/* Versioned, bounded recovery snapshots. Each open tab owns its own slot. */
(function (root) {
  'use strict';
  const prefix = 'got.recovery.v1.', slot = prefix + (root.crypto?.randomUUID?.() || Date.now() + '-' + Math.random());
  let timer = null, signature = '', source = null, status = '', recovered = false;
  const blankGames = new WeakSet();
  function bounded(game) {
    const stack = [game.root]; let count = 0;
    while (stack.length) { const node = stack.pop(); if (++count > 2000) return false; stack.push(...node.children); }
    return true;
  }
  function checksum(text) { let n = 2166136261; for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619); return n >>> 0; }
  function rows() {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw || raw.length > 1100000) continue;
        const value = JSON.parse(raw);
        if (value.version === 1 && Number.isFinite(value.at)) result.push({ key, value });
      } catch (_) { /* Ignore damaged slots; never replace a running game. */ }
    }
    return result.sort((a, b) => b.value.at - a.value.at);
  }
  function restore() {
    try {
      const candidates = rows();
      for (const { value } of candidates) {
        try {
          if (typeof value.sgf !== 'string' || !value.sgf.startsWith('(;') || value.sgf.length > 1000000 || checksum(value.sgf) !== value.hash) continue;
          if (!Array.isArray(value.path) || value.path.length > 2000 || !value.path.every(i => Number.isInteger(i) && i >= 0)) continue;
          const size = /\bSZ\[(\d+)\]/.exec(value.sgf);
          if (!size || ![9,13,19].includes(Number(size[1])) || (value.sgf.match(/;/g) || []).length > 2000) continue;
          const game = root.GoEngine.sgfToGame(value.sgf);
          if (![9,13,19].includes(game.size)) continue;
          let node = game.root;
          for (const index of value.path) { node = node.children[index]; if (!node) throw new Error('Invalid cursor'); }
          game.current = node;
          // Force position reconstruction before handing a snapshot to the app.
          game.positionAt(game.current);
          recovered = true; status = 'restored'; blankGames.add(game);
          return { game, opponent: ['builtin','gtp','human'].includes(value.opponent) ? value.opponent : 'human', humanColor: value.humanColor === 2 ? 2 : 1 };
        } catch (_) { /* Try the next valid checkpoint. */ }
      }
      if (candidates.length) status = 'damaged';
    } catch (_) { status = 'unavailable'; }
    return null;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    try {
      const value = source?.();
      if (!value) return;
      if (!bounded(value.game)) { status = 'too-large'; return; }
      const sgf = root.GoEngine.gameToSgf(value.game), path = [];
      let node = value.game.current;
      while (node.parent) { path.unshift(node.parent.children.indexOf(node)); node = node.parent; }
      if (sgf.length > 1000000 || path.length > 2000 || (sgf.match(/;/g) || []).length > 2000) { status = 'too-large'; return; }
      const next = JSON.stringify([sgf, path, value.opponent, value.humanColor]);
      if (next === signature) return;
      const record = { version: 1, at: Date.now(), sgf, hash: checksum(sgf), path, opponent: value.opponent, humanColor: value.humanColor };
      localStorage.setItem(slot, JSON.stringify(record)); signature = next; status = 'saved';
      // Keep six recent tabs/checkpoints. A tab never writes into another tab's slot.
      for (const row of rows().slice(6)) if (row.key !== slot) localStorage.removeItem(row.key);
    } catch (_) { status = 'unavailable'; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 500); }
  root.GoTRecovery = { restore, flush, schedule, allowBlank(game) { blankGames.add(game); }, canSaveBlank(game) { return blankGames.has(game); }, connect(fn) { source = fn; }, get status() { return status; }, get recovered() { return recovered; } };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
})(window);
