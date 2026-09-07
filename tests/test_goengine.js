'use strict';
const GE = require('../js/goengine.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }

// --- 1. basic capture ---
{
  const g = new GE.Game({ size: 9 });
  const pos = g.positionAt(g.root);
  pos.play(GE.BLACK, pos.idx(0, 0));
  pos.play(GE.WHITE, pos.idx(1, 0));
  pos.play(GE.WHITE, pos.idx(0, 1));
  eq(pos.board[pos.idx(0, 0)], GE.EMPTY, 'corner stone captured');
  eq(pos.captures[GE.WHITE], 1, 'white captured 1');
  eq(pos.turn, GE.BLACK, 'turn back to black');
}

// --- 2. simple ko ---
{
  const g = new GE.Game({ size: 9 });
  const p = g.positionAt(g.root);
  const at = (x, y, c) => p.play(c, p.idx(x, y));
  // canonical ko shape:
  //   . B W .
  //   B W . W
  //   . B W .
  at(1, 0, GE.BLACK); at(2, 0, GE.WHITE);
  at(0, 1, GE.BLACK); at(1, 1, GE.WHITE); at(3, 1, GE.WHITE);
  at(1, 2, GE.BLACK); at(2, 2, GE.WHITE);
  const r = p.play(GE.BLACK, p.idx(2, 1));
  ok(r.ok, 'ko capture ok');
  eq(r.captured.length, 1, 'ko captures exactly one');
  eq(p.ko, p.idx(1, 1), 'ko point set to captured stone');
  const illegal = p.play(GE.WHITE, p.idx(1, 1));
  ok(!illegal.ok && illegal.reason === 'ko', 'immediate recapture forbidden');
  p.play(GE.WHITE, p.idx(8, 8));
  p.play(GE.BLACK, p.idx(7, 8));
  const rec = p.play(GE.WHITE, p.idx(1, 1));
  ok(rec.ok, 'recapture after tenuki ok');
}

// --- 3. suicide forbidden ---
{
  const g = new GE.Game({ size: 9 });
  const p = g.positionAt(g.root);
  p.play(GE.BLACK, p.idx(0, 1));
  p.play(GE.BLACK, p.idx(1, 0));
  const s = p.play(GE.WHITE, p.idx(0, 0));
  ok(!s.ok && s.reason === 'suicide', 'suicide rejected');
}

// --- 4. game.play + positionAt + variation tree ---
{
  const g = new GE.Game({ size: 9 });
  ok(g.play(GE.BLACK, 2, 2).ok, 'play 1');
  ok(g.play(GE.WHITE, 3, 3).ok, 'play 2');
  eq(g.current.move.x, 3, 'current node is move 2');
  const pos = g.positionAt(g.current);
  eq(pos.board[pos.idx(2, 2)], GE.BLACK, 'stone on board');
  g.navParent();
  eq(g.positionAt(g.current).board[g.positionAt(g.current).idx(3, 3)], GE.EMPTY, 'undo removes stone');
  ok(g.play(GE.WHITE, 5, 5).ok, 'new variation created');
  eq(g.root.children.length, 1, 'same first move reused');
  eq(g.root.children[0].children.length, 2, 'branch has 2 children');
}

// --- 5. scoring: territory + area ---
{
  const g = new GE.Game({ size: 9, rules: 'japanese', komi: 0 });
  const p = g.positionAt(g.root);
  for (let y = 0; y < 9; y++) p.play(GE.BLACK, p.idx(4, y));
  for (let y = 0; y < 9; y++) p.play(GE.WHITE, p.idx(5, y));
  const sc = GE.scorePosition(p, { scoring: 'territory', komi: 0 });
  eq(sc.terrB, 36, 'black territory 4x9');
  eq(sc.terrW, 27, 'white territory 3x9');
  eq(sc.black, 36, 'japanese: territory only');
  const ar = GE.scorePosition(p, { scoring: 'area', komi: 0 });
  eq(ar.black, 45, 'area: stones+territory');
  eq(ar.white, 36, 'area white');
}

// --- 6. dead stone marking ---
{
  const g = new GE.Game({ size: 9, rules: 'japanese', komi: 0 });
  const p = g.positionAt(g.root);
  for (let y = 0; y < 9; y++) p.play(GE.BLACK, p.idx(4, y));
  for (let y = 0; y < 9; y++) p.play(GE.WHITE, p.idx(5, y));
  p.setStone(p.idx(1, 1), GE.WHITE);
  const dead = new Set([p.idx(1, 1)]);
  const sc = GE.scorePosition(p, { scoring: 'territory', komi: 0, dead });
  eq(sc.black, 37, 'dead white stone: 36 terr + 1 prisoner');
}

// --- 7. SGF round trip with variations ---
{
  const g = new GE.Game({ size: 9, rules: 'japanese', komi: 6.5 });
  g.playerNames[GE.BLACK] = 'Alpha'; g.playerRanks[GE.BLACK] = '9d';
  g.playerNames[GE.WHITE] = 'Beta';
  g.play(GE.BLACK, 2, 2);
  g.play(GE.WHITE, 3, 3);
  g.navParent();
  g.play(GE.WHITE, 5, 5);
  g.pass(GE.BLACK);
  const sgf = GE.gameToSgf(g);
  ok(sgf.indexOf('(;GM[1]') === 0, 'sgf root props');
  ok(sgf.indexOf('KM[6.5]') >= 0, 'komi in sgf');
  ok(sgf.indexOf('PB[Alpha]') >= 0, 'player name');
  ok(sgf.indexOf('B[cc]') >= 0, 'black move cc');
  ok(sgf.indexOf('W[ff]') >= 0, 'variation white ff');
  ok(sgf.indexOf('B[])') >= 0, 'pass encoded');
  const g2 = GE.sgfToGame(sgf);
  eq(g2.size, 9, 'roundtrip size');
  eq(g2.komi, 6.5, 'roundtrip komi');
  eq(g2.root.children.length, 1, 'roundtrip root child');
  eq(g2.root.children[0].children.length, 2, 'roundtrip branch');
  eq(g2.playerNames[GE.BLACK], 'Alpha', 'roundtrip name');
  const line = g2.mainLine();
  eq(line[0].move.x, 2, 'mainline first move');
}

// --- 8. handicap ---
{
  const g = new GE.Game({ size: 19, handicap: 4 });
  const pos = g.positionAt(g.root);
  let stones = 0;
  for (let i = 0; i < pos.board.length; i++) if (pos.board[i] === GE.BLACK) stones++;
  eq(stones, 4, '4 handicap stones placed');
  eq(pos.turn, GE.WHITE, 'white moves first after handicap');
  const sgf = GE.gameToSgf(g);
  ok(sgf.indexOf('HA[4]') >= 0, 'HA in sgf');
  ok(sgf.indexOf('AB[dp]') >= 0, 'AB stones in sgf');
  const g2 = GE.sgfToGame(sgf);
  const pos2 = g2.positionAt(g2.root);
  let stones2 = 0;
  for (let i = 0; i < pos2.board.length; i++) if (pos2.board[i] === GE.BLACK) stones2++;
  eq(stones2, 4, 'handicap stones restored from SGF');
}

// --- 9. positional superko (Chinese rules) ---
{
  const g = new GE.Game({ size: 9, rules: 'chinese' });
  const p = g.positionAt(g.root);
  // send-two return-one is NOT simple ko; positional superko should still block triple-ko-less cycles
  // simple sanity: board hash changes on move
  const h0 = p.key();
  p.play(GE.BLACK, p.idx(4, 4));
  ok(p.key() !== h0, 'hash changes after move');
  ok(p.history.has(h0), 'history contains initial hash');
}

// --- 10. group/liberties util ---
{
  const g = new GE.Game({ size: 9 });
  const p = g.positionAt(g.root);
  p.play(GE.BLACK, p.idx(3, 3));
  p.play(GE.BLACK, p.idx(4, 3));
  const grp = p.group(p.idx(3, 3));
  eq(grp.stones.length, 2, 'group of 2');
  eq(grp.libs.size, 6, '2 connected stones have 6 liberties');
}

// --- 11. throw-in capture (capture happens before suicide check) ---
{
  const g = new GE.Game({ size: 9 });
  const p = g.positionAt(g.root);
  const at = (x, y, c) => p.play(c, p.idx(x, y));
  // White group (4,0),(4,1) with single liberty (4,2);
  // black fully surrounds the approach so the capture point itself has no own liberties.
  at(4, 0, GE.WHITE); at(4, 1, GE.WHITE);
  at(3, 0, GE.BLACK); at(5, 0, GE.BLACK);
  at(3, 1, GE.BLACK); at(5, 1, GE.BLACK);
  at(3, 2, GE.BLACK); at(5, 2, GE.BLACK); at(4, 3, GE.BLACK);
  eq(p.group(p.idx(4, 0)).libs.size, 1, 'white group in atari');
  const r = p.play(GE.BLACK, p.idx(4, 2));
  ok(r.ok, 'throw-in capture legal (capture before suicide)');
  eq(r.captured.length, 2, 'two white stones captured');
  eq(p.board[p.idx(4, 0)], GE.EMPTY, 'white stones removed');
  eq(p.board[p.idx(4, 2)], GE.BLACK, 'capturing stone remains');
}

// --- 12. scorePosition merges AI ownership for dame regions (AI 围空计入点目) ---
{
  const g = new GE.Game({ size: 5, rules: 'chinese', komi: 0 });
  const p = g.positionAt(g.root);
  p.play(GE.BLACK, p.idx(0, 0)); // corner black stone
  p.play(GE.WHITE, p.idx(2, 2)); // lone white stone, not marked dead
  const N = 25;
  // the 23 empty points touch BOTH stones → flood-fill says dame.
  // strong black ownership everywhere (except the white stone point itself)
  const own = new Array(N).fill(0.9);
  own[p.idx(2, 2)] = -0.9;
  const sc = GE.scorePosition(p, { dead: new Set(), komi: 0, scoring: 'area', ownership: own });
  eq(sc.terrB, 23, 'dame region assigned to black via ownership');
  eq(sc.black, 24, 'black area = 1 stone + 23 territory');
  eq(sc.white, 1, 'white keeps only its stone');
  ok(sc.result.startsWith('B+'), 'result B+: ' + sc.result);
  // without ownership the dame region is not counted at all
  const sc2 = GE.scorePosition(p, { dead: new Set(), komi: 0, scoring: 'area' });
  eq(sc2.terrB, 0, 'no ownership → dame not counted');
  eq(sc2.terrW, 0, 'no ownership → dame not counted (white)');
  // weak/ambiguous ownership (|v| ≤ threshold) must NOT be trusted
  const own3 = new Array(N).fill(0.3);
  own3[p.idx(2, 2)] = -0.3;
  const sc3 = GE.scorePosition(p, { dead: new Set(), komi: 0, scoring: 'area', ownership: own3 });
  eq(sc3.terrB, 0, 'ambiguous ownership ignored');
  // marked-dead stone is removed; region then fully enclosed by black
  const sc4 = GE.scorePosition(p, { dead: new Set([p.idx(2, 2)]), komi: 0, scoring: 'area', ownership: own });
  eq(sc4.black, 25, 'dead white stone removed, whole board black');
  // territory scoring (Japanese) also benefits: territory + dead-stone prisoners
  const sc5 = GE.scorePosition(p, { dead: new Set([p.idx(2, 2)]), komi: 0, scoring: 'territory', ownership: own });
  eq(sc5.black, 25, 'territory scoring: 24 territory + 1 dead-stone prisoner');
}

// --- 13. positional superko enforcement (Chinese rules) ---
{
  const p = new GE.Position(9);
  p.play(GE.BLACK, p.idx(4, 4));
  // 用 clone 计算“白下 (5,5) 之后”的局面哈希，预先塞进 history——
  // 开启 superko 后同一手必须被拒（禁循环局面）
  const sim = p.clone();
  sim.play(GE.WHITE, sim.idx(5, 5));
  p.history.add(sim.key());
  const r = p.play(GE.WHITE, p.idx(5, 5), undefined, true);
  ok(!r.ok && r.reason === 'superko', 'superko blocks recreating a seen position');
  // 不开启 superko（日韩规则）时同一点仍合法
  const p2 = new GE.Position(9);
  p2.play(GE.BLACK, p2.idx(4, 4));
  const sim2 = p2.clone();
  sim2.play(GE.WHITE, sim2.idx(5, 5));
  p2.history.add(sim2.key());
  ok(p2.play(GE.WHITE, p2.idx(5, 5), undefined, false).ok, 'no superko flag → move stays legal');
  // Game 层：中国规则对局自动启用 superko
  const g = new GE.Game({ size: 9, rules: 'chinese' });
  const pos = g.positionAt(g.current);
  pos.play(GE.BLACK, pos.idx(4, 4));
  const simG = pos.clone();
  simG.play(GE.WHITE, simG.idx(5, 5));
  pos.history.add(simG.key());
  const rg = g.play(GE.WHITE, 5, 5);
  ok(!rg.ok && rg.reason === 'superko', 'game.play enforces superko under chinese rules');
}

// --- 14. SGF with SZ≠19: non-root setup must map onto the right board ---
{
  // 13 路棋谱：根后第一个节点带 AB[dd]（非根置子），白先手 B[cc]
  const sgf = '(;GM[1]FF[4]SZ[13]KM[0];B[cc];AB[dd])';
  const g = GE.sgfToGame(sgf);
  eq(g.size, 13, 'SZ=13 parsed (pre-scan)');
  g.current = g.root.children[0];
  const pos1 = g.positionAt(g.current);
  eq(pos1.board[pos1.idx(2, 2)], GE.BLACK, 'B[cc] on 13x13');
  const node2 = g.current.children[0];
  const pos2 = g.positionAt(node2);
  eq(pos2.board[pos2.idx(3, 3)], GE.BLACK, 'non-root AB[dd] indexed on 13x13 (not 19x19)');
  eq(pos2.board.length, 169, 'board is 13x13');
  // 根置子 SGF 往返不再产生重复 AB 属性
  const sgf2 = GE.gameToSgf(g);
  ok((sgf2.match(/AB\[/g) || []).length === 1, 'no duplicated AB property on export');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
