/* KataGo JSON analysis transport. One process serves both play and analysis. */
'use strict';
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const columns = 'ABCDEFGHJKLMNOPQRST';
const color = c => c === 2 || String(c).toUpperCase() === 'W' ? 'W' : 'B';
function vertex(m, size) {
  if (m.pass || m.x < 0 || m.y < 0) return 'pass';
  if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || m.x >= size || m.y >= size) throw Error('Invalid move');
  return columns[m.x] + (size - m.y);
}
function move(v, size) {
  if (v === 'pass') return { x: -1, y: -1, pass: true };
  const x = columns.indexOf(v[0]), y = size - Number(v.slice(1));
  return { x, y, pass: false };
}
function query(spec, id) {
  const size = Number(spec.size || 19);
  if (![9, 13, 19].includes(size)) throw Error('Unsupported board size');
  const rules = spec.rules || 'chinese';
  if (!['chinese', 'japanese', 'korean'].includes(rules)) throw Error('Unsupported rules');
  const moves = (spec.moves || []).map(m => [color(m.color), vertex(m, size)]);
  const initialStones = [];
  for (const [key, c] of [['AB', 'B'], ['AW', 'W']]) {
    for (const p of (spec.setup && spec.setup[key]) || []) {
      const x = typeof p === 'number' ? p % size : p.charCodeAt(0) - 97;
      const y = typeof p === 'number' ? Math.floor(p / size) : p.charCodeAt(1) - 97;
      initialStones.push([c, vertex({ x, y }, size)]);
    }
  }
  const overrideSettings = { maxTime: Math.max(0.2, Math.min(60, Number(spec.seconds) || 10)) };
  /* 对弈查询传 wideRootNoise:0 消除根节点随机性——同一进程既分析又对弈，
   * analysis.cfg 的 0.04 会让 AI 落子带噪声、偏弱（KataGo 官方要求对弈设 0）。 */
  if (spec.wideRootNoise !== undefined) {
    overrideSettings.wideRootNoise = Math.max(0, Math.min(1, Number(spec.wideRootNoise) || 0));
  }
  /* 棋力降档：playoutDoublingAdvantage（-3..3）。负值让引擎在评估时假设
   * 对手更强，从而下得更软；与 maxVisits 一起构成强度阶梯。仅对手走子使用。 */
  if (spec.pda !== undefined) {
    const pda = Number(spec.pda);
    if (Number.isFinite(pda)) overrideSettings.playoutDoublingAdvantage = Math.max(-3, Math.min(3, pda));
  }
  const q = { id, moves, initialStones, rules, komi: spec.komi === undefined ? 7.5 : Number(spec.komi),
    initialPlayer: moves.length ? moves[0][0] : color(spec.toMove),
    boardXSize: size, boardYSize: size,
    maxVisits: Math.max(1, Math.min(100000, Math.round(Number(spec.maxVisits) || 800))),
    includeOwnership: !!spec.ownership, analysisPVLen: 20, reportDuringSearchEvery: 0.25,
    priority: Math.max(-10, Math.min(10, Number(spec.priority) || 0)),
    overrideSettings };
  if (spec.allowMove) q.allowMoves = [{ player: color(spec.toMove), moves: [vertex(spec.allowMove, size)], untilDepth: 1 }];
  return q;
}
function normalize(raw, spec, model) {
  const sign = color(spec.toMove) === 'B' ? 1 : -1;
  const root = raw.rootInfo || {};
  const candidates = (raw.moveInfos || []).sort((a, b) => a.order - b.order).slice(0, spec.topN || 5).map(c => ({
    ...move(c.move, spec.size || 19), visits: c.visits, prior: c.prior,
    winrate: Number.isFinite(c.winrate) ? (sign === 1 ? c.winrate : 1 - c.winrate) * 100 : null,
    scoreLead: Number.isFinite(c.scoreLead) ? c.scoreLead * sign : null,
    scoreStdev: c.scoreStdev, pv: (c.pv || []).map(v => move(v, spec.size || 19))
  }));
  return { ok: !raw.error && !!raw.rootInfo, error: raw.error || (raw.noResults ? 'Analysis cancelled' : undefined),
    engine: 'KataGo', engineKind: 'analysis', model, rules: spec.rules || 'chinese',
    toMove: color(spec.toMove) === 'B' ? 1 : 2, size: spec.size || 19,
    visits: root.visits || 0, winrateBlack: root.winrate, scoreLead: root.scoreLead,
    ownership: raw.ownership || null, candidates, bestMove: candidates[0] || null,
    isDuringSearch: !!raw.isDuringSearch };
}
class AnalysisEngine {
  constructor(exe, args, model) {
    this.model = model; this.nextId = 0; this.pending = new Map(); this.alive = true; this.lastError = '';
    this.child = spawn(exe, args, { windowsHide: true, cwd: path.dirname(exe) });
    readline.createInterface({ input: this.child.stdout }).on('line', line => {
      let raw; try { raw = JSON.parse(line); } catch (_) { return; }
      const p = this.pending.get(raw.id);
      if (!p || raw.warning) return;
      if (raw.error) return p.finish(Error(raw.error));
      const result = normalize(raw, p.spec, this.model);
      if (raw.isDuringSearch) { if (p.onUpdate) p.onUpdate(result); }
      else p.finish(result.ok ? null : Error(result.error || 'No analysis result'), result);
    });
    this.child.stderr.on('data', d => { this.lastError = (this.lastError + d).slice(-2000); });
    const fail = e => { this.alive = false; for (const p of this.pending.values()) p.finish(e); };
    this.child.on('error', fail);
    this.child.on('exit', () => fail(Error('KataGo analysis exited: ' + this.lastError)));
    this.child.stdin.on('error', fail);
  }
  analyze(spec, { signal, onUpdate } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.alive) return reject(Error('KataGo analysis is unavailable'));
      const id = 'got-' + (++this.nextId);
      let q; try { q = query(spec, id); } catch (e) { return reject(e); }
      let timer;
      const finish = (err, result) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer); if (signal) signal.removeEventListener('abort', cancel);
        err ? reject(err) : resolve(result);
      };
      const cancel = () => {
        this.child.stdin.write(JSON.stringify({ id: 'stop-' + id, action: 'terminate', terminateId: id }) + '\n');
        const e = Error('Analysis cancelled'); e.name = 'AbortError'; finish(e);
      };
      this.pending.set(id, { spec, onUpdate, finish });
      if (signal && signal.aborted) return cancel();
      if (signal) signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, 120000);
      this.child.stdin.write(JSON.stringify(q) + '\n');
    });
  }
  stop() { this.child.kill(); }
}
function detect(root) {
  const dir = path.join(root, 'engines', 'katago');
  if (!fs.existsSync(dir)) return null;
  const exe = ['katago.exe', 'katago'].map(n => path.join(dir, n)).find(f => fs.existsSync(f));
  const models = fs.readdirSync(dir).filter(f => /\.(bin|txt)\.gz$/.test(f)).sort((a,b) => fs.statSync(path.join(dir,b)).size - fs.statSync(path.join(dir,a)).size);
  const config = path.join(root, 'analysis.cfg');
  return exe && models.length ? { exe, args: ['analysis', '-config', config, '-model', path.join(dir, models[0])], model: models[0] } : null;
}
module.exports = { AnalysisEngine, detect, query, normalize };
