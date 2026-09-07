/* GoT — built-in Go AI engine (Web Worker).
 * MCTS (PUCT) + Go-specific heuristic priors + light playouts on an
 * incremental union-find board with liberty counting (Tromp-Taylor scoring).
 * Usable in a Worker (postMessage protocol) and from Node (require) for tests. */
'use strict';

(function (scope) {
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  function other(c) { return c === BLACK ? WHITE : BLACK; }

  /* ------------------------------------------------------------------ *
   *  FastBoard: union-find groups with incremental liberty counts       *
   *  每个根维护棋子链表（head/tail/next），groupStones/recountLibs 按    *
   *  链表遍历 O(棋组)，不再整盘扫描 O(棋盘)。                           *
   * ------------------------------------------------------------------ */
  let _scratchN = 19 * 19;
  let _seenFlags = new Uint8Array(_scratchN);
  let _grpSeen = new Uint8Array(_scratchN);
  function ensureScratch(n) {
    if (n <= _scratchN) return;
    _scratchN = n;
    _seenFlags = new Uint8Array(n);
    _grpSeen = new Uint8Array(n);
  }
  const _nb1 = [], _nb2 = [], _oppR = [], _myR = [], _cap = [], _tou = [], _capRoots = [];
  const _st = [], _stack = [], _region = [];

  class FastBoard {
    constructor(size) {
      this.size = size;
      const n = size * size;
      ensureScratch(n);
      this.board = new Int8Array(n);
      this.parent = new Int32Array(n).fill(-1);
      this.libs = new Int16Array(n);
      this.stones = new Int16Array(n);
      this.stamp = new Int32Array(n);
      this.curStamp = 1;
      this.ko = -1;
      this.captures = new Int16Array(3);
      this.lastMove = -1;
      this.head = new Int32Array(n).fill(-1);  // 根 → 首子
      this.tail = new Int32Array(n).fill(-1);  // 根 → 末子
      this.next = new Int32Array(n).fill(-1);  // 棋子 → 链中下一子
    }
    clone() {
      const f = new FastBoard(this.size);
      f.board.set(this.board); f.parent.set(this.parent); f.libs.set(this.libs);
      f.stones.set(this.stones); f.stamp.set(this.stamp); f.curStamp = this.curStamp;
      f.ko = this.ko; f.captures.set(this.captures); f.lastMove = this.lastMove;
      f.head.set(this.head); f.tail.set(this.tail); f.next.set(this.next);
      return f;
    }
    nb(i, out) {
      const s = this.size, x = i % s;
      out.length = 0;
      if (x > 0) out.push(i - 1);
      if (x < s - 1) out.push(i + 1);
      if (i >= s) out.push(i - s);
      if (i < s * (s - 1)) out.push(i + s);
      return out;
    }
    find(i) {
      let r = i;
      while (this.parent[r] !== r) r = this.parent[r];
      while (this.parent[i] !== r) { const nx = this.parent[i]; this.parent[i] = r; i = nx; }
      return r;
    }
    /* raw setup stone (no captures); call rebuild() after batch */
    setupStone(i, color) {
      if (color === EMPTY) {
        this.board[i] = EMPTY; this.parent[i] = -1;
        this.head[i] = -1; this.tail[i] = -1; this.next[i] = -1;
        return;
      }
      this.board[i] = color; this.parent[i] = i; this.stones[i] = 1; this.libs[i] = 0;
      this.head[i] = i; this.tail[i] = i; this.next[i] = -1;
    }
    rebuild() {
      const n = this.board.length;
      // 全部复位为单例组
      for (let i = 0; i < n; i++) {
        if (this.board[i] === EMPTY) {
          this.parent[i] = -1; this.stones[i] = 0; this.libs[i] = 0;
          this.head[i] = -1; this.tail[i] = -1; this.next[i] = -1;
          continue;
        }
        this.parent[i] = i; this.stones[i] = 1; this.libs[i] = 0;
        this.head[i] = i; this.tail[i] = i; this.next[i] = -1;
      }
      // 并查集合并相邻同色置子——否则 setup 相邻两子是两块"幽灵单子组"：
      // 幻影提子（真规则不提的被提）+ stones 计数错误 → 劫误判
      const s = this.size;
      for (let i = 0; i < n; i++) {
        const c = this.board[i];
        if (c === EMPTY) continue;
        const x = i % s;
        // 只向右、向下连，避免重复
        const nx = x > 0 ? i - 1 : -1;
        if (nx >= 0 && this.board[nx] === c) {
          const ra = this.find(i), rb = this.find(nx);
          if (ra !== rb) { this.stones[ra] += this.stones[rb]; this.parent[rb] = ra; this.next[this.tail[ra]] = this.head[rb]; this.tail[ra] = this.tail[rb]; }
        }
        const ny = i >= s ? i - s : -1;
        if (ny >= 0 && this.board[ny] === c) {
          const ra = this.find(i), rb = this.find(ny);
          if (ra !== rb) { this.stones[ra] += this.stones[rb]; this.parent[rb] = ra; this.next[this.tail[ra]] = this.head[rb]; this.tail[ra] = this.tail[rb]; }
        }
      }
      // 重建组头索引与各根气数
      const roots = [];
      _grpSeen.fill(0, 0, n);
      for (let i = 0; i < n; i++) {
        if (this.board[i] === EMPTY) continue;
        const r = this.find(i);
        if (!_grpSeen[r]) { _grpSeen[r] = 1; roots.push(r); }
      }
      for (const r of roots) this.recountLibs(r);
      this.ko = -1;
    }
    /* Play a stone. Returns number of captured stones, or -1 if illegal. */
    play(i, color) {
      const b = this.board;
      if (i < 0 || i >= b.length) return -1;
      if (b[i] !== EMPTY || i === this.ko) return -1;
      const opp = other(color);
      b[i] = color;
      this.parent[i] = i; this.stones[i] = 1;
      this.head[i] = i; this.tail[i] = i; this.next[i] = -1;
      const nb = this.nb(i, _nb1);
      // classify neighbors
      _myR.length = 0; _oppR.length = 0;
      for (let k = 0; k < nb.length; k++) {
        const n = nb[k];
        if (b[n] === EMPTY) continue;
        const r = this.find(n);
        if (b[n] === color) { if (_myR.indexOf(r) < 0) _myR.push(r); }
        else if (_oppR.indexOf(r) < 0) _oppR.push(r);
      }
      // 自杀预判（ mutations 前完成）：无提子且合并后无气 → 直接拒绝，
      // 棋盘完全未动——避免旧实现"先合并后回滚"造成并组状态损坏
      let willCapture = false;
      for (const r of _oppR) { if (this.libs[r] === 1) { willCapture = true; break; } }
      if (!willCapture) {
        this.curStamp++;
        let libsAfter = 0;
        const st = _stack; st.length = 0;
        this.stamp[i] = this.curStamp; st.push(i);
        while (st.length) {
          const c = st.pop();
          const cnb = this.nb(c, _nb2);
          for (let k = 0; k < cnb.length; k++) {
            const p = cnb[k];
            if (this.board[p] === EMPTY) {
              if (this.stamp[p] !== this.curStamp) { this.stamp[p] = this.curStamp; libsAfter++; }
            } else if (this.board[p] === color && this.stamp[p] !== this.curStamp) {
              this.stamp[p] = this.curStamp; st.push(p); // 洪泛穿过己方连通组
            }
          }
        }
        if (libsAfter === 0) {
          b[i] = EMPTY; this.parent[i] = -1; this.stones[i] = 0;
          this.head[i] = -1; this.tail[i] = -1; this.next[i] = -1;
          return -1;
        }
      }
      // merge same-color neighbor groups (always, choosing largest as root)
      let myRoot = i;
      for (const r of _myR) if (this.stones[r] >= this.stones[myRoot]) myRoot = r;
      if (_myR.length) {
        if (myRoot !== i) {
          this.parent[i] = myRoot;
          this.stones[myRoot]++;
          // 新子挂到 myRoot 链尾
          this.next[this.tail[myRoot]] = i;
          this.tail[myRoot] = i;
          this.head[i] = -1; this.tail[i] = -1;
        }
        for (const r of _myR) {
          if (r === myRoot) continue;
          this.stones[myRoot] += this.stones[r];
          this.parent[r] = myRoot;
          // 被并根的整条棋子链接到 myRoot 链尾
          this.next[this.tail[myRoot]] = this.head[r];
          this.tail[myRoot] = this.tail[r];
          this.head[r] = -1; this.tail[r] = -1;
        }
      }
      this.recountLibs(myRoot);
      // decrease liberties of opponent neighbor groups
      for (const r of _oppR) this.libs[r]--;
      // capture dead opponent groups
      _cap.length = 0; _capRoots.length = 0;
      for (const r of _oppR) {
        if (this.libs[r] <= 0) {
          _capRoots.push(r);
          const gs = this.groupStones(r);
          for (const st of gs) _cap.push(st);
        }
      }
      if (_cap.length) {
        for (const c of _cap) { this.board[c] = EMPTY; this.parent[c] = -1; }
        for (const r of _capRoots) { this.head[r] = -1; this.tail[r] = -1; }
        this.captures[color] += _cap.length;
        // captured points are new liberties for ALL adjacent groups (both colors)
        _tou.length = 0;
        for (const c of _cap) {
          const nb2 = this.nb(c, _nb2);
          for (let k = 0; k < nb2.length; k++) {
            const n = nb2[k];
            if (this.board[n] !== EMPTY) {
              const r = this.find(n);
              if (_tou.indexOf(r) < 0) _tou.push(r);
            }
          }
        }
        for (const r of _tou) this.recountLibs(r);
        myRoot = this.find(i);
      }
      // simple ko
      if (_cap.length === 1) {
        const r = this.find(i);
        if (this.stones[r] === 1 && this.libs[r] === 1) this.ko = _cap[0];
        else this.ko = -1;
      } else this.ko = -1;
      this.lastMove = i;
      return _cap.length;
    }
    groupStones(root) {
      const out = _st; out.length = 0;
      for (let s = this.head[root]; s >= 0; s = this.next[s]) out.push(s);
      return out;
    }
    recountLibs(root) {
      let libs = 0;
      this.curStamp++;
      for (let s = this.head[root]; s >= 0; s = this.next[s]) {
        const nb = this.nb(s, _nb2);
        for (let k = 0; k < nb.length; k++) {
          const p = nb[k];
          if (this.board[p] === EMPTY && this.stamp[p] !== this.curStamp) {
            this.stamp[p] = this.curStamp; libs++;
          }
        }
      }
      this.libs[root] = libs;
      return libs;
    }
    isTrueEye(i, color) {
      const b = this.board, s = this.size, x = i % s, y = (i / s) | 0;
      let edge = false;
      if (x > 0 && b[i - 1] !== color) return false;
      if (x === 0 || x === s - 1) edge = true;
      if (x < s - 1 && b[i + 1] !== color) return false;
      if (y > 0 && b[i - s] !== color) return false;
      if (y === 0 || y === s - 1) edge = true;
      if (y < s - 1 && b[i + s] !== color) return false;
      let badDiag = 0;
      const opp = other(color);
      for (let dy = -1; dy <= 1; dy += 2) {
        const ny = y + dy;
        if (ny < 0 || ny >= s) continue;
        for (let dx = -1; dx <= 1; dx += 2) {
          const nx = x + dx;
          if (nx < 0 || nx >= s) continue;
          if (b[ny * s + nx] === opp) badDiag++;
        }
      }
      return edge ? badDiag === 0 : badDiag <= 1;
    }
    /* Tromp-Taylor area diff: black - (white + komi) */
    score(komi) {
      const b = this.board, n = b.length;
      let black = 0, white = 0;
      for (let i = 0; i < n; i++) { if (b[i] === BLACK) black++; else if (b[i] === WHITE) white++; }
      const seen = _seenFlags; seen.fill(0, 0, n);
      const stack = _stack;
      for (let i = 0; i < n; i++) {
        if (b[i] !== EMPTY || seen[i]) continue;
        let touchB = false, touchW = false, cnt = 0;
        seen[i] = 1; stack.length = 0; stack.push(i);
        while (stack.length) {
          const c = stack.pop(); cnt++;
          const nb = this.nb(c, _nb1);
          for (let k = 0; k < nb.length; k++) {
            const nn = nb[k], v = b[nn];
            if (v === BLACK) touchB = true;
            else if (v === WHITE) touchW = true;
            else if (!seen[nn]) { seen[nn] = 1; stack.push(nn); }
          }
        }
        if (touchB && !touchW) black += cnt;
        else if (touchW && !touchB) white += cnt;
      }
      return black - white - komi;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Area ownership (Tromp-Taylor): per-point final owner estimate.     *
   *  +1 black-owned point (stone or fully-surrounded empty region),     *
   *  -1 white-owned, 0 dame/neutral. 围住的空点同样计入。               *
   * ------------------------------------------------------------------ */
  function areaOwnership(board) {
    const b = board.board, n = b.length, s = board.size;
    const out = new Int8Array(n);
    const seen = _seenFlags; seen.fill(0, 0, n);
    const stack = _stack;
    for (let i = 0; i < n; i++) {
      if (b[i] === BLACK) { out[i] = 1; continue; }
      if (b[i] === WHITE) { out[i] = -1; continue; }
      if (seen[i]) continue;
      let touchB = false, touchW = false;
      _region.length = 0;
      seen[i] = 1; stack.length = 0; stack.push(i);
      while (stack.length) {
        const c = stack.pop(); _region.push(c);
        const nb = board.nb(c, _nb1);
        for (let k = 0; k < nb.length; k++) {
          const nn = nb[k], v = b[nn];
          if (v === BLACK) touchB = true;
          else if (v === WHITE) touchW = true;
          else if (!seen[nn]) { seen[nn] = 1; stack.push(nn); }
        }
      }
      if (touchB && !touchW) { for (const r of _region) out[r] = 1; }
      else if (touchW && !touchB) { for (const r of _region) out[r] = -1; }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  Light playout                                                      *
   * ------------------------------------------------------------------ */
  function atariLiberties(board, color, out) {
    // collect [lib, size, lib, size, ...] for groups of `color` with exactly 1 liberty
    const b = board.board, n = b.length;
    out.length = 0;
    _grpSeen.fill(0, 0, n);
    for (let i = 0; i < n; i++) {
      if (b[i] !== color) continue;
      const r = board.find(i);
      if (_grpSeen[r]) continue;
      _grpSeen[r] = 1;
      if (board.libs[r] !== 1) continue;
      board.curStamp++;
      let lib = -1;
      for (let s = board.head[r]; s >= 0 && lib < 0; s = board.next[s]) {
        const nb = board.nb(s, _nb2);
        for (let k = 0; k < nb.length; k++) {
          const p = nb[k];
          if (b[p] === EMPTY && board.stamp[p] !== board.curStamp) {
            board.stamp[p] = board.curStamp; lib = p; break;
          }
        }
      }
      if (lib >= 0) { out.push(lib, board.stones[r]); }
    }
    return out;
  }

  /* One light playout; returns black-vs-white area diff (black positive). */
  function playout(board, colorToMove, komi, maxMoves, rng, ownAcc, ownWeight) {
    let color = colorToMove, passes = 0;
    const n = board.board.length;
    const atk = [];
    for (let m = 0; m < maxMoves && passes < 2; m++) {
      let played = false;
      // capture biggest opponent atari group（atk 为 [lib,size,...] 扁平对）
      atariLiberties(board, other(color), atk);
      if (atk.length && rng() < 0.86) {
        let bi = -1, bs = 0;
        for (let k = 0; k < atk.length; k += 2) {
          if (atk[k + 1] > bs && atk[k] !== board.ko) { bs = atk[k + 1]; bi = atk[k]; }
        }
        if (bi >= 0 && board.play(bi, color) >= 0) played = true;
      }
      // save own atari group
      if (!played) {
        atariLiberties(board, color, atk);
        if (atk.length && rng() < 0.82) {
          let bi = -1, bs = 0;
          for (let k = 0; k < atk.length; k += 2) {
            if (atk[k + 1] > bs && atk[k] !== board.ko) { bs = atk[k + 1]; bi = atk[k]; }
          }
          if (bi >= 0 && board.play(bi, color) >= 0) played = true;
        }
      }
      // random non-eye move
      if (!played) {
        let tries = n, i = (rng() * n) | 0;
        while (tries-- > 0) {
          if (board.board[i] === EMPTY && i !== board.ko && !board.isTrueEye(i, color)) {
            if (board.play(i, color) >= 0) { played = true; break; }
          }
          i++; if (i >= n) i = 0;
        }
      }
      if (!played) { passes++; board.ko = -1; } else passes = 0; // pass 清劫禁点
      color = other(color);
    }
    if (ownAcc) {
      // 终局领地归属：棋子 + 围住的空点一并计入（dame 为 0）
      const own = areaOwnership(board);
      for (let i = 0; i < n; i++) ownAcc[i] += ownWeight * own[i];
    }
    return board.score(komi);
  }

  /* ------------------------------------------------------------------ *
   *  Heuristic candidate priors                                         *
   * ------------------------------------------------------------------ */
  const _nb3 = [], _nb4 = [];
  const _lineWCache = new Map();
  function lineWeights(s) {
    let t = _lineWCache.get(s);
    if (!t) {
      t = [];
      for (let e = 0; e < s; e++) {
        t.push(e === 0 ? 0.02 : e === 1 ? 0.35 : e === 2 ? 0.95 : e === 3 ? 1.35 : e === 4 ? 1.2 : 0.95);
      }
      _lineWCache.set(s, t);
    }
    return t;
  }
  function genCandidates(board, color, phase, lastMove) {
    const b = board.board, n = b.length, s = board.size;
    const opp = other(color);
    const oppAtari = atariLiberties(board, opp, []);
    const myAtari = atariLiberties(board, color, []);
    const capMap = new Map();
    for (let k = 0; k < oppAtari.length; k += 2) capMap.set(oppAtari[k], (capMap.get(oppAtari[k]) || 0) + oppAtari[k + 1]);
    const saveMap = new Map();
    for (let k = 0; k < myAtari.length; k += 2) saveMap.set(myAtari[k], (saveMap.get(myAtari[k]) || 0) + myAtari[k + 1]);
    // sparse stone map for proximity (opening only)
    const stoneList = [];
    if (phase < 1.2) {
      for (let i = 0; i < n; i++) if (b[i] !== EMPTY) stoneList.push(i);
    }
    const edgeW = lineWeights(s);
    const moves = [], priors = [];
    for (let i = 0; i < n; i++) {
      if (b[i] !== EMPTY || i === board.ko) continue;
      if (board.isTrueEye(i, color)) continue;
      // cheap suicide filter: must have an empty neighbor, capture an atari group,
      // or join an own group that keeps liberties
      const nbPre = board.nb(i, _nb4);
      let emptyNbr = false, oppAtariNbr = false, ownSafeNbr = false;
      for (let k = 0; k < nbPre.length; k++) {
        const v = b[nbPre[k]];
        if (v === EMPTY) { emptyNbr = true; continue; }
        const rr = board.find(nbPre[k]);
        if (v === color) { if (board.libs[rr] >= 2) ownSafeNbr = true; }
        else if (board.libs[rr] === 1) oppAtariNbr = true;
      }
      if (!emptyNbr && !oppAtariNbr && !ownSafeNbr) continue; // suicide
      let pr = 1.0;
      const capVal = capMap.get(i) || 0;
      if (capVal > 0) pr += 6 + 3 * capVal;
      const saveVal = saveMap.get(i) || 0;
      if (saveVal > 0) {
        const trial = board.clone();
        const r = trial.play(i, color);
        if (r >= 0) {
          const libs = trial.libs[trial.find(i)];
          if (libs >= 2) pr += 4 + 2 * saveVal;
          else pr *= 0.12;
        } else pr = 0;
      }if (pr <= 0) continue;
      if (capVal === 0) {
        const nb = board.nb(i, _nb3);
        let emptyAdj = 0, oppAtariAdj = 0, ownAdj = 0;
        for (let k = 0; k < nb.length; k++) {
          const v = b[nb[k]];
          if (v === EMPTY) emptyAdj++;
          else if (v === color) ownAdj++;
          else if (board.libs[board.find(nb[k])] === 1) oppAtariAdj++;
        }
        if (emptyAdj === 0 && oppAtariAdj === 0) pr *= ownAdj >= 3 ? 0.08 : 0.4;
        pr += 2.5 * oppAtariAdj;
        if (lastMove >= 0) {
          const lx = lastMove % s, ly = (lastMove / s) | 0;
          const x = i % s, y = (i / s) | 0;
          const d = Math.max(Math.abs(x - lx), Math.abs(y - ly));
          if (d <= 3) pr += (4 - d) * 0.9;
        }
        if (stoneList.length) {
          const x = i % s, y = (i / s) | 0;
          let minD = 99;
          for (let k = 0; k < stoneList.length; k++) {
            const d = Math.max(Math.abs(x - (stoneList[k] % s)), Math.abs(y - ((stoneList[k] / s) | 0)));
            if (d < minD) minD = d;
          }
          if (minD <= 4) pr += (5 - minD) * 0.35;
        }
        const x = i % s, y = (i / s) | 0;
        const e = Math.min(x, y, s - 1 - x, s - 1 - y);
        pr *= edgeW[e];
      }
      if (pr <= 0.001) continue;
      moves.push(i); priors.push(pr);
    }
    let sum = 0;
    for (const p of priors) sum += p;
    if (sum > 0) for (let k = 0; k < priors.length; k++) priors[k] /= sum;
    else if (priors.length) priors.fill(1 / priors.length);
    return { moves, priors };
  }

  /* ------------------------------------------------------------------ *
   *  MCTS (PUCT)                                                        *
   * ------------------------------------------------------------------ */
  class MctsNode {
    constructor(move, color, prior, parent) {
      this.move = move; this.color = color; this.prior = prior; this.parent = parent;
      this.children = null;
      this.visits = 0; this.wins = 0; // wins from mover-to-this-node perspective
    }
    q() { return this.visits ? this.wins / this.visits : 0.45; }
  }
  function expandNode(board, node, colorToMove, phase, lastMove) {
    const { moves, priors } = genCandidates(board, colorToMove, phase, lastMove);
    node.children = [];
    for (let k = 0; k < moves.length; k++) {
      node.children.push(new MctsNode(moves[k], colorToMove, priors[k], node));
    }
    node.children.push(new MctsNode(-1, colorToMove, 0.004, node)); // pass
  }
  function selectChild(node, cPuct) {
    let best = null, bestScore = -Infinity;
    const sqrtN = Math.sqrt(node.visits + 1);
    for (const c of node.children) {
      if (c.prior < 0) continue; // permanently excluded (illegal in this line)
      const u = c.q() + cPuct * c.prior * sqrtN / (1 + c.visits);
      if (u > bestScore) { bestScore = u; best = c; }
    }
    return best;
  }
  function pvLine(node, maxLen) {
    const out = [];
    let cur = node;
    while (cur.children && cur.children.length && out.length < maxLen) {
      let best = null;
      for (const c of cur.children) if (!best || c.visits > best.visits) best = c;
      if (!best || best.visits === 0) break;
      out.push(best.move);
      cur = best;
    }
    return out;
  }
  function vtx(size, m) {
    return m < 0 ? { pass: true, x: -1, y: -1 } : { pass: false, x: m % size, y: (m / size) | 0 };
  }

  class GoAI {
    constructor() { this.stopFlag = false; }
    stop() { this.stopFlag = true; }
    budgetFor(strength, forAnalysis) {
      const s = Math.max(1, Math.min(9, strength | 0));
      const table = [
        { visits: 40, timeMs: 250, noise: 0.55 },
        { visits: 80, timeMs: 400, noise: 0.45 },
        { visits: 160, timeMs: 600, noise: 0.35 },
        { visits: 320, timeMs: 900, noise: 0.25 },
        { visits: 640, timeMs: 1400, noise: 0.18 },
        { visits: 1200, timeMs: 2000, noise: 0.12 },
        { visits: 2200, timeMs: 3000, noise: 0.07 },
        { visits: 4000, timeMs: 4500, noise: 0.03 },
        { visits: 7000, timeMs: 7000, noise: 0 }
      ];
      const b = table[s - 1];
      return forAnalysis ? { visits: Math.max(b.visits, 2400), timeMs: Math.max(b.timeMs, 3000), noise: 0 } : b;
    }
    /* posSpec: {size, komi, setup:{AB:[i],AW:[i]}, moves:[{color,x,y,pass}], toMove?}
     * opts: {strength, maxVisits, timeMs, topN, analysis} */
    analyze(posSpec, opts) {
      this.stopFlag = false;
      opts = opts || {};
      const size = posSpec.size || 19;
      const komi = posSpec.komi !== undefined ? posSpec.komi : 7.5;
      const strength = opts.strength || 7;
      const budget = this.budgetFor(strength, opts.analysis);
      const maxVisits = opts.maxVisits || budget.visits;
      const timeMs = opts.timeMs || budget.timeMs;
      const noise = budget.noise;
      const topN = opts.topN || 5;

      const rootBoard = new FastBoard(size);
      if (posSpec.setup) {
        for (const i of (posSpec.setup.AB || [])) rootBoard.setupStone(i, BLACK);
        for (const i of (posSpec.setup.AW || [])) rootBoard.setupStone(i, WHITE);
        rootBoard.rebuild();
      }
      let last = -1;
      const moves = posSpec.moves || [];
      for (const m of moves) {
        if (m.pass) { last = -1; rootBoard.ko = -1; } // pass 清劫禁点（与规则引擎 goengine 语义一致）
        else { rootBoard.play(m.y * size + m.x, m.color); last = m.y * size + m.x; }
      }
      let rootColor;
      if (posSpec.toMove) rootColor = posSpec.toMove;
      else if (moves.length) rootColor = other(moves[moves.length - 1].color);
      else if (posSpec.setup && posSpec.setup.AB && posSpec.setup.AB.length) rootColor = WHITE;
      else rootColor = BLACK;

      const phase = moves.length / (size * 2);
      const root = new MctsNode(-1, rootColor, 1, null);
      expandNode(rootBoard, root, rootColor, phase, last);
      const ownAcc = new Float32Array(size * size);
      let ownPlayouts = 0, sumScore = 0, visits = 0;
      const t0 = Date.now();
      const cPuct = 1.1;
      const maxMovesPlayout = size * size * 2 + 60;
      const rng = Math.random;
      const self = this;

      while (visits < maxVisits) {
        if (self.stopFlag) break;
        if ((visits & 15) === 0 && Date.now() - t0 >= timeMs) break;
        // --- descend ---
        let node = root;
        const work = rootBoard.clone();
        let colorNow = rootColor, lastM = last, depth = 0;
        while (node.children && node.children.length && node.visits > 0 && depth < 512) {
          let child = null, tries = node.children.length;
          while (tries-- > 0) {
            child = noise > 0 ? noisyPick(node.children, rng, noise) : selectChild(node, cPuct);
            if (!child) break;
            if (child.move < 0 || work.play(child.move, child.color) >= 0) break;
            excludeChild(child);
            child = null;
          }
          if (!child) break;
          if (child.move >= 0) { lastM = child.move; } else { lastM = -1; work.ko = -1; } // pass 清劫禁点
          node = child; colorNow = other(colorNow); depth++;
        }
        // --- expand / pick leaf ---
        if (node.visits > 0 && (!node.children || !node.children.length)) {
          expandNode(work, node, colorNow, phase, lastM);
        }
        let leaf = node;
        if (node.children && node.children.length) {
          let tries = node.children.length;
          while (tries-- > 0) {
            leaf = noise > 0 ? noisyPick(node.children, rng, noise) : (selectChild(node, cPuct) || node.children[0]);
            if (!leaf) { leaf = node; break; }
            if (leaf === node || leaf.move < 0 || work.play(leaf.move, leaf.color) >= 0) break;
            excludeChild(leaf);
            leaf = null;
          }
          if (!leaf) leaf = node;
        }
        // --- playout ---
        const diff = playout(work, other(leaf.color), komi, maxMovesPlayout, rng, ownAcc, 1);
        ownPlayouts++; sumScore += diff;
        const z = diff > 0 ? 1 : diff < 0 ? 0 : 0.5; // black win fraction
        // --- backup ---
        let cur = leaf;
        while (cur) {
          cur.visits++;
          cur.wins += (cur.color === BLACK) ? z : (1 - z);
          cur = cur.parent;
        }
        visits++;
        if ((visits & 255) === 0 && typeof scope.postMessage === 'function') {
          const p = buildResult(root, visits, t0, ownAcc, ownPlayouts, sumScore, size, komi, topN);
          p.done = false;
          scope.postMessage(p);
        }
      }
      const result = buildResult(root, visits, t0, ownAcc, ownPlayouts, sumScore, size, komi, topN);
      result.done = true;
      result.strength = strength;
      result.toMove = rootColor;
      return result;
    }
  }
  function excludeChild(c) {
    c.prior = -1;   // illegal in this line — exclude permanently
    c._wT = -1;     // noisyPick 权重缓存失效
  }
  function noisyPick(children, rng, noise) {
    let sum = 0;
    const invT = 1 - noise * 1.4;
    for (const c of children) {
      // 权重变换按子缓存：prior 未变时不再每次重算 pow
      if (c._wT < 0 || c._wInvT !== invT) {
        c._wInvT = invT;
        c._wT = c.prior < 0 ? 0 : Math.pow(c.prior + 1e-9, invT);
      }
      sum += c._wT;
    }
    if (sum <= 0) return null;
    let r = rng() * sum;
    for (let k = 0; k < children.length; k++) { r -= children[k]._wT; if (r <= 0) return children[k]; }
    return children[children.length - 1];
  }
  function buildResult(root, visits, t0, ownAcc, ownPlayouts, sumScore, size, komi, topN) {
    const secs = Math.max(0.001, (Date.now() - t0) / 1000);
    const cand = [];
    if (root.children) {
      const arr = root.children.slice().sort((a, b) => b.visits - a.visits);
      for (const c of arr) {
        if (cand.length >= topN) break;
        if (c.visits === 0) continue;
        const q = c.wins / c.visits;
        cand.push({
          ...vtx(size, c.move),
          visits: c.visits,
          winrate: c.color === BLACK ? q : 1 - q,
          prior: c.prior,
          pv: [vtx(size, c.move)].concat(pvLine(c, 12).map(m => vtx(size, m)))
        });
      }
    }
    const best = cand[0] || null;
    const meanDiff = ownPlayouts ? sumScore / ownPlayouts : 0;
    return {
      type: 'result',
      engine: 'got-mcts',
      best: best ? { x: best.x, y: best.y, pass: !!best.pass } : null,
      winrate: best ? best.winrate : 0.5,
      scoreLead: meanDiff, // black-positive area estimate incl. komi
      visits,
      nodesPerSec: Math.round(visits / secs),
      candidates: cand,
      ownership: ownPlayouts ? Array.from(ownAcc, v => v / ownPlayouts) : [],
      elapsedMs: Date.now() - t0
    };
  }

  /* ------------------------------------------------------------------ *
   *  Wiring: worker protocol / Node export                              *
   * ------------------------------------------------------------------ */
  const ai = new GoAI();
  const isWorker = typeof scope.postMessage === 'function' && typeof scope.importScripts === 'function';
  if (isWorker) {
    scope.onmessage = function (e) {
      const msg = e.data || {};
      if (msg.type === 'stop') { ai.stop(); return; }
      if (msg.type === 'analyze') {
        try {
          const result = ai.analyze(msg.position || {}, msg.opts || {});
          if (msg.marker) result.marker = msg.marker;
          scope.postMessage(result);
        } catch (err) {
          scope.postMessage({ type: 'result', error: String(err && err.stack || err), done: true, marker: msg.marker });
        }
      }
    };
  }
  const exportsObj = { GoAI, FastBoard, playout, genCandidates, MctsNode, areaOwnership };
  if (typeof module === 'object' && module.exports) module.exports = exportsObj;
  scope.GoTAI = exportsObj;
})(typeof self !== 'undefined' ? self : this);
