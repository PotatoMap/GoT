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
  const SCORE_MARK_HALF_SIZE = 0.15;
  const GENERATED_APPEARANCE_IMAGES = new Map();
  const GENERATED_STONE_ASSETS = {
    porcelain: 'porcelain-stones.png',
    'golden-satin': 'gold-groove-stones.svg',
    'shell-brushed': 'kaya-silk-stones.svg'
  };
  const GENERATED_STONE_CENTERS = {
    porcelain: [[324, 622], [933, 622]],
    'golden-satin': [[300, 600], [900, 600]],
    'shell-brushed': [[300, 600], [900, 600]]
  };

  function loadGeneratedAppearanceImage(filename, onReady) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
    let entry = GENERATED_APPEARANCE_IMAGES.get(filename);
    if (!entry) {
      const image = new Image();
      entry = { image, loaded: false, failed: false, listeners: new Set() };
      GENERATED_APPEARANCE_IMAGES.set(filename, entry);
      image.onload = () => {
        entry.loaded = true;
        for (const listener of entry.listeners) listener();
        entry.listeners.clear();
      };
      image.onerror = () => {
        entry.failed = true;
        entry.listeners.clear();
      };
      image.src = new URL(`assets/appearance-generated/${filename}`, document.baseURI).href;
    }
    if (onReady && !entry.loaded && !entry.failed) entry.listeners.add(onReady);
    return entry.loaded ? entry.image : null;
  }

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
        dame: null,             // Uint8Array 1=公气/未定空点（点目时用中性色方块标出）
        dead: null,             // Set of indexes
        preview: null,          // [{x,y,color}]
        hover: null,            // {x,y,color,legal}
        pending: null,          // 待确认落子 {x,y,color}（落子确认模式）
        flip: false,            // 棋盘翻转 180°（从对方视角看棋）
        showCoords: true,
        compact: false,
        showNumbers: false,
        overlayOnly: false,      // 2.5D integration: preserve all native overlays above WebGL.
        showOwnership: false,
        toMove: BLACK,
        bestMove: -1,
        theme: 'obsidian',
        material: 'kaya',
        stone: 'classic',
        naturalPlacement: true
      };
      this._grain = null;
      this._bg = null;        // 木纹+网格+坐标 离屏缓存
      this._bgKey = '';
      this._sprites = null;   // 黑/白棋子精灵缓存
      this._materialAssetReady = () => {
        this._grain = null;
        this._bg = null;
        this._bgKey = '';
        this.requestRender();
        if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
          document.dispatchEvent(new CustomEvent('got:appearance-asset-loaded', { detail: { kind: 'material' } }));
        }
      };
      this._stoneAssetReady = () => {
        this._sprites = null;
        this.requestRender();
        if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
          document.dispatchEvent(new CustomEvent('got:appearance-asset-loaded', { detail: { kind: 'stones' } }));
        }
      };
      this._queuedMove = null;
      this._moveEffect = null;
      this.animationSpeed = 1.25;
      this._raf = 0;
      this.px = 0;
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
    }
    set(opts) {
      const oldTheme = this.opts.theme;
      const oldCompact = this.opts.compact;
      const previousStones = this.stones;
      const previousSize = this.size;
      Object.assign(this.opts, opts);
      if (oldCompact !== this.opts.compact) { this._bg = null; this._sprites = null; }
      if (opts.theme !== undefined && opts.theme !== oldTheme) {
        this._grain = null;
        this._bg = null;
        this._bgKey = '';
      }
      const oldMaterial = this._lastMaterial;
      if (opts.material !== undefined && opts.material !== oldMaterial) {
        this._lastMaterial = opts.material;
        this._grain = null;
        this._bg = null;
        this._bgKey = '';
        this._sprites = null;   // 云子/雪印质感随材质档重绘
      }
      const oldStone = this._lastStone;
      if (opts.stone !== undefined && opts.stone !== oldStone) {
        this._lastStone = opts.stone;
        this._sprites = null;   // 棋子质感（云子/经典/哑光）切换即重建精灵
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
      if (opts.stones) {
        this.stones = opts.stones;
        const queued = this._queuedMove;
        if (queued) {
          const index = queued.y * this.size + queued.x;
          const fresh = performance.now() - queued.queuedAt < 1200;
          const boardChanged = previousSize !== this.size || previousStones.length !== opts.stones.length || previousStones.some((color, i) => color !== opts.stones[i]);
          if (fresh && previousSize === this.size && opts.lastMove === index && opts.stones[index] === queued.color) {
            const captures = [];
            for (let i = 0; i < previousStones.length; i++) {
              if (previousStones[i] && !opts.stones[i]) captures.push({ index: i, color: previousStones[i] });
            }
            // Start on the first painted frame, after the app finishes its
            // synchronous panel updates. Starting here can consume the whole
            // effect before the browser gets a chance to display it.
            this._moveEffect = { index, color: queued.color, start: null, duration: (queued.reducedMotion ? 190 : 240) / this.animationSpeed, reducedMotion: queued.reducedMotion, captures, board: Int8Array.from(opts.stones) };
            this._queuedMove = null;
          } else if (!fresh || boardChanged) {
            this._moveEffect = null;
            this._queuedMove = null;
          }
        } else if (this._moveEffect) {
          const effect = this._moveEffect;
          const boardChanged = previousSize !== this.size || previousStones.length !== opts.stones.length || previousStones.some((color, i) => color !== opts.stones[i]);
          const sameEffectBoard = effect.board?.length === opts.stones.length && effect.board.every((color, i) => color === opts.stones[i]);
          if (boardChanged && !sameEffectBoard) this._moveEffect = null;
        }
      }
    }
    queueMoveAnimation(move) {
      this._queuedMove = null;
      if (!move || move.pass || !Number.isInteger(move.x) || !Number.isInteger(move.y) || !move.color) return;
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      this._queuedMove = { ...move, reducedMotion: !!reducedMotion, queuedAt: performance.now() };
    }
    setAnimationSpeed(speed) {
      const value=Number(speed);
      if([0.75,1,1.25,1.5].includes(value))this.animationSpeed=value;
    }
    resizeTo(stage) {
      /* 内容盒尺寸：clientWidth/Height 含 padding，须先扣除，画布才不会溢出到工具栏 */
      const cs = getComputedStyle(stage);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const available = Math.floor(Math.min(stage.clientWidth - padX, stage.clientHeight - padY));
      if (available <= 0) return; // Hidden workspaces have no usable content box.
      const cssSize = Math.max(1, available - 4);
      const dpr = window.devicePixelRatio || 1;
      if (this.canvas.style.width !== cssSize + 'px') {
        this.canvas.style.width = cssSize + 'px';
        this.canvas.style.height = cssSize + 'px';
      }
      const px = Math.floor(cssSize * dpr);
      if (this.px !== px || this.canvas.width !== px || this.canvas.height !== px) {
        this.px = px;
        this.canvas.width = px;
        this.canvas.height = px;
        this._grain = null;
        this._bg = null;
        this._sprites = null;
      }
      this.dpr = dpr;
      this.cssSize = cssSize;
      this.panBy(0, 0);
      this.requestRender();
    }
    setZoom(zoom, point) {
      this.zoom = Math.max(1, Math.min(3, zoom));
      this.panX = point ? (this.cssSize / 2 - this.cx(point.x) / this.dpr) * this.zoom : 0;
      this.panY = point ? (this.cssSize / 2 - this.cy(point.y) / this.dpr) * this.zoom : 0;
      this.panBy(0, 0);
    }
    panBy(dx, dy) {
      const limit = (this.cssSize || 0) * (this.zoom - 1) / 2;
      this.panX = Math.max(-limit, Math.min(limit, this.panX + dx));
      this.panY = Math.max(-limit, Math.min(limit, this.panY + dy));
      this.requestRender();
    }
    /* 帧合并：同一帧内多次触发只画一次（hover / 分析刷新更顺滑） */
    requestRender() {
      if (typeof requestAnimationFrame !== 'function') { this.render(); return; }
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
    }
    get margin() { return this.cssSize * (this.opts.compact ? (this.opts.showCoords ? 0.045 : 0.027) : (this.opts.showCoords ? 0.08 : 0.045)); }
    get cell() { return (this.cssSize - 2 * this.margin) / (this.size - 1); }
    /* 视觉列/行（未翻转的像素映射），网格与坐标标签使用 */
    _vx(i) { return (this.margin + i * this.cell) * this.dpr; }
    _vy(i) { return (this.margin + i * this.cell) * this.dpr; }
    /* 逻辑坐标 → 像素：flip 时做 180° 旋转 */
    cx(x) { return this._vx(this.opts.flip ? this.size - 1 - x : x); }
    cy(y) { return this._vy(this.opts.flip ? this.size - 1 - y : y); }
    _point(x, y) {
      return this.projectedPoint ? this.projectedPoint(x, y) : { x: this.cx(x), y: this.cy(y) };
    }
    naturalStoneOffset(x, y, size = this.size) {
      if (!this.opts.naturalPlacement) return { x: 0, y: 0 };
      const index = y * size + x;
      let seed = (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(size, 0x85ebca6b)) >>> 0;
      seed ^= seed >>> 16; seed = Math.imul(seed, 0x7feb352d) >>> 0; seed ^= seed >>> 15;
      const angle = (seed / 0x100000000) * Math.PI * 2;
      seed = Math.imul(seed ^ (seed >>> 13), 0x846ca68b) >>> 0; seed = (seed ^ (seed >>> 16)) >>> 0;
      const radius = 0.03 + (seed / 0x100000000) * 0.02;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }
    _stoneCenter(x, y) {
      if (this.visualStonePoint) return this.visualStonePoint(x, y);
      const jitter = this.naturalStoneOffset(x, y);
      const orientation = this.opts.flip ? -1 : 1;
      return { x: this.cx(x) + jitter.x * this.cell * this.dpr * orientation, y: this.cy(y) + jitter.y * this.cell * this.dpr * orientation };
    }
    pointAt(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || !this.cssSize) return null;
      if (clientX < rect.left || clientY < rect.top || clientX > rect.left + rect.width || clientY > rect.top + rect.height) return null;
      const offset = this.cssSize * (1 - this.zoom) / 2;
      const px = ((clientX - rect.left) * this.cssSize / rect.width - offset - this.panX) / this.zoom;
      const py = ((clientY - rect.top) * this.cssSize / rect.height - offset - this.panY) / this.zoom;
      const gx = Math.round((px - this.margin) / this.cell);
      const gy = Math.round((py - this.margin) / this.cell);
      if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return null;
      const dx = px - (this.margin + gx * this.cell);
      const dy = py - (this.margin + gy * this.cell);
      if (dx * dx + dy * dy > this.cell * this.cell * 0.36) return null;
      // 视觉格 → 逻辑坐标
      return this.opts.flip ? { x: this.size - 1 - gx, y: this.size - 1 - gy } : { x: gx, y: gy };
    }
    renderPhotoCanvas(targetSize = 2400) {
      if (!this.px || !this.cssSize) throw new Error('棋盘尚未完成布局');
      const scale = Math.max(1, Math.min(3, targetSize / this.px));
      const photo = document.createElement('canvas');
      const exportRenderer = new BoardRenderer(photo);
      exportRenderer.size = this.size;
      exportRenderer.stones = Int8Array.from(this.stones);
      exportRenderer.opts = {
        ...this.opts, overlayOnly: false, lastMove: -1, moveNumbers: null,
        candidates: [], ownership: null, showOwnership: false, territory: null,
        dame: null, dead: null, preview: null, hover: null, pending: null,
        tutorMarks: [], showNumbers: false
      };
      exportRenderer.cssSize = this.cssSize * scale;
      exportRenderer.dpr = this.dpr;
      exportRenderer.px = Math.round(this.px * scale);
      photo.width = photo.height = exportRenderer.px;
      exportRenderer.zoom = 1;
      exportRenderer.panX = exportRenderer.panY = 0;
      exportRenderer.render();
      return photo;
    }
    /* ---------- paint ---------- */
    render() {
      const ctx = this.ctx, px = this.px;
      if (!px) return;
      const effect = this._moveEffect;
      if (effect && effect.start === null) effect.start = performance.now();
      const progress = effect ? Math.min(1, Math.max(0, (performance.now() - effect.start) / effect.duration)) : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      if (effect && progress >= 1) this._moveEffect = null;
      const activeEffect = effect && progress < 1 ? effect : null;
      if (!this.opts.overlayOnly) {
        const key = px + '|' + this.size + '|' + (this.opts.showCoords ? 1 : 0) + '|' + (this.opts.flip ? 1 : 0) + '|' + (this.opts.theme || 'obsidian') + '|' + (this.opts.material || 'kaya');
        // 仅背景依赖 flip/showCoords；棋子精灵只依赖 px，不随翻转向失效重建
        if (this._bgKey !== key) this._bg = null;
        if (!this._bg) { this._buildBg(); this._bgKey = key; }
      }
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.translate((px * (1 - this.zoom) / 2) + this.panX * this.dpr, (px * (1 - this.zoom) / 2) + this.panY * this.dpr);
      ctx.scale(this.zoom, this.zoom);
      if (!this.opts.overlayOnly) ctx.drawImage(this._bg, 0, 0);
      if (this.opts.territory) this._paintTerritory(ctx);
      if (this.opts.dame) this._paintDame(ctx);
      if (!this.opts.overlayOnly) {
        if (activeEffect) this._paintMoveCaptures(ctx, activeEffect, eased);
        if (activeEffect) this._paintLandingShadow(ctx, activeEffect, eased);
        this._paintStones(ctx, activeEffect?.index ?? -1);
        if (activeEffect) this._paintFallingStone(ctx, activeEffect, eased);
      }
      // 形势覆盖层画在棋子之上：整块地域连成同色区域，死子一目了然
      if (this.opts.showOwnership && this.opts.ownership) this._paintOwnership(ctx);
      if (this.opts.showNumbers && this.opts.moveNumbers) this._paintNumbers(ctx);
      if (this.opts.dead && this.opts.dead.size) this._paintDead(ctx);
      if (this.opts.lastMove >= 0 && !this.opts.showNumbers) this._paintLast(ctx);
      if (this.opts.candidates && this.opts.candidates.length) this._paintCandidates(ctx);
      if (this.opts.preview && this.opts.preview.length) this._paintPreview(ctx);
      if (!this.opts.overlayOnly && this.opts.hover && !this.opts.pending && !this.opts.preview?.length &&
          !this.stones[this.opts.hover.y * this.size + this.opts.hover.x]) this._paintHover(ctx);
      if (!this.opts.overlayOnly && this.opts.pending) this._paintPending(ctx);
      // Keep teacher annotations visible above candidates, hover and pending stones.
      if (this.opts.tutorMarks && this.opts.tutorMarks.length) this._paintTutorMarks(ctx);
      ctx.restore();
      if (this._moveEffect && !this.opts.overlayOnly) this.requestRender();
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
    /* 木纹材质库：kaya 原色木 / tea 茶色木 / ebony 黑檀木 / alphago 浅金木纹。
     * 每种材质 = 底色渐变 + 纹理参数（年轮密度/振幅/颜色）+ 网格配色。 */
    _materials() {
      return {
        kaya: {
          wood: ['#e8c998', '#dfbd86', '#d3af74'],
          rings: 'rgba(146, 100, 42, ALPHA)', ringAlpha: [0.03, 0.075], ringCount: 26,
          grain: 'rgba(122, 82, 34, ALPHA)', grainAlpha: [0.02, 0.045],
          sheen: 'rgba(255, 243, 214, 0.10)',
          border: 'rgba(90, 58, 20, 0.55)', grid: 'rgba(94, 62, 24, 0.85)',
          star: 'rgba(70, 45, 16, 0.95)', coord: 'rgba(74, 48, 17, 0.9)'
        },
        'kaya-photo': {
          wood: ['#e8c998', '#dfbd86', '#d3af74'],
          textureAsset: 'kaya-photo.jpg', textureOpacity: 0.91,
          rings: 'rgba(146, 100, 42, ALPHA)', ringAlpha: [0.01, 0.025], ringCount: 18,
          grain: 'rgba(122, 82, 34, ALPHA)', grainAlpha: [0.008, 0.02],
          sheen: 'rgba(255, 243, 214, 0.07)',
          border: 'rgba(90, 58, 20, 0.55)', grid: 'rgba(94, 62, 24, 0.85)',
          star: 'rgba(70, 45, 16, 0.95)', coord: 'rgba(74, 48, 17, 0.9)'
        },
        tea: {
          wood: ['#c9a06a', '#b98d55', '#a97a44'],
          rings: 'rgba(96, 62, 26, ALPHA)', ringAlpha: [0.04, 0.09], ringCount: 30,
          grain: 'rgba(80, 50, 20, ALPHA)', grainAlpha: [0.025, 0.055],
          sheen: 'rgba(255, 236, 200, 0.08)',
          border: 'rgba(66, 42, 14, 0.6)', grid: 'rgba(70, 46, 18, 0.88)',
          star: 'rgba(52, 33, 12, 0.95)', coord: 'rgba(56, 36, 13, 0.92)'
        },
        ebony: {
          wood: ['#4a3626', '#3c2b1d', '#302115'],
          rings: 'rgba(18, 11, 6, ALPHA)', ringAlpha: [0.05, 0.12], ringCount: 34,
          grain: 'rgba(12, 8, 4, ALPHA)', grainAlpha: [0.03, 0.07],
          sheen: 'rgba(214, 178, 130, 0.07)',
          border: 'rgba(12, 8, 4, 0.7)', grid: 'rgba(214, 184, 140, 0.75)',
          star: 'rgba(228, 200, 158, 0.95)', coord: 'rgba(222, 194, 152, 0.9)'
        },
        alphago: {
          wood: ['#f0d18e', '#e9c77c', '#e7bf71'],
          rings: 'rgba(158, 105, 41, ALPHA)', ringAlpha: [0.018, 0.046], ringCount: 20,
          grain: 'rgba(132, 84, 31, ALPHA)', grainAlpha: [0.012, 0.032],
          sheen: 'rgba(255, 247, 220, 0.11)',
          // Keep the gold frame outside the coordinate labels; the wood/frame seam
          // must sit nearer the canvas edge than the coordinate band.
          frame: '#d89536', inset: 0.018, innerBorder: 'rgba(190, 126, 43, 0.75)',
          border: 'rgba(181, 108, 31, 0.95)', grid: 'rgba(62, 43, 24, 0.9)',
          star: 'rgba(65, 43, 22, 0.94)', coord: 'rgba(62, 43, 24, 0.9)'
        },
        'maple-light': {
          wood: ['#f0ddb8', '#e8d0a3', '#dcc091'],
          textureAsset: 'maple-light.jpg', textureOpacity: 0.92,
          rings: 'rgba(137, 104, 61, ALPHA)', ringAlpha: [0.014, 0.038], ringCount: 32,
          grain: 'rgba(117, 87, 51, ALPHA)', grainAlpha: [0.012, 0.03],
          sheen: 'rgba(255, 250, 230, 0.09)',
          border: 'rgba(104, 76, 41, 0.6)', grid: 'rgba(89, 66, 37, 0.82)',
          star: 'rgba(75, 53, 29, 0.94)', coord: 'rgba(76, 55, 31, 0.9)'
        },
        'walnut-dark': {
          wood: ['#79573c', '#64462f', '#503622'],
          textureAsset: 'walnut-dark.jpg', textureOpacity: 0.88,
          rings: 'rgba(28, 18, 12, ALPHA)', ringAlpha: [0.025, 0.065], ringCount: 34,
          grain: 'rgba(35, 23, 15, ALPHA)', grainAlpha: [0.018, 0.048],
          sheen: 'rgba(236, 194, 143, 0.075)',
          border: 'rgba(28, 18, 12, 0.8)', grid: 'rgba(230, 207, 170, 0.78)',
          star: 'rgba(239, 216, 177, 0.92)', coord: 'rgba(240, 218, 183, 0.9)'
        },
        'paper-antique': {
          wood: ['#f1e5ca', '#e9dbbc', '#dfcfad'],
          textureMode: 'paper', textureAsset: 'paper-antique.jpg', textureOpacity: 0.9,
          sheen: 'rgba(255, 252, 239, 0.06)',
          border: 'rgba(111, 86, 55, 0.62)', grid: 'rgba(91, 69, 43, 0.82)',
          star: 'rgba(76, 56, 35, 0.94)', coord: 'rgba(76, 56, 36, 0.9)'
        },
        'slate-dark': {
          wood: ['#58616a', '#48525b', '#3c454e'],
          textureMode: 'slate', textureAsset: 'slate-dark.jpg', textureOpacity: 0.82,
          sheen: 'rgba(232, 224, 204, 0.045)',
          border: 'rgba(23, 30, 36, 0.86)', grid: 'rgba(226, 216, 192, 0.78)',
          star: 'rgba(241, 226, 192, 0.92)', coord: 'rgba(232, 220, 195, 0.9)'
        },
        'ivory-modern': {
          wood: ['#f6f1e5', '#ede7d8', '#e3dccb'],
          textureMode: 'ivory', textureAsset: 'ivory-modern.jpg', textureOpacity: 0.92,
          sheen: 'rgba(255, 255, 249, 0.07)',
          border: 'rgba(123, 109, 85, 0.58)', grid: 'rgba(89, 77, 58, 0.82)',
          star: 'rgba(79, 65, 46, 0.94)', coord: 'rgba(77, 65, 48, 0.9)'
        },
        'cinnabar-lacquer': {
          wood: ['#c16f54', '#ae563e', '#93402f'],
          textureMode: 'red-lacquer', textureAsset: 'cinnabar-lacquer.jpg', textureOpacity: 0.76,
          frame: '#542920', inset: 0.022, innerBorder: 'rgba(235, 190, 112, 0.88)',
          sheen: 'rgba(255, 224, 198, 0.10)',
          border: 'rgba(62, 28, 23, 0.94)', grid: 'rgba(58, 31, 27, 0.9)',
          star: 'rgba(58, 31, 27, 0.96)', coord: 'rgba(255, 232, 204, 0.98)'
        },
        'indigo-lacquer': {
          wood: ['#8c9eb8', '#788ba7', '#667a96'],
          textureMode: 'indigo-lacquer', textureAsset: 'indigo-lacquer.jpg', textureOpacity: 0.5,
          sheen: 'rgba(238, 245, 255, 0.08)',
          border: 'rgba(34, 48, 68, 0.9)', grid: 'rgba(35, 48, 67, 0.92)',
          star: 'rgba(35, 48, 67, 0.97)', coord: 'rgba(247, 242, 228, 0.98)'
        },
        'celadon-lacquer': {
          wood: ['#a9b99d', '#91a487', '#7e9279'],
          textureMode: 'celadon-lacquer', textureAsset: 'celadon-lacquer.jpg', textureOpacity: 0.68,
          sheen: 'rgba(245, 255, 230, 0.10)',
          border: 'rgba(48, 66, 49, 0.88)', grid: 'rgba(43, 58, 43, 0.9)',
          star: 'rgba(43, 58, 43, 0.96)', coord: 'rgba(248, 244, 220, 0.98)'
        },
      };
    }
    /* 木纹材质调色（按所选材质取年轮/网格配色） */
    _woodPalette() {
      const m = this._materials();
      return m[this.opts.material] || m.kaya;
    }
    _createMaterialTexture(px, p) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      const g = canvas.getContext('2d');
      if (!g) return canvas;
      if (p.textureAsset) {
        const image = loadGeneratedAppearanceImage(p.textureAsset, this._materialAssetReady);
        if (image) {
          g.globalAlpha = p.textureOpacity ?? 1;
          g.drawImage(image, 0, 0, px, px);
          g.globalAlpha = 1;
          return canvas;
        }
        // Keep the existing procedural 2D texture as a local fallback while
        // the bundled generated artwork is loading or if it is unavailable.
      }
      if (!p.textureMode) return null;
      const textureSeeds = { slate: 41, paper: 23, 'red-lacquer': 61, 'indigo-lacquer': 73, 'celadon-lacquer': 89 };
      let seed = textureSeeds[p.textureMode] || 31;
      const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
      const unit = Math.max(1, px / 1024);
      if (p.textureMode === 'paper') {
        // Original, low-contrast paper fibers; generated only while this 2D material is selected.
        for (let i = 0; i < 360; i++) {
          const x = random() * px, y = random() * px;
          const length = (12 + random() * 92) * unit;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + length, y + (random() - 0.5) * 2.4 * unit);
          g.strokeStyle = i % 3 === 0 ? 'rgba(255,252,238,0.12)' : 'rgba(116,88,54,0.045)';
          g.lineWidth = (0.45 + random() * 0.7) * unit; g.stroke();
        }
        for (let i = 0; i < 250; i++) {
          g.fillStyle = random() < 0.55 ? 'rgba(125,96,58,0.035)' : 'rgba(255,255,245,0.12)';
          g.fillRect(random() * px, random() * px, unit * (0.5 + random()), unit * (0.5 + random()));
        }
      } else if (p.textureMode === 'slate') {
        for (let i = 0; i < 6; i++) {
          const x = random() * px, y = random() * px, radius = px * (0.18 + random() * 0.26);
          const cloud = g.createRadialGradient(x, y, 0, x, y, radius);
          cloud.addColorStop(0, 'rgba(225,230,232,0.055)'); cloud.addColorStop(1, 'rgba(225,230,232,0)');
          g.fillStyle = cloud; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        for (let i = 0; i < 1700; i++) {
          const light = random() > 0.56;
          g.fillStyle = light ? 'rgba(231,232,225,0.09)' : 'rgba(10,15,20,0.08)';
          const dot = (0.35 + random() * 1.1) * unit;
          g.fillRect(random() * px, random() * px, dot, dot);
        }
      } else if (p.textureMode === 'red-lacquer') {
        // Smooth lacquer reflections: broad light falloff and only a few polished ribbons.
        const polish = g.createLinearGradient(px * 0.12, px * 0.08, px * 0.88, px * 0.92);
        polish.addColorStop(0, 'rgba(255,232,207,0.09)');
        polish.addColorStop(0.38, 'rgba(255,222,195,0.025)');
        polish.addColorStop(0.72, 'rgba(74,24,19,0.018)');
        polish.addColorStop(1, 'rgba(54,18,16,0.075)');
        g.fillStyle = polish; g.fillRect(0, 0, px, px);
        for (let i = 0; i < 7; i++) {
          const y = random() * px;
          const bow = (random() - 0.5) * px * 0.012;
          g.beginPath();
          g.moveTo(-px * 0.05, y);
          g.bezierCurveTo(px * 0.28, y + bow, px * 0.68, y - bow * 0.7, px * 1.05, y + (random() - 0.5) * unit * 3);
          g.strokeStyle = random() > 0.48 ? 'rgba(255,232,211,0.055)' : 'rgba(64,22,20,0.035)';
          g.lineWidth = (0.6 + random() * 2.2) * unit;
          g.stroke();
        }
      } else if (p.textureMode === 'indigo-lacquer') {
        // Layered blue-gray mineral haze with long, soft veins rather than wood grain.
        for (let i = 0; i < 5; i++) {
          const x = random() * px, y = random() * px, radius = px * (0.12 + random() * 0.2);
          const cloud = g.createRadialGradient(x, y, 0, x, y, radius);
          cloud.addColorStop(0, random() > 0.5 ? 'rgba(225,238,255,0.075)' : 'rgba(35,55,82,0.065)');
          cloud.addColorStop(1, 'rgba(110,140,180,0)');
          g.fillStyle = cloud; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        for (let i = 0; i < 6; i++) {
          const x = random() * px * 0.7, y = random() * px, drift = (random() - 0.5) * px * 0.16;
          g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + px * 0.12, y + drift, x + px * 0.24, y - drift * 0.65, x + px * 0.38, y + drift * 0.3);
          g.strokeStyle = i % 2 ? 'rgba(226,238,253,0.045)' : 'rgba(31,48,72,0.04)';
          g.lineWidth = (0.45 + random() * 0.8) * unit; g.stroke();
        }
      } else if (p.textureMode === 'celadon-lacquer') {
        // Milky translucent glaze blooms and a restrained pearlescent sweep.
        for (let i = 0; i < 4; i++) {
          const x = random() * px, y = random() * px, radius = px * (0.16 + random() * 0.2);
          const cloud = g.createRadialGradient(x, y, radius * 0.04, x, y, radius);
          cloud.addColorStop(0, random() > 0.5 ? 'rgba(247,252,228,0.085)' : 'rgba(58,83,64,0.055)');
          cloud.addColorStop(1, 'rgba(150,175,139,0)');
          g.fillStyle = cloud; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        const glaze = g.createLinearGradient(0, px * 0.18, px, px * 0.82);
        glaze.addColorStop(0, 'rgba(247,255,233,0.055)'); glaze.addColorStop(0.46, 'rgba(240,255,235,0)');
        glaze.addColorStop(1, 'rgba(50,75,56,0.045)');
        g.fillStyle = glaze; g.fillRect(0, 0, px, px);
        for (let i = 0; i < 64; i++) {
          g.fillStyle = random() > 0.52 ? 'rgba(248,240,205,0.07)' : 'rgba(50,68,49,0.045)';
          const dot = (0.45 + random() * 0.9) * unit;
          g.fillRect(random() * px, random() * px, dot, dot);
        }
      } else {
        const glow = g.createRadialGradient(px * 0.18, px * 0.12, 0, px * 0.2, px * 0.16, px * 0.9);
        glow.addColorStop(0, 'rgba(255,255,255,0.14)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow; g.fillRect(0, 0, px, px);
        for (let i = 0; i < 220; i++) {
          g.fillStyle = random() < 0.5 ? 'rgba(151,128,91,0.025)' : 'rgba(255,255,252,0.1)';
          const dot = (0.4 + random() * 0.9) * unit;
          g.fillRect(random() * px, random() * px, dot, dot);
        }
      }
      return canvas;
    }
    _paintWood(ctx, px) {
      const p = this._woodPalette();
      const requestedInset = Math.round(px * (p.inset || 0));
      // Keep the wood/frame seam outside the coordinate glyphs on every board
      // size; a fixed material inset can otherwise collide with labels on 9x9/7x7.
      const coordCenterFromEdge = this.margin * this.dpr * 0.45;
      const coordFontSize = Math.max(9, this.cell * 0.34 * this.dpr);
      const safeInset = Math.max(0, Math.floor(coordCenterFromEdge - coordFontSize * 0.5 - 2 * this.dpr));
      const inset = this.opts.showCoords ? Math.min(requestedInset, safeInset) : requestedInset;
      if (inset) {
        ctx.fillStyle = p.frame;
        ctx.fillRect(0, 0, px, px);
      }
      const g = ctx.createLinearGradient(0, inset, 0, px - inset);
      g.addColorStop(0, p.wood[0]);
      g.addColorStop(0.5, p.wood[1]);
      g.addColorStop(1, p.wood[2]);
      ctx.fillStyle = g;
      ctx.fillRect(inset, inset, px - inset * 2, px - inset * 2);
      // 木纹保持低对比，让网格和棋子始终是视觉焦点。
      if (!this._grain && (p.textureMode || p.textureAsset)) this._grain = this._createMaterialTexture(px, p);
      if (!this._grain) {
        const gc = document.createElement('canvas');
        gc.width = px; gc.height = px;
        const gctx = gc.getContext('2d');
        if (inset) {
          gctx.beginPath();
          gctx.rect(inset, inset, px - inset * 2, px - inset * 2);
          gctx.clip();
        }
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        // 第一层：柔和宽木纹，方向保持水平，不叠加醒目的斜向亮带。
        for (let i = 0; i < Math.round(p.ringCount * 0.72); i++) {
          const y = rnd() * px;
          const amp = 2 + rnd() * 5;
          const wl = 260 + rnd() * 340;
          gctx.beginPath();
          gctx.moveTo(-8, y);
          for (let x = 0; x <= px + 8; x += 40) gctx.lineTo(x, y + Math.sin(x / wl + i) * amp);
          gctx.strokeStyle = p.rings.replace('ALPHA', (p.ringAlpha[0] + rnd() * (p.ringAlpha[1] - p.ringAlpha[0]) * 0.62).toFixed(3));
          gctx.lineWidth = 1.2 + rnd() * 2.2;
          gctx.stroke();
        }
        // 第二层：少量细纹，只提供木质感，不形成噪点。
        for (let i = 0; i < 58; i++) {
          const y = rnd() * px;
          const amp = 1 + rnd() * 2.5;
          gctx.beginPath();
          gctx.moveTo(0, y);
          for (let x = 0; x <= px; x += 24) gctx.lineTo(x, y + Math.sin(x / 130 + i) * amp);
          gctx.strokeStyle = p.grain.replace('ALPHA', (p.grainAlpha[0] + rnd() * (p.grainAlpha[1] - p.grainAlpha[0]) * 0.58).toFixed(3));
          gctx.lineWidth = 0.6 + rnd() * 0.9;
          gctx.stroke();
        }
        // 一层宽而弱的漫反射，避免旧版两道斜向亮带造成的塑料感。
        const light = gctx.createRadialGradient(px * 0.16, px * 0.12, 0, px * 0.2, px * 0.16, px * 1.05);
        light.addColorStop(0, p.sheen);
        light.addColorStop(0.42, p.sheen.replace(/0\.\d+\)$/, '0.035)'));
        light.addColorStop(1, 'rgba(255,255,255,0)');
        gctx.fillStyle = light;
        gctx.fillRect(0, 0, px, px);
        const shade = gctx.createRadialGradient(px * 0.92, px * 0.94, 0, px * 0.92, px * 0.94, px * 0.9);
        shade.addColorStop(0, 'rgba(32,20,8,0.045)');
        shade.addColorStop(1, 'rgba(32,20,8,0)');
        gctx.fillStyle = shade;
        gctx.fillRect(0, 0, px, px);
        this._grain = gc;
      }
      if (inset && p.textureMode) {
        // Texture overlays must stay on the playing surface, leaving the new lacquer frame clean.
        ctx.save();
        ctx.beginPath(); ctx.rect(inset, inset, px - inset * 2, px - inset * 2); ctx.clip();
        ctx.drawImage(this._grain, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(this._grain, 0, 0);
      }
      if (inset) {
        ctx.strokeStyle = p.innerBorder;
        ctx.lineWidth = Math.max(1, 1.2 * this.dpr);
        ctx.strokeRect(inset + 0.5, inset + 0.5, px - inset * 2 - 1, px - inset * 2 - 1);
      }
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
      const drawLines = () => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const c = this._vx(i), r = this._vy(i);
          ctx.moveTo(x0, r); ctx.lineTo(x1, r);
          ctx.moveTo(c, x0); ctx.lineTo(c, x1);
        }
        ctx.stroke();
      };
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = Math.max(1, 0.9 * dpr);
      drawLines();
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
      // 材质（原色/茶色/黑檀）覆盖网格/星位/坐标配色，与所选木纹保持一致观感
      const base = palettes[this.opts.theme] || palettes.obsidian;
      const m = this._woodPalette();
      return { ...base, border: m.border, grid: m.grid, star: m.star, coord: m.coord };
    }
    /* 用宽阔的漫反射塑造体积；经典与云子不叠加针尖高光。 */
    _stoneRadius() { return this.cell * 0.47 * this.dpr; }
    _drawInkStone(g, cx, cy, r, color) {
      // Resolution-independent vector circles, rendered at the current device
      // scale into the same sprite cache as other stones. No bitmap or shading.
      const black = color === BLACK;
      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = black ? '#191c1e' : '#f7f3e9';
      g.fill();
      g.strokeStyle = black ? '#b5bab7' : '#55564f';
      g.lineWidth = Math.max(0.7 * (this.dpr || 1), r * 0.035);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
      g.strokeStyle = black ? '#646b69' : '#bbb5a6';
      g.lineWidth = Math.max(0.45 * (this.dpr || 1), r * 0.018);
      g.stroke();
      g.restore();
    }
    /* 棋子本体（画到指定 ctx），供精灵缓存使用 */
    _drawStoneBody(g, cx, cy, r, color) {
      const dpr = this.dpr || 1;
      const style = this.opts.stone || 'classic';
      if (style === 'ink-flat') {
        this._drawInkStone(g, cx, cy, r, color);
        return;
      }
      const isMatte = style === 'matte';
      const isYunzi = style === 'yunzi';
      const isAlphaGo = style === 'alphago';
      const isSoftGloss = style === 'soft-gloss';
      const isPhotorealistic = style === 'photorealistic';
      const isShellSlate = style === 'shell-slate';
      const isJade = style === 'jade';
      const isAntique = style === 'antique';
      const isPorcelain = style === 'porcelain';
      // 接触阴影只落在棋子右下方，边缘柔化后不会出现第二层硬圆。
      {
        const sh = g.createRadialGradient(cx + r * 0.1, cy + r * 0.16, r * 0.38, cx + r * 0.1, cy + r * 0.16, r * 1.08);
        sh.addColorStop(0, 'rgba(22, 16, 10, 0.22)');
        sh.addColorStop(0.62, 'rgba(22, 16, 10, 0.11)');
        sh.addColorStop(1, 'rgba(25, 15, 4, 0)');
        g.beginPath();
        g.arc(cx + r * 0.1, cy + r * 0.16, r * 1.08, 0, 7);
        g.fillStyle = sh;
        g.fill();
      }
      // A broad reflected window gives the stone shape without a tiny white dot.
      // Keep the inner radius large so the brightest region stays diffuse at HiDPI.
      const grad = g.createRadialGradient(cx - r * 0.28, cy - r * 0.34, r * 0.2, cx + r * 0.08, cy + r * 0.14, r * 1.22);
      if (isPorcelain && color === BLACK) {
        grad.addColorStop(0, '#767a7d'); grad.addColorStop(0.16, '#414548');
        grad.addColorStop(0.54, '#1d2022'); grad.addColorStop(0.86, '#090b0c'); grad.addColorStop(1, '#030404');
      } else if (isPorcelain) {
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.27, '#fffefa');
        grad.addColorStop(0.7, '#e8e5dc'); grad.addColorStop(1, '#b8b1a5');
      } else if (isAlphaGo) {
        if (color === BLACK) {
          grad.addColorStop(0, '#4a4c4e');
          grad.addColorStop(0.24, '#303234');
          grad.addColorStop(0.62, '#151719');
          grad.addColorStop(1, '#070809');
        } else {
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.28, '#fafaf8');
          grad.addColorStop(0.72, '#e7e7e3');
          grad.addColorStop(1, '#c6c6c2');
        }
      } else if (isSoftGloss && color === BLACK) {
        grad.addColorStop(0, '#555b60'); grad.addColorStop(0.2, '#383e43');
        grad.addColorStop(0.58, '#1a1f23'); grad.addColorStop(1, '#070a0d');
      } else if (isSoftGloss) {
        grad.addColorStop(0, '#fffefa'); grad.addColorStop(0.34, '#f5f1e9');
        grad.addColorStop(0.76, '#e1ddd4'); grad.addColorStop(1, '#bcb6aa');
      } else if (isPhotorealistic && color === BLACK) {
        grad.addColorStop(0, '#62676a'); grad.addColorStop(0.18, '#34383a');
        grad.addColorStop(0.56, '#17191a'); grad.addColorStop(0.86, '#08090a'); grad.addColorStop(1, '#030404');
      } else if (isPhotorealistic) {
        grad.addColorStop(0, '#fffefa'); grad.addColorStop(0.26, '#f4f1e9');
        grad.addColorStop(0.68, '#dedbd3'); grad.addColorStop(0.92, '#c3beb4'); grad.addColorStop(1, '#9e988e');
      } else if (isShellSlate && color === BLACK) {
        grad.addColorStop(0, '#59616a'); grad.addColorStop(0.24, '#343c45');
        grad.addColorStop(0.68, '#151b21'); grad.addColorStop(1, '#080c11');
      } else if (isShellSlate) {
        grad.addColorStop(0, '#fffefa'); grad.addColorStop(0.34, '#f6f0e2');
        grad.addColorStop(0.74, '#e2d8c5'); grad.addColorStop(1, '#bdb19b');
      } else if (isJade && color === BLACK) {
        grad.addColorStop(0, '#354b43'); grad.addColorStop(0.26, '#20352e');
        grad.addColorStop(0.68, '#10211c'); grad.addColorStop(1, '#07110e');
      } else if (isJade) {
        grad.addColorStop(0, '#fbfff4'); grad.addColorStop(0.32, '#e6f0df');
        grad.addColorStop(0.72, '#cfddca'); grad.addColorStop(1, '#a4b5a0');
      } else if (isAntique && color === BLACK) {
        grad.addColorStop(0, '#514941'); grad.addColorStop(0.3, '#342e28');
        grad.addColorStop(0.72, '#1b1815'); grad.addColorStop(1, '#0b0908');
      } else if (isAntique) {
        grad.addColorStop(0, '#fff8e9'); grad.addColorStop(0.34, '#efe4cf');
        grad.addColorStop(0.78, '#d7c8ad'); grad.addColorStop(1, '#b1a184');
      } else if (color === BLACK) {
        if (isMatte) {
          grad.addColorStop(0, '#383c3e');
          grad.addColorStop(0.46, '#202426');
          grad.addColorStop(1, '#090c0d');
        } else if (isYunzi) {
          grad.addColorStop(0, '#454c4d');
          grad.addColorStop(0.3, '#303638');
          grad.addColorStop(0.68, '#111617');
          grad.addColorStop(1, '#050809');
        } else {
          grad.addColorStop(0, '#45474a');
          grad.addColorStop(0.34, '#292b2e');
          grad.addColorStop(0.74, '#111315');
          grad.addColorStop(1, '#070809');
        }
      } else if (isMatte) {
        grad.addColorStop(0, '#eae7df');
        grad.addColorStop(0.52, '#e1ded5');
        grad.addColorStop(0.88, '#cbc7bd');
        grad.addColorStop(1, '#aaa59a');
      } else if (isYunzi) {
        grad.addColorStop(0, '#f5f2e9');
        grad.addColorStop(0.36, '#eeeade');
        grad.addColorStop(0.78, '#ded9ce');
        grad.addColorStop(1, '#bbb4a8');
      } else {
        grad.addColorStop(0, '#f2efe7');
        grad.addColorStop(0.4, '#eae7df');
        grad.addColorStop(0.82, '#d8d3c8');
        grad.addColorStop(1, '#b8b1a5');
      }
      g.beginPath();
      g.arc(cx, cy, r, 0, 7);
      g.fillStyle = grad;
      g.fill();
      if (isSoftGloss || isPhotorealistic || isShellSlate || isJade || isAntique || isPorcelain) {
        g.save();
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
        if (isShellSlate) {
          // Delicate broad nacre lines and mineral clouds, kept below the grid/stone contrast threshold.
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.ellipse(cx - r * 0.08, cy - r * 0.12 + i * r * 0.1, r * (0.42 + i * 0.04), r * 0.14, -0.18, 0.08, Math.PI * 0.92);
            g.strokeStyle = color === WHITE ? 'rgba(255,255,255,0.10)' : 'rgba(220,232,240,0.045)';
            g.lineWidth = Math.max(0.55, r * 0.025); g.stroke();
          }
        } else {
          const reflection = g.createRadialGradient(cx - r * 0.34, cy - r * 0.42, r * 0.02, cx - r * 0.16, cy - r * 0.12, r * (isPhotorealistic ? 0.86 : 0.78));
          const alpha = isPorcelain ? (color === BLACK ? 0.24 : 0.3) : isSoftGloss ? (color === BLACK ? 0.2 : 0.24) : isPhotorealistic ? (color === BLACK ? 0.25 : 0.32) : isJade ? 0.13 : 0.09;
          reflection.addColorStop(0, color === BLACK ? `rgba(239,245,248,${alpha})` : `rgba(255,255,255,${alpha})`);
          reflection.addColorStop(0.42, color === BLACK ? `rgba(220,230,236,${alpha * 0.42})` : `rgba(255,255,255,${alpha * 0.42})`);
          reflection.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = reflection; g.fillRect(cx - r, cy - r, r * 2, r * 2);
          if (isPorcelain) {
            // One broad softbox ribbon gives glazed porcelain a crisp but non-pinpoint shine.
            g.save();
            g.translate(cx - r * 0.26, cy - r * 0.39); g.rotate(-0.48);
            g.beginPath();
            g.ellipse(0, 0, r * 0.44, r * 0.12, 0, 0, Math.PI * 2);
            const glaze = g.createLinearGradient(-r * 0.42, 0, r * 0.42, 0);
            glaze.addColorStop(0, 'rgba(255,255,255,0)');
            glaze.addColorStop(0.34, color === BLACK ? 'rgba(248,252,255,0.16)' : 'rgba(255,255,255,0.2)');
            glaze.addColorStop(0.53, color === BLACK ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.46)');
            glaze.addColorStop(0.74, color === BLACK ? 'rgba(248,252,255,0.14)' : 'rgba(255,255,255,0.18)');
            glaze.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = glaze;
            g.fill();
            g.restore();
          }
          if (isJade) {
            const cloud = g.createRadialGradient(cx + r * 0.24, cy + r * 0.24, r * 0.02, cx + r * 0.18, cy + r * 0.18, r * 0.76);
            cloud.addColorStop(0, color === BLACK ? 'rgba(89,145,117,0.11)' : 'rgba(255,255,255,0.15)');
            cloud.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = cloud; g.fillRect(cx - r, cy - r, r * 2, r * 2);
          }
        }
        g.restore();
      }
      if (isMatte) {
        // 细颗粒（哑光磨砂质感）：确定性伪随机撒点，落在棋子圆内
        let seed = (color === BLACK ? 11 : 29);
        const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
        const dots = Math.max(10, Math.round(r * 0.55));
        for (let i = 0; i < dots; i++) {
          const a = rnd() * Math.PI * 2;
          const d = Math.sqrt(rnd()) * r * 0.92;
          g.beginPath();
          g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(0.4, r * 0.02), 0, 7);
          g.fillStyle = color === BLACK ? 'rgba(210, 218, 220, 0.025)' : 'rgba(120, 110, 88, 0.03)';
          g.fill();
        }
      }
      // No extra gloss spot or drawn crescent: both previously looked like paint.
      // Fine edge separates the stone from the grid without a bright halo.
      const darkAddedBoard = this.opts.material === 'slate-dark' || this.opts.material === 'walnut-dark';
      g.strokeStyle = isAlphaGo
        ? (color === BLACK ? 'rgba(35, 36, 37, 0.92)' : 'rgba(150, 150, 146, 0.7)')
        : isShellSlate && color === BLACK ? 'rgba(188, 201, 212, 0.58)'
          : isJade && color === BLACK ? 'rgba(112, 151, 131, 0.56)'
            : darkAddedBoard && color === BLACK ? (this.opts.material === 'slate-dark' ? 'rgba(211, 219, 224, 0.52)' : 'rgba(222, 194, 155, 0.54)')
            : (color === BLACK ? 'rgba(0, 0, 0, 0.58)' : 'rgba(105, 97, 82, 0.44)');
      g.lineWidth = Math.max(0.7, (isAlphaGo ? 0.9 : 0.7) * dpr);
      g.beginPath();
      g.arc(cx, cy, r, 0, 7);
      g.stroke();
    }
    _ensureSprites() {
      if (this._sprites) return;
      const r = this._stoneRadius();
      const s = Math.ceil(r * 2.4);
      const generatedAtlas = GENERATED_STONE_ASSETS[this.opts.stone]
        ? loadGeneratedAppearanceImage(GENERATED_STONE_ASSETS[this.opts.stone], this._stoneAssetReady)
        : null;
      if (generatedAtlas?.naturalWidth && generatedAtlas?.naturalHeight) {
        // Atlas layout: black at 25% x, white at 75% x. Crop equal square cells
        // around each source stone so the transparent art stays perfectly round.
        const sourceCell = Math.min(generatedAtlas.naturalWidth / 2, generatedAtlas.naturalHeight / 2);
        const centers = GENERATED_STONE_CENTERS[this.opts.stone];
        const makeGeneratedSprite = (slot) => {
          const c = document.createElement('canvas');
          c.width = c.height = s;
          const g = c.getContext('2d');
          const sourceX = centers[slot][0] - sourceCell / 2;
          const sourceY = centers[slot][1] - sourceCell / 2;
          const drawSize = s * 0.95;
          g.drawImage(generatedAtlas, sourceX, sourceY, sourceCell, sourceCell, (s - drawSize) / 2, (s - drawSize) / 2, drawSize, drawSize);
          return c;
        };
        this._sprites = { b: makeGeneratedSprite(0), w: makeGeneratedSprite(1), s };
        return;
      }
      const mk = (color) => {
        const c = document.createElement('canvas');
        c.width = s; c.height = s;
        const g = c.getContext('2d');
        this._drawStoneBody(g, s / 2, s / 2, r, color);
        return c;
      };
      this._sprites = { b: mk(BLACK), w: mk(WHITE), s };
    }
    _paintStone(ctx, x, y, color, alpha, offsetY = 0, scale = 1) {
      this._ensureSprites();
      const sp = this._sprites;
      const { x: cx, y: cy } = this._stoneCenter(x, y);
      const needsAlpha = alpha !== undefined && alpha < 1;
      if (needsAlpha) { ctx.save(); ctx.globalAlpha = alpha; } // 不透明棋子免掉状态栈
      const size = sp.s * scale;
      ctx.drawImage(color === BLACK ? sp.b : sp.w, cx - size / 2, cy + offsetY - size / 2, size, size);
      if (needsAlpha) ctx.restore();
    }
    _paintStones(ctx, skipIndex = -1) {
      const b = this.stones;
      for (let i = 0; i < b.length; i++) {
        if (i === skipIndex) continue;
        if (b[i] === BLACK) this._paintStone(ctx, i % this.size, (i / this.size) | 0, BLACK);
        else if (b[i] === WHITE) this._paintStone(ctx, i % this.size, (i / this.size) | 0, WHITE);
      }
    }
    _paintMoveCaptures(ctx, effect, progress) {
      const lift = this.cell * this.dpr * (effect.reducedMotion ? 0.2 : 0.34) * progress;
      const scale = 1 - (effect.reducedMotion ? 0.045 : 0.08) * progress;
      for (const captured of effect.captures) {
        this._paintStone(ctx, captured.index % this.size, (captured.index / this.size) | 0, captured.color, 1 - progress, -lift, scale);
      }
    }
    _paintLandingShadow(ctx, effect, progress) {
      const { x: cx, y: cy } = this._stoneCenter(effect.index % this.size, (effect.index / this.size) | 0);
      const r = this._stoneRadius(), spread = 1.34 - 0.28 * progress;
      const shadow = ctx.createRadialGradient(cx, cy + r * 0.22, r * 0.08, cx, cy + r * 0.22, r * spread);
      shadow.addColorStop(0, `rgba(34, 25, 15, ${0.07 + 0.2 * progress})`);
      shadow.addColorStop(0.48, `rgba(34, 25, 15, ${0.025 + 0.08 * progress})`);
      shadow.addColorStop(1, 'rgba(34, 25, 15, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.22, r * spread, r * spread * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    _paintFallingStone(ctx, effect, progress) {
      const x = effect.index % this.size, y = (effect.index / this.size) | 0;
      // Start clearly above the board, then settle in one quick, readable drop.
      const lift = this.cell * this.dpr * (effect.reducedMotion ? 0.24 : 0.72) * (1 - progress);
      const scale = (effect.reducedMotion ? 0.96 : 0.9) + (effect.reducedMotion ? 0.04 : 0.1) * progress;
      this._paintStone(ctx, x, y, effect.color, 1, -lift, scale);
    }
    _paintNumbers(ctx) {
      const dpr = this.dpr, mn = this.opts.moveNumbers;
      ctx.font = `600 ${Math.max(8, this.cell * 0.36 * dpr)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [idx, num] of mn) {
        const color = this.stones[idx];
        if (!color) continue;
        const { x: cx, y: cy } = this._stoneCenter(idx % this.size, (idx / this.size) | 0);
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
      const { x: cx, y: cy } = this._stoneCenter(i % this.size, (i / this.size) | 0);
      // A quiet, centered outline stays legible over either stone without hiding it.
      ctx.beginPath();
      ctx.arc(cx, cy, this._stoneRadius() * 0.25, 0, Math.PI * 2);
      ctx.strokeStyle = color === BLACK ? 'rgba(246, 238, 216, 0.94)' : 'rgba(37, 42, 36, 0.84)';
      ctx.lineWidth = Math.max(1.05 * this.dpr, this._stoneRadius() * 0.075);
      ctx.stroke();
    }
    _paintDead(ctx) {
      for (const i of this.opts.dead) {
        const color = this.stones[i];
        if (!color) continue;
        // A dead stone becomes a scoring point for its opponent; mark it with
        // the same owner-colored square used by the other score overlays.
        this._paintOwnerSquare(ctx, i % this.size, (i / this.size) | 0, color === BLACK ? WHITE : BLACK, 1, SCORE_MARK_HALF_SIZE);
      }
    }
    _paintTerritory(ctx) {
      const t = this.opts.territory;
      for (let i = 0; i < t.length; i++) {
        if (!t[i]) continue;
        this._paintOwnerSquare(ctx, i % this.size, (i / this.size) | 0, t[i], .96, SCORE_MARK_HALF_SIZE);
      }
    }
    _paintOwnerSquare(ctx, x, y, owner, alpha = 1, halfSize = .11) {
      const occupied = !!this.stones[y * this.size + x];
      const offset = occupied ? this.naturalStoneOffset(x, y) : { x: 0, y: 0 };
      const corners = [
        this._point(x + offset.x - halfSize, y + offset.y - halfSize),
        this._point(x + offset.x + halfSize, y + offset.y - halfSize),
        this._point(x + offset.x + halfSize, y + offset.y + halfSize),
        this._point(x + offset.x - halfSize, y + offset.y + halfSize)
      ];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fillStyle = owner === BLACK ? '#191a1c' : '#f7f4eb';
      ctx.strokeStyle = owner === BLACK ? 'rgba(249,245,232,.88)' : 'rgba(36,34,29,.78)';
      ctx.lineWidth = Math.max(.7 * this.dpr, this.cell * this.dpr * .018);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    /* 公气/未定空点：用低对比金色方块标出，保持点目覆盖形状统一。 */
    _paintDame(ctx) {
      const d = this.opts.dame;
      for (let i = 0; i < d.length; i++) {
        if (!d[i]) continue;
        this._paintDameSquare(ctx, i % this.size, (i / this.size) | 0);
      }
    }
    _paintDameSquare(ctx, x, y) {
      const halfSize = SCORE_MARK_HALF_SIZE;
      const corners = [
        this._point(x - halfSize, y - halfSize), this._point(x + halfSize, y - halfSize),
        this._point(x + halfSize, y + halfSize), this._point(x - halfSize, y + halfSize)
      ];
      ctx.save();
      ctx.fillStyle = 'rgba(214,158,60,.66)';
      ctx.strokeStyle = 'rgba(110,76,16,.82)';
      ctx.lineWidth = Math.max(.7 * this.dpr, this.cell * this.dpr * .018);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    _paintOwnership(ctx) {
      const own = this.opts.ownership;
      if (!own || own.length !== this.size * this.size) return;
      for (let i = 0; i < own.length; i++) {
        const v = own[i];
        const av = Math.abs(v);
        if (av < 0.12) continue;          // 真正的公气不上色
        const t = Math.min(1, (av - 0.12) / 0.5);
        this._paintOwnerSquare(ctx, i % this.size, (i / this.size) | 0, v > 0 ? BLACK : WHITE, .62 + .34 * t, .5);
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
        const { x: cx, y: cy } = this._point(c.x, c.y);
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
        // 最佳手：细暖金外圈，保留辨识度但不盖过棋子。
        if (k === 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 2.2 * dpr, 0, 7);
          ctx.strokeStyle = 'rgba(255, 226, 155, .82)';
          ctx.lineWidth = Math.max(1, 1.1 * dpr);
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
          const { x: cx, y: cy } = this._stoneCenter(p.x, p.y);
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
      const { x: cx, y: cy } = this._stoneCenter(h.x, h.y), r = this._stoneRadius();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
      ctx.strokeStyle = h.legal === false
        ? 'rgba(166,78,78,0.76)'
        : h.color === BLACK ? 'rgba(245,238,218,0.78)' : 'rgba(43,40,34,0.62)';
      ctx.lineWidth = Math.max(0.9, this.dpr * 0.9);
      ctx.stroke();
    }
    /* 待确认落子：稍实的影子 + 金色虚线圈，等待二次点击确认 */
    _paintPending(ctx) {
      const p = this.opts.pending;
      if (!p || p.x < 0) return;
      if (this.stones[p.y * this.size + p.x]) return;
      this._paintStone(ctx, p.x, p.y, p.color, 0.72);
      const { x: cx, y: cy } = this._stoneCenter(p.x, p.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, this._stoneRadius() * 1.12, 0, 7);
      ctx.strokeStyle = this.opts.theme === 'forest' ? '#b89245' : '#b47b20';
      ctx.lineWidth = Math.max(1.4, 1.7 * this.dpr);
      ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
      ctx.stroke();
      ctx.restore();
    }
    _paintTutorMarks(ctx) {
      const dpr = this.dpr || 1;
      for (const mark of this.opts.tutorMarks) {
        const stoneIndex = mark.y * this.size + mark.x;
        const { x, y } = this.stones[stoneIndex] ? this._stoneCenter(mark.x, mark.y) : this._point(mark.x, mark.y);
        const r = this._stoneRadius() * 1.24;
        ctx.save();
        if (mark.source === 'teacher') {
          // Open corner strokes preserve the stone and resemble a teacher pointing at it.
          const cell = this.cell * dpr, half = cell * .43, leg = cell * .17, curve = cell * .075;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const corners = () => {
            ctx.beginPath();
            for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
              const bx = x + sx * half, by = y + sy * half;
              ctx.moveTo(bx - sx * leg, by);
              ctx.lineTo(bx - sx * curve, by);
              ctx.quadraticCurveTo(bx, by, bx, by - sy * curve);
              ctx.lineTo(bx, by - sy * leg);
            }
          };
          corners(); ctx.strokeStyle = 'rgba(25,29,27,.78)'; ctx.lineWidth = 4 * dpr; ctx.stroke();
          corners(); ctx.strokeStyle = '#f0d39a'; ctx.lineWidth = 1.8 * dpr; ctx.stroke();
          const occupied = this.stones[mark.y * this.size + mark.x];
          const badgeR = Math.max(5 * dpr, cell * .17);
          const bx = occupied ? x + half : x, by = occupied ? y - half : y;
          ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = '#f0d39a'; ctx.fill();
          ctx.strokeStyle = '#343b33'; ctx.lineWidth = dpr; ctx.stroke();
          ctx.font = `600 ${Math.max(8 * dpr, cell * .24)}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#252b25';
          ctx.fillText(mark.label, bx, by + .3 * dpr); ctx.restore(); continue;
        }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(214, 176, 101, .22)'; ctx.fill();
        ctx.lineWidth = Math.max(1.4, 1.8 * dpr); ctx.strokeStyle = 'rgba(245, 201, 112, .96)'; ctx.stroke();
        if (mark.label) {
          ctx.font = `700 ${Math.max(9, this.cell * .24 * dpr)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(25, 27, 28, .86)'; ctx.strokeText(mark.label, x, y - r * 1.08);
          ctx.fillStyle = '#f2cc7c'; ctx.fillText(mark.label, x, y - r * 1.08);
        }
        ctx.restore();
      }
    }
  }

  return BoardRenderer;
});
