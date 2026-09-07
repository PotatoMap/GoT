'use strict';
const GE = require('../js/goengine.js');
const { GoAI, FastBoard, playout, areaOwnership } = require('../js/ai-worker.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }

// --- differential test: FastBoard vs GoEngine.Position on random games ---
{
  let mismatches = 0, totalMoves = 0, games = 0;
  for (let g = 0; g < 12; g++) {
    const size = [5, 7, 9][g % 3];
    const ref = new GE.Position(size);
    const fast = new FastBoard(size);
    let color = GE.BLACK;
    let consecutivePasses = 0;
    let guard = 0;
    while (consecutivePasses < 2 && guard++ < 300) {
      const n = size * size;
      // pick random legal-ish move according to ref engine legality (superko ignored for FastBoard simple-ko parity)
      const order = [];
      for (let i = 0; i < n; i++) order.push(i);
      for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
      let played = false;
      for (const i of order) {
        if (ref.board[i] !== GE.EMPTY) continue;
        // skip moves that are simple-ko violations for ref
        if (i === ref.ko) continue;
        const chk = ref.checkPlay(color, i);
        if (!chk.ok) continue;
        // FastBoard must agree: play both
        const before = ref.board.slice();
        const rr = ref.play(color, i);
        const rf = fast.play(i, color);
        totalMoves++;
        if (!rr.ok || rf < 0) { mismatches++; break; }
        for (let k = 0; k < n; k++) {
          if (ref.board[k] !== fast.board[k]) {
            mismatches++;
            console.error('  board mismatch at', k, 'game', g, 'move', totalMoves, 'ref', ref.board[k], 'fast', fast.board[k]);
            break;
          }
        }
        played = true;
        break;
      }
      if (!played) { consecutivePasses++; }
      else consecutivePasses = 0;
      color = color === GE.BLACK ? GE.WHITE : GE.BLACK;
    }
    games++;
  }
  eq(mismatches, 0, 'FastBoard matches reference across ' + totalMoves + ' random moves in ' + games + ' games');
}

// --- playout speed & sanity ---
{
  const board = new FastBoard(9);
  const t0 = Date.now();
  let n = 0, blackWins = 0;
  while (Date.now() - t0 < 1500) {
    const b2 = new FastBoard(9);
    const diff = playout(b2, GE.BLACK, 7, 200, Math.random, null, 0);
    n++;
    if (diff > 0) blackWins++;
  }
  console.log('playouts/sec (9x9): ' + Math.round(n / 1.5));
  ok(n > 300, 'playout throughput acceptable');
  ok(blackWins > n * 0.2 && blackWins < n * 0.8, 'playout results balanced-ish');
}

// --- AI analyze: smoke + legality + preference for captures ---
{
  const ai = new GoAI();
  // white stone in atari; engine (black to move) should find the capture
  const board = new FastBoard(9);
  board.setupStone(0 * 9 + 0, GE.WHITE); // (0,0)
  board.setupStone(1 * 9 + 0, GE.BLACK); // (1,0)
  board.setupStone(0 * 9 + 1, GE.BLACK); // (0,1)
  board.rebuild();
  // white corner stone in atari after black (1,0); black to move captures at (0,1)
  const res2 = ai.analyze(
    {
      size: 9, komi: 7, toMove: GE.BLACK,
      setup: { AB: [9], AW: [0] }
    },
    { strength: 5 }
  );
  ok(res2.candidates.length > 0, 'candidates produced');
  ok(res2.best && res2.best.x === 1 && res2.best.y === 0, 'AI captures atari stone at (1,0) (got ' + JSON.stringify(res2.best) + ')');
  ok(res2.visits > 100, 'reasonable visit count');
  ok(res2.nodesPerSec > 100, 'nps sane: ' + res2.nodesPerSec);
  ok(res2.ownership.length === 81, 'ownership array sized');
  ok(typeof res2.scoreLead === 'number', 'scoreLead numeric');
}

// --- AI: avoid filling own true eye ---
{
  const ai = new GoAI();
  // black group with eye at (0,0): stones (1,0),(0,1); surrounded by white so (0,0) is true eye
  // white wall: (2,0),(1,1)? simpler: check top-1 candidate is not the eye point when board nearly full
  const res = ai.analyze(
    {
      size: 5, komi: 0.5, toMove: GE.BLACK,
      setup: {
        AB: [1, 5, 7, 8, 9, 11, 12, 13, 14], // rough black wall
        AW: [2, 3, 4, 10, 16, 17, 18, 19, 20, 21, 22, 23, 24]
      }
    },
    { strength: 3 }
  );
  if (res.best && !res.best.pass) {
    ok(!(res.best.x === 0 && res.best.y === 0), 'does not fill own true eye (0,0)');
  }
}

// --- full self-play game legality fuzz ---
{
  const ai = new GoAI();
  let illegal = 0, passes = 0, moves = 0;
  const size = 9;
  const ref = new GE.Game({ size, rules: 'chinese' });
  for (let turn = 0; turn < 120; turn++) {
    const pos = ref.positionAt(ref.current);
    const toMove = pos.turn;
    const res = ai.analyze(
      {
        size, komi: 7, toMove,
        moves: ref.pathFromRoot(ref.current).filter(n => n.move).map(n => ({ color: n.move.color, x: n.move.x, y: n.move.y, pass: n.move.pass }))
      },
      { strength: 2, maxVisits: 24, timeMs: 60 }
    );
    if (!res.best || res.best.pass) { ref.pass(toMove); passes++; if (passes >= 2) break; continue; }
    passes = 0;
    const r = ref.play(toMove, res.best.x, res.best.y);
    if (!r.ok) {
      const pos2 = ref.positionAt(ref.current);
      console.error('illegal proposed move', JSON.stringify(res.best), 'reason', r.reason,
        'refKo', pos2.ko, 'occupied?', pos2.board[pos2.idx(res.best.x, res.best.y)]);
      illegal++; break;
    }
    moves++;
  }
  eq(illegal, 0, 'self-play moves all legal');
  ok(moves > 10, 'self-play produced moves: ' + moves);
}

// --- areaOwnership: surrounded EMPTY regions must be owned (AI 围空计入) ---
{
  const s = 9, idx = (x, y) => y * s + x;
  const board = new FastBoard(s);
  // black rectangular wall rows/cols 2..6, interior fully empty
  for (let x = 2; x <= 6; x++) { board.setupStone(idx(x, 2), GE.BLACK); board.setupStone(idx(x, 6), GE.BLACK); }
  for (let y = 3; y <= 5; y++) { board.setupStone(idx(2, y), GE.BLACK); board.setupStone(idx(6, y), GE.BLACK); }
  board.rebuild();
  const own = areaOwnership(board);
  // interior empty points are enclosed by black only → +1
  eq(own[idx(3, 3)], 1, 'enclosed empty point owned by black');
  eq(own[idx(5, 5)], 1, 'enclosed empty point (2) owned by black');
  eq(own[idx(3, 2)], 1, 'black stone point owned by black');
  eq(own[idx(0, 0)], 1, 'outer region touching only black owned by black');
  // dame cases
  const b2 = new FastBoard(5);
  b2.setupStone(0, GE.BLACK); b2.setupStone(2, GE.WHITE);
  b2.rebuild();
  eq(areaOwnership(b2)[1], 0, 'empty point between black and white is dame');
  // alive enemy stone inside the enclosed area → its touching region is dame (Tromp-Taylor)
  const b3 = new FastBoard(s);
  for (let x = 2; x <= 6; x++) { b3.setupStone(idx(x, 2), GE.BLACK); b3.setupStone(idx(x, 6), GE.BLACK); }
  for (let y = 3; y <= 5; y++) { b3.setupStone(idx(2, y), GE.BLACK); b3.setupStone(idx(6, y), GE.BLACK); }
  b3.setupStone(idx(4, 4), GE.WHITE);
  b3.rebuild();
  eq(areaOwnership(b3)[idx(3, 3)], 0, 'region touching alive enemy stone is dame on static board');
}

// --- analyze: playout-averaged ownership counts enclosed territory & dead stones ---
{
  const ai = new GoAI();
  const s = 9, idx = (x, y) => y * s + x;
  const AB = [];
  for (let x = 2; x <= 6; x++) { AB.push(idx(x, 2), idx(x, 6)); }
  for (let y = 3; y <= 5; y++) { AB.push(idx(2, y), idx(6, y)); }
  // white stone in atari inside black's area → dead in almost every playout
  const AW = [idx(4, 4)];
  AB.push(idx(3, 4), idx(5, 4), idx(4, 3)); // single liberty left at (4,5)
  const res = ai.analyze(
    { size: s, komi: 7.5, toMove: GE.BLACK, setup: { AB, AW } },
    { strength: 8, maxVisits: 3000, timeMs: 4000 }
  );
  ok(res.ownership.length === 81, 'ownership sized');
  const inside = res.ownership[idx(3, 3)] + res.ownership[idx(5, 4)] + res.ownership[idx(4, 4)];
  ok(inside / 3 > 0.5, 'enclosed region (incl. dead stone point) averaged as black territory (got ' + (inside / 3).toFixed(2) + ')');
  ok(res.ownership[idx(4, 4)] > 0.7, 'dead white stone point flips to black ownership (got ' + res.ownership[idx(4, 4)].toFixed(2) + ')');
  ok(typeof res.scoreLead === 'number' && res.scoreLead > 20, 'scoreLead reflects black area incl. komi (got ' + res.scoreLead.toFixed(1) + ')');
}

// --- regression (0.1.15): adjacent same-color setup stones form ONE group (no phantom captures) ---
{
  const s = 5, idx = (x, y) => y * s + x;
  const b = new FastBoard(s);
  b.setupStone(idx(0, 0), GE.BLACK);
  b.setupStone(idx(1, 0), GE.BLACK);
  b.rebuild();
  // 相邻两黑子共有两口气 (0,1)(1,1)——白落 (0,1) 不得提任何子
  const cap = b.play(idx(0, 1), GE.WHITE);
  eq(cap, 0, 'adjacent setup stones merged: white cannot capture either');
  eq(b.board[idx(0, 1)], GE.WHITE, 'white stone sits at (0,1)');
  eq(b.board[idx(0, 0)], GE.BLACK, 'black stone stays at (0,0)');
  eq(b.board[idx(1, 0)], GE.BLACK, 'black stone stays at (1,0)');
  ok(b.find(idx(0, 0)) === b.find(idx(1, 0)), 'two setup stones are ONE group');
}

// --- regression (0.1.15): ko point parity with reference + pass clears ko (production semantics) ---
{
  // 程序化构造：交替随机合法行棋直到形成劫；随后按"pass 清 ko"的生产语义验证立即回提合法。
  // 每次尝试独立实例；FastBoard 的 pass 语义（ko=-1）是生产代码在三处实现的约定。
  const s = 9;
  let koPoint = -1, bKo = -1;
  for (let attempt = 0; attempt < 60 && koPoint < 0; attempt++) {
    const b = new FastBoard(s);
    const g = new GE.Position(s);
    for (let m = 0, color = GE.BLACK; m < 220 && koPoint < 0; m++) {
      const order = [];
      for (let i = 0; i < s * s; i++) order.push(i);
      for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
      let played = false;
      for (const i of order) {
        if (g.board[i] !== GE.EMPTY || i === g.ko) continue;
        if (!g.checkPlay(color, i).ok) continue;
        if (b.play(i, color) < 0) break;
        g.play(color, i);
        played = true;
        break;
      }
      if (!played) { b.ko = -1; g.pass(color); } // pass：两侧同清 ko
      if (g.ko >= 0) {
        koPoint = g.ko;
        bKo = b.ko;
        // 劫生效期间 fast 禁立即回提
        ok(b.play(koPoint, color) < 0, 'FastBoard blocks immediate ko retake');
        // pass 语义：ko 清除 → 立即回提合法（ref 同样放行）
        b.ko = -1;
        g.pass(color);
        ok(b.play(koPoint, color) >= 0, 'after pass (ko cleared) immediate recapture is legal');
        ok(g.checkPlay(color, koPoint).ok, 'reference allows recapture after pass');
        break;
      }
      color = color === GE.BLACK ? GE.WHITE : GE.BLACK;
    }
  }
  ok(koPoint >= 0, 'random playout produced an active ko');
  if (koPoint >= 0) eq(bKo, koPoint, 'FastBoard ko point equals reference when ko appeared');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
