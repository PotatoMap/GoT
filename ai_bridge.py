# -*- coding: utf-8 -*-
"""GoT — local GTP bridge.

Connects a local Go engine that speaks GTP (KataGo, LeelaZero, GNU Go, ...)
to the GoT_GUI web app over HTTP.

Usage:
    python ai_bridge.py                                  # auto-detect engine in ./engines
    python ai_bridge.py --engine-cmd "katago gtp -model m.bin.gz -config gtp.cfg"
    python ai_bridge.py --engine-cmd "python engines/mock_gtp.py" --port 8766

Endpoints (all JSON, CORS enabled):
    GET  /health   -> engine name/version + capabilities
    POST /gtp      {command}                 -> raw GTP passthrough
    POST /analyze  {size,komi,toMove,moves,  -> normalized analysis
                    seconds,topN,ownership}
`moves` entries may be "pd" (SGF), "D4" (GTP), "pass", or {x,y,color,pass}.
Reported winrate is from the perspective of `toMove`.
"""

import argparse
import atexit
import json
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty, Queue
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8766
SERVICE = "got_gtp_bridge"

GTP_COLUMNS = "ABCDEFGHJKLMNOPQRST"
SGF_LETTERS = "abcdefghijklmnopqrstuvwxyz"


class GtpProcess:
    """Manages one GTP engine subprocess with a line-reader thread."""

    def __init__(self, cmd):
        self.cmd = cmd
        self.lock = threading.Lock()
        self.lines = Queue()
        creationflags = 0
        if sys.platform == "win32":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.proc = subprocess.Popen(
            cmd, shell=True,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            creationflags=creationflags,
        )
        self.alive = True
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def _read_loop(self):
        try:
            for line in self.proc.stdout:
                self.lines.put(line.rstrip("\r\n"))
        except Exception:
            pass
        self.alive = False

    def send(self, text):
        try:
            self.proc.stdin.write(text + "\n")
            self.proc.stdin.flush()
            return True
        except Exception:
            self.alive = False
            return False

    def read_line(self, timeout):
        try:
            return self.lines.get(timeout=timeout)
        except Empty:
            return None

    def command(self, cmd, timeout=60.0):
        """Send a normal GTP command, read until blank line. Returns (ok, payload_lines)."""
        with self.lock:
            if not self.alive or not self.send(cmd):
                return False, ["engine not running"]
            out = []
            deadline = time.time() + timeout
            while time.time() < deadline:
                line = self.read_line(timeout=max(0.05, deadline - time.time()))
                if line is None:
                    if not self.alive:
                        break  # 引擎已死：立即退出，避免空转烧 CPU
                    continue
                if line == "":
                    if out:
                        return True, out
                    continue
                out.append(line)
                if line.startswith("?"):
                    return False, out
            return False, out or ["timeout"]

    def drain_until_blank(self, timeout, collector):
        """Collect streamed lines (kata-analyze) until blank line or timeout."""
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            line = self.read_line(timeout=max(0.02, deadline - time.time()))
            if line is None:
                continue
            if line == "":
                break
            collector.append(line)
            last = line
        return last

    def stop(self):
        try:
            self.send("quit")
        except Exception:
            pass
        time.sleep(0.2)
        try:
            self.proc.kill()
        except Exception:
            pass


ENGINE = None  # global GtpProcess


def detect_engine_cmd(root):
    """Auto-detect a GTP engine under ./engines (or current dir)."""
    candidates = []
    eng_dir = root / "engines"
    for pattern in ("katago*.exe", "katago", "leelaz*.exe", "leelaz", "gnugo*.exe", "gnugo*.exe", "michi*", "pachi*"):
        candidates.extend(eng_dir.glob(pattern))
        candidates.extend(root.glob(pattern))
    for c in sorted(candidates):
        name = c.name.lower()
        if "katago" in name:
            # needs -model; look for a model next to it
            models = list(eng_dir.glob("*.bin.gz")) + list(eng_dir.glob("*.txt.gz"))
            cfg = list(eng_dir.glob("gtp*.cfg")) + list(eng_dir.glob("*.cfg"))
            cmd = [str(c)]
            if models:
                cmd += ["gtp", "-model", str(models[0])]
                if cfg:
                    cmd += ["-config", str(cfg[0])]
                return " ".join(cmd)
            print("[got-bridge] katago found but no *.bin.gz model next to it;", file=sys.stderr)
            continue
        if "leelaz" in name:
            models = list(eng_dir.glob("*.gz")) + list(root.glob("*.gz"))
            if models:
                cmd = [str(c), "gtp", "--weights", str(models[0])]
                return " ".join(cmd)
            continue
        if "gnugo" in name:
            return f'"{c}" --mode gtp'
        if name.endswith((".py",)):
            return f'"{sys.executable}" "{c}"'
    # fallback: bundled mock engine (always available)
    mock = eng_dir / "mock_gtp.py"
    if mock.exists():
        return f'"{sys.executable}" "{mock}"'
    return None


# ---------------------------------------------------------------------------
# vertex helpers
# ---------------------------------------------------------------------------
def gtp_vertex(x, y, size):
    return f"{GTP_COLUMNS[x]}{size - y}"


def parse_vertex_token(tok, size):
    """GTP 'D4' / 'pass' -> (x,y) or None for pass."""
    if not tok:
        return None
    t = tok.strip().lower()
    if t in ("pass", "resign"):
        return "pass" if t == "pass" else "resign"
    m = re.match(r"^([A-Za-z])(\d{1,2})$", tok.strip())
    if not m:
        return None
    col = GTP_COLUMNS.find(m.group(1).upper())
    row = int(m.group(2))
    x = col
    y = size - row
    if x < 0 or x >= size or y < 0 or y >= size:
        return None
    return (x, y)


def normalize_move(m, size):
    """Accept 'pd' | 'D4' | 'pass' | {x,y,pass,color} -> {color?,x,y,pass}."""
    if isinstance(m, dict):
        x = m.get("x", -1)
        y = m.get("y", -1)
        p = bool(m.get("pass")) or x < 0 or y < 0
        return {"color": m.get("color"), "x": -1 if p else int(x), "y": -1 if p else int(y), "pass": p}
    s = str(m).strip()
    if s.lower() == "pass" or s == "":
        return {"color": None, "x": -1, "y": -1, "pass": True}
    if len(s) == 2 and s[0] in SGF_LETTERS and s[1] in SGF_LETTERS:
        x, y = SGF_LETTERS.find(s[0]), SGF_LETTERS.find(s[1])
        if x < size and y < size:
            return {"color": None, "x": x, "y": y, "pass": False}
    v = parse_vertex_token(s, size)
    if isinstance(v, tuple):
        return {"color": None, "x": v[0], "y": v[1], "pass": False}
    if v == "pass":
        return {"color": None, "x": -1, "y": -1, "pass": True}
    raise ValueError("cannot parse move: " + s)


LAST_POS = None  # 增量重放状态 {"size", "setup", "moves": [key,...]}


def _move_key(col, mv, size):
    return col + (":pass" if mv["pass"] else f":{mv['x']},{mv['y']}")


def replay_position(engine, spec):
    global LAST_POS
    size = int(spec.get("size", 19))
    komi = float(spec.get("komi", 7.5))
    setup = spec.get("setup") or None
    moves = []
    for m in spec.get("moves", []):
        mv = normalize_move(m, size)
        col = mv.get("color")
        if col in (1, "1", "black", "B", "b"):
            col = "B"
        elif col in (2, "2", "white", "W", "w"):
            col = "W"
        else:
            col = "B"  # engine replay only needs alternation hints; B default
        moves.append((col, mv))
    move_keys = [_move_key(col, mv, size) for col, mv in moves]

    # 增量重放：新局面是上一局面 + N 手时只补 play，避免每次 clear_board 全量重摆
    if (LAST_POS and LAST_POS["size"] == size and LAST_POS["setup"] == setup
            and len(move_keys) >= len(LAST_POS["moves"])
            and move_keys[: len(LAST_POS["moves"])] == LAST_POS["moves"]):
        try:
            engine.command(f"komi {komi}", timeout=10)
            for i in range(len(LAST_POS["moves"]), len(moves)):
                col, mv = moves[i]
                v = "pass" if mv["pass"] else gtp_vertex(mv["x"], mv["y"], size)
                ok, out = engine.command(f"play {col} {v}", timeout=10)
                if not ok:
                    raise RuntimeError(f"play {col} {v} failed: " + " ".join(out))
            LAST_POS["moves"] = move_keys
            return
        except RuntimeError:
            LAST_POS = None  # 缓存与引擎实际状态不一致——回退全量重放

    ok, out = engine.command(f"boardsize {size}", timeout=30)
    if not ok:
        raise RuntimeError("boardsize failed: " + " ".join(out))
    engine.command(f"komi {komi}", timeout=10)
    ok, out = engine.command("clear_board", timeout=30)
    if not ok:
        raise RuntimeError("clear_board failed: " + " ".join(out))
    if setup:
        for idx in (setup.get("AB") or []):
            x, y = _setup_point(idx, size)
            if x is None:
                continue
            ok, out = engine.command(f"play B {gtp_vertex(x, y, size)}", timeout=10)
            if not ok:
                raise RuntimeError("setup play B failed: " + " ".join(out))
        for idx in (setup.get("AW") or []):
            x, y = _setup_point(idx, size)
            if x is None:
                continue
            ok, out = engine.command(f"play W {gtp_vertex(x, y, size)}", timeout=10)
            if not ok:
                raise RuntimeError("setup play W failed: " + " ".join(out))
    for col, mv in moves:
        v = "pass" if mv["pass"] else gtp_vertex(mv["x"], mv["y"], size)
        ok, out = engine.command(f"play {col} {v}", timeout=10)
        if not ok:
            raise RuntimeError(f"play {col} {v} failed: " + " ".join(out))
    LAST_POS = {"size": size, "setup": setup, "moves": move_keys}


def _setup_point(idx, size):
    """兼容整数索引（idx=y*size+x）与 SGF 两字母坐标（'dd'）；非法返回 (None, None)。"""
    if isinstance(idx, int) and idx >= 0:
        return idx % size, idx // size
    if isinstance(idx, str) and len(idx) == 2:
        x, y = SGF_LETTERS.find(idx[0]), SGF_LETTERS.find(idx[1])
        if 0 <= x < size and 0 <= y < size:
            return x, y
    return None, None


def parse_analyze_line(line, size):
    """Parse one lz/kata-analyze update line -> list of dicts.
    A single update line contains MANY 'info move ...' blocks concatenated."""
    line = line.lstrip("= ").strip()
    if not line:
        return []
    segments = ("info " + re.sub(r"\binfo\s+move\b", "\x00info move", line)).split("\x00")
    out_all = []
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        parsed = parse_analyze_segment(seg, size)
        if parsed:
            out_all.append(parsed)
    return out_all


def parse_analyze_segment(line, size):
    parts = line.split()
    out = {}
    pv = []
    i = 0
    if parts and parts[0].lower() == "info":
        i = 1
    while i < len(parts):
        k = parts[i]
        if k == "pv":
            pv = parts[i + 1:]
            break
        if i + 1 < len(parts):
            out[k] = parts[i + 1]
        i += 2
    def f(k, default=None):
        try:
            return float(out.get(k, default))
        except (TypeError, ValueError):
            return default
    v = parse_vertex_token(str(out.get("move", "")), size)
    if isinstance(v, tuple):
        out["x"], out["y"] = v
    elif str(out.get("move", "")).lower() == "pass":
        out["pass_"] = True
    else:
        return None
    out["visits"] = int(f("visits", 0) or 0)
    wr = f("winrate")
    if wr is not None:
        if wr <= 1.0:
            wr = wr * 100.0
        out["winrate"] = wr  # percent, for side to move
    for src in ("scoreMean", "scoreSelfplay", "score"):
        sv = f(src)
        if sv is not None:
            out["scoreLead"] = sv
            break
    out["prior"] = f("prior", 0.0) or 0.0
    out["order"] = int(f("order", 0) or 0)
    out["pv"] = []
    for t in pv:
        p = parse_vertex_token(t, size)
        if isinstance(p, tuple):
            out["pv"].append({"x": p[0], "y": p[1]})
        elif p == "pass":
            out["pv"].append({"pass": True})
    return out


OWNERSHIP_RE = re.compile(r"ownership\s+(-?1?\.\d+|-?\d+)")


def extract_ownership(line, size):
    m = re.search(r"\bownership\s+((?:-?\d+(?:\.\d+)?\s*)+)", line)
    if not m:
        return None
    vals = [float(t) for t in m.group(1).split()]
    if len(vals) >= size * size:
        return vals[: size * size]
    return None


def do_analyze(spec):
    global ENGINE_COMMANDS
    size = int(spec.get("size", 19))
    komi = float(spec.get("komi", 7.5))
    to_move_raw = spec.get("toMove", 1)
    to_move = "B" if str(to_move_raw) in ("1", "B", "b", "black") else "W"
    seconds = max(0.2, min(float(spec.get("seconds", 1.5)), 30.0))
    top_n = int(spec.get("topN", 5))
    want_ownership = bool(spec.get("ownership", False))

    replay_position(ENGINE, spec)

    if ENGINE_COMMANDS is None:
        _ok, cmd_lines = ENGINE.command("list_commands", timeout=15)
        commands = set()
        for line in cmd_lines:
            commands.update(line.lstrip("= ").split())
        ENGINE_COMMANDS = commands
    commands = ENGINE_COMMANDS

    cand_by_move = {}
    ownership = None
    used = None
    stream_cmds = []
    if "kata-analyze" in commands:
        stream_cmds.append(f"kata-analyze {to_move} interval 20 ownership { 'true' if want_ownership else 'false'}")
    if "lz-analyze" in commands:
        stream_cmds.append(f"lz-analyze {to_move} interval 20")
    for cmd in stream_cmds:
        used = cmd.split()[0]
        ENGINE.send(cmd)
        lines = []
        last = ENGINE.drain_until_blank(seconds, lines)  # never blank until stop
        ENGINE.send("stop")
        # read until the terminating blank line arrives
        deadline = time.time() + 10
        got_blank = False
        while time.time() < deadline and not got_blank:
            line = ENGINE.read_line(timeout=0.2)
            if line is None:
                if not ENGINE.alive:
                    break
                continue
            if line == "":
                got_blank = True
                break
            lines.append(line)
        # also consume possible leftovers produced after stop
        while True:
            line = ENGINE.read_line(timeout=0.05)
            if line is None or line == "":
                break
            lines.append(line)
        for ln in lines:
            # 取最后一次 ownership 报告（访问量最高的最终估计），而非第一行
            if "ownership" in ln:
                ownership = extract_ownership(ln, size) or ownership
            parsed_line = parse_analyze_line(ln, size)
            if len(parsed_line) >= 2:
                # KataGo 风格：单行即全量候选快照——以最后一行为准，整体替换
                cand_by_move.clear()
                for parsed in parsed_line:
                    cand_by_move[(parsed.get("x"), parsed.get("y"))] = parsed
            else:
                # 单候选行（mock / 老式引擎）：按点位合并
                for parsed in parsed_line:
                    cand_by_move[(parsed.get("x"), parsed.get("y"))] = parsed
        if cand_by_move:
            break
    if not cand_by_move:
        # fallback: plain genmove（genmove 真实落子，引擎棋盘领先于缓存——失效重建）
        global LAST_POS
        LAST_POS = None
        ok, out = ENGINE.command(f"genmove {to_move}", timeout=max(30, seconds * 3))
        mv = None
        for line in out:
            t = line.lstrip("= ").strip()
            v = parse_vertex_token(t, size)
            if v:
                mv = v
                break
            if t.lower() == "pass":
                mv = "pass"
                break
        if mv == "pass":
            result = {"ok": True, "engine": ENGINE_NAME, "bestMove": {"pass": True}, "candidates": [], "winrate": None, "scoreLead": None}
            result["mode"] = "genmove"
            return result
        if isinstance(mv, tuple):
            result = {"ok": True, "engine": ENGINE_NAME, "bestMove": {"x": mv[0], "y": mv[1]}, "candidates": [], "winrate": None, "scoreLead": None}
            result["mode"] = "genmove"
            return result
        return {"ok": False, "error": "engine produced no move: " + " ".join(out)}

    cands = sorted(cand_by_move.values(), key=lambda c: -c["visits"])[:top_n]
    best = cands[0]
    # kata-analyze 的 ownership 为"行棋方视角"，统一归一化为黑方视角返回（与 server.js 一致）
    if ownership is not None and to_move == "W":
        ownership = [-v for v in ownership]
    best_move = {"pass": True} if best.get("pass_") else {"x": best["x"], "y": best["y"]}
    return {
        "ok": True,
        "engine": ENGINE_NAME,
        "engineKind": used,
        "bestMove": best_move,
        "candidates": [
            {
                "x": c.get("x", -1),
                "y": c.get("y", -1),
                "pass": bool(c.get("pass_")),
                "visits": c["visits"],
                "winrate": c.get("winrate"),       # percent for toMove
                "scoreLead": c.get("scoreLead"),   # points for toMove
                "prior": c.get("prior"),
                "pv": c.get("pv", []),
            } for c in cands
        ],
        "ownership": ownership,  # black-perspective floats or None
        "toMove": 1 if to_move == "B" else 2,
        "size": size,
        "komi": komi,
    }


ENGINE_NAME = "unknown"
ENGINE_SUPPORTS_ANALYZE = False
ENGINE_COMMANDS = None      # list_commands 探测结果缓存（避免 /health 高频轮询每次问询引擎）
ENGINE_INFO_CACHE = None    # /health 返回的能力信息缓存


def probe_engine_info():
    """探测一次引擎能力并缓存；失败返回 None。"""
    global ENGINE_NAME, ENGINE_SUPPORTS_ANALYZE, ENGINE_COMMANDS, ENGINE_INFO_CACHE
    if ENGINE_INFO_CACHE is not None and ENGINE.alive:
        return ENGINE_INFO_CACHE
    ok, out = ENGINE.command("name", timeout=15)
    name = out[0].lstrip("= ").strip() if ok and out else "unknown"
    ok2, out2 = ENGINE.command("version", timeout=15)
    version = out2[0].lstrip("= ").strip() if ok2 and out2 else ""
    ok3, out3 = ENGINE.command("list_commands", timeout=15)
    if not ok3:
        return None
    commands = set()
    for line in out3:
        commands.update(line.lstrip("= ").split())
    ENGINE_NAME = name
    ENGINE_COMMANDS = commands
    ENGINE_SUPPORTS_ANALYZE = ("kata-analyze" in commands) or ("lz-analyze" in commands)
    ENGINE_INFO_CACHE = {
        "name": name,
        "version": version,
        "supportsAnalyze": ENGINE_SUPPORTS_ANALYZE,
        "supportsOwnership": "kata-analyze" in commands,
        "kataAnalyze": "kata-analyze" in commands,
        "lzAnalyze": "lz-analyze" in commands,
    }
    return ENGINE_INFO_CACHE


class Handler(BaseHTTPRequestHandler):
    server_version = "GoTBridge/1.0"
    protocol_version = "HTTP/1.1"

    def _cors_headers(self):
        """仅放行本机回环 Origin（含任意端口）；其余跨域不给 ACAO——
        防止任意网页驱动本机引擎（与 server.js 策略一致）。"""
        origin = self.headers.get("Origin")
        if not origin or re.match(r"^https?://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$", origin, re.I):
            return {"Access-Control-Allow-Origin": origin or "*",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"}
        return {}

    def _send(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in self._cors_headers().items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self._send({"ok": True, "service": SERVICE})

    def do_GET(self):  # noqa: N802
        if urlparse(self.path).path == "/health":
            if ENGINE is None or not ENGINE.alive:
                self._send({"ok": False, "service": SERVICE, "error": "engine not running"})
                return
            info = probe_engine_info()
            if info is None:
                self._send({"ok": False, "service": SERVICE, "error": "engine not ready"})
                return
            self._send({"ok": True, "service": SERVICE, "engine": info})
            return
        self._send({"ok": False, "error": "not_found"}, 404)

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length) or b"{}")
            if path == "/gtp":
                cmd = str(req.get("command", "")).strip()
                if not cmd:
                    return self._send({"ok": False, "error": "command required"}, 400)
                if cmd.split()[0].lower() in ("kata-analyze", "lz-analyze", "genmove_analyze", "kata-genmove_analyze", "quit"):
                    return self._send({"ok": False, "error": "streaming/quit commands not allowed here"}, 400)
                global LAST_POS, ENGINE_INFO_CACHE
                LAST_POS = None  # 透传命令可能改变棋盘状态，增量重放缓存失效
                ok, out = ENGINE.command(cmd, timeout=120)
                if not ok and not ENGINE.alive:
                    ENGINE_INFO_CACHE = None
                return self._send({"ok": ok, "response": "\n".join(out)})
            if path == "/analyze":
                return self._send(do_analyze(req))
            self._send({"ok": False, "error": "not_found"}, 404)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            import traceback
            self._send({"ok": False, "error": str(exc), "trace": traceback.format_exc()}, 400)
        except Exception as exc:  # keep bridge errors inside JSON
            import traceback
            self._send({"ok": False, "error": str(exc), "trace": traceback.format_exc()}, 500)

    def log_message(self, fmt, *args):
        print("[got-bridge] " + fmt % args)


def main():
    global ENGINE
    ap = argparse.ArgumentParser(description="GoT local GTP bridge")
    ap.add_argument("--engine-cmd", default=None, help='full command line, e.g. "katago gtp -model m.bin.gz"')
    ap.add_argument("--host", default=HOST)
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()

    cmd = args.engine_cmd or detect_engine_cmd(Path(__file__).resolve().parent)
    if not cmd:
        print("No GTP engine found. Put katago/leelaz in ./engines or pass --engine-cmd.", file=sys.stderr)
        sys.exit(1)
    print(f"[got-bridge] starting engine: {cmd}")
    ENGINE = GtpProcess(cmd)
    atexit.register(ENGINE.stop)

    # wait briefly for engine to boot
    t0 = time.time()
    while time.time() - t0 < 20:
        ok, out = ENGINE.command("list_commands", timeout=5)
        if ok:
            break
        time.sleep(0.3)

    print(f"[got-bridge] listening on http://{args.host}:{args.port}")
    print("[got-bridge] Press Ctrl+C to stop.")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
