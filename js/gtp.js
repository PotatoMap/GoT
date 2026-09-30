/* GoT — GTP engine client (over the local ai_bridge.py HTTP bridge).
 * Provides: health(), gtp(cmd), analyze(spec) with automatic request
 * serialization and abort support. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GtpClient = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Privacy boundary: GoT may talk only to a bridge on this machine. The
   * launcher is the sole opt-in internet path (official KataGo download).
   * Validate immediately before every fetch as app code may update baseUrl. */
  function localRequestUrl(baseUrl, requestPath) {
    const base = String(baseUrl || '').replace(/\/$/, '');
    const target = base + requestPath;
    if (!base) return target; // relative URL: same origin as the local GoT server
    let parsed;
    try {
      parsed = new URL(target, 'http://127.0.0.1:4173');
    } catch (e) {
      throw new Error('Invalid local bridge URL');
    }
    const host = parsed.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (!loopback || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      throw new Error('GoT only permits local bridge addresses (localhost, 127.0.0.1, or ::1)');
    }
    return target;
  }

  class GtpClient {
    constructor(baseUrl) {
      // same-origin by default when served over http(s); file:// pages target the local server
      const fallback = (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0)
        ? '' : 'http://127.0.0.1:4173';
      this.baseUrl = (baseUrl !== undefined && baseUrl !== null ? baseUrl : fallback).replace(/\/$/, '');
      this.busy = false;
      this._queue = [];
      this.info = null; // {name, version, supportsAnalyze, ...}
      // Static hosting has no local HTTP bridge.  When the browser adapter is
      // present it becomes the same analysis surface, so the app can keep its
      // existing GTP-shaped result flow and transparently fall back to MCTS.
      this.browserModels = typeof BrowserKataGo === 'function' ? {
        b6: new BrowserKataGo(),
        b10: new BrowserKataGo({
          modelPath: 'katago/kata1-b10c128-s1141046784-d204142634.txt.gz',
          modelId: 'b10c128',
          rankCeiling: '6段',
          initTimeoutMs: 120000
        })
      } : {};
      this.browserModel = 'b6';
      this.browser = this.browserModels.b6 || null;
      this.source = '';
      // 引擎来源：native = 外置 KataGo 桥接；browser = 内置 KataGo b6/b10；
      // KataGo 不可用时由 app 回退内置 MCTS。health() 只探测能力，不加载模型，
      // 由 app 的 applyEngineChoice() 决定最终激活哪一个。
      this.nativeInfo = null;
      this.browserInfo = null;
      this.browserB10Info = null;
    }
    useBrowserModel(model) {
      const id = model === 'b10' ? 'b10' : 'b6';
      this.browserModel = id;
      this.browser = this.browserModels[id] || null;
      return this.browser;
    }
    async _post(path, body, timeoutMs, signal) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const abort = () => ctrl && ctrl.abort();
      if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs || 120000);
      try {
        const res = await fetch(localRequestUrl(this.baseUrl, path), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
          signal: ctrl ? ctrl.signal : undefined
        });
        return await res.json();
      } finally {
        clearTimeout(timer);
        if(signal)signal.removeEventListener('abort',abort);
      }
    }
    /* serialize all engine work; one request at a time.
     * priority>0 的请求（引擎走子/点目/主分析）插队到队头，避免被后台
     * 假设分析（悬停推演）等低优先级任务长时间阻塞——后者应可被丢弃。 */
    _enqueue(fn, priority) {
      return new Promise((resolve, reject) => {
        const item = { fn, resolve, reject };
        if (priority > 0) {
          const firstBg = this._queue.findIndex(q => !(q.priority > 0));
          if (firstBg < 0) this._queue.push(item);
          else this._queue.splice(firstBg, 0, item);
        } else {
          this._queue.push(item);
        }
        item.priority = priority || 0;
        this._pump();
      });
    }
    _pump() {
      if (this.busy || !this._queue.length) return;
      this.busy = true;
      const { fn, resolve, reject } = this._queue.shift();
      fn().then(resolve, reject).finally(() => {
        this.busy = false;
        this._pump();
      });
    }
    async health(timeoutMs) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs || 4000);
      let native = null;
      let nativeError = '';
      try {
        const res = await fetch(localRequestUrl(this.baseUrl, '/health'), { signal: ctrl ? ctrl.signal : undefined });
        const data = await res.json();
        if (data.ok) native = data.engine;
        else nativeError = data.error || 'local bridge unavailable';
      } catch (e) {
        nativeError = String(e && e.message || e);
      } finally {
        clearTimeout(timer);
      }
      this.nativeInfo = native || null;
      // A Pages/Cloudflare deployment deliberately returns a negative /health.
      // Probe the bundled browser engine next; it is local to the page and does
      // not weaken the loopback-only privacy boundary of the native bridge.
      let web = null;
      const b6 = this.browserModels.b6;
      const b10 = this.browserModels.b10;
      const b6Probe = b6 ? b6.health() : { ok: false };
      const b10Probe = b10 ? b10.health() : { ok: false };
      this.browserInfo = b6Probe.ok ? b6Probe.engine : null;
      this.browserB10Info = b10Probe.ok ? b10Probe.engine : null;
      web = this.browserInfo;
      if (!web && !this.browserB10Info && !nativeError) nativeError = b6Probe.error || b10Probe.error || '';
      // 默认（auto）：外置 KataGo 优先，其次内置 b6。app 可据用户选择覆盖 info/source。
      const chosen = native ? { engine: native, source: 'native' } : web ? { engine: web, source: 'browser' } : null;
      const availability = { native: this.nativeInfo, browser: this.browserInfo, browserB10: this.browserB10Info };
      if (chosen) {
        this.info = chosen.engine;
        this.source = chosen.source;
        return { ok: true, engine: chosen.engine, browser: chosen.source === 'browser', source: chosen.source, ...availability };
      }
      this.info = null;
      this.source = '';
      return { ok: false, error: nativeError || 'engine unavailable', ...availability };
    }
    gtp(command) {
      if (this.info && this.info.browser) return Promise.reject(new Error('Browser KataGo does not expose raw GTP commands'));
      return this._enqueue(() => this._post('/gtp', { command }));
    }
    /* spec: {size, komi, toMove, moves:[...], seconds, topN, ownership}
     * opts: {timeoutMs, priority} —— timeoutMs 覆盖默认的 seconds*1000+90s，
     * 引擎走子等交互路径用它收紧超时，避免"卡死的引擎占住整条队列 90 秒"。 */
    analyze(spec, opts) {
      opts = opts || {};
      if (this.info && this.info.browser && this.browser) return this.browser.analyze(spec, opts);
      if (this.info && this.info.nativeAnalysis) return this.analyzeStream(spec, opts);
      const timeoutMs = opts.timeoutMs || (spec.seconds || 2) * 1000 + 90000;
      return this._enqueue(() => this._post('/analyze', spec, timeoutMs, opts.signal), opts.priority);
    }
    async analyzeStream(spec, opts) {
      opts = opts || {};
      const ctrl = new AbortController();
      const abort = () => ctrl.abort();
      if (opts.signal) {
        if (opts.signal.aborted) ctrl.abort();
        opts.signal.addEventListener('abort', abort, { once: true });
      }
      const timer = setTimeout(abort, opts.timeoutMs || 120000);
      try {
        const res = await fetch(localRequestUrl(this.baseUrl, '/analysis'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, spec, { priority: opts.priority || 0 })), signal: ctrl.signal
        });
        if (!res.ok) throw Error('Analysis HTTP ' + res.status);
        const reader = res.body.getReader(), decoder = new TextDecoder();
        let buffer = '', last = null;
        const consume = line => {
          if (!line.trim()) return;
          const result = JSON.parse(line);
          if (!result.ok) throw Error(result.error || 'Analysis failed');
          last = result;
          if (result.isDuringSearch && opts.onUpdate) opts.onUpdate(result);
        };
        while (true) {
          const chunk = await reader.read();
          buffer += decoder.decode(chunk.value, { stream: !chunk.done });
          let idx;
          while ((idx = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, idx)); buffer = buffer.slice(idx + 1); }
          if (chunk.done) break;
        }
        consume(buffer);
        if (!last || last.isDuringSearch) throw Error('Incomplete analysis response');
        return last;
      } finally {
        ctrl.abort(); clearTimeout(timer);
        if (opts.signal) opts.signal.removeEventListener('abort', abort);
      }
    }
  }

  // All cached evaluations use black perspective. Missing values stay missing.
  GtpClient.normalizeAnalysis = function (kind, raw, toMove) {
    const finite = v => Number.isFinite(v) ? v : null;
    const sign = toMove === 1 ? 1 : -1;
    const candidates = (raw.candidates || []).map(c => {
      const wr = finite(c.winrate);
      const wrBlack = wr === null ? null : kind === 'builtin' ? wr : toMove === 1 ? wr / 100 : 1 - wr / 100;
      return { x: c.x, y: c.y, pass: !!c.pass, visits: c.visits || 0, prior: finite(c.prior),
        scoreLeadBlack: finite(c.scoreLead) === null ? null : c.scoreLead * (kind === 'builtin' ? 1 : sign),
        scoreStdev: finite(c.scoreStdev), wrBlack, wrToMove: wrBlack === null ? null : toMove === 1 ? wrBlack : 1 - wrBlack,
        pv: c.pv || [] };
    });
    const wrBlack = kind === 'builtin' ? finite(raw.winrate) : Number.isFinite(raw.winrateBlack) ? raw.winrateBlack : candidates.length ? candidates[0].wrBlack : null;
    const scoreLeadBlack = Number.isFinite(raw.scoreLead) ? raw.scoreLead : candidates.length ? candidates[0].scoreLeadBlack : null;
    return { kind, wrBlack, scoreLeadBlack, candidates, visits: raw.visits || (candidates[0] || {}).visits || 0,
      ownership: raw.ownership || null, model: raw.model || '', rules: raw.rules || '', nps: raw.nodesPerSec || 0 };
  };
  GtpClient.moveLoss = function (before, after, mover) {
    if (!before || !after || !Number.isFinite(before.scoreLeadBlack) || !Number.isFinite(after.scoreLeadBlack) ||
        (before.kind && after.kind && before.kind !== after.kind) || (before.model && after.model && before.model !== after.model) ||
        (before.rules && after.rules && before.rules !== after.rules)) return null;
    return Math.max(0, (before.scoreLeadBlack - after.scoreLeadBlack) * (mover === 1 ? 1 : -1));
  };

  return GtpClient;
});
