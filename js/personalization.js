/* Local workspace and GoT Tutor preferences. This module only changes presentation. */
(function (root) {
  'use strict';
  const WORKSPACE_KEY = 'got.workspace-layouts.v1';
  const WIDTHS_KEY = 'got.workspace-widths.v1';
  const TUTOR_KEY = 'got.tutor-preferences.v1';
  const TREE_STYLE_KEY = 'got.tree-style.v1';
  const panelChoices = [
    { id: 'boardControls', zh: '棋盘显示与返回按键', en: 'Board view and return controls', selectors: ['#mobilePanelClose', '.inspector-top-actions'] },
    { id: 'players', zh: '棋手信息', en: 'Players', selectors: ['.match-header'] },
    { id: 'gameInfo', zh: '对局信息', en: 'Game details', selectors: ['.match-meta-row'] },
    { id: 'gameStatus', zh: '对局状态与提示', en: 'Game status and guidance', selectors: ['#taskContext'] }
  ];
  const panels = { play: panelChoices, review: panelChoices };
  const defaults = {
    play: { visible: ['boardControls', 'players', 'gameInfo', 'gameStatus'] },
    review: { visible: ['boardControls', 'players', 'gameInfo', 'gameStatus'] }
  };
  const defaultTutor = { style: 'patient', depth: 'balanced', hints: 'progressive' };
  function read(key, fallback) {
    try { const value = JSON.parse(root.localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : fallback; }
    catch (_) { return fallback; }
  }
  function layouts() {
    const stored = read(WORKSPACE_KEY, {}), result = {};
    for (const [name, list] of Object.entries(panels)) {
      const source = stored[name] || {}, fallback = defaults[name];
      const valid = new Set(list.map(item => item.id));
      let visible;
      if (source.version === 3 && Array.isArray(source.visible)) {
        visible = source.visible.filter(id => valid.has(id));
      } else if (source.version === 2 && Array.isArray(source.visible)) {
        visible = source.visible.filter(id => valid.has(id));
        if (!visible.includes('gameStatus')) visible.push('gameStatus');
      } else if (Array.isArray(source.visible)) {
        const legacy = new Set(source.visible);
        visible = [];
        if (legacy.has('top') || legacy.has('mobileClose')) visible.push('boardControls');
        for (const id of ['players', 'gameInfo']) if (legacy.has(id)) visible.push(id);
        visible.push('gameStatus');
      } else visible = fallback.visible.slice();
      result[name] = { version: 3, visible };
    }
    return result;
  }
  function tutorPreferences() {
    const saved = read(TUTOR_KEY, {});
    return {
      style: ['patient', 'direct', 'socratic'].includes(saved.style) ? saved.style : defaultTutor.style,
      depth: ['brief', 'balanced', 'detailed'].includes(saved.depth) ? saved.depth : defaultTutor.depth,
      hints: ['progressive', 'gentle', 'explicit'].includes(saved.hints) ? saved.hints : defaultTutor.hints
    };
  }
  function save(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function currentProfile(workspace) { return workspace === 'play' || workspace === 'review' ? workspace : null; }
  function apply(profile) {
    if (!panels[profile]) return;
    const spec = panels[profile], pref = layouts()[profile];
    const host = root.document.getElementById('inspectorPanel');
    if (!host || !spec) return;
    const visible = new Set(pref.visible);
    for (const item of spec) {
      for (const selector of item.selectors) {
        const node = host.querySelector(selector);
        if (node) node.classList.toggle('personalization-hidden', !visible.has(item.id));
      }
    }
    host.dataset.layoutPreset = profile;
  }
  function restoreDefaults(profile) {
    const host = root.document.getElementById('inspectorPanel');
    for (const item of panels[profile] || []) {
      for (const selector of item.selectors) host?.querySelector(selector)?.classList.remove('personalization-hidden');
    }
  }
  function applyWorkspace(workspace) {
    const profile = currentProfile(workspace);
    const host = root.document.getElementById('inspectorPanel');
    const marker = profile || 'default';
    if (host?.dataset.layoutPreset === marker) return;
    restoreDefaults('play');
    restoreDefaults('review');
    if (profile) apply(profile);
    else if (host) host.dataset.layoutPreset = marker;
  }
  function isEnglish() { return /^en/i.test(root.document.documentElement.lang || ''); }
  function label(zh, en) { return isEnglish() ? en : zh; }
  let selected = 'play';
  function renderEditor() {
    const host = root.document.getElementById('workspaceLayoutEditor');
    if (!host) return;
    const pref = layouts()[selected], list = panels[selected];
    const rows = list.map(item => {
      const checked = pref.visible.includes(item.id);
      return `<div class="workspace-panel-row" data-panel-id="${item.id}">
        <label><input type="checkbox" data-panel-visible="${item.id}" ${checked ? 'checked' : ''}><span>${label(item.zh, item.en)}</span></label>
      </div>`;
    }).join('');
    host.innerHTML = `<div class="workspace-preset-picker" role="group" aria-label="${label('选择工作区', 'Choose workspace')}">
      <button class="tool-button" type="button" data-layout-profile="play" aria-pressed="${selected === 'play'}">${label('对弈', 'Play')}</button>
      <button class="tool-button" type="button" data-layout-profile="review" aria-pressed="${selected === 'review'}">${label('复盘', 'Review')}</button>
    </div><div class="workspace-panel-list">${rows}</div>`;
    host.querySelectorAll('[data-layout-profile]').forEach(button => button.addEventListener('click', () => {
      selected = button.dataset.layoutProfile;
      renderEditor();
    }));
    host.querySelectorAll('[data-panel-visible]').forEach(input => input.addEventListener('change', () => {
      const next = layouts(); next[selected] = { version: 3, visible: Array.from(host.querySelectorAll('[data-panel-visible]:checked')).map(el => el.dataset.panelVisible) };
      const stored = read(WORKSPACE_KEY, {});
      Object.assign(stored, next);
      if (!save(WORKSPACE_KEY, stored)) return setStatus(label('浏览器存储不可用，偏好未保存。', 'Browser storage is unavailable; preferences were not saved.'));
      applyIfActive(selected); setStatus(label('面板显示偏好已保存在本机。', 'Panel visibility saved on this device.'));
    }));
  }
  function treeStyle() {
    try {
      const saved = JSON.parse(root.localStorage.getItem(TREE_STYLE_KEY) || '"current"');
      if (saved === 'centered') return 'pure'; // Migrate the removed centered layout to its clean counterpart.
      return ['current', 'structural', 'pure'].includes(saved) ? saved : 'current';
    } catch (_) { return 'current'; }
  }
  function applyTreeStyle() {
    const style = treeStyle();
    root.document.body.dataset.treeStyle = style;
    const host = root.document.getElementById('treeStyleEditor');
    if (host) {
      host.innerHTML = `<div class="workspace-preset-picker tree-style-picker" role="group" aria-label="${label('棋谱树样式','Game tree style')}">
        <button type="button" class="tool-button" data-tree-style="current" aria-pressed="${style === 'current'}">${label('列表式','List style')}</button>
        <button type="button" class="tool-button" data-tree-style="structural" aria-pressed="${style === 'structural'}">${label('结构树','Structure tree')}</button>
        <button type="button" class="tool-button" data-tree-style="pure" aria-pressed="${style === 'pure'}">${label('结构树（纯净）','Clean structure tree')}</button>
      </div>`;
      host.querySelectorAll('[data-tree-style]').forEach(button => button.addEventListener('click', () => {
        const next = button.dataset.treeStyle;
        if (!save(TREE_STYLE_KEY, next)) return setStatus(label('浏览器存储不可用，棋谱树样式未保存。', 'Browser storage is unavailable; tree style was not saved.'));
        root.document.body.dataset.treeStyle = next;
        host.querySelectorAll('[data-tree-style]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        root.document.dispatchEvent(new CustomEvent('got:tree-style-changed'));
        setStatus(label('棋谱树样式已保存在本机。', 'Game tree style saved on this device.'));
      }));
    }
  }
  function setStatus(message) { const el = root.document.getElementById('workspacePreferenceStatus'); if (el) el.textContent = message; }
  function widthLimits() {
    const total = Math.max(600, root.innerWidth - 58); // sidebar + workbench content, excluding its outer gutters
    const navMin = 68; // enough room for the navigation icons and button hit area
    const inspectorMin = Math.max(352, Number.parseFloat(getComputedStyle(root.document.documentElement).getPropertyValue('--analysis-w')) || 352);
    const boardStageHeight = root.document.querySelector('.board-stage')?.clientHeight || 0;
    const desiredBoardMin = Math.max(480, boardStageHeight ? boardStageHeight - 22 : root.innerHeight - 180);
    const boardMin = Math.max(320, Math.min(desiredBoardMin, total - navMin - inspectorMin));
    return { total, navMin, boardMin, inspectorMin, navMax: Math.max(navMin, total - boardMin - inspectorMin) };
  }
  function widthValues() {
    const { total, navMin, boardMin, inspectorMin, navMax } = widthLimits();
    const saved = read(WIDTHS_KEY, null);
    let nav = Number.isFinite(saved?.navigation) ? saved.navigation * total : 264;
    let inspector = Number.isFinite(saved?.inspector) ? saved.inspector * total : inspectorMin;
    inspector = Math.max(inspectorMin, Math.min(total - navMin - boardMin, inspector));
    nav = Math.max(navMin, Math.min(total - boardMin - inspector, nav));
    const board = Math.max(boardMin, total - nav - inspector);
    return { total, nav, board, inspector, navMin, boardMin, inspectorMin, navMax };
  }
  function updateWidthEditor(persist = false, override = null, previewOnly = false) {
    const host = root.document.getElementById('workspaceWidthEditor');
    if (!host) return;
    const value = override ? { ...widthLimits(), ...override } : widthValues();
    const { total, nav, board, inspector, boardMin, inspectorMin } = value;
    const first = host.querySelector('[data-width-nav]'), second = host.querySelector('[data-width-board]');
    if (!first || !second) return renderWidthEditor();
    first.min = '0'; first.max = String(Math.round(total)); first.value = String(Math.round(nav));
    second.min = '0'; second.max = String(Math.round(total));
    second.value = String(Math.round(total - inspector));
    const navPct = nav / total * 100, boardPct = board / total * 100;
    host.style.setProperty('--workspace-nav-stop', `${navPct}%`);
    host.style.setProperty('--workspace-board-stop', `${navPct + boardPct}%`);
    for (const [name, pixels, minimum, maximum] of [
      ['nav', nav, value.navMin, total - boardMin - inspectorMin],
      ['board', board, boardMin, total - value.navMin - inspectorMin],
      ['panel', inspector, inspectorMin, total - value.navMin - boardMin]
    ]) {
      const input = host.querySelector(`[data-width-pixels="${name}"]`);
      input.value = String(Math.round(pixels));
      input.min = String(Math.ceil(minimum));
      input.max = String(Math.floor(maximum));
    }
    const output = host.querySelector('[data-width-values]');
    if (output) output.textContent = label(`导航 ${Math.round(nav)} · 棋盘 ${Math.round(board)} · 工作区 ${Math.round(inspector)} px`, `Navigation ${Math.round(nav)} · Board ${Math.round(board)} · Workspace ${Math.round(inspector)} px`);
    // Dragging previews the control only; committing applies and saves the layout.
    if (previewOnly) return;
    const target = root.document.documentElement;
    if ((persist || read(WIDTHS_KEY, null)) && root.matchMedia('(min-width: 1024px)').matches) {
      target.style.setProperty('--workspace-sidebar-w', `${Math.round(nav)}px`);
      target.style.setProperty('--workspace-analysis-w', `${Math.round(inspector)}px`);
      target.style.setProperty('--workspace-analysis-min', `${Math.round(inspectorMin)}px`);
      target.style.setProperty('--workspace-board-min', `${Math.round(boardMin)}px`);
      root.document.body.classList.toggle('workspace-sidebar-compact', nav < 136);
    }
    if (persist) {
      const stored = { navigation: nav / total, inspector: inspector / total };
      if (save(WIDTHS_KEY, stored)) setStatus(label('工作区宽度已保存在本机。', 'Workspace widths saved on this device.'));
      else setStatus(label('浏览器存储不可用，宽度偏好未保存。', 'Browser storage is unavailable; width preferences were not saved.'));
    }
  }
  function renderWidthEditor() {
    const host = root.document.getElementById('workspaceWidthEditor');
    if (!host) return;
    const value = widthValues();
    host.innerHTML = `<div class="workspace-width-labels">
      ${[['nav', label('导航区','Navigation')], ['board', label('棋盘区','Board')], ['panel', label('工作区','Workspace')]].map(([name, title]) => `<label>${title}<span class="workspace-width-pixel-field"><input type="number" step="1" inputmode="numeric" data-width-pixels="${name}" aria-label="${title} (px)"><span>px</span></span></label>`).join('')}
    </div><div class="workspace-width-track" role="group" aria-label="${label('调整导航、棋盘和工作区宽度','Adjust navigation, board and workspace widths')}">
      <div class="workspace-width-segments" aria-hidden="true"><i></i><i></i><i></i></div>
      <input type="range" data-width-nav aria-label="${label('导航区宽度','Navigation width')}" min="0" max="${Math.round(value.total)}" value="${Math.round(value.nav)}" step="1">
      <input type="range" data-width-board aria-label="${label('棋盘区宽度','Board width')}" min="0" max="${Math.round(value.total)}" value="${Math.round(value.total - value.inspector)}" step="1">
    </div><output class="workspace-width-values" data-width-values aria-live="polite"></output><div class="workspace-width-presets" role="group" aria-label="${label('推荐布局','Suggested layouts')}">
      <button type="button" class="tool-button" data-width-preset="balanced">${label('均衡布局','Balanced')}</button>
      <button type="button" class="tool-button" data-width-preset="board">${label('棋盘优先','Board first')}</button>
      <button type="button" class="tool-button" data-width-preset="panel">${label('工作区优先','Workspace first')}</button>
    </div>`;
    const first = host.querySelector('[data-width-nav]'), second = host.querySelector('[data-width-board]');
    const syncFromInputs = (changed, commit = false) => {
      const limits = widthLimits();
      let nav = Number(first.value), boardEnd = Number(second.value);
      nav = Math.max(limits.navMin, Math.min(limits.navMax, nav));
      boardEnd = Math.max(nav + limits.boardMin, Math.min(limits.total - limits.inspectorMin, boardEnd));
      if (changed === first && nav > boardEnd - limits.boardMin) boardEnd = nav + limits.boardMin;
      if (changed === second && boardEnd < nav + limits.boardMin) nav = boardEnd - limits.boardMin;
      first.value = String(nav); second.value = String(boardEnd);
      const inspector = limits.total - boardEnd;
      updateWidthEditor(commit, { nav, board: boardEnd - nav, inspector, total: limits.total }, !commit);
    };
    first.addEventListener('input', () => syncFromInputs(first));
    second.addEventListener('input', () => syncFromInputs(second));
    first.addEventListener('change', () => syncFromInputs(first, true));
    second.addEventListener('change', () => syncFromInputs(second, true));
    const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
    const commitWidths = (nav, inspector, limits) => {
      updateWidthEditor(true, { nav, inspector, board: limits.total - nav - inspector, total: limits.total });
    };
    host.querySelectorAll('[data-width-pixels]').forEach(input => {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      });
      input.addEventListener('change', () => {
        if (!input.value.trim() || !Number.isFinite(input.valueAsNumber)) {
          updateWidthEditor(false);
          setStatus(label('请输入有效的像素值。', 'Enter a valid pixel value.'));
          return;
        }
        const limits = widthLimits();
        const current = widthValues();
        const requested = Math.round(input.valueAsNumber);
        let nav = current.nav, inspector = current.inspector, actual;
        if (input.dataset.widthPixels === 'nav') {
          nav = actual = clamp(requested, limits.navMin, limits.navMax);
          inspector = Math.min(inspector, limits.total - nav - limits.boardMin);
        } else if (input.dataset.widthPixels === 'panel') {
          inspector = actual = clamp(requested, limits.inspectorMin, limits.total - limits.navMin - limits.boardMin);
          nav = Math.min(nav, limits.total - inspector - limits.boardMin);
        } else {
          const board = actual = clamp(requested, limits.boardMin, limits.total - limits.navMin - limits.inspectorMin);
          nav = Math.min(nav, limits.total - board - limits.inspectorMin);
          inspector = limits.total - nav - board;
        }
        commitWidths(nav, inspector, limits);
        if (actual !== requested) setStatus(label('已按可用空间和最小宽度调整。', 'Adjusted to the available space and minimum widths.'));
      });
    });
    host.querySelectorAll('[data-width-preset]').forEach(button => button.addEventListener('click', () => {
      const limits = widthLimits();
      const nav = button.dataset.widthPreset === 'balanced' ? clamp(264, limits.navMin, limits.navMax) : limits.navMin;
      const inspector = button.dataset.widthPreset === 'panel'
        ? clamp(Math.round(limits.total * 0.34), limits.inspectorMin, limits.total - nav - limits.boardMin)
        : limits.inspectorMin;
      commitWidths(nav, inspector, limits);
    }));
    updateWidthEditor(false);
  }
  function applyIfActive(profile) {
    const active = currentProfile(root.document.body.dataset.workspace || 'play');
    if (active === profile) apply(profile);
  }
  function resetLayouts() {
    try { root.localStorage.removeItem(WIDTHS_KEY); }
    catch (_) { setStatus(label('浏览器存储不可用，默认设置未能保存。', 'Browser storage is unavailable; defaults were not saved.')); return; }
    for (const property of ['--workspace-sidebar-w', '--workspace-analysis-w', '--workspace-analysis-min', '--workspace-board-min']) root.document.documentElement.style.removeProperty(property);
    root.document.body.classList.remove('workspace-sidebar-compact');
    const stored = read(WORKSPACE_KEY, {});
    for (const [name, spec] of Object.entries(panels)) {
      const valid = new Set(spec.map(item => item.id));
      stored[name] = { version: 3, visible: defaults[name].visible.filter(id => valid.has(id)) };
    }
    if (!save(WORKSPACE_KEY, stored)) {
      setStatus(label('浏览器存储不可用，默认设置未能保存。', 'Browser storage is unavailable; defaults were not saved.'));
      return;
    }
    const workspace = root.document.body.dataset.workspace || 'play';
    selected = currentProfile(workspace) || 'play';
    if (currentProfile(workspace)) apply(selected);
    else applyWorkspace(workspace);
    renderEditor();
    renderWidthEditor();
    try { root.localStorage.removeItem(TREE_STYLE_KEY); } catch (_) {}
    applyTreeStyle();
    setStatus(label('工作区宽度与对弈、复盘面板已恢复默认设置。', 'Workspace widths and play/review panels restored to defaults.'));
  }
  function mount() {
    const workspace = root.document.body.dataset.workspace || 'play';
    selected = currentProfile(workspace) || 'play';
    renderEditor();
    renderWidthEditor();
    applyTreeStyle();
    for (const [id, value] of Object.entries(tutorPreferences())) {
      const select = root.document.getElementById(`tutorPref${id[0].toUpperCase()}${id.slice(1)}`);
      if (select) select.value = value;
    }
    root.document.querySelectorAll('[data-tutor-preference]').forEach(select => select.addEventListener('change', () => {
      const next = tutorPreferences(); next[select.dataset.tutorPreference] = select.value;
      if (save(TUTOR_KEY, next)) setStatus(label('老师偏好已保存在本机。', 'Teacher preferences saved on this device.'));
      else setStatus(label('浏览器存储不可用，偏好未保存。', 'Browser storage is unavailable; preferences were not saved.'));
    }));
    const resetButton = root.document.getElementById('workspaceLayoutResetBtn');
    if (resetButton) resetButton.addEventListener('click', resetLayouts);
    applyWorkspace(workspace);
  }
  root.document?.addEventListener('got:workspace-changed', event => {
    const workspace = event.detail?.workspace || root.document.body.dataset.workspace || 'play';
    selected = currentProfile(workspace) || selected; applyWorkspace(workspace);
    renderEditor();
  });
  root.addEventListener('resize', () => updateWidthEditor(false), { passive: true });
  function refresh() { renderEditor(); renderWidthEditor(); applyTreeStyle(); }
  root.GoTPersonalization = { mount, apply, applyWorkspace, refresh, getTutorPreferences: tutorPreferences, getLayouts: layouts };
})(window);
