/* GoT — canvas board renderer.
 * Wood-textured goban with stones, coordinates, move numbers, last-move
 * marker, analysis overlay (candidate markers + ownership heat), territory
 * overlay and preview stones. HiDPI aware. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoardRenderer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BLACK = 1, WHITE = 2;
  const _styleCache = new Map();   // 形势层 rgba 色串缓存（alpha 量化）

  class BoardRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.size = 19;
      this.stones = new Int8Array(19 * 19);
      this.opts = {
        lastMove: -1,
        moveNumbers: null,      // Map(index -> number)
        candidates: [],         // [{x,y,visits,wrToMove,pass}]
        candColorMode: 'winrate', // winrate 按胜率着色 | rank 按列表排名着色
        ownership: null,        // Float array -1..1 (black-positive)
        territory: null,        // Int8Array 0/1/2
        dame: null,             // Uint8Array 1=公气/未定空点（点目时用第三种颜色标出）
        dead: null,             // Set of indexes
        preview: null,          // [{x,y,color}]
        hover: null,            // {x,y,color,legal}
        pending: null,          // 待确认落子 {x,y,color}（落子确认模式）
        flip: false,            // 棋盘翻转 180°（从对方视角看棋）
        showCoords: true,
        showNumbers: false,
        showOwnership: false,
        toMove: BLACK,
        bestMove: -1,
        theme: 'obsidian'
      };
      this._grain = null;
      this._bg = null;        // 木纹+网格+坐标 离屏缓存
      this._bgKey = '';
      this._sprites = null;   // 黑/白棋子精灵缓存
      this._raf = 0;
      this.px = 0;
    }
    set(opts) {
      const oldTheme = this.opts.theme;
      Object.assign(this.opts, opts);
      if (opts.theme !== undefined && opts.theme !== oldTheme) {
        this._grain = null;
        this._bg = null;
        this._bgKey = '';
      }
      if (opts.size !== undefined && opts.size !== this.size) {
        this.size = opts.size;
        this.stones = new Int8Array(this.size * this.size);
        // The sprite radius is derived from the cell size. A 9x9 board can
        // keep the same canvas pixels as a 19x19 board, so resizeTo() is not
        // guaranteed to run and clear the cache for us. Rebuild immediately
        // when the logical board size changes or the stones stay visibly too
        // small until the next layout pass.
        this._sprites = null;
      }
      if (opts.stones) this.stones = opts.stones;
    }
    resizeTo(stage) {
      /* 内容盒尺寸：clientWidth/Height 含 padding，须先扣除，画布才不会溢出到工具栏 */
      const cs = getComputedStyle(stage);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const cssSize = Math.max(240, Math.floor(Math.min(stage.clientWidth - padX, stage.clientHeight - padY)) - 4);
      const dpr = window.devicePixelRatio || 1;
      if (this.canvas.style.width !== cssSize + 'px') {
        this.canvas.style.width = cssSize + 'px';
        this.canvas.style.height = cssSize + 'px';
      }
      const px = Math.floor(cssSize * dpr);
      if (this.px !== px) {
        this.px = px;
        this.canvas.width = px;
        this.canvas.height = px;
        this._grain = null;
        this._bg = null;
        this._sprites = null;
      }
      this.dpr = dpr;
      this.cssSize = cssSize;
      this.requestRender();
    }
    /* 帧合并：同一帧内多次触发只画一次（hover / 分析刷新更顺滑） */
    requestRender() {
      if (typeof requestAnimationFrame !== 'function') { this.render(); return; }
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
    }
    get margin() { return this.cssSize * 0.045 + (this.opts.showCoords ? this.cssSize * 0.035 : 0); }
    get cell() { return (this.cssSize - 2 * this.margin) / (this.size - 1); }
    /* 视觉列/行（未翻转的像素映射），网格与坐标标签使用 */
    _vx(i) { return (this.margin + i * this.cell) * this.dpr; }
    _vy(i) { return (this.margin + i * this.cell) * this.dpr; }
    /* 逻辑坐标 → 像素：flip 时做 180° 旋转 */
    cx(x) { return this._vx(this.opts.flip ? this.size - 1 - x : x); }
    cy(y) { return this._vy(this.opts.flip ? this.size - 1 - y : y); }
    pointAt(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const px = clientX - rect.left, py = clientY - rect.top;
      const gx = Math.round((px - this.margin) / this.cell);
      const gy = Math.round((py - this.margin) / this.cell);
      if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return null;
      const dx = px - (this.margin + gx * this.cell);
      const dy = py - (this.margin + gy * this.cell);
      if (dx * dx + dy * dy > this.cell * this.cell * 0.36) return null;
      // 视觉格 → 逻辑坐标
      return this.opts.flip ? { x: this.size - 1 - gx, y: this.size - 1 - gy } : { x: gx, y: gy };
    }
    /* ---------- paint ---------- */
    render() {
      const ctx = this.ctx, px = this.px;
      if (!px) return;
      const key = px + '|' + this.size + '|' + (this.opts.showCoords ? 1 : 0) + '|' + (this.opts.flip ? 1 : 0) + '|' + (this.opts.theme || 'obsidian');
      // 仅背景依赖 flip/showCoords；棋子精灵只依赖 px，不随翻转向失效重建
      if (this._bgKey !== key) this._bg = null;
      if (!this._bg) { this._buildBg(); this._bgKey = key; }
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(this._bg, 0, 0);
      if (this.opts.territory) this._paintTerritory(ctx);
      if (this.opts.dame) this._paintDame(ctx);
      this._paintStones(ctx);
      // 形势覆盖层画在棋子之上：整块地域连成同色区域，死子一目了然
      if (this.opts.showOwnership && this.opts.ownership) this._paintOwnership(ctx);
      if (this.opts.showNumbers && this.opts.moveNumbers) this._paintNumbers(ctx);
      if (this.opts.dead && this.opts.dead.size) this._paintDead(ctx);
      if (this.opts.lastMove >= 0 && !this.opts.showNumbers) this._paintLast(ctx);
      if (this.opts.candidates && this.opts.candidates.length) this._paintCandidates(ctx);
      if (this.opts.preview && this.opts.preview.length) this._paintPreview(ctx);
      if (this.opts.hover) this._paintHover(ctx);
      if (this.opts.pending) this._paintPending(ctx);
    }
    /* 静态背景一次成像：木纹 + 颗粒 + 网格 + 星位 + 坐标 */
    _buildBg() {
      const c = document.createElement('canvas');
      c.width = this.px; c.height = this.px;
      const g = c.getContext('2d');
      this._paintWood(g, this.px);
      this._paintGrid(g);
      this._bg = c;
    }
    _paintWood(ctx, px) {
      const p = this._palette();
      const g = ctx.createLinearGradient(0, 0, px, px);
      g.addColorStop(0, p.wood[0]);
      g.addColorStop(0.5, p.wood[1]);
      g.addColorStop(1, p.wood[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px, px);
      // cached grain
      if (!this._grain) {
        const gc = document.createElement('canvas');
        gc.width = px; gc.height = px;
        const gctx = gc.getContext('2d');
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 90; i++) {
          const y = rnd() * px;
          const amp = 2 + rnd() * 5;
          gctx.beginPath();
          gctx.moveTo(0, y);
          for (let x = 0; x <= px; x += 24) gctx.lineTo(x, y + Math.sin(x / 130 + i) * amp);
          gctx.strokeStyle = p.grain.replace('ALPHA', (0.02 + rnd() * 0.025).toFixed(3));
          gctx.lineWidth = 0.8 + rnd() * 1.6;
          gctx.stroke();
        }
        this._grain = gc;
      }
      ctx.drawImage(this._grain, 0, 0);
      // border
      ctx.strokeStyle = p.border;
      ctx.lineWidth = Math.max(1, 2 * this.dpr);
      ctx.strokeRect(1, 1, px - 2, px - 2);
    }
    _paintGrid(ctx) {
      const p = this._palette();
      const n = this.size, dpr = this.dpr, flip = this.opts.flip;
      // 网格/星位/坐标用视觉坐标（对称，翻转后形状不变）；标签内容按逻辑坐标翻转
      const x0 = this._vx(0), x1 = this._vx(n - 1);
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = Math.max(1, 0.9 * dpr);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const c = this._vx(i), r = this._vy(i);
        ctx.moveTo(x0, r); ctx.lineTo(x1, r);
        ctx.moveTo(c, x0); ctx.lineTo(c, x1);
      }
      ctx.stroke();
      // outer frame heavier
      ctx.lineWidth = Math.max(1.5, 1.8 * dpr);
      ctx.strokeRect(x0, x0, x1 - x0, x1 - x0);
      // star points
      const stars = this._stars(n);
      ctx.fillStyle = p.star;
      for (const [sx, sy] of stars) {
        ctx.beginPath();
        ctx.arc(this._vx(sx), this._vy(sy), Math.max(2, 2.6 * dpr), 0, 7);
        ctx.fill();
      }
      // coordinates
      if (this.opts.showCoords) {
        const letters = 'ABCDEFGHJKLMNOPQRST';
        ctx.fillStyle = p.coord;
        ctx.font = `${Math.max(9, this.cell * 0.34 * dpr)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let v = 0; v < n; v++) {
          const lx = flip ? n - 1 - v : v;   // 视觉第 v 列对应的逻辑 x
          const ly = flip ? n - 1 - v : v;   // 视觉第 v 行对应的逻辑 y
          ctx.fillText(letters[lx], this._vx(v), this._vy(0) - this.margin * 0.55);
          ctx.fillText(letters[lx], this._vx(v), this._vy(n - 1) + this.margin * 0.55);
          ctx.fillText(String(n - ly), this._vx(0) - this.margin * 0.55, this._vy(v));
          ctx.fillText(String(n - ly), this._vx(n - 1) + this.margin * 0.55, this._vy(v));
        }
      }
    }
    _stars(n) {
      if (n === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
      if (n === 13) return [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]];
      if (n === 9) return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]];
      if (n === 7) return [[3, 3]];
      const e = n >= 13 ? 3 : 2, m = (n - 1) / 2;
      const out = [[e, e], [n - 1 - e, e], [e, n - 1 - e], [n - 1 - e, n - 1 - e]];
      if (Number.isInteger(m)) out.push([m, m]);
      return out;
    }
    _palette() {
      const palettes = {
        obsidian: {
          wood: ['#dfc38f', '#d7b77d', '#ceb080'], grain: 'rgba(122, 82, 34, ALPHA)',
          border: 'rgba(90, 58, 20, 0.55)', grid: 'rgba(94, 62, 24, 0.85)',
          star: 'rgba(70, 45, 16, 0.95)', coord: 'rgba(74, 48, 17, 0.9)'
        },
        paper: {
          wood: ['#dfc38f', '#d7b77d', '#ceb080'], grain: 'rgba(122, 82, 34, ALPHA)',
          border: 'rgba(90, 58, 20, 0.55)', grid: 'rgba(94, 62, 24, 0.85)',
          star: 'rgba(70, 45, 16, 0.95)', coord: 'rgba(74, 48, 17, 0.9)'
        },
        forest: {
          wood: ['#c7c39e', '#b8b58f', '#aaa77f'], grain: 'rgba(70, 79, 50, ALPHA)',
          border: 'rgba(60, 69, 45, 0.6)', grid: 'rgba(60, 67, 43, 0.82)',
          star: 'rgba(45, 55, 34, 0.95)', coord: 'rgba(49, 59, 38, 0.9)'
        }
      };
      return palettes[this.opts.theme] || palettes.obsidian;
    }
    _stoneRadius() { return this.cell * 0.47 * this.dpr; }
    /* 棋子本体（画到指定 ctx），供精灵缓存使用 */
    _drawStoneBody(g, cx, cy, r, color) {
      const dpr = this.dpr || 1;
      // shadow
      g.beginPath();
      g.arc(cx + r * 0.08, cy + r * 0.12, r * 0.98, 0, 7);
      g.fillStyle = 'rgba(30, 18, 4, 0.35)';
      g.fill();
      // body
      const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      if (color === BLACK) {
        grad.addColorStop(0, '#585b60');
        grad.addColorStop(0.35, '#26282c');
        grad.addColorStop(1, '#050607');
      } else {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#f0efe9');
        grad.addColorStop(1, '#c9c7bd');
      }
      g.beginPath();
      g.arc(cx, cy, r, 0, 7);
      g.fillStyle = grad;
      g.fill();
      // rim
      g.strokeStyle = color === BLACK ? 'rgba(0,0,0,0.5)' : 'rgba(120,118,108,0.6)';
      g.lineWidth = 0.8 * dpr;
      g.stroke();
    }
    _ensureSprites() {
      if (this._sprites) return;
      const r = this._stoneRadius();
      const s = Math.ceil(r * 2.4);
      const mk = (color) => {
        const c = document.createElement('canvas');
        c.width = s; c.height = s;
        const g = c.getContext('2d');
        this._drawStoneBody(g, s / 2, s / 2, r, color);
        return c;
      };
      this._sprites = { b: mk(BLACK), w: mk(WHITE), s };
    }
    _paintStone(ctx, x, y, color, alpha) {
      this._ensureSprites();
      const sp = this._sprites;
      const cx = this.cx(x), cy = this.cy(y);
      const needsAlpha = alpha !== undefined && alpha < 1;
      if (needsAlpha) { ctx.save(); ctx.globalAlpha = alpha; } // 不透明棋子免掉状态栈
      ctx.drawImage(color === BLACK ? sp.b : sp.w, cx - sp.s / 2, cy - sp.s / 2, sp.s, sp.s);
      if (needsAlpha) ctx.restore();
    }
    _paintStones(ctx) {
      const b = this.stones;
      for (let i = 0; i < b.length; i++) {
        if (b[i] === BLACK) this._paintStone(ctx, i % this.size, (i / this.size) | 0, BLACK);
        else if (b[i] === WHITE) this._paintStone(ctx, i % this.size, (i / this.size) | 0, WHITE);
      }
    }
    _paintNumbers(ctx) {
      const dpr = this.dpr, mn = this.opts.moveNumbers;
      ctx.font = `600 ${Math.max(8, this.cell * 0.36 * dpr)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [idx, num] of mn) {
        const color = this.stones[idx];
        if (!color) continue;
        const cx = this.cx(idx % this.size), cy = this.cy((idx / this.size) | 0);
        ctx.fillStyle = color === BLACK ? '#e8e6df' : '#1c1d20';
        const label = num > 999 ? '999+' : String(num);
        if (String(num).length > 2) ctx.font = `600 ${Math.max(7, this.cell * 0.3 * dpr)}px Inter, system-ui, sans-serif`;
        ctx.fillText(label, cx, cy);
      }
    }
    _paintLast(ctx) {
      const i = this.opts.lastMove;
      const color = this.stones[i];
      if (!color) return;
      const cx = this.cx(i % this.size), cy = this.cy((i / this.size) | 0);
      ctx.beginPath();
      ctx.arc(cx, cy, this._stoneRadius() * 0.42, 0, 7);
      ctx.strokeStyle = color === BLACK ? '#f2d879' : '#a35d1f';
      ctx.lineWidth = Math.max(1.4, 1.8 * this.dpr);
      ctx.stroke();
    }
    _paintDead(ctx) {
      for (const i of this.opts.dead) {
        const color = this.stones[i];
        if (!color) continue;
        const cx = this.cx(i % this.size), cy = this.cy((i / this.size) | 0);
        const r = this._stoneRadius() * 0.5;
        ctx.strokeStyle = color === BLACK ? 'rgba(255,255,255,0.85)' : 'rgba(200,60,40,0.9)';
        ctx.lineWidth = Math.max(1.4, 2 * this.dpr);
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
      }
    }
    _paintTerritory(ctx) {
      const t = this.opts.territory;
      const s = Math.max(3, this.cell * 0.22 * this.dpr);
      for (let i = 0; i < t.length; i++) {
        if (!t[i]) continue;
        const cx = this.cx(i % this.size), cy = this.cy((i / this.size) | 0);
        ctx.fillStyle = t[i] === BLACK ? 'rgba(20,20,22,0.85)' : 'rgba(245,244,238,0.9)';
        ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
        ctx.strokeStyle = 'rgba(60,40,15,0.6)';
        ctx.lineWidth = Math.max(0.6, this.dpr * 0.7);
        ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
      }
    }
    /* 公气/未定空点：金色小圆点，与黑白领地方块区分开——不标出来用户只会觉得"数字不对" */
    _paintDame(ctx) {
      const d = this.opts.dame;
      const r = Math.max(1.5, this.cell * 0.08 * this.dpr);
      ctx.fillStyle = 'rgba(214,158,60,0.62)';
      ctx.strokeStyle = 'rgba(110,76,16,0.85)';
      ctx.lineWidth = Math.max(0.6, this.dpr * 0.7);
      for (let i = 0; i < d.length; i++) {
        if (!d[i]) continue;
        const cx = this.cx(i % this.size), cy = this.cy((i / this.size) | 0);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    _paintOwnership(ctx) {
      const own = this.opts.ownership;
      if (!own || own.length !== this.size * this.size) return;
      const cell2 = this.cell * this.dpr;
      // alpha 量化后缓存色串——逐帧 361 点拼 rgba 字符串是纯浪费
      const style = (r, g, b, a) => {
        const aq = Math.round(a * 24) / 24;
        const key = ((r << 16) | (g << 8) | b) * 25 + aq * 100;
        let s = _styleCache.get(key);
        if (!s) { s = 'rgba(' + r + ',' + g + ',' + b + ',' + aq + ')'; _styleCache.set(key, s); }
        return s;
      };
      for (let i = 0; i < own.length; i++) {
        const v = own[i];
        const av = Math.abs(v);
        if (av < 0.12) continue;          // 真正的公气不上色
        const hasStone = !!this.stones[i];
        const t = Math.min(1, (av - 0.12) / 0.5);
        // 空点：近不透明同色矩形占住交叉点；棋子上面：半透明覆盖（棋子仍可辨，死活一眼可分）
        const a = hasStone ? 0.30 + 0.32 * t : 0.45 + 0.45 * t;
        const cx = this.cx(i % this.size), cy = this.cy((i / this.size) | 0);
        if (v > 0) {
          // 黑方地盘：同色深色矩形
          ctx.fillStyle = style(28, 30, 34, a);
          ctx.fillRect(cx - cell2 / 2, cy - cell2 / 2, cell2, cell2);
        } else {
          // 白方地盘：同色浅色矩形
          ctx.fillStyle = style(249, 247, 239, a);
          ctx.fillRect(cx - cell2 / 2, cy - cell2 / 2, cell2, cell2);
          if (!hasStone) {
            // 空点上的浅色矩形加描边，避免在浅色棋盘上发虚；棋子上只叠加不描边
            ctx.strokeStyle = style(90, 60, 20, 0.25 + 0.35 * t);
            ctx.lineWidth = Math.max(0.8, this.dpr * 0.8);
            ctx.strokeRect(cx - cell2 / 2, cy - cell2 / 2, cell2, cell2);
          }
        }
      }
    }
    _paintCandidates(ctx) {
      const dpr = this.dpr;
      const shown = this.opts.candidates.slice(0, 8).filter(c => !c.pass);
      const n = shown.length;
      if (!n) return;
      // 等大圆点，与棋子同大。
      // 颜色两种模式（设置里可切）：
      //  - winrate（默认）：直接映射该手胜率——≤42% 全红、≥65% 全绿，中间线性。
      //    颜色与圈内数字同源，"60.4 比 59.3 红"的困惑不会再出现。
      //  - rank：按候选间相对排名（第1名绿 → 末名红），Lizzie 风格的偏好梯度。
      const r = this._stoneRadius();
      const byRank = this.opts.candColorMode === 'rank';
      const hueOf = (c, k) => {
        if (byRank) return n > 1 ? Math.round(128 * (1 - k / (n - 1))) : 128;
        const wr = (typeof c.wrToMove === 'number' && isFinite(c.wrToMove)) ? c.wrToMove : 0.5;
        return Math.round(128 * Math.max(0, Math.min(1, (wr - 0.42) / 0.23)));
      };
      for (let k = 0; k < n; k++) {
        const c = shown[k];
        const hue = hueOf(c, k);
        const col = `hsl(${hue}, 68%, 50%)`;
        const cx = this.cx(c.x), cy = this.cy(c.y);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 7);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1, 1.2 * dpr);
        ctx.strokeStyle = 'rgba(20, 16, 8, .5)';
        ctx.stroke();
        // 最佳手：白色高亮外圈
        if (k === 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 2 * dpr, 0, 7);
          ctx.strokeStyle = 'rgba(255, 255, 255, .9)';
          ctx.lineWidth = Math.max(1, 1.2 * dpr);
          ctx.stroke();
        }
        // 标注：走这手之后的行棋方胜率（如 99.1 / 90.2）
        const wr = (typeof c.wrToMove === 'number' && isFinite(c.wrToMove)) ? c.wrToMove : 0.5;
        const label = (Math.round(wr * 1000) / 10).toFixed(1);
        ctx.font = `800 ${Math.max(6.5, this.cell * (label.length > 4 ? 0.19 : 0.23) * dpr)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(20, 16, 8, .9)';
        ctx.lineWidth = 2.4 * dpr;
        ctx.strokeText(label, cx, cy);
        ctx.fillText(label, cx, cy);
        ctx.restore();
      }
    }
    _paintPreview(ctx) {
      const dpr = this.dpr;
      for (const p of this.opts.preview) {
        if (p.pass) continue;
        this._paintStone(ctx, p.x, p.y, p.color, 0.45);
        /* PV 变化图：半透明石子上叠加手数序号（1 起，黑底白字描边保证可读） */
        if (typeof p.n === 'number' && p.n >= 1) {
          const cx = this.cx(p.x), cy = this.cy(p.y);
          ctx.save();
          ctx.font = `700 ${Math.max(6.5, this.cell * 0.22 * dpr)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(20, 16, 8, .85)';
          ctx.lineWidth = 2.2 * dpr;
          ctx.strokeText(String(p.n), cx, cy);
          ctx.fillText(String(p.n), cx, cy);
          ctx.restore();
        }
      }
    }
    _paintHover(ctx) {
      const h = this.opts.hover;
      if (!h || h.x < 0) return;
      if (this.stones[h.y * this.size + h.x]) return;
      this._paintStone(ctx, h.x, h.y, h.color, h.legal === false ? 0.18 : 0.5);
    }
    /* 待确认落子：稍实的影子 + 金色虚线圈，等待二次点击确认 */
    _paintPending(ctx) {
      const p = this.opts.pending;
      if (!p || p.x < 0) return;
      if (this.stones[p.y * this.size + p.x]) return;
      this._paintStone(ctx, p.x, p.y, p.color, 0.72);
      const cx = this.cx(p.x), cy = this.cy(p.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, this._stoneRadius() * 1.12, 0, 7);
      ctx.strokeStyle = '#f2d879';
      ctx.lineWidth = Math.max(1.6, 2 * this.dpr);
      ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
      ctx.stroke();
      ctx.restore();
    }
  }

  return BoardRenderer;
});
