#!/usr/bin/env node
/* GoT — 一体化本地服务器：静态文件 + GTP 引擎桥接（同一端口，同源无 CORS）。
 *
 * 用法：
 *   node server.js                       # 自动检测 engines/ 下的 KataGo
 *   node server.js --engine-cmd "katago gtp -model net.bin.gz -config gtp.cfg"
 *   node server.js --port 4173 --engine-cmd "python engines/mock_gtp.py"
 *
 * 端点：
 *   GET  /            静态文件（默认 index.html）
 *   GET  /health      引擎信息
 *   POST /gtp         {command} → GTP 透传
 *   POST /analyze     {size,komi,toMove,moves,seconds,topN,ownership}
 *
 * 也可当纯静态服务器用（--no-engine）。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const ROOT = __dirname;
const args = process.argv.slice(2);
function argOf(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
}
const parsedPort = parseInt(argOf('--port', '4173'), 10);
/* The launcher normally reserves 4173 first, but a second GoT instance can
 * still win the race before Node binds. Keep the server resilient when it is
 * started directly or when another process takes the port between checks. */
const PORT = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 4173;
const PORT_SCAN_LIMIT = 40;
const USE_ENGINE = !args.includes('--no-engine');

/* ------------------------------------------------------------------ *
 *  GTP engine process                                                  *
 * ------------------------------------------------------------------ */
class GtpProcess {
  constructor(cmd) {
    this.alive = true;
    this.lines = [];
    this.waiters = [];
    this.pendingGarbage = false; // 上次命令超时——迟到响应需吞掉，防止污染下一条
    this.child = spawn(cmd, { shell: true, cwd: ROOT, windowsHide: true });
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this._push(line.trimEnd()));
    this.child.stderr.on('data', () => { /* engine logs */ });
    // 引擎退出瞬间写入 stdin 会触发异步 EPIPE——没有 error 监听器会打崩整个进程
    this.child.stdin.on('error', () => { this.alive = false; });
    this.child.on('exit', () => { this.alive = false; this._push(null); });
    this.lock = Promise.resolve();
  }
  _push(line) {
    const w = this.waiters.shift();
    if (w) { clearTimeout(w.timer); w.resolve(line); }
    else this.lines.push(line);
  }
  readLine(timeoutMs) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (!this.alive) return Promise.resolve(null);
    return new Promise((resolve) => {
      const w = { resolve };
      w.timer = setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(w);
    });
  }
  send(text) {
    return new Promise((resolve) => {
      if (!this.alive) return resolve(false);
      try {
        // 写回调可能永不触发（引擎活着但停止读 stdin，管道缓冲填满）——
        // 无超时会导致 send 永挂 → ENGINE.lock + engineMutex 永久持有，全服务瘫痪
        let settled = false;
        const t = setTimeout(() => { settled = true; this.alive = false; resolve(false); }, 15000);
        this.child.stdin.write(text + '\n', (err) => {
          clearTimeout(t);
          if (settled) return;
          settled = true;
          if (err) this.alive = false;
          resolve(!err);
        });
      } catch (e) { this.alive = false; resolve(false); }
    });
  }
  /* serialized command: returns {ok, lines[]} */
  command(cmd, timeoutMs = 60000) {
    const run = async () => {
      // 先吞掉上次超时遗留的迟到响应，保证本条命令与响应对齐
      if (this.pendingGarbage) {
        await this.swallowGarbage();
        this.pendingGarbage = false;
      }
      if (!this.alive || !(await this.send(cmd))) return { ok: false, lines: ['engine not running'] };
      const out = [];
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const line = await this.readLine(Math.max(50, deadline - Date.now()));
        if (line === null) { if (!this.alive) break; continue; } // 引擎已死：立即退出，避免空转烧 CPU
        if (line === '') { if (out.length) return { ok: true, lines: out }; continue; }
        out.push(line);
        if (line.startsWith('?')) return { ok: false, lines: out };
      }
      // 超时：引擎稍后仍会补出响应（如 KataGo GPU 调优期间），须整段吞掉，
      // 否则残行会被下一条命令当作自己的响应——曾有 /health 探测整条错位
      this.pendingGarbage = true;
      return { ok: false, lines: out.length ? out : ['timeout'] };
    };
    const p = this.lock.then(run, run);
    this.lock = p.catch(() => { });
    return p;
  }
  /* 吞掉迟到的垃圾响应，直到其空白行（GTP 响应以空行结束）或宽限期用尽 */
  async swallowGarbage(graceMs = 60000) {
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline && this.alive) {
      const line = await this.readLine(Math.max(50, deadline - Date.now()));
      if (line === null) { if (!this.alive) return false; continue; }
      if (line === '') return true;
    }
    return false;
  }
  /* stream collection for kata-analyze; returns last line */
  async drainFor(ms, sink) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const line = await this.readLine(Math.max(20, deadline - Date.now()));
      if (line === null) { if (!this.alive) break; continue; }
      if (line === '') break;
      sink.push(line);
    }
    return sink.length ? sink[sink.length - 1] : null;
  }
  stop() {
    if (!this.alive) return;
    try { this.child.stdin.write('quit\n'); } catch (e) { }
    setTimeout(() => { try { this.child.kill(); } catch (e) { } }, 300);
  }
}

let ENGINE = null;
const NativeAnalysis = require('./analysis-engine');
let ANALYSIS = null;
let ENGINE_NAME = 'unknown';
let ENGINE_CMDLINE = '';
let ENGINE_COMMANDS = null;   // 引擎支持的命令集（探测后缓存）
let lastPos = null;           // 增量重放状态 {size, setupKey, moveKeys[]}

/* 引擎级互斥：/analyze 的 kata-analyze 流式收发不经过 ENGINE.lock（command 队列），
 * 并发两个 /analyze 或与 /gtp 交叉会污染引擎流。所有"重放 + 流式 + 探测"统一在此串行。 */
let engineMutex = Promise.resolve();
function withEngineMutex(fn) {
  const p = engineMutex.then(fn, fn);
  engineMutex = p.catch(() => { });
  return p;
}

/* ------------------------------------------------------------------ *
 *  engine detection                                                    *
 * ------------------------------------------------------------------ */
function detectEngineCmd(rootDir) {
  const engDir = path.join(rootDir || ROOT, 'engines');
  const katagoDir = path.join(engDir, 'katago');
  const exe = ['katago.exe', 'katago']
    .map(n => path.join(katagoDir, n)).find(p => fs.existsSync(p));
  if (exe) {
    const models = fs.readdirSync(katagoDir)
      .filter(f => f.endsWith('.bin.gz') || f.endsWith('.txt.gz'))
      .sort((a, b) => fs.statSync(path.join(katagoDir, b)).size - fs.statSync(path.join(katagoDir, a)).size);
    const cfgs = fs.readdirSync(katagoDir).filter(f => /^default_gtp\.cfg$|^gtp.*\.cfg$/i.test(f));
    if (models.length) {
      const parts = [`"${exe}"`, 'gtp', '-model', `"${path.join(katagoDir, models[0])}"`];
      if (cfgs.length) parts.push('-config', `"${path.join(katagoDir, cfgs[0])}"`);
      return parts.join(' ');
    }
    console.error('[got] katago.exe found but no *.bin.gz model in engines/katago');
  }
  /* mock_gtp.py 只是单元测试桩，**绝不自动回退**——否则"有引擎无模型"的轻量包
   * 会静默用假 AI，而用户以为是内置 MCTS。测试请显式传
   * --engine-cmd "python engines/mock_gtp.py"。无引擎 → 前端用内置 AI。 */
  return null;
}

/* ------------------------------------------------------------------ *
 *  GTP helpers (mirror of ai_bridge.py)                                *
 * ------------------------------------------------------------------ */
const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRST';
const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function parseVertexToken(tok, size) {
  if (!tok) return null;
  const t = tok.trim().toLowerCase();
  if (t === 'pass') return 'pass';
  if (t === 'resign') return 'resign';
  const m = /^([A-HJ-T])(\d{1,2})$/i.exec(tok.trim());
  if (!m) return null;
  const x = GTP_COLUMNS.indexOf(m[1].toUpperCase());
  const y = size - parseInt(m[2], 10);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return [x, y];
}
function gtpVertex(x, y, size) { return GTP_COLUMNS[x] + (size - y); }
function normalizeMove(m, size) {
  if (typeof m === 'object' && m !== null) {
    const p = !!(m.pass) || m.x < 0 || m.y < 0;
    return { color: m.color, x: p ? -1 : m.x, y: p ? -1 : m.y, pass: p };
  }
  const s = String(m).trim();
  if (s === '' || s.toLowerCase() === 'pass') return { color: null, x: -1, y: -1, pass: true };
  if (s.length === 2 && SGF_LETTERS.includes(s[0]) && SGF_LETTERS.includes(s[1])) {
    const x = SGF_LETTERS.indexOf(s[0]), y = SGF_LETTERS.indexOf(s[1]);
    if (x < size && y < size) return { color: null, x, y, pass: false };
  }
  const v = parseVertexToken(s, size);
  if (Array.isArray(v)) return { color: null, x: v[0], y: v[1], pass: false };
  if (v === 'pass') return { color: null, x: -1, y: -1, pass: true };
  throw new Error('cannot parse move: ' + s);
}
function colorToGtp(c) {
  if ([1, '1', 'B', 'b', 'black'].includes(c)) return 'B';
  if ([2, '2', 'W', 'w', 'white'].includes(c)) return 'W';
  return 'B';
}
async function replayPosition(spec) {
  const size = spec.size || 19;
  const komi = spec.komi !== undefined ? spec.komi : 7.5;
  const setupKey = JSON.stringify(spec.setup || null);
  const rules = spec.rules || 'chinese';
  if (!lastPos || lastPos.rules !== rules) {
    await probeEngineLocked();
    if (ENGINE_COMMANDS && ENGINE_COMMANDS.has('kata-set-rules')) {
      if (!['chinese', 'japanese', 'korean'].includes(rules)) throw new Error('Unsupported rules');
      const r = await ENGINE.command('kata-set-rules ' + rules, 10000);
      if (!r.ok) throw new Error('Cannot set analysis rules');
    }
    lastPos = null;
  }
  // 规范化手顺为 "B x,y" / "W pass" 形式，便于前缀比较
  const moves = (spec.moves || []).map(m => {
    const mv = normalizeMove(m, size);
    return { c: colorToGtp(mv.color || 'B'), pass: mv.pass, x: mv.x, y: mv.y };
  });
  const moveKeys = moves.map(m => m.c + (m.pass ? ':pass' : ':' + m.x + ',' + m.y));

  /* 增量重放：复盘逐手分析时，新局面通常是上一局面 + 1 手。
   * 前缀一致则只补 play 增量，避免每次都 clear_board + 全量重摆（200 手对局提速 ~200×）。 */
  if (lastPos && lastPos.size === size && lastPos.setupKey === setupKey &&
    moveKeys.length >= lastPos.moveKeys.length &&
    lastPos.moveKeys.every((k, i) => k === moveKeys[i])) {
    try {
      await ENGINE.command(`komi ${komi}`, 10000);
      for (let i = lastPos.moveKeys.length; i < moves.length; i++) {
        const m = moves[i];
        const v = m.pass ? 'pass' : gtpVertex(m.x, m.y, size);
        const r = await ENGINE.command(`play ${m.c} ${v}`, 10000);
        if (!r.ok) throw new Error(`play ${m.c} ${v} failed: ` + r.lines.join(' '));
      }
      lastPos.moveKeys = moveKeys;
      return;
    } catch (e) {
      lastPos = null; // 缓存与引擎实际状态不一致——回退全量重放
    }
  }

  const r1 = await ENGINE.command(`boardsize ${size}`, 30000);
  if (!r1.ok) { lastPos = null; throw new Error('boardsize failed: ' + r1.lines.join(' ')); }
  await ENGINE.command(`komi ${komi}`, 10000);
  const r2 = await ENGINE.command('clear_board', 30000);
  if (!r2.ok) { lastPos = null; throw new Error('clear_board failed: ' + r2.lines.join(' ')); }
  try {
    // 置子（让子 / SGF AB·AW）：用 play 逐子摆上——否则让子局的分析完全基于空盘
    const setup = spec.setup || null;
    const placeStones = async (list, color) => {
      // 元素兼容两种写法：整数索引（前端 rootSetup 约定，idx = y*size+x）或 SGF 两字母坐标（'dd'）；
      // 非法元素一律跳过——绝不让 NaN 进 gtpVertex 拼出坏命令
      for (const i of (Array.isArray(list) ? list : (list ? [list] : []))) {
        let idx = -1;
        if (typeof i === 'number' && Number.isInteger(i) && i >= 0) idx = i;
        else if (typeof i === 'string' && i.length === 2) {
          const x = SGF_LETTERS.indexOf(i[0]), y = SGF_LETTERS.indexOf(i[1]);
          if (x >= 0 && y >= 0 && x < size && y < size) idx = y * size + x;
        }
        if (idx < 0) continue;
        const x = idx % size, y = (idx / size) | 0;
        const r = await ENGINE.command(`play ${color} ${gtpVertex(x, y, size)}`, 10000);
        if (!r.ok) throw new Error(`setup play ${color} ${gtpVertex(x, y, size)} failed: ` + r.lines.join(' '));
      }
    };
    if (setup) {
      await placeStones(setup.AB, 'B');
      await placeStones(setup.AW, 'W');
      // AE（提走子）GTP 无法直接表达，实际对局谱中罕见，忽略
    }
    for (const m of moves) {
      const v = m.pass ? 'pass' : gtpVertex(m.x, m.y, size);
      const r = await ENGINE.command(`play ${m.c} ${v}`, 10000);
      if (!r.ok) throw new Error(`play ${m.c} ${v} failed: ` + r.lines.join(' '));
    }
  } catch (e) {
    /* 全量重放中途失败：引擎棋盘已残缺，lastPos 仍指向旧局面会令下次
     * 增量重放对残缺棋盘静默分析（数据坏）——必须失效缓存再上抛 */
    lastPos = null;
    throw e;
  }
  lastPos = { size, setupKey, moveKeys, rules };
}
function parseAnalyzeLine(line, size) {
  // One update line contains MANY "info move ..." blocks concatenated.
  const segments = ('info ' + line.replace(/^[=\s]+/, '').replace(/\binfo\s+move\b/g, '\u0001info move'))
    .split('\u0001').map(s => s.trim()).filter(Boolean);
  const outAll = [];
  for (const seg of segments) {
    const parsed = parseAnalyzeSegment(seg, size);
    if (parsed) outAll.push(parsed);
  }
  return outAll;
}
function parseAnalyzeSegment(line, size) {
  const parts = line.split(/\s+/);
  const out = {};
  let pv = [];
  let i = 0;
  if (parts.length && parts[0].toLowerCase() === 'info') i = 1;
  while (i < parts.length) {
    const k = parts[i];
    if (k === 'pv') { pv = parts.slice(i + 1); break; }
    if (i + 1 < parts.length) out[k] = parts[i + 1];
    i += 2;
  }
  const num = (k, d) => { const v = parseFloat(out[k]); return Number.isFinite(v) ? v : d; };
  const v = parseVertexToken(String(out.move || ''), size);
  if (Array.isArray(v)) { out.px = v[0]; out.py = v[1]; }
  else if (String(out.move || '').toLowerCase() === 'pass') out.pass_ = true;
  else return null;
  out.visits = Math.round(num('visits', 0));
  let wr = num('winrate', null);
  if (wr !== null) {
    // 引擎可能输出 0..1 分数或 0..100 百分比，统一为百分比并钳制
    if (wr <= 1.0) wr *= 100;
    out.wr = Math.max(0, Math.min(100, wr));
  }
  const sv = num('scoreLead', num('scoreMean', num('scoreSelfplay', num('score', null))));
  if (sv !== null) out.score = sv;
  out.prior = num('prior', 0);
  out.pvMoves = [];
  for (const t of pv) {
    const p = parseVertexToken(t, size);
    if (Array.isArray(p)) out.pvMoves.push({ x: p[0], y: p[1] });
    else if (p === 'pass') out.pvMoves.push({ pass: true });
  }
  return out;
}
function extractOwnership(line, size) {
  const m = line.match(/\bownership\s+((?:-?\d+(?:\.\d+)?\s*)+)/);
  if (!m) return null;
  const vals = m[1].trim().split(/\s+/).map(Number);
  return vals.length >= size * size ? vals.slice(0, size * size) : null;
}

async function doAnalyze(spec) {
  const size = spec.size || 19;
  const toMove = colorToGtp(spec.toMove !== undefined ? spec.toMove : 1);
  const seconds = Math.max(0.2, Math.min(Number(spec.seconds) || 1.5, 30));
  const topN = spec.topN || 5;
  const wantOwnership = !!spec.ownership;

  await replayPosition(spec);

  if (!ENGINE_COMMANDS) await probeEngineLocked();
  const commands = ENGINE_COMMANDS || new Set();

  const candByMove = new Map();
  let ownership = null;
  let used = null;
  const streams = [];
  if (commands.has('kata-analyze')) streams.push(`kata-analyze ${toMove} interval 20 ownership ${wantOwnership ? 'true' : 'false'}`);
  if (commands.has('lz-analyze')) streams.push(`lz-analyze ${toMove} interval 20`);

  for (const cmd of streams) {
    used = cmd.split(' ')[0];
    await ENGINE.send(cmd);
    const lines = [];
    await ENGINE.drainFor(seconds * 1000, lines);
    await ENGINE.send('stop');
    const deadline = Date.now() + 10000;
    let gotBlank = false;
    while (Date.now() < deadline && !gotBlank) {
      const line = await ENGINE.readLine(200);
      if (line === null) { if (!ENGINE.alive) break; continue; } // 引擎已死：立即退出，避免纯微任务紧循环烧满 10s CPU
      if (line === '') { gotBlank = true; break; }
      lines.push(line);
    }
    for (;;) {
      const line = await ENGINE.readLine(50);
      if (line === null || line === '') break;
      lines.push(line);
    }
    for (const ln of lines) {
      // 取最后一次 ownership 报告（访问量最高的最终估计），而非第一行
      if (ln.includes('ownership')) {
        const o = extractOwnership(ln, size);
        if (o) ownership = o;
      }
      const parsedLine = parseAnalyzeLine(ln, size);
      if (parsedLine.length >= 2) {
        // KataGo 风格：单行即全量候选快照——以访问量最高的最后一行为准，整体替换
        candByMove.clear();
        for (const parsed of parsedLine) candByMove.set(parsed.px + ',' + parsed.py, parsed);
      } else {
        // 单候选行（mock / 老式引擎）：按点位合并
        for (const parsed of parsedLine) candByMove.set(parsed.px + ',' + parsed.py, parsed);
      }
    }
    if (candByMove.size) break;
  }

  if (!candByMove.size) {
    lastPos = null; // genmove 会实际落子，引擎棋盘领先于缓存——失效重建
    const gm = await ENGINE.command(`genmove ${toMove}`, Math.max(30000, seconds * 3000));
    let mv = null;
    for (const line of gm.lines) {
      const t = line.replace(/^=\s*/, '').trim();
      const v = parseVertexToken(t, size);
      if (Array.isArray(v)) { mv = { x: v[0], y: v[1] }; break; }
      if (t.toLowerCase() === 'pass') { mv = { pass: true }; break; }
    }
    if (!mv) return { ok: false, error: 'engine produced no move: ' + gm.lines.join(' ') };
    return { ok: true, engine: ENGINE_NAME, bestMove: mv, candidates: [], winrate: null, scoreLead: null, mode: 'genmove' };
  }

  const cands = [...candByMove.values()].sort((a, b) => b.visits - a.visits).slice(0, topN);
  const best = cands[0];
  // kata-analyze 的 ownership 为“行棋方视角”（正值=行棋方所有，已由真实引擎验证），
  // 统一归一化为黑方视角返回，前端所有形势/点目逻辑均按黑正处理
  let ownershipOut = ownership;
  if (ownershipOut && toMove === 'W') ownershipOut = ownershipOut.map(v => -v);
  // scoreMean 同为行棋方视角（含贴目），顶层 scoreLead 归一化为黑正，
  // 供点目「AI 参考分」直接消费（此前只在候选项里，前端取不到 → 一直显示"未参与"）
  const scoreLeadBlack = best && best.score !== undefined
    ? (toMove === 'B' ? best.score : -best.score) : null;
  return {
    ok: true,
    engine: ENGINE_NAME,
    engineKind: used,
    bestMove: best.pass_ ? { pass: true } : { x: best.px, y: best.py },
    candidates: cands.map(c => ({
      x: c.px, y: c.py, pass: !!c.pass_, visits: c.visits,
      winrate: c.wr !== undefined ? c.wr : null,       // percent, toMove perspective
      scoreLead: c.score !== undefined ? c.score : null,
      prior: c.prior, pv: c.pvMoves
    })),
    ownership: ownershipOut,                            // black perspective or null
    scoreLead: scoreLeadBlack,                          // black perspective, incl. komi, or null
    toMove: toMove === 'B' ? 1 : 2,
    size
  };
}

/* ------------------------------------------------------------------ *
 *  static files                                                        *
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip',
  '.md': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8'
};
/* 本地开发/发行都不希望浏览器把文件"粘住"：
 *  - HTML/CSS/JS：no-cache + ETag/Last-Modified（可 304，但不许无条件复用旧副本）
 *  - 引擎接口：no-store（/health 高频轮询，绝不能吃陈旧响应）
 * 离线兜底交给 Service Worker（网络优先，失败才回缓存）。 */
const NO_CACHE = 'no-cache, must-revalidate';
const NO_STORE = 'no-store';

function serveStatic(req, res, urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch (e) {
    res.writeHead(400); return res.end('bad request'); // 畸形 %序列 不允许打崩进程
  }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  // 路径穿越：仅放行 ROOT 本身与其直接子路径——"/../兄弟目录" 归一化后也带不上 ROOT+sep 前缀
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Cache-Control': NO_STORE }); return res.end('not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const tag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    const head = {
      'Content-Type': type,
      'Cache-Control': NO_CACHE,
      'ETag': tag,
      'Last-Modified': st.mtime.toUTCString()
    };
    if (req.headers['if-none-match'] === tag) {
      res.writeHead(304, { 'ETag': tag, 'Cache-Control': NO_CACHE, 'Last-Modified': head['Last-Modified'] });
      return res.end();
    }
    fs.readFile(file, (err2, data) => {
      if (err2) { res.writeHead(404, { 'Cache-Control': NO_STORE }); return res.end('not found'); }
      head['Content-Length'] = data.length;
      res.writeHead(200, head);
      res.end(data);
    });
  });
}

/* ------------------------------------------------------------------ *
 *  http server                                                         *
 * ------------------------------------------------------------------ */
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => {
      data += c;
      if (data.length > 5e6) { req.destroy(); finish({}); } // 超限：销毁连接并立即放行，不悬挂
    });
    req.on('end', () => {
      let obj = {};
      try { obj = JSON.parse(data || '{}'); } catch (e) { obj = {}; } // 坏 JSON 按 {} 处理
      finish(obj);
    });
    req.on('error', () => finish({}));
    req.on('close', () => finish({}));
  });
}
/* CORS 收紧：仅放行本机回环 Origin（含任意端口）；无 Origin（curl/同源导航）直接放行。
 * 其余跨域网页不给 ACAO 头——浏览器会拦截其读取响应，防止恶意网页驱动本地引擎。 */
function corsHeaders(req) {
  const origin = req.headers.origin;
  const h = { 'Content-Type': 'application/json; charset=utf-8' };
  if (!origin || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) {
    h['Access-Control-Allow-Origin'] = origin || '*';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  }
  return h;
}
function sendJson(req, res, obj, status = 200) {
  const body = JSON.stringify(obj);
  // /health 每 4s 轮询、/analyze 结果随局面变化：一律 no-store
  const h = corsHeaders(req);
  h['Cache-Control'] = NO_STORE;
  res.writeHead(status, h);
  res.end(body);
}

/* 引擎能力探测结果缓存：/health 高频轮询（前端每 4s）不应每次都向引擎发 3 条 GTP 命令。
 * 探测成功后缓存；引擎退出或命令失败时失效；并发请求共享同一次探测。 */
let engineInfoCache = null;
let engineProbing = null;
function invalidateEngineInfo() { engineInfoCache = null; }
/* 锁内核心：调用方必须已持有 engineMutex（/analyze 路径内复用，避免重入死锁） */
async function probeEngineLocked() {
  if (engineInfoCache) return engineInfoCache;
  const nm = await ENGINE.command('name', 15000);
  const ver = await ENGINE.command('version', 15000);
  const lc = await ENGINE.command('list_commands', 15000);
  if (!lc.ok) return null;
  const commands = new Set();
  for (const line of lc.lines) for (const c of line.replace(/^=\s*/, '').split(/\s+/)) commands.add(c);
  ENGINE_NAME = nm.ok && nm.lines[0] ? nm.lines[0].replace(/^=\s*/, '') : 'unknown';
  ENGINE_COMMANDS = commands;
  engineInfoCache = {
    name: ENGINE_NAME,
    version: ver.ok && ver.lines[0] ? ver.lines[0].replace(/^=\s*/, '') : '',
    supportsAnalyze: commands.has('kata-analyze') || commands.has('lz-analyze'),
    supportsOwnership: commands.has('kata-analyze'),
    kataAnalyze: commands.has('kata-analyze'),
    lzAnalyze: commands.has('lz-analyze')
  };
  return engineInfoCache;
}
/* /health 等锁外调用入口：与 /analyze、/gtp 同一互斥，探测不会插进流式分析中间 */
function probeEngine() {
  if (engineInfoCache) return Promise.resolve(engineInfoCache);
  if (engineProbing) return engineProbing;
  engineProbing = withEngineMutex(probeEngineLocked).finally(() => { engineProbing = null; });
  return engineProbing;
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    // 未处理 rejection 在 Node ≥15 直接退出进程——任何端点意外失败都必须降级成 JSON 错误
    console.error('[got] handler error:', e && e.stack || e);
    try { sendJson(req, res, { ok: false, error: String(e && e.message || e) }, 500); }
    catch (e2) { try { res.end(); } catch (e3) { } }
  }
});

/* Bind the requested loopback port and advance through a small local range on
 * EADDRINUSE. This is deliberately kept in the server as a final race-safe
 * fallback; the BAT launchers perform the same quick check to show the chosen
 * port before Node starts. */
function listenWithFallback(startPort) {
  return new Promise((resolve, reject) => {
    const limit = startPort === 0 ? 1 : PORT_SCAN_LIMIT;
    let port = startPort;
    let tried = 0;
    const attempt = () => {
      tried += 1;
      const onListening = () => {
        server.removeListener('error', onError);
        server.removeListener('listening', onListening);
        resolve(server.address().port);
      };
      const onError = (err) => {
        server.removeListener('listening', onListening);
        server.removeListener('error', onError);
        if (err && err.code === 'EADDRINUSE' && port > 0 && port < 65535 && tried < limit) {
          const blocked = port;
          port += 1;
          console.warn(`[got] port ${blocked} is busy; trying ${port}`);
          /* After a failed listen Node reports ERR_SERVER_NOT_RUNNING from
           * close(); the callback is still the safe point for the next bind. */
          server.close(() => setImmediate(attempt));
          return;
        }
        reject(err);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };
    attempt();
  });
}

async function handle(req, res) {
  const u = req.url || '/';
  if (req.method === 'OPTIONS') return sendJson(req, res, { ok: true });
  if (ANALYSIS && u === '/health') return sendJson(req, res, {
    ok: ANALYSIS.alive, service: 'got_server', engine: { name: 'KataGo', version: '',
      nativeAnalysis: true, supportsAnalyze: true, supportsOwnership: true, kataAnalyze: true, model: ANALYSIS.model }
  });
  if (ANALYSIS && (u === '/analysis' || u === '/analyze') && req.method === 'POST') {
    const body = await readBody(req);
    const ctrl = new AbortController();
    res.on('close', () => ctrl.abort());
    const streaming = u === '/analysis';
    if (streaming) res.writeHead(200, { ...corsHeaders(req), 'Content-Type': 'application/x-ndjson', 'Cache-Control': NO_STORE });
    const send = obj => { if (!res.destroyed) res.write(JSON.stringify(obj) + '\n'); };
    try {
      const result = await ANALYSIS.analyze(body, { signal: ctrl.signal, onUpdate: streaming ? send : undefined });
      if (streaming) { send(result); res.end(); }
      else if (!res.destroyed) sendJson(req, res, result);
    } catch (e) {
      if (!res.destroyed) {
        if (streaming) { send({ ok: false, error: e.message }); res.end(); }
        else sendJson(req, res, { ok: false, error: e.message }, 500);
      }
    }
    return;
  }
  if (USE_ENGINE && ENGINE && u === '/health') {
    const info = await probeEngine();
    if (!info) return sendJson(req, res, { ok: false, error: 'engine not ready' }, 503);
    return sendJson(req, res, { ok: true, service: 'got_server', engine: info });
  }
  if (USE_ENGINE && ENGINE && u === '/gtp' && req.method === 'POST') {
    const body = await readBody(req);
    const cmd = String(body.command || '').trim();
    if (!cmd) return sendJson(req, res, { ok: false, error: 'command required' }, 400);
    const head = cmd.split(/\s+/)[0].toLowerCase();
    if (['kata-analyze', 'lz-analyze', 'quit', 'kata-genmove_analyze', 'lz-genmove_analyze'].includes(head))
      return sendJson(req, res, { ok: false, error: 'streaming/quit commands not allowed here' }, 400);
    lastPos = null; // 透传命令可能改变棋盘状态，增量重放缓存失效
    const r = await withEngineMutex(() => ENGINE.command(cmd, 120000));
    if (!r.ok && !ENGINE.alive) invalidateEngineInfo();
    return sendJson(req, res, { ok: r.ok, response: r.lines.join('\n') });
  }
  if (USE_ENGINE && ENGINE && u === '/analyze' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const result = await withEngineMutex(() => doAnalyze(body));
      return sendJson(req, res, result);
    } catch (e) { return sendJson(req, res, { ok: false, error: String(e && e.message || e) }, 500); }
  }
  if (u === '/health' || u === '/gtp' || u === '/analyze') {
    return sendJson(req, res, { ok: false, error: 'engine not running' }, 503);
  }
  if (req.method === 'GET') return serveStatic(req, res, u);
  res.writeHead(404); res.end();
}

async function main() {
  const engineArgIdx = args.indexOf('--engine-cmd');
  let cmd = engineArgIdx >= 0 ? args[engineArgIdx + 1] : null;
  if (USE_ENGINE) {
    const native = !cmd && NativeAnalysis.detect(ROOT);
    if (native) {
      ANALYSIS = new NativeAnalysis.AnalysisEngine(native.exe, native.args, native.model);
      console.log('[got] KataGo JSON analysis:', native.model);
    }
    if (!cmd && !native) cmd = detectEngineCmd();
    if (cmd && !native) {
      console.log('[got] engine:', cmd);
      ENGINE = new GtpProcess(cmd);
      ENGINE.child.on('exit', () => { invalidateEngineInfo(); lastPos = null; ENGINE_COMMANDS = null; });
      ENGINE_CMDLINE = cmd;
      // 预热：等引擎就绪（KataGo 首启 GPU 调优 10–90s）。单次窗口放宽到 30s，
      // 超时留下的迟到响应由 swallowGarbage 机制保证下一条命令对齐
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        const r = await ENGINE.command('list_commands', 30000);
        if (r.ok) break;
        await new Promise(res => setTimeout(res, 400));
      }
    } else if (!native) {
      console.log('[got] no GTP engine found — serving built-in-AI-only mode');
    }
  }
  const activePort = await listenWithFallback(PORT);
  console.log(`[got] GoT serving at http://127.0.0.1:${activePort}`);
  console.log('[got] Ctrl+C to stop');
  // 服务器就绪后再打开浏览器（--open），避免“页面先于服务启动”的竞态（Windows / Linux 都支持）
  if (args.includes('--open')) {
    try {
      const { exec } = require('child_process');
      if (process.platform === 'win32') exec(`start "" http://127.0.0.1:${activePort}`, { shell: 'cmd.exe' });
      else exec(`xdg-open http://127.0.0.1:${activePort}`, () => { }); // 无桌面环境时静默失败
    } catch (e) { console.error('[got] open browser failed:', e.message); }
  }
}
/* 退出时同步杀死引擎进程树——shell:true 下直接 kill 只能杀到 cmd.exe，
 * Windows 上要用 taskkill /T 连整棵进程树一起收掉，否则 KataGo 变孤儿进程继续烧 GPU */
function killEngineTree() {
  if (ANALYSIS) ANALYSIS.stop();
  if (!ENGINE) return;
  try {
    if (process.platform === 'win32' && ENGINE.child.pid) {
      require('child_process').execSync(`taskkill /pid ${ENGINE.child.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
    } else {
      ENGINE.child.kill('SIGTERM');
    }
  } catch (e) { /* 进程可能已退出 */ }
}
function shutdown() { killEngineTree(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', killEngineTree);
// 兜底：任何拒绝都不允许打崩整个桥接服务（未处理 rejection 默认退出进程）
process.on('unhandledRejection', (e) => { console.error('[got] unhandled rejection:', e && e.stack || e); });
if (require.main === module) {
  main().catch(e => { console.error('[got] startup failed:', e && e.stack || e); process.exit(1); });
}
/* detectEngineCmd 供单元测试直接调用（require 本文件不会启动服务） */
module.exports = { detectEngineCmd };
