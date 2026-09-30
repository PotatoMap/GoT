/* GoT — lightweight browser KataGo client.
 *
 * The worker and two browser model weights (small g170-b6c96 by default, optional
 * kata1-b10c128) are shipped as static assets. This
 * adapter keeps the rest of GoT on its existing analysis protocol: it turns the
 * game's flat Position into KataGo's BoardState, forwards a search to the worker,
 * then returns GTP-shaped candidates so the normal UI, scoring and review paths
 * can share the same renderer.  WebGPU is preferred when the browser exposes it;
 * TensorFlow.js WASM is the portable fallback.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.BrowserKataGo = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const MODEL_PATH = 'katago/katago-small.bin.gz';
  const WORKER_PATH = 'katago/worker.js';
  const COLUMNS = 'ABCDEFGHJKLMNOPQRST';

  function currentPlayer(value) {
    return value === 2 || String(value).toLowerCase() === 'white' ? 'white' : 'black';
  }
  function colorNumber(value) { return currentPlayer(value) === 'black' ? 1 : 2; }
  function isBrowserProtocol() {
    const protocol = root && root.location && root.location.protocol;
    return protocol === 'http:' || protocol === 'https:';
  }
  function assetUrl(path) {
    if (root && root.location && root.location.href) return new URL(path, root.location.href).href;
    return path;
  }
  function emptyBoard(size) {
    return Array.from({ length: size }, () => Array(size).fill(null));
  }
  function setupPoint(value, size) {
    if (Number.isInteger(value)) return value >= 0 && value < size * size ? value : -1;
    const s = String(value || '').trim().toLowerCase();
    if (s.length < 2) return -1;
    const x = s.charCodeAt(0) - 97, y = s.charCodeAt(1) - 97;
    return x >= 0 && x < size && y >= 0 && y < size ? y * size + x : -1;
  }
  function boardStateFromFlat(flat, size) {
    const board = emptyBoard(size);
    for (let i = 0; i < size * size; i++) {
      board[(i / size) | 0][i % size] = flat[i] === 1 ? 'black' : flat[i] === 2 ? 'white' : null;
    }
    return board;
  }
  function parsePvMove(value, size) {
    if (value && typeof value === 'object') {
      if (value.pass || value.x < 0 || value.y < 0) return { pass: true };
      return { x: value.x, y: value.y, pass: false };
    }
    const token = String(value || '').trim();
    if (!token || token.toLowerCase() === 'pass') return { pass: true };
    const m = /^([A-T])([0-9]{1,2})$/i.exec(token);
    if (!m) return null;
    const x = COLUMNS.indexOf(m[1].toUpperCase());
    const y = size - Number(m[2]);
    return x >= 0 && x < size && y >= 0 && y < size ? { x, y, pass: false } : null;
  }

  /* Build the exact board and the two recent snapshots KataGo uses for ko and
   * temporal features. GoEngine is already loaded before this client is used;
   * the small fallback keeps the adapter testable in a worker-less environment. */
  function positionPayload(spec) {
    const size = Number(spec.size) || 19;
    const GE = root && root.GoEngine;
    let pos = GE && GE.Position ? new GE.Position(size) : null;
    const flat = new Int8Array(size * size);
    const setStone = (idx, color) => {
      if (idx < 0 || idx >= flat.length) return;
      flat[idx] = color;
      if (pos) pos.setStone(idx, color);
    };
    const setup = spec.setup || {};
    for (const p of setup.AE || []) setStone(setupPoint(p, size), 0);
    for (const p of setup.AB || []) setStone(setupPoint(p, size), 1);
    for (const p of setup.AW || []) setStone(setupPoint(p, size), 2);

    const snapshots = [];
    const moves = Array.isArray(spec.moves) ? spec.moves : [];
    for (const move of moves) {
      snapshots.push(pos ? pos.board.slice() : flat.slice());
      const color = colorNumber(move.color);
      if (move.pass || move.x < 0 || move.y < 0) {
        if (pos) pos.pass(color);
        continue;
      }
      const idx = Number(move.y) * size + Number(move.x);
      if (pos) {
        const result = pos.play(color, idx);
        if (!result || result.ok !== false) flat.set(pos.board);
        else if (idx >= 0 && idx < flat.length) flat[idx] = color;
      } else if (idx >= 0 && idx < flat.length) {
        flat[idx] = color;
      }
    }
    const current = pos ? pos.board : flat;
    const previous = snapshots.length ? snapshots[snapshots.length - 1] : null;
    const previousPrevious = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
    const history = moves.slice(-5).map(move => ({
      x: Number.isInteger(move.x) ? move.x : -1,
      y: Number.isInteger(move.y) ? move.y : -1,
      player: currentPlayer(move.color)
    }));
    return {
      board: boardStateFromFlat(current, size),
      previousBoard: previous ? boardStateFromFlat(previous, size) : undefined,
      previousPreviousBoard: previousPrevious ? boardStateFromFlat(previousPrevious, size) : undefined,
      moveHistory: history,
      toMove: currentPlayer(spec.toMove),
      size
    };
  }

  function abortError() {
    const error = new Error('Browser KataGo request was cancelled');
    error.name = 'AbortError';
    return error;
  }

  class BrowserKataGoClient {
    constructor(options) {
      options = options || {};
      this.workerPath = options.workerPath || WORKER_PATH;
      this.modelPath = options.modelPath || MODEL_PATH;
      this.modelId = options.modelId || 'b6';
      this.rankCeiling = options.rankCeiling || '3段';
      this.backendPreference = options.backend || 'auto';
      this.info = null;
      this.status = 'idle';
      this.error = '';
      this.worker = null;
      this._initPromise = null;
      this._nextId = 1;
      this._pending = new Map();
      this._queue = [];
      this._busy = false;
      this.onStatus = null;
      this.initTimeoutMs = options.initTimeoutMs || 45000;
      this._generation = 0;
    }

    _status(next, error) {
      this.status = next;
      this.error = error ? String(error.message || error) : '';
      if (typeof this.onStatus === 'function') this.onStatus(this.status, this.error);
    }

    isAvailable() {
      return isBrowserProtocol() && typeof root.Worker === 'function' &&
        typeof root.WebAssembly === 'object' && typeof root.fetch === 'function';
    }

    health() {
      if (this.status === 'error') return { ok: false, code: 'browser_failed', error: this.error };
      if (!this.isAvailable()) {
        this._status('unavailable', 'Browser workers require an http(s) page');
        return { ok: false, code: 'browser_unavailable', error: this.error };
      }
      if (!this.info) {
        this.info = {
          name: 'KataGo Web', version: this.modelId + ' · TFJS', model: this.modelId === 'b10c128' ? 'kata1-b10c128-s1141046784-d204142634' : 'g170-b6c96',
          browserModel: this.modelId === 'b10c128' ? 'b10' : 'b6', rankCeiling: this.rankCeiling,
          supportsAnalyze: true, nativeAnalysis: false, browser: true,
          backend: this.backendPreference === 'auto' ? 'auto' : this.backendPreference
        };
      }
      if (this.status === 'unavailable') this._status('idle');
      return { ok: true, engine: this.info, browser: true };
    }

    async load() {
      if (this.status === 'error') this._status('idle');
      const probe = this.health();
      if (!probe.ok) return probe;
      try {
        await this._ensureInitialized();
        return { ok: true, engine: this.info, browser: true };
      } catch (error) {
        this._status('error', error);
        return { ok: false, code: 'browser_load_failed', error: this.error };
      }
    }

    _enqueue(fn, priority) {
      return new Promise((resolve, reject) => {
        const item = { fn, resolve, reject, priority: priority || 0 };
        if (item.priority > 0) {
          const firstBackground = this._queue.findIndex(q => q.priority <= 0);
          if (firstBackground < 0) this._queue.push(item);
          else this._queue.splice(firstBackground, 0, item);
        } else this._queue.push(item);
        this._pump();
      });
    }
    _pump() {
      if (this._busy || !this._queue.length) return;
      this._busy = true;
      const item = this._queue.shift();
      Promise.resolve().then(item.fn).then(item.resolve, item.reject).finally(() => {
        this._busy = false;
        this._pump();
      });
    }

    _ensureWorker() {
      if (this.worker) return;
      if (!this.isAvailable()) throw new Error('Browser KataGo is unavailable in this context');
      this.worker = new root.Worker(assetUrl(this.workerPath));
      this.worker.onmessage = (event) => this._handleMessage(event.data || {});
      this.worker.onerror = (event) => {
        const error = event && (event.error || new Error(event.message || 'KataGo worker failed'));
        this._reset(error, true);
      };
      this.worker.onmessageerror = () => {
        const error = new Error('KataGo worker returned an invalid message');
        this._reset(error, true);
      };
    }

    _handleMessage(message) {
      if (message.type === 'katago:init_result') {
        if (message.ok) {
          if (!this.info) this.health();
          this.info.backend = message.backend || this.info.backend;
          this.info.model = message.modelName || this.info.model;
          this._status('ready');
          if (this._initResolve) this._initResolve(this.info);
        } else {
          const error = new Error(message.error || 'KataGo model failed to load');
          this._status('error', error);
          if (this._initReject) this._initReject(error);
        }
        this._initResolve = this._initReject = null;
        return;
      }
      const pending = this._pending.get(message.id);
      if (!pending) return;
      if (message.type === 'katago:analyze_update') {
        if (message.ok && message.analysis && pending.onUpdate) pending.onUpdate(message);
        return;
      }
      if (message.type !== 'katago:analyze_result') return;
      this._pending.delete(message.id);
      if (message.canceled || message.error === 'canceled') {
        pending.resolve({ ok: false, canceled: true, error: 'Analysis canceled' });
      } else if (!message.ok || !message.analysis) {
        pending.reject(new Error(message.error || 'KataGo analysis failed'));
      } else {
        pending.resolve(message);
      }
    }

    _rejectAll(error) {
      const entries = [...this._pending.values()];
      this._pending.clear();
      for (const pending of entries) pending.reject(error instanceof Error ? error : new Error(String(error)));
      if (this._initReject) this._initReject(error instanceof Error ? error : new Error(String(error)));
      this._initResolve = this._initReject = null;
      this._initPromise = null;
    }

    _reset(error, failed) {
      this._generation++;
      if (this.worker) this.worker.terminate();
      this.worker = null;
      this._rejectAll(error);
      for (const item of this._queue.splice(0)) item.reject(error);
      this._status(failed ? 'error' : 'idle', failed ? error : null);
    }

    cancel() { this._reset(abortError(), false); }

    _ensureInitialized() {
      const probe = this.health();
      if (!probe.ok) return Promise.reject(new Error(probe.error || 'Browser KataGo unavailable'));
      if (this._initPromise) return this._initPromise;
      try { this._ensureWorker(); } catch(error) { this._reset(error,true); return Promise.reject(error); }
      this._status('loading');
      this._initPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => this._reset(new Error('KataGo model loading timed out. Retry loading.'), true), this.initTimeoutMs);
        this._initResolve = value => { clearTimeout(timer); resolve(value); };
        this._initReject = error => { clearTimeout(timer); reject(error); };
        const hasGpu = !!(root.navigator && root.navigator.gpu);
        // WebGPU does not need SharedArrayBuffer / cross-origin isolation.  Only the
        // threaded WASM path does, so prefer the GPU whenever the browser exposes it
        // and let the worker fall back to WASM/CPU if the device rejects it.
        const backend = this.backendPreference === 'auto'
          ? (hasGpu ? 'webgpu' : 'wasm') : this.backendPreference;
        try {
          this.worker.postMessage({
            type: 'katago:init', modelUrl: assetUrl(this.modelPath), backend
          });
        } catch (error) {
          this._reset(error, true);
        }
      }).catch(error => {
        this._initPromise = null;
        if(error.name !== 'AbortError' && this.worker) this._reset(error,true);
        throw error;
      });
      return this._initPromise;
    }

    _request(payload, timeoutMs, onUpdate) {
      const id = this._nextId++;
      payload.id = id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this._reset(new Error('KataGo Web timed out. Retry loading.'), true);
        }, Math.max(5000, timeoutMs || 30000));
        this._pending.set(id, {
          onUpdate,
          resolve: value => { clearTimeout(timer); resolve(value); },
          reject: error => { clearTimeout(timer); reject(error); }
        });
        try { this.worker.postMessage(payload); }
        catch (error) { this._pending.delete(id); clearTimeout(timer); reject(error); }
      });
    }

    _normalize(message, spec, elapsedMs) {
      if (!message || !message.ok) return message || { ok: false, error: 'KataGo Web returned no result' };
      const analysis = message.analysis || {};
      const sideBlack = currentPlayer(spec.toMove) === 'black';
      const size = Number(spec.size) || 19;
      const candidates = (analysis.moves || []).map(move => {
        const pass = move.x < 0 || move.y < 0;
        const winRate = typeof move.winRate === 'number' ? move.winRate : NaN;
        const scoreLead = typeof move.scoreLead === 'number' ? move.scoreLead : NaN;
        return {
          x: pass ? -1 : move.x, y: pass ? -1 : move.y, pass,
          visits: Number(move.visits) || 0,
          prior: Number.isFinite(Number(move.prior)) ? Number(move.prior) : 0,
          // The existing GTP normalizer expects the candidate winrate/score from
          // the side-to-move perspective and converts it to black perspective.
          winrate: Number.isFinite(winRate) ? (sideBlack ? winRate : 1 - winRate) * 100 : null,
          scoreLead: Number.isFinite(scoreLead) ? (sideBlack ? scoreLead : -scoreLead) : null,
          scoreStdev: Number.isFinite(Number(move.scoreStdev)) ? Number(move.scoreStdev) : null,
          pv: (move.pv || []).map(value => parsePvMove(value, size)).filter(Boolean)
        };
      });
      const rootWin = typeof analysis.rootWinRate === 'number' ? analysis.rootWinRate : NaN;
      const rootScore = typeof analysis.rootScoreLead === 'number' ? analysis.rootScoreLead : NaN;
      const visits = Number(analysis.rootVisits) || 0;
      const backend = message.backend || (this.info && this.info.backend) || 'wasm';
      if (this.info) this.info.backend = backend;
      return {
        ok: true, browser: true, engine: 'KataGo Web',
        model: message.modelName || (this.info && this.info.model) || 'g170-b6c96',
        backend, rules: spec.rules || 'chinese', size,
        toMove: currentPlayer(spec.toMove) === 'black' ? 1 : 2,
        visits, nodesPerSec: elapsedMs > 0 ? Math.round(visits / (elapsedMs / 1000)) : 0,
        winrateBlack: Number.isFinite(rootWin) ? rootWin : null,
        scoreLead: Number.isFinite(rootScore) ? rootScore : null,
        ownership: analysis.ownership ? Array.from(analysis.ownership) : null,
        candidates,
        bestMove: candidates[0] || null
      };
    }

    analyze(spec, options) {
      options = options || {};
      const probe = this.health();
      if (!probe.ok) return Promise.resolve({ ok: false, error: probe.error || 'Browser KataGo unavailable' });
      const timeoutMs = options.timeoutMs || Math.max(12000, (Number(spec.seconds) || 2) * 1000 + 10000);
      const generation = this._generation;
      return this._enqueue(async () => {
        if (generation !== this._generation) throw abortError();
        if (options.signal && options.signal.aborted) throw abortError();
        const abort = () => this.cancel();
        if (options.signal) options.signal.addEventListener('abort', abort, { once: true });
        try {
        const started = Date.now();
        const position = positionPayload(spec);
        await this._ensureInitialized();
        if (options.signal && options.signal.aborted) throw abortError();
        const requestedVisits = Number(spec.maxVisits || options.maxVisits || 0);
        const requestedMs = Number(spec.maxTimeMs || options.maxTimeMs || 0);
        const payload = {
          type: 'katago:analyze',
          analysisGroup: options.priority > 0 ? 'interactive' : 'background',
          modelUrl: assetUrl(this.modelPath),
          backend: this.info && String(this.info.backend || '').toLowerCase() === 'webgpu' ? 'webgpu' : 'wasm',
          board: position.board, previousBoard: position.previousBoard,
          previousPreviousBoard: position.previousPreviousBoard,
          currentPlayer: position.toMove, moveHistory: position.moveHistory,
          komi: Number.isFinite(Number(spec.komi)) ? Number(spec.komi) : 7.5, rules: spec.rules || 'chinese',
          topK: Number(spec.topN) || 5, analysisPvLen: 15,
          ownershipMode: spec.ownership ? 'root' : 'none',
          includeMovesOwnership: false,
          // The b6 net is intentionally tiny, but a WASM tensor evaluation is
          // still much slower than native KataGo on phones. Keep interactive
          // searches bounded; the UI can still request a deeper native search.
          visits: Math.min(requestedVisits > 0 ? requestedVisits : 48, 96),
          maxTimeMs: requestedMs > 0 ? requestedMs : Math.max(250, (Number(spec.seconds) || 2) * 1000),
          batchSize: this.info && this.info.backend === 'WebGPU' ? 16 : 4,
          wideRootNoise: Number.isFinite(Number(spec.wideRootNoise)) ? Number(spec.wideRootNoise) : 0.04,
          conservativePass: true, nnRandomize: true
        };
        if (spec.allowMove) payload.allowMoves = [{ player: position.toMove, moves: [spec.allowMove], untilDepth: 1 }];
        const response = await this._request(payload, timeoutMs, options.onUpdate ? message => options.onUpdate(this._normalize(message, spec, Date.now() - started)) : null);
        if (response && response.canceled) return response;
        return this._normalize(response, spec, Date.now() - started);
        } finally {
          if (options.signal) options.signal.removeEventListener('abort', abort);
        }
      }, options.priority);
    }

    dispose() {
      this.cancel();
    }
  }

  BrowserKataGoClient.positionPayload = positionPayload;
  BrowserKataGoClient.MODEL_PATH = MODEL_PATH;
  return BrowserKataGoClient;
});
