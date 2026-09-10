/* GoT — 棋力/段位策略（UMD 纯函数，浏览器与 Node 双用）。
 *
 * 把内部 strength 1..9 映射为：
 *   - KataGo 对弈预算：maxVisits / playoutDoublingAdvantage / 选点温度
 *   - 段位显示：级位 18级→1级，段位 1段→9段
 *
 * 只用于"对手走子"。分析 / 点目 / 复盘一律走满强度，不使用这里的低档参数。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Strength = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 1..9 档 → KataGo 对弈参数（经验值，非精确评级；段位标注为"约合"）。
   * maxVisits：搜索量，低档明显更少（真的"想得少"）。
   * pda：playoutDoublingAdvantage，负值表示"假设对手更强"，让引擎下得更软。
   * temperature：>0 时从候选中按胜率 softmax 采样——低档会走出非最优手，
   *              更像"会下错"，而不是"每步都最优、只是算得浅"。
   * 分析与复盘不使用此表。 */
  const KATAGO = [
    { maxVisits: 24,   pda: -2.5, temperature: 1.6 },
    { maxVisits: 48,   pda: -2.0, temperature: 1.4 },
    { maxVisits: 96,   pda: -1.5, temperature: 1.2 },
    { maxVisits: 192,  pda: -1.0, temperature: 1.0 },
    { maxVisits: 384,  pda: -0.6, temperature: 0.8 },
    { maxVisits: 768,  pda: -0.3, temperature: 0.6 },
    { maxVisits: 1500, pda: 0,    temperature: 0.4 },
    { maxVisits: 3000, pda: 0,    temperature: 0.2 },
    { maxVisits: 6000, pda: 0,    temperature: 0 }
  ];

  /* 段位数值轴：级位 18级→1级 = 0..17，段位 1段→9段 = 18..26。
   * 两个引擎真实棋力不同，上限分开标注（内置约业余 3 段，KataGo 可到 9 段）。 */
  const RANK_BUILTIN = [0, 3, 6, 9, 12, 15, 17, 18, 20];
  const RANK_KATAGO = [0, 3, 8, 13, 17, 18, 20, 22, 26];

  function clampStrength(s) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 5;         // 缺失/非法 → 默认中档
    return Math.max(1, Math.min(9, Math.round(n)));
  }

  function kataGo(s) { return Object.assign({}, KATAGO[clampStrength(s) - 1]); }

  function rankNum(s, isKataGo) {
    const tbl = isKataGo ? RANK_KATAGO : RANK_BUILTIN;
    return tbl[clampStrength(s) - 1];
  }

  function rankText(r, lang) {
    const zh = lang !== 'en';
    return r <= 17 ? (18 - r) + (zh ? '级' : 'k') : (r - 17) + (zh ? '段' : 'd');
  }

  /* 从候选中选一手：temperature<=0 或只有一个候选 → 最佳（第一个）。
   * 否则按胜率 softmax 采样。score 优先用胜率（行棋方视角百分比），
   * 其次 wrToMove(0..1)，再次 scoreLead。rng 可注入（测试用）。 */
  function pickMove(candidates, temperature, rng) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return null;
    if (!(temperature > 0) || list.length === 1) return list[0];
    const score = (c) => {
      if (c && typeof c.winrate === 'number' && isFinite(c.winrate)) return c.winrate;
      if (c && typeof c.wrToMove === 'number' && isFinite(c.wrToMove)) return c.wrToMove * 100;
      if (c && typeof c.scoreLead === 'number' && isFinite(c.scoreLead)) return c.scoreLead * 10;
      return 0;
    };
    const max = Math.max.apply(null, list.map(score));
    const weights = list.map(c => Math.exp((score(c) - max) / (temperature * 10)));
    let total = 0; for (const w of weights) total += w;
    if (!(total > 0)) return list[0];
    const r = (typeof rng === 'function' ? rng() : Math.random()) * total;
    let acc = 0;
    for (let i = 0; i < list.length; i++) { acc += weights[i]; if (r <= acc) return list[i]; }
    return list[list.length - 1];
  }

  return { kataGo, rankNum, rankText, pickMove, KATAGO };
});
