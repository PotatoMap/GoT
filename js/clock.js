/* GoT — 对局计时（UMD 纯函数，浏览器与 Node 双用）。
 *
 * 规则：主时间用完后进入读秒（byo-yomi），每阶段 N 秒；读秒内落子即重置本阶段，
 * 阶段耗尽判负。颜色用 1=黑 / 2=白（与 goengine 一致）。
 * 只用于"人对局"的思考时间；AI 对手的思考由「用时」设置控制，不占这里的钟。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Clock = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 预设（秒）。off 表示不计时。主时间 >0 才启用。
   * inc = Fischer 加秒：每落一手给该方补回 inc 秒（主时间用完后在读秒内补）。 */
  const PRESETS = {
    off:      { main: 0,   byo: 0,  periods: 0, inc: 0 },
    blitz:    { main: 60,  byo: 20, periods: 3, inc: 0 },   // 1 分 + 3×20 秒
    standard: { main: 300, byo: 30, periods: 3, inc: 0 },   // 5 分 + 3×30 秒
    long:     { main: 600, byo: 30, periods: 5, inc: 0 },   // 10 分 + 5×30 秒
    casual:   { main: 900, byo: 0,  periods: 0, inc: 0 },   // 15 分，无读秒
    fischer:  { main: 180, byo: 0,  periods: 0, inc: 2 }    // 3 分 + 每手加 2 秒
  };

  function preset(key) { return PRESETS[key] || PRESETS.off; }

  function create(key) {
    const p = preset(key);
    if (!p.main) return null;
    const side = () => ({ main: p.main, periods: p.periods, byoLeft: p.byo, inByo: false });
    return {
      preset: key, main: p.main, byo: p.byo, periods: p.periods, inc: p.inc || 0,
      black: side(), white: side(), flagged: null
    };
  }

  function sideOf(c, color) { return color === 1 ? c.black : c.white; }
  function valid(color) { return color === 1 || color === 2; }

  /* 递减当前行棋方 dtMs 毫秒；返回被判超时的颜色或 null。 */
  function tick(c, color, dtMs) {
    if (!c || c.flagged || !valid(color)) return c ? c.flagged : null;
    const s = sideOf(c, color);
    const dt = Math.max(0, dtMs) / 1000;
    if (s.inByo) {
      s.byoLeft -= dt;
      if (s.byoLeft <= 0) {
        s.periods -= 1;
        if (s.periods <= 0) { s.periods = 0; s.byoLeft = 0; c.flagged = color; return color; }
        s.byoLeft = c.byo;
      }
    } else {
      s.main -= dt;
      if (s.main <= 0) {
        s.main = 0;
        if (c.periods > 0) { s.inByo = true; s.byoLeft = c.byo; }
        else { c.flagged = color; return color; }
      }
    }
    return null;
  }

  /* 落子：读秒阶段重置本阶段计时（主时间不在落子时重置）；
   * Fischer 加秒：给该方补回 inc 秒（读秒中则补到本阶段，不超过阶段长度）。 */
  function onMove(c, color) {
    if (!c || !valid(color)) return;
    const s = sideOf(c, color);
    if (s.inByo) {
      s.byoLeft = c.byo;
      if (c.inc > 0) s.byoLeft = Math.min(c.byo, s.byoLeft + c.inc);
    } else if (c.inc > 0) {
      s.main += c.inc;
    }
  }

  /* 当前剩余秒数（读秒中为读秒剩余，否则为主时间）。 */
  function remaining(c, color) {
    if (!c || !valid(color)) return 0;
    const s = sideOf(c, color);
    return Math.max(0, s.inByo ? s.byoLeft : s.main);
  }

  function format(c, color, lang) {
    if (!c || !valid(color)) return '';
    const s = sideOf(c, color);
    if (s.inByo) {
      const t = Math.ceil(Math.max(0, s.byoLeft));
      return (lang === 'en' ? 'Byo ' : '读秒 ') + t + 's ×' + s.periods;
    }
    const t = Math.max(0, Math.ceil(s.main));
    const m = Math.floor(t / 60), sec = t % 60;
    return m + ':' + String(sec).padStart(2, '0');
  }

  return { PRESETS, preset, create, tick, onMove, remaining, format };
});
