/* GoT — Go (Weiqi/Baduk) rules engine.
 * Board, captures, simple & positional-superko ko, suicide, handicap,
 * area/territory scoring, game tree with variations, SGF 4 import/export.
 * UMD-ish: usable in browser (window.GoEngine) and Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GoEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

  function other(color) { return color === BLACK ? WHITE : BLACK; }

  /* ------------------------------------------------------------------ *
   *  Zobrist hashing (two 32-bit halves packed into a string key)       *
   * ------------------------------------------------------------------ */
  const zobristCache = new Map(); // size -> {piece: Float64Array-ish pairs}
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function zobristFor(size) {
    let z = zobristCache.get(size);
    if (z) return z;
    const rnd = mulberry32(0x9E3779B9 ^ (size * 2654435761));
    const piece = new Int32Array(size * size * 2 * 2); // [point][color-1][half]
    for (let i = 0; i < piece.length; i++) piece[i] = (rnd() * 4294967296) | 0;
    z = { piece, turnB: [(rnd() * 4294967296) | 0, (rnd() * 4294967296) | 0] };
    zobristCache.set(size, z);
    return z;
  }
  function hashKey(h1, h2) { return h1 + ':' + h2; }

  /* ------------------------------------------------------------------ *
   *  Position: immutable-ish board state                                *
   * ------------------------------------------------------------------ */
  class Position {
    constructor(size) {
      this.size = size;
      this.board = new Int8Array(size * size);
      this.turn = BLACK;
      this.captures = new Int16Array(3); // [_, black's prisoners, white's prisoners]
      this.ko = -1;                       // simple-ko forbidden point
      this.lastMove = -1;                 // index of last placed stone (-1 none)
      this.lastWasPass = false;
      this.moveNumber = 0;
      const z = zobristFor(size);
      this.zh = z.piece; this.zt = z.turnB;
      this.h1 = 0; this.h2 = 0;
      this.history = new Set();           // hash keys seen (for superko)
      this.history.add(hashKey(0, 0));
    }
    clone() {
      const p = Object.create(Position.prototype);
      p.size = this.size; p.board = this.board.slice(); p.turn = this.turn;
      p.captures = this.captures.slice(); p.ko = this.ko; p.lastMove = this.lastMove;
      p.lastWasPass = this.lastWasPass; p.moveNumber = this.moveNumber;
      p.zh = this.zh; p.zt = this.zt;
      p.h1 = this.h1; p.h2 = this.h2;
      p.history = new Set(this.history);
      return p;
    }
    idx(x, y) { return y * this.size + x; }
    xy(i) { return [i % this.size, (i / this.size) | 0]; }
    neighbors(i) {
      const s = this.size, x = i % s, out = [];
      if (x > 0) out.push(i - 1);
      if (x < s - 1) out.push(i + 1);
      if (i >= s) out.push(i - s);
      if (i < s * (s - 1)) out.push(i + s);
      return out;
    }
    /* Flood-fill a group; returns {stones:[...], libs:Set} */
    group(i, board) {
      board = board || this.board;
      const color = board[i];
      const stones = [];
      const libs = new Set();
      const seen = new Set([i]);
      const stack = [i];
      while (stack.length) {
        const c = stack.pop();
        stones.push(c);
        const s = this.size, x = c % s;
        const nb = [];
        if (x > 0) nb.push(c - 1);
        if (x < s - 1) nb.push(c + 1);
        if (c >= s) nb.push(c - s);
        if (c < s * (s - 1)) nb.push(c + s);
        for (let k = 0; k < nb.length; k++) {
          const n = nb[k];
          if (board[n] === EMPTY) libs.add(n);
          else if (board[n] === color && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
      return { stones, libs };
    }
    isLegal(color, i, allowSuicide) {
      return this.checkPlay(color, i, allowSuicide).ok;
    }
    /* superko=true 时按 position hash 拒绝循环局面（中国规则 positional superko） */
    checkPlay(color, i, allowSuicide, superko) {
      const b = this.board;
      if (i < 0 || i >= b.length) return { ok: false, reason: 'offboard' };
      if (b[i] !== EMPTY) return { ok: false, reason: 'occupied' };
      if (i === this.ko) return { ok: false, reason: 'ko' };
      // simulate
      const s = this.size;
      const sim = b.slice();
      sim[i] = color;
      let captured = 0;
      const capturedPts = [];
      const x = i % s;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < s - 1) nb.push(i + 1);
      if (i >= s) nb.push(i - s);
      if (i < s * (s - 1)) nb.push(i + s);
      for (const n of nb) {
        if (sim[n] === other(color)) {
          const g = this.group(n, sim);
          if (g.libs.size === 0) {
            captured += g.stones.length;
            for (const st of g.stones) capturedPts.push(st);
          }
        }
      }
      if (captured === 0) {
        const g = this.group(i, sim);
        if (g.libs.size === 0 && !allowSuicide) return { ok: false, reason: 'suicide' };
      }
      if (superko) {
        // 模拟落子后的局面哈希（落子 + 提子 + 行棋方），与历史比对
        let h1 = this.h1, h2 = this.h2;
        const off = i * 4 + (color - 1) * 2;
        h1 = (h1 ^ this.zh[off]) | 0; h2 = (h2 ^ this.zh[off + 1]) | 0;
        const co = other(color);
        for (const st of capturedPts) {
          const so = st * 4 + (co - 1) * 2;
          h1 = (h1 ^ this.zh[so]) | 0; h2 = (h2 ^ this.zh[so + 1]) | 0;
        }
        if (color === WHITE) { h1 = (h1 ^ this.zt[0]) | 0; h2 = (h2 ^ this.zt[1]) | 0; }
        if (this.history.has(hashKey(h1, h2))) return { ok: false, reason: 'superko' };
      }
      return { ok: true, captured };
    }
    /* Play a stone. Returns {ok, captured:[idx]} or {ok:false, reason}. */
    play(color, i, allowSuicide, superko) {
      const chk = this.checkPlay(color, i, allowSuicide, superko);
      if (!chk.ok) return chk;
      const b = this.board, s = this.size, opp = other(color);
      b[i] = color;
      const captured = [];
      const x = i % s;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < s - 1) nb.push(i + 1);
      if (i >= s) nb.push(i - s);
      if (i < s * (s - 1)) nb.push(i + s);
      for (const n of nb) {
        if (b[n] === opp) {
          const g = this.group(n, b);
          if (g.libs.size === 0) {
            for (const st of g.stones) { b[st] = EMPTY; captured.push(st); }
          }
        }
      }
      this.captures[color] += captured.length;
      // simple ko: single stone captured by a single stone that itself has 1 liberty
      if (captured.length === 1) {
        const g = this.group(i, b);
        if (g.stones.length === 1 && g.libs.size === 1) this.ko = captured[0];
        else this.ko = -1;
      } else this.ko = -1;
      // zobrist
      const off = i * 4 + (color - 1) * 2;
      this.h1 = (this.h1 ^ this.zh[off]) | 0;
      this.h2 = (this.h2 ^ this.zh[off + 1]) | 0;
      if (color === WHITE) { this.h1 = (this.h1 ^ this.zt[0]) | 0; this.h2 = (this.h2 ^ this.zt[1]) | 0; }
      this.lastMove = i; this.lastWasPass = false;
      this.moveNumber++; this.turn = opp;
      this.history.add(hashKey(this.h1, this.h2));
      return { ok: true, captured };
    }
    pass(color) {
      if (color === WHITE) { this.h1 = (this.h1 ^ this.zt[0]) | 0; this.h2 = (this.h2 ^ this.zt[1]) | 0; }
      this.lastMove = -1; this.lastWasPass = true; this.ko = -1;
      this.moveNumber++; this.turn = other(color);
      this.history.add(hashKey(this.h1, this.h2));
      return { ok: true, captured: [] };
    }
    setStone(i, color) { // setup stones (no capture logic); board arrays only
      const old = this.board[i];
      if (old === color) return;
      if (old !== EMPTY) {
        const off = i * 4 + (old - 1) * 2;
        this.h1 = (this.h1 ^ this.zh[off]) | 0;
        this.h2 = (this.h2 ^ this.zh[off + 1]) | 0;
      }
      this.board[i] = EMPTY;
      if (color !== EMPTY) {
        const off = i * 4 + (color - 1) * 2;
        this.h1 = (this.h1 ^ this.zh[off]) | 0;
        this.h2 = (this.h2 ^ this.zh[off + 1]) | 0;
      }
      this.board[i] = color;
      this.ko = -1;
      this.history.add(hashKey(this.h1, this.h2));
    }
    key() { return hashKey(this.h1, this.h2); }
    /* Tromp-Taylor-like area count (used by playouts & Chinese scoring base) */
    areaScore(komi) {
      const b = this.board, n = b.length;
      let black = 0, white = 0;
      for (let i = 0; i < n; i++) { if (b[i] === BLACK) black++; else if (b[i] === WHITE) white++; }
      const seen = new Uint8Array(n);
      const stack = [];
      for (let i = 0; i < n; i++) {
        if (b[i] !== EMPTY || seen[i]) continue;
        let touchB = false, touchW = false, cnt = 0;
        seen[i] = 1; stack.length = 0; stack.push(i);
        while (stack.length) {
          const c = stack.pop(); cnt++;
          const s = this.size, x = c % s;
          const nb = [];
          if (x > 0) nb.push(c - 1);
          if (x < s - 1) nb.push(c + 1);
          if (c >= s) nb.push(c - s);
          if (c < s * (s - 1)) nb.push(c + s);
          for (let k = 0; k < nb.length; k++) {
            const nn = nb[k];
            if (b[nn] === BLACK) touchB = true;
            else if (b[nn] === WHITE) touchW = true;
            else if (!seen[nn]) { seen[nn] = 1; stack.push(nn); }
          }
        }
        if (touchB && !touchW) black += cnt;
        else if (touchW && !touchB) white += cnt;
      }
      return { black, white, blackScore: black, whiteScore: white + komi };
    }
  }

  /* ------------------------------------------------------------------ *
   *  Handicap placement (standard star points)                          *
   * ------------------------------------------------------------------ */
  const STAR = {
    9: [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4]],
    13: [[3, 9], [9, 3], [9, 9], [3, 3], [6, 6], [3, 6], [6, 3], [6, 9], [9, 6]],
    19: [[3, 15], [15, 3], [15, 15], [3, 3], [9, 9], [3, 9], [9, 3], [9, 15], [15, 9]]
  };
  // order for 2..9 handicap stones (standard convention)
  function handicapStones(size, n) {
    const pts = STAR[size] || STAR[19];
    const order = {
      2: [0, 1], 3: [0, 1, 2], 4: [0, 1, 2, 3], 5: [0, 1, 2, 3, 8],
      6: [0, 1, 2, 3, 8, 6], 7: [0, 1, 2, 3, 8, 6, 4],
      8: [0, 1, 2, 3, 8, 6, 4, 7], 9: [0, 1, 2, 3, 8, 6, 4, 7, 5]
    };
    const sel = order[Math.min(n, 9)] || [];
    return sel.map(i => pts[i]);
  }
  function starPoints(size) {
    if (size === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
    if (size === 13) return [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]];
    if (size === 9) return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]];
    if (size === 7) return [[3, 3]];
    const e = size >= 13 ? 3 : 2, m = (size - 1) / 2;
    const out = [[e, e], [size - 1 - e, e], [e, size - 1 - e], [size - 1 - e, size - 1 - e]];
    if (m % 1 === 0) out.push([m, m]);
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  Game tree                                                          *
   * ------------------------------------------------------------------ */
  let NODE_ID = 1;
  class Node {
    constructor(parent, move) {
      this.id = NODE_ID++;
      this.parent = parent || null;
      this.children = [];
      this.move = move || null;   // {color, x, y, pass}
      this.setup = null;          // {AB:[idx], AW:[idx], AE:[idx]}
      this.comment = '';
      this.props = {};            // misc SGF props (PB, RE, DT, RU, ...)
    }
    isMainLineChild() {
      return this.parent && this.parent.children[0] === this;
    }
  }

  const RULES = {
    chinese: { komi: 7.5, scoring: 'area', superko: true, label: '中国规则' },
    japanese: { komi: 6.5, scoring: 'territory', superko: false, label: '日本规则' },
    korean: { komi: 6.5, scoring: 'territory', superko: false, label: '韩国规则' }
  };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.size = opts.size || 19;
      this.rules = opts.rules || 'chinese';
      this.komi = opts.komi !== undefined ? opts.komi : RULES[this.rules].komi;
      this.handicap = opts.handicap || 0;
      this.root = new Node(null, null);
      this.root.props = {
        GM: '1', FF: '4', CA: 'UTF-8', AP: ['GoT', '1.0'],
        SZ: String(this.size), KM: String(this.komi), RU: this.rules
      };
      if (this.handicap >= 2) {
        this.root.props.HA = String(this.handicap);
        const pts = handicapStones(this.size, this.handicap);
        this.root.setup = { AB: pts.map(p => p[1] * this.size + p[0]), AW: [], AE: [] };
      }
      this.current = this.root;
      this._posCache = new Map(); // node.id -> Position (invalidated by generation)
      this._gen = 0;
      this.playerNames = { 1: '', 2: '' };
      this.playerRanks = { 1: '', 2: '' };
      this.result = '';
      this.date = '';
      this.event = '';
    }
    infoProps() {
      const p = this.root.props;
      if (this.playerNames[BLACK]) p.PB = this.playerNames[BLACK];
      if (this.playerNames[WHITE]) p.PW = this.playerNames[WHITE];
      if (this.playerRanks[BLACK]) p.BR = this.playerRanks[BLACK];
      if (this.playerRanks[WHITE]) p.WR = this.playerRanks[WHITE];
      if (this.result) p.RE = this.result;
      if (this.date) p.DT = this.date;
      if (this.event) p.EV = this.event;
      p.KM = String(this.komi); p.RU = this.rules; p.SZ = String(this.size);
      return p;
    }
    /* Position after applying all moves/setup from root to node. */
    positionAt(node) {
      node = node || this.current;
      const cached = this._posCache.get(node.id);
      if (cached && cached.__gen === this._gen) return cached.pos;
      // build ancestor chain
      const chain = [];
      let n = node;
      while (n) { chain.push(n); n = n.parent; }
      chain.reverse();
      const pos = new Position(this.size);
      for (const nd of chain) {
        if (nd.setup) {
          for (const i of (nd.setup.AB || [])) pos.setStone(i, BLACK);
          for (const i of (nd.setup.AW || [])) pos.setStone(i, WHITE);
          for (const i of (nd.setup.AE || [])) pos.setStone(i, EMPTY);
          // handicap/setup stones on the root: White moves first (SGF convention)
          if (nd === this.root && ((nd.setup.AB && nd.setup.AB.length) || (nd.setup.AW && nd.setup.AW.length))) {
            pos.turn = WHITE;
          }
        }
        if (nd.move) {
          const i = nd.move.pass ? -1 : pos.idx(nd.move.x, nd.move.y);
          if (nd.move.pass) pos.pass(nd.move.color);
          else pos.play(nd.move.color, i);
        }
      }
      this._posCache.set(node.id, { __gen: this._gen, pos });
      return pos;
    }
    invalidate() { this._gen++; this._posCache.clear(); }
    /* find existing child with same move (variation replay) */
    findChild(node, move) {
      for (const c of node.children) {
        if (move.pass && c.move && c.move.pass && c.move.color === move.color) return c;
        if (c.move && !c.move.pass && !move.pass && c.move.x === move.x && c.move.y === move.y) return c;
      }
      return null;
    }
    play(color, x, y) {
      const pos = this.positionAt(this.current);
      const superko = !!(RULES[this.rules] && RULES[this.rules].superko);
      const chk = pos.checkPlay(color, y * this.size + x, undefined, superko);
      if (!chk.ok) return chk;
      let child = this.findChild(this.current, { color, x, y, pass: false });
      if (!child) {
        child = new Node(this.current, { color, x, y, pass: false });
        this.current.children.push(child);
      }
      this.current = child;
      return { ok: true, node: child };
    }
    pass(color) {
      let child = this.findChild(this.current, { color, pass: true });
      if (!child) {
        child = new Node(this.current, { color, x: -1, y: -1, pass: true });
        this.current.children.push(child);
      }
      this.current = child;
      return { ok: true, node: child };
    }
    placeSetup(color, x, y) { // edit mode: add/remove stone as setup on a fresh node
      const node = new Node(this.current, null);
      const i = y * this.size + x;
      const cur = this.positionAt(this.current);
      const curColor = cur.board[i];
      const setup = { AB: [], AW: [], AE: [] };
      if (color === EMPTY && curColor !== EMPTY) setup.AE.push(i);
      else if (color !== EMPTY) {
        if (curColor !== EMPTY) setup.AE.push(i);
        (color === BLACK ? setup.AB : setup.AW).push(i);
      } else return null;
      node.setup = setup;
      this.current.children.push(node);
      this.current = node;
      return node;
    }
    legalMoves(color) {
      const pos = this.positionAt(this.current);
      const out = [];
      for (let i = 0; i < pos.board.length; i++) {
        if (pos.board[i] === EMPTY && pos.isLegal(color, i)) out.push(i);
      }
      return out;
    }
    navParent() { if (this.current.parent) { this.current = this.current.parent; return true; } return false; }
    navChild(k) {
      const c = this.current.children[k];
      if (c) { this.current = c; return true; }
      return false;
    }
    navNext(k) {
      // step into main child (k===undefined -> index of current within parent +? ) kept simple
      return this.navChild(k || 0);
    }
    navSibling(delta) {
      const p = this.current.parent;
      if (!p) return false;
      const i = p.children.indexOf(this.current);
      const j = i + delta;
      if (j >= 0 && j < p.children.length) { this.current = p.children[j]; return true; }
      return false;
    }
    mainLine() {
      const out = [];
      let n = this.root;
      while (n.children.length) { n = n.children[0]; out.push(n); }
      return out;
    }
    pathFromRoot(node) {
      const out = [];
      let n = node || this.current;
      while (n) { out.unshift(n); n = n.parent; }
      return out;
    }
    treeHeight(node, d) {
      node = node || this.root; d = d || 0;
      let m = d;
      for (const c of node.children) m = Math.max(m, this.treeHeight(c, d + 1));
      return m;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Scoring                                                            *
   * ------------------------------------------------------------------ */
  /*
   * dead: Set of point indices whose entire group is considered dead.
   * rules.scoring: 'area' (Chinese) | 'territory' (Japanese/Korean)
   * ownership: 可选，AI 形势数组（黑正，-1..1）。洪泛判为公气（dame）的空点，
   *            若 AI 强烈归属一方（|v| > ownThreshold）则计入该方领地——
   *            这样 AI 判定围住的区域（含未标死子的空域）也会被算上。
   * Returns {black, white, komi, diff, territory:Int8Array(0/1/2), deadStones:[...], captures}
   */
  function scorePosition(pos, opts) {
    opts = opts || {};
    const dead = opts.dead || new Set();
    const komi = opts.komi !== undefined ? opts.komi : 0;
    const mode = opts.scoring || 'area';
    const ownership = (opts.ownership && opts.ownership.length === pos.size * pos.size) ? opts.ownership : null;
    const ownT = opts.ownThreshold !== undefined ? opts.ownThreshold : 0.5;
    const size = pos.size, b = pos.board;
    const work = b.slice();
    const deadStones = [];
    for (const i of dead) if (work[i] !== EMPTY) { deadStones.push(i); work[i] = EMPTY; }
    const territory = new Int8Array(size * size); // 0 none/dame, 1 black, 2 white
    const seen = new Uint8Array(size * size);
    let terrB = 0, terrW = 0;
    const stack = [];
    for (let i = 0; i < work.length; i++) {
      if (work[i] !== EMPTY || seen[i]) continue;
      let touchB = false, touchW = false;
      const region = [];
      seen[i] = 1; stack.length = 0; stack.push(i);
      while (stack.length) {
        const c = stack.pop(); region.push(c);
        const s = size, x = c % s;
        const nb = [];
        if (x > 0) nb.push(c - 1);
        if (x < s - 1) nb.push(c + 1);
        if (c >= s) nb.push(c - s);
        if (c < s * (s - 1)) nb.push(c + s);
        for (let k = 0; k < nb.length; k++) {
          const nn = nb[k];
          if (work[nn] === BLACK) touchB = true;
          else if (work[nn] === WHITE) touchW = true;
          else if (!seen[nn]) { seen[nn] = 1; stack.push(nn); }
        }
      }
      let owner = 0;
      if (touchB && !touchW) owner = BLACK;
      else if (touchW && !touchB) owner = WHITE;
      if (owner) { for (const r of region) territory[r] = owner; if (owner === BLACK) terrB += region.length; else terrW += region.length; }
      else if (ownership) {
        // 公气/含未标死子的空域：交给 AI 形势判定
        let oB = false, oW = false;
        for (const r of region) { const v = ownership[r] || 0; if (v > ownT) oB = true; else if (v < -ownT) oW = true; }
        if (oB && !oW) owner = BLACK;
        else if (oW && !oB) owner = WHITE;
        if (owner) { for (const r of region) territory[r] = owner; if (owner === BLACK) terrB += region.length; else terrW += region.length; }
      }
    }
    let stonesB = 0, stonesW = 0;
    for (let i = 0; i < work.length; i++) { if (work[i] === BLACK) stonesB++; else if (work[i] === WHITE) stonesW++; }
    let black, white;
    if (mode === 'territory') {
      black = terrB + pos.captures[BLACK] + deadStones.filter(i => b[i] === WHITE).length;
      white = terrW + pos.captures[WHITE] + deadStones.filter(i => b[i] === BLACK).length;
    } else { // area
      black = stonesB + terrB;
      white = stonesW + terrW;
    }
    white += komi;
    return {
      black, white, komi, diff: black - white,
      result: black > white ? 'B+' + (black - white) : white > black ? 'W+' + (white - black) : 'Draw',
      territory, deadStones: deadStones.slice(), stonesB, stonesW, terrB, terrW
    };
  }

  /* ------------------------------------------------------------------ *
   *  Coordinates                                                        *
   * ------------------------------------------------------------------ */
  const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRST';
  function coordName(size, x, y) { return GTP_LETTERS[x] + (size - y); }
  function parseCoordName(size, name) {
    const m = /^[A-T](\d{1,2})$/i.exec(name.trim());
    if (!m) return null;
    const x = GTP_LETTERS.indexOf(m[1].toUpperCase());
    const y = size - parseInt(m[1], 10);
    if (x < 0 || x >= size || y < 0 || y >= size) return null;
    return [x, y];
  }
  function sgfVertex(size, x, y) { return SGF_LETTERS[x] + SGF_LETTERS[y]; }
  function parseSgfVertex(v, size) {
    if (!v || v.length < 2) return null;
    const x = SGF_LETTERS.indexOf(v[0]), y = SGF_LETTERS.indexOf(v[1]);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return [x, y];
  }

  /* ------------------------------------------------------------------ *
   *  SGF import / export (FF[4], variations)                            *
   * ------------------------------------------------------------------ */
  function escSgf(s) { return String(s).replace(/\\/g, '\\\\').replace(/]/g, '\\]'); }
  function gameToSgf(game) {
    function propsOf(node) {
      const p = [];
      const size = game.size;
      const toV = i => sgfVertex(size, i % size, (i / size) | 0);
      if (node.setup) {
        if (node.setup.AB && node.setup.AB.length) p.push('AB' + node.setup.AB.map(i => '[' + toV(i) + ']').join(''));
        if (node.setup.AW && node.setup.AW.length) p.push('AW' + node.setup.AW.map(i => '[' + toV(i) + ']').join(''));
        if (node.setup.AE && node.setup.AE.length) p.push('AE' + node.setup.AE.map(i => '[' + toV(i) + ']').join(''));
      }
      if (node.move) {
        const v = node.move.pass ? '' : sgfVertex(size, node.move.x, node.move.y);
        p.push((node.move.color === BLACK ? 'B' : 'W') + '[' + v + ']');
      }
      if (node.comment) p.push('C[' + escSgf(node.comment) + ']');
      return p;
    }
    function walk(node) {
      const isRoot = node === game.root;
      const parts = [];
      if (isRoot) {
        const p = [];
        const info = game.infoProps();
        for (const k of Object.keys(info)) {
          const v = info[k];
          const vs = Array.isArray(v) ? v : [v];
          p.push(k + vs.map(x => '[' + escSgf(x) + ']').join(''));
        }
        if (game.root.setup && game.root.setup.AB && game.root.setup.AB.length) {
          const toV = i => sgfVertex(game.size, i % game.size, (i / game.size) | 0);
          p.push('AB' + game.root.setup.AB.map(i => '[' + toV(i) + ']').join(''));
        }
        parts.push(';' + p.join(''));
      } else {
        const p = propsOf(node);
        parts.push(p.length ? ';' + p.join('') : ';');
      }
      const children = node.children;
      if (children.length === 1) {
        parts.push(walk(children[0]));
      } else if (children.length > 1) {
        for (const c of children) parts.push('(' + walk(c) + ')');
      }
      return parts.join('');
    }
    return '(' + walk(game.root) + ')\n';
  }

  /* Parse SGF text -> Game (with variations) */
  function sgfToGame(text) {
    let i = 0;
    const n = text.length;
    function ws() { while (i < n && /\s/.test(text[i])) i++; }
    function parseNode() {
      ws(); if (text[i] !== ';') return null;
      i++;
      const props = {};
      ws();
      while (i < n && /[A-Za-z]/.test(text[i])) {
        let key = '';
        while (i < n && /[A-Za-z]/.test(text[i])) key += text[i++];
        const values = [];
        ws();
        while (i < n && text[i] === '[') {
          i++;
          let v = '';
          while (i < n && text[i] !== ']') {
            if (text[i] === '\\') { i++; if (i < n) v += text[i++]; }
            else v += text[i++];
          }
          i++; // skip ]
          values.push(v);
          ws();
        }
        if (props[key]) props[key] = props[key].concat(values);
        else props[key] = values;
      }
      return props;
    }
    function parseTree(game, parent) {
      // parse one gametree: sequence of nodes then child variations
      ws();
      if (text[i] !== '(') return null;
      i++;
      let node = null, first = true;
      while (true) {
        ws();
        if (text[i] === ';') {
          const props = parseNode();
          if (first && parent === null) {
            node = game.root;
            applyPropsRoot(game, props);
          } else {
            node = new Node(parent, null);
            parent.children.push(node);
            applyPropsNode(game, node, props);
          }
          parent = node;
          first = false;
        } else break;
      }
      ws();
      while (text[i] === '(') {
        parseTree(game, parent);
        ws();
      }
      ws();
      if (text[i] === ')') i++;
      return game.root;
    }
    // 预扫描 SZ：非根节点的 AB/AW/AE/B/W 换算依赖正确棋盘尺寸，
    // 解析期间 game.size 必须先就位（此前按 19 解析会让 9/13 路非根置子错位）
    const szPre = /\bSZ\[(\d+)\]/.exec(text);
    const g = new Game({ size: szPre ? (parseInt(szPre[1], 10) || 19) : 19 });
    parseTree(g, null);
    // fix size after root props parsed
    const sz = parseInt(g.root.props.SZ, 10);
    if (sz && sz !== g.size) {
      g.size = sz;
      g.root.props.SZ = String(sz);
    }
    // convert root setup props (handicap stones) into root.setup
    if (g.root.props.AB || g.root.props.AW) {
      const toIdx = v => { const p = parseSgfVertex(v, g.size); return p ? p[1] * g.size + p[0] : -1; };
      g.root.setup = {
        AB: (g.root.props.AB || []).map(toIdx).filter(i => i >= 0),
        AW: (g.root.props.AW || []).map(toIdx).filter(i => i >= 0),
        AE: []
      };
      // 结构化后删除原始属性——否则导出时与 root.setup 各输出一次 AB/AW
      delete g.root.props.AB;
      delete g.root.props.AW;
      delete g.root.props.AE;
    }
    if (g.root.props.RU) {
      const ru = String(g.root.props.RU[0] || '').toLowerCase();
      if (RULES[ru]) g.rules = ru;
    }
    if (g.root.props.HA) g.handicap = parseInt(g.root.props.HA, 10) || 0;
    if (g.root.props.KM) g.komi = parseFloat(g.root.props.KM) || 0;
    if (g.root.props.PB) g.playerNames[BLACK] = g.root.props.PB[0];
    if (g.root.props.PW) g.playerNames[WHITE] = g.root.props.PW[0];
    if (g.root.props.BR) g.playerRanks[BLACK] = g.root.props.BR[0];
    if (g.root.props.WR) g.playerRanks[WHITE] = g.root.props.WR[0];
    if (g.root.props.RE) g.result = g.root.props.RE[0];
    if (g.root.props.DT) g.date = g.root.props.DT[0];
    if (g.root.props.EV) g.event = g.root.props.EV[0];
    g.invalidate();
    return g;
  }
  function applyPropsRoot(game, props) {
    Object.assign(game.root.props, props || {});
  }
  function applyPropsNode(game, node, props) {
    if (!props) return;
    const size = game.size;
    const toIdx = v => { const p = parseSgfVertex(v, size); return p ? p[1] * size + p[0] : -1; };
    if (props.AB) node.setup = mergeSetup(node.setup, props.AB.map(toIdx), BLACK);
    if (props.AW) node.setup = mergeSetup(node.setup, props.AW.map(toIdx), WHITE);
    if (props.AE) node.setup = mergeSetup(node.setup, props.AE.map(toIdx), EMPTY);
    if (props.B) { const p = parseSgfVertex(props.B[0], size); node.move = p ? { color: BLACK, x: p[0], y: p[1], pass: !props.B[0] } : { color: BLACK, x: -1, y: -1, pass: true }; }
    else if (props.W) { const p = parseSgfVertex(props.W[0], size); node.move = p ? { color: WHITE, x: p[0], y: p[1], pass: !props.W[0] } : { color: WHITE, x: -1, y: -1, pass: true }; }
    if (props.C) node.comment = props.C.join('\n');
    const skip = new Set(['AB', 'AW', 'AE', 'B', 'W', 'C']);
    for (const k of Object.keys(props)) if (!skip.has(k)) node.props[k] = props[k][0];
  }
  function mergeSetup(setup, list, color) {
    setup = setup || { AB: [], AW: [], AE: [] };
    const key = color === BLACK ? 'AB' : color === WHITE ? 'AW' : 'AE';
    setup[key] = (setup[key] || []).concat(list.filter(i => i >= 0));
    return setup;
  }

  return {
    EMPTY, BLACK, WHITE,
    Position, Game, Node, RULES,
    other, handicapStones, starPoints,
    scorePosition, coordName, parseCoordName,
    gameToSgf, sgfToGame, sgfVertex, parseSgfVertex,
    GTP_LETTERS
  };
});
