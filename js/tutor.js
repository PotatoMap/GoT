/* GoT Tutor: lesson orchestration lives outside the game UI. The model can
 * call only the named board tools; rule checking and answer grading stay local. */
(function (root) {
  'use strict';
  const storeKey = 'got.tutor.progress.v1';
  const toolSchemas = [
    { type: 'function', function: { name: 'get_current_position', description: 'Read the current Go board, side to play, and liberties.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'clear_board', description: 'Clear the teaching board.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'setup_position', description: 'Set up a small teaching position from black and white coordinates.', parameters: { type: 'object', properties: { size: { type: 'integer' }, toMove: { type: 'string', enum: ['black', 'white'] }, black: { type: 'array', items: { type: 'array', items: { type: 'integer' } } }, white: { type: 'array', items: { type: 'array', items: { type: 'integer' } } } }, required: ['size'] } } },
    { type: 'function', function: { name: 'play_move', description: 'Play a legal move for a side during a demonstration.', parameters: { type: 'object', properties: { color: { type: 'string', enum: ['black', 'white'] }, x: { type: 'integer' }, y: { type: 'integer' } }, required: ['color', 'x', 'y'] } } },
    { type: 'function', function: { name: 'highlight', description: 'Highlight board intersections for the current teaching step.', parameters: { type: 'object', properties: { points: { type: 'array', items: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, label: { type: 'string' } }, required: ['x', 'y'] } } }, required: ['points'] } } },
    { type: 'function', function: { name: 'show_variation', description: 'Demonstrate a short variation on the board.', parameters: { type: 'object', properties: { moves: { type: 'array', items: { type: 'object', properties: { color: { type: 'string', enum: ['black', 'white'] }, x: { type: 'integer' }, y: { type: 'integer' } }, required: ['color', 'x', 'y'] } } }, required: ['moves'] } } },
    { type: 'function', function: { name: 'wait_for_user_move', description: 'Wait for the learner to play directly on the board.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'judge_user_answer', description: 'Check a played move against the local lesson or puzzle answer.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'load_tsumego', description: 'Load a basic position from GoT’s built-in life-and-death collection.', parameters: { type: 'object', properties: { id: { type: 'string' } } } } },
    { type: 'function', function: { name: 'analyze_katago', description: 'Analyze the current position with the configured KataGo adapter.', parameters: { type: 'object', properties: {} } } }
  ];
  let api = null, active = false, mode = '', phase = '', lessonStep = 0, answerAttempts = 0, puzzle = null, puzzleIndex = 0, humanColor = 1, llmReady = false, sessionId = '';
  const $ = id => document.getElementById(id);
  const set = (id, value) => {
    const el = $(id); if (!el) return;
    if (id === 'tutorSource') { el.title = value; el.textContent = value.split(' · ')[0]; }
    else el.textContent = value;
  };
  const lang = () => (document.documentElement.lang || 'zh-CN').startsWith('en') ? 'en' : 'zh';
  const copy = (zh, en) => lang() === 'zh' ? zh : en;
  function connectionError(error) {
    const code = error?.code;
    const known = {
      missing_key: copy('尚未保存此供应商的 API Key。请在设置 → 引擎中保存后再试。', 'No API key is saved for this provider. Save it in Settings → Engine and try again.'),
      invalid_key: copy('供应商没有接受此密钥。请确认密钥和所选供应商匹配，再到设置中验证连接。', 'The provider rejected this key. Check that it matches the selected provider, then verify the connection in Settings.'),
      access_denied: copy('当前密钥没有调用此模型的权限。可在设置中重新读取模型或选择有权限的模型。', 'This key cannot use the selected model. Reload models or choose one available to this key in Settings.'),
      balance: copy('供应商账户余额或订阅不足。请检查供应商账户后重试。', 'Provider balance or subscription is insufficient. Check the provider account, then retry.'),
      rate_limit: copy('请求过于频繁或可用额度不足。请稍后重试，棋局和课堂进度已保留。', 'The provider is rate-limiting requests or the quota is exhausted. Try later; the board and lesson are preserved.'),
      gateway_rate_limit: copy('老师请求较频繁，请稍后再试；课堂内容已保留。', 'Too many teacher requests. Wait a moment and retry; your lesson is preserved.'),
      model_unavailable: copy('所选模型当前不可用。请重新读取模型并选择可用项。', 'The selected model is unavailable. Reload the model list and choose an available one.'),
      output_limit: copy('模型回复达到长度上限，没有生成完整讲解。可重试或选择更快的模型。', 'The model response reached its output limit. Retry or choose a faster model.'),
      empty_answer: copy('模型没有返回讲解内容。可重试，或在设置中更换模型。', 'The model returned no explanation. Retry or choose another model in Settings.'),
      provider_error: copy('供应商暂时无法完成请求。请稍后重试；课堂内容已保留。', 'The provider could not complete the request. Try later; the lesson is preserved.')
    };
    if (known[code]) return known[code];
    if (error?.name === 'SecurityError') return copy('浏览器阻止此网站保存本地数据。请检查网站的存储权限或退出无痕模式后重试；不要把密钥发给他人。', 'The browser blocked local storage for this site. Check site storage permissions or leave private browsing, then retry. Do not share the key.');
    if (error?.name === 'QuotaExceededError') return copy('此网站的浏览器存储空间不足，密钥没有保存。请释放本机网站存储空间后重试。', 'This site has run out of browser storage, so the key was not saved. Free local site storage and retry.');
    if (error?.name === 'TimeoutError') return copy('连接老师服务超时，请检查网络后重试。', 'The teacher service connection timed out. Check the network and retry.');
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) return copy('无法连接老师服务。请检查网络、网站转发服务和浏览器连接状态；课堂内容已保留。', 'Could not reach the teacher service. Check the network, gateway deployment and browser connection; the lesson is preserved.');
    return error?.message || copy('请求失败', 'Request failed');
  }
  const progress = () => { try { const p = JSON.parse(localStorage.getItem(storeKey)); return { lessons: p?.lessons && typeof p.lessons === 'object' ? p.lessons : {}, mistakes: p?.mistakes && typeof p.mistakes === 'object' ? p.mistakes : {} }; } catch (_) { return { lessons: {}, mistakes: {} }; } };
  function saveProgress(key, mistake) {
    const p = progress();
    p.lessons[key] = (p.lessons[key] || 0) + (mistake ? 0 : 1);
    if (mistake) p.mistakes[mistake] = (p.mistakes[mistake] || 0) + 1;
    try { localStorage.setItem(storeKey, JSON.stringify(p)); } catch (_) { set('tutorStatus', copy('浏览器未能保存学习进度；本次课堂仍可继续。', 'Progress could not be saved; the lesson can continue.')); }
    document.dispatchEvent(new CustomEvent('got:tutor-progress', { detail: p }));
  }
  async function configure() {
    return (await refreshConfig()).ready;
  }
  const modelCache = new Map();
  function currentProvider() { return $('tutorProvider')?.value || 'opencode-go'; }
  function defaultModel(provider) { return provider === 'deepseek' ? 'deepseek-flash' : provider === 'opencode-go' ? 'deepseek-v4.1-flash' : ''; }
  function modelCacheKey(provider, baseUrl = '') { return provider === 'custom' ? provider + ':' + baseUrl.trim().replace(/\/+$/, '') : provider; }
  function syncCustomProviderFields() {
    const custom = currentProvider() === 'custom';
    $('tutorCustomEndpointField').hidden = !custom;
    $('tutorCustomEndpointHint').hidden = !custom;
    $('tutorCustomModelField').hidden = !custom;
  }
  function syncTutorIdentity(model) {
    const provider = currentProvider();
    const modelEl = $('tutorModelName'), providerEl = $('tutorProviderName');
    if (modelEl) modelEl.textContent = model || (provider === 'custom' ? $('tutorCustomModel')?.value : $('tutorModel')?.value) || defaultModel(provider) || '—';
    if (providerEl) providerEl.textContent = provider === 'deepseek' ? 'DeepSeek API' : provider === 'custom' ? copy('自定义 API', 'Custom API') : 'OpenCode Go';
  }
  function showModels(models, selected) {
    const select = $('tutorModel'); if (!select) return;
    select.replaceChildren();
    for (const item of models || []) {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.name && item.name !== item.id ? `${item.name} · ${item.id}` : item.id; select.append(option);
    }
    if (selected && !Array.from(select.options).some(option => option.value === selected)) {
      const option = document.createElement('option'); option.value = selected; option.textContent = selected; select.prepend(option);
    }
    if (selected) select.value = selected;
  }
  let modelRequest = 0;
  function connectionLabel(result) {
    if (result.service === 'checking') return copy('正在检查老师服务…', 'Checking teacher service…');
    if (result.service === 'offline') return copy('当前离线：联网后可使用老师', 'Offline: connect to use the teacher');
    if (result.service !== 'available') return result.keyConfigured
      ? copy('密钥已保存在当前标签页会话；老师转发服务不可用，请检查网络或重启本机 GoT。', 'Key saved for this tab session; the teacher gateway is unavailable. Check the network or restart local GoT.')
      : copy('老师接口未就绪：在线版需部署转发服务，本机版需重启 GoT 服务', 'Teacher gateway unavailable: deploy the online gateway or restart local GoT');
    if (!result.keyConfigured) return copy('服务可用，尚未保存 API Key', 'Service available; save your API key');
    return result.verified ? copy('已读取模型列表；所选模型能否讲解，会在课堂请求时确认。', 'Model list loaded. The selected model is checked when you ask for a lesson explanation.')
      : copy('密钥已保存在当前标签页会话，尚未验证供应商连接；关闭标签页后需重新填写。', 'Key saved in this tab session, but provider connection is not verified. Re-enter it after closing the tab.');
  }
  async function loadModels(provider = currentProvider(), apiKey = '') {
    const sequence = ++modelRequest;
    const baseUrl = provider === 'custom' ? $('tutorCustomBaseUrl').value.trim() : '';
    set('tutorModelsStatus', copy('正在验证供应商并读取模型…', 'Checking provider and loading models…'));
    try {
      const models = await root.GoTTutorConnection.models(provider, apiKey, baseUrl);
      if (sequence !== modelRequest || provider !== currentProvider() || (provider === 'custom' && baseUrl !== $('tutorCustomBaseUrl').value.trim())) return [];
      modelCache.set(modelCacheKey(provider, baseUrl), models);
      const selected = provider === 'custom' ? ($('tutorCustomModel').value.trim() || $('tutorModel')?.value) : $('tutorModel')?.value;
      const next = models.some(m => m.id === selected) ? selected : (defaultModel(provider) || models[0]?.id || '');
      showModels(models, next);
      if (provider === 'custom' && !$('tutorCustomModel').value.trim()) $('tutorCustomModel').value = next;
      set('tutorModelsStatus', copy(`已读取 ${models.length} 个模型`, `Loaded ${models.length} models`));
      set('tutorApiStatus', connectionLabel(root.GoTTutorConnection.info()));
      syncTutorIdentity();
      return models;
    } catch (error) {
      if (sequence === modelRequest && provider === currentProvider()) set('tutorModelsStatus', connectionError(error));
      return [];
    }
  }
  async function refreshConfig(syncForm = false) {
    const providerBefore = currentProvider();
    const result = await root.GoTTutorConnection.probe();
    llmReady = result.ready;
    const provider = result.provider;
    if (syncForm && currentProvider() === providerBefore) {
      $('tutorProvider').value = provider;
      $('tutorCustomBaseUrl').value = result.baseUrl || '';
      $('tutorCustomModel').value = provider === 'custom' ? (result.model || '') : '';
      syncCustomProviderFields();
      showModels(modelCache.get(modelCacheKey(provider, result.baseUrl || '')) || [], result.model);
    }
    $('tutorApiKey').placeholder = result.keyConfigured ? copy('已保存在当前标签页，留空保留', 'Saved in this tab; leave blank to keep') : copy('粘贴所选供应商的 API Key', 'Paste the selected provider API key');
    set('tutorApiKeyLabel', provider === 'deepseek' ? 'DeepSeek API Key' : provider === 'custom' ? copy('自定义 API Key', 'Custom API key') : 'OpenCode Go API Key');
    set('tutorApiStatus', connectionLabel(result));
    syncTutorIdentity(result.model);
    const connectionState = $('tutorConnectionState');
    if (connectionState) {
      connectionState.dataset.state = result.ready ? 'connected' : 'disconnected';
      connectionState.textContent = result.ready ? copy('已连接', 'Connected') : copy('尚未连接', 'Not connected');
    }
    if (!active) set('tutorStatus', connectionLabel(result));
    return { ...result, message: connectionLabel(result) };
  }
  async function saveConfig() {
    try {
      stopRequest(); modelRequest++;
      const provider = currentProvider();
      const model = provider === 'custom' ? ($('tutorCustomModel').value.trim() || $('tutorModel').value) : $('tutorModel').value;
      root.GoTTutorConnection.save(provider, $('tutorApiKey').value, model, $('tutorCustomBaseUrl').value);
      $('tutorApiKey').value = '';
      const result = await refreshConfig(true);
      document.dispatchEvent(new CustomEvent('got:tutor-config-changed', { detail: result }));
      return true;
    } catch (error) { set('tutorApiStatus', copy('无法保存设置：', 'Could not save: ') + connectionError(error)); return false; }
  }
  function populateModels() { showModels([{ id: defaultModel(currentProvider()), name: defaultModel(currentProvider()) }], defaultModel(currentProvider())); }
  // Conversations contain explanations only. Board mutation remains in the lesson controller.
  let paused = false, reviewCheckpoint = null, lastPresentation = null, workEpoch = 0;
  const moveCheckpoints = [];
  function snapshot(board = api.bookmark()) {
    return { board, phase, puzzleIndex, lessonStep, answerAttempts, presentation: lastPresentation,
      speech: $('tutorSpeech').textContent, source: $('tutorSource').title };
  }
  function invalidateWork() {
    workEpoch++; stopRequest(); clearWaits(); engineBusy = false; lastAnalysis = null;
    pendingGameQuestion = null; lastQuestion = null;
    $('tutorRetryEngine').hidden = true; $('tutorRetryExplanation').hidden = true;
    api.cancelTeachingAnalysis();
  }
  function syncClassControls() {
    $('tutorReturn').hidden = !paused;
    $('tutorUndo').hidden = mode === 'explain';
    $('tutorUndo').disabled = !moveCheckpoints.length;
    $('tutorQuestion').disabled = paused;
    $('tutorSend').disabled = paused;
    if (paused) { $('tutorContinue').hidden = true; $('tutorHint').hidden = true; $('tutorOptions').replaceChildren(); }
  }
  function rememberMove(board) {
    if (!active || paused || mode === 'explain') return;
    if (moveCheckpoints.length && moveCheckpoints.at(-1).board.owner !== board.owner) moveCheckpoints.length = 0;
    moveCheckpoints.push(snapshot(board)); if (moveCheckpoints.length > 100) moveCheckpoints.shift();
    syncClassControls();
  }
  function discardRejectedMoveCheckpoint() {
    moveCheckpoints.pop();
    syncClassControls();
  }
  function pauseForReview() {
    if (!active || mode === 'explain' || paused) return;
    reviewCheckpoint = snapshot(); paused = true; invalidateWork(); clearTeacherMarks();
    set('tutorEngineStatus', copy('课堂已暂停，可以前后回看；点“返回课堂继续”回到刚才的位置。', 'Lesson paused. Browse moves, then choose Return to lesson to continue.'));
    api.setTutorPanelOpen(true); syncClassControls();
  }
  function restoreClass(saved) {
    invalidateWork(); paused = false;
    phase = saved.phase; puzzleIndex = saved.puzzleIndex; lessonStep = saved.lessonStep; answerAttempts = saved.answerAttempts;
    if (!api.restoreBookmark(saved.board)) { exit(true); return; }
    if (saved.presentation) show(saved.presentation);
    set('tutorSpeech', saved.speech); set('tutorSource', saved.source);
    set('tutorEngineStatus', copy('已回到课堂，轮到你继续。', 'Back in the lesson. Continue when ready.'));
    syncClassControls(); api.refreshBoardUI();
    if (mode === 'game' && api.getPosition().toMove === 'white' && !api.isFinished()) void onGameMove({ retry: true });
  }
  function resumeClass() {
    if (!paused || !reviewCheckpoint) return;
    const saved = reviewCheckpoint; reviewCheckpoint = null; restoreClass(saved);
  }
  function undoClass() {
    let saved = moveCheckpoints.pop();
    while (saved && saved.board.owner !== api.bookmark().owner) saved = moveCheckpoints.pop();
    if (!saved) { set('tutorStatus', copy('还没有可以撤回的课堂落子。', 'No lesson move to undo yet.')); syncClassControls(); return; }
    reviewCheckpoint = null; restoreClass(saved);
    record('local', copy('撤回了自己的上一手及随后应手，可以重新尝试。', 'Undid your last move and its reply. Try again.'), copy('课堂记录', 'Lesson record'));
  }
  const historyKey = 'got.tutor.conversations.v1';
  let conversations = [], conversation = null, request = null, engineBusy = false, lastAnalysis = null, queuedExplanation = null, lastQuestion = null, observedStamp = '', positionExplainTimer = null, pendingGameQuestion = null, pendingReplyText = '', pendingReplyTyping = false, pendingReplyContent = '', autoReply = false;
  const autoReplyKey = 'got.tutor.autoReply.v1';
  try { conversations = JSON.parse(localStorage.getItem(historyKey) || '[]'); if (!Array.isArray(conversations)) conversations = []; } catch (_) {}
  function persistConversation() {
    conversations = conversations.slice(-12);
    for (const item of conversations) {
      item.messages = (item.messages || []).slice(-160);
      if (item.snapshots) {
        const used = new Set(item.messages.map(message => message.snapshotId).filter(Boolean));
        for (const key of Object.keys(item.snapshots)) if (!used.has(key)) delete item.snapshots[key];
      }
    }
    let snapshotBytes = conversations.reduce((total, item) => total + JSON.stringify([item.startSnapshot, item.savedSnapshot, Object.values(item.snapshots || {})]).length, 0);
    if (snapshotBytes > 480 * 1024) {
      for (const item of conversations) {
        for (const message of item.messages || []) {
          const key = message.snapshotId, snapshot = key && item.snapshots?.[key];
          if (!snapshot || snapshotBytes <= 400 * 1024) continue;
          snapshotBytes -= JSON.stringify(snapshot).length;
          delete item.snapshots[key]; delete message.snapshotId;
          message.snapshotUnavailable = true;
        }
        if (snapshotBytes <= 400 * 1024) break;
      }
    }
    try { localStorage.setItem(historyKey, JSON.stringify(conversations)); return true; }
    catch (_) { set('tutorStatus', copy('本机空间不足，课堂没有保存。', 'Local storage is full; the lesson was not saved.')); return false; }
  }
  function renderHistory(forceLatest = false) {
    const select = $('tutorHistorySelect'), host = $('tutorTranscript');
    if (!select || !host) return;
    const selected = select.value || conversation?.savedId || '';
    const oldScroll = host.scrollTop;
    const followLatest = forceLatest || host.scrollHeight - host.clientHeight - oldScroll < 32;
    select.replaceChildren();
    [...conversations].reverse().forEach(c => {
      const option = document.createElement('option'); option.value = c.id;
      option.textContent = `${new Date(c.at).toLocaleString()} · ${c.title}`; select.append(option);
    });
    if (conversations.some(c => c.id === selected)) select.value = selected;
    host.replaceChildren();
    const activeUnsaved = active && conversation && (!select.value || select.value === conversation.savedId);
    const c = activeUnsaved ? conversation : conversations.find(c => c.id === select.value);
    for (const m of c?.messages || []) {
      const role = m.role === 'assistant' ? 'teacher' : m.role === 'user' ? 'learner' : 'notice';
      const row = document.createElement('article'); row.className = `tutor-message tutor-message-${role}`;
      const text = document.createElement('p'); text.textContent = m.text;
      const time = m.at ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      if (role === 'teacher') {
        const header = document.createElement('div'); header.className = 'tutor-message-head';
        const avatar = document.createElement('span'); avatar.className = 'tutor-message-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = 'Go';
        const label = document.createElement('strong');
        label.textContent = String(m.source || '').split(' · ').at(-1) || $('tutorModelName')?.textContent || 'AI';
        const stamp = document.createElement('time'); stamp.textContent = time;
        header.append(avatar, label, stamp); row.append(header, text);
        const savedPosition = m.snapshotId && c?.snapshots?.[m.snapshotId];
        if (savedPosition) {
          const restore = document.createElement('button');
          restore.type = 'button'; restore.className = 'tool-button tutor-restore-snapshot';
          restore.textContent = savedPosition.moveNumber
            ? copy(`回到第 ${savedPosition.moveNumber} 手`, `Restore move ${savedPosition.moveNumber}`)
            : copy('回到开局', 'Restore opening position');
          restore.addEventListener('click', () => root.GoTTutor?.restoreHistoryPosition(c, savedPosition));
          row.append(restore);
        } else if (m.snapshotUnavailable) {
          const note = document.createElement('small');
          note.className = 'tutor-snapshot-unavailable';
          note.textContent = copy('本机存储空间有限，这条讲解的局面快照已清理。', 'This position snapshot was removed to stay within local storage limits.');
          row.append(note);
        }
      } else if (role === 'learner') {
        const bubble = document.createElement('div'); bubble.className = 'tutor-message-bubble'; bubble.append(text);
        const stamp = document.createElement('time'); stamp.textContent = copy(`我 · ${time}`, `You · ${time}`);
        row.append(bubble, stamp);
      } else {
        const label = document.createElement('small'); label.textContent = m.source || copy('课堂提示', 'Lesson notice');
        row.append(label, text);
      }
      host.append(row);
    }
    if ((pendingReplyText || pendingReplyTyping) && c?.id === conversation?.id) {
      const row = document.createElement('article'); row.className = 'tutor-message tutor-message-teacher tutor-pending'; row.id = 'tutorPendingReply';
      const header = document.createElement('div'); header.className = 'tutor-message-head';
      const avatar = document.createElement('span'); avatar.className = 'tutor-message-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = 'Go';
      const label = document.createElement('strong'); label.textContent = $('tutorModelName')?.textContent || $('tutorModel')?.value || 'AI';
      header.append(avatar, label);
      row.append(header);
      if (pendingReplyTyping) {
        const content = document.createElement('p'); content.className = 'tutor-pending-content'; content.id = 'tutorPendingReplyContent'; content.textContent = pendingReplyContent;
        row.append(content);
      } else {
        const line = document.createElement('div'); line.className = 'tutor-pending-line'; line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite');
        const status = document.createElement('span'); status.textContent = pendingReplyText;
        const dots = document.createElement('span'); dots.className = 'tutor-thinking-dots'; dots.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
        line.append(status, dots); row.append(line);
      }
      host.append(row);
    }
    host.scrollTop = followLatest ? host.scrollHeight : oldScroll;
    $('tutorLatest').hidden = followLatest || host.scrollHeight <= host.clientHeight;
    const saveButton = $('tutorSaveConversation');
    if (saveButton) {
      const viewingCurrent = active && conversation && (!select.value || select.value === conversation.savedId);
      saveButton.hidden = !(active && mode === 'explain' && viewingCurrent);
      const changed = !!conversation && (conversation.revision !== conversation.savedRevision || conversation.positionDirty || !conversation.savedId);
      saveButton.disabled = !conversation || !(conversation.messages || []).length || !changed;
      saveButton.textContent = saveButton.disabled ? copy('已保存', 'Saved') : copy('保存课堂', 'Save lesson');
    }
  }
  function record(role, text, source) {
    if (!conversation || !text) return;
    const previous = conversation.messages.at(-1);
    if (previous?.text === text && previous.role === role) return;
    const message = { role, text: String(text).slice(0, 8000), source, at: Date.now() };
    try {
      const snapshot = api?.captureHistorySnapshot?.();
      if (snapshot?.sgf) {
        const positions = conversation.snapshots || (conversation.snapshots = {});
        const base = `n${snapshot.rootId}-${snapshot.nodeId}`;
        let key = base, suffix = 1;
        while (positions[key] && (positions[key].sgf !== snapshot.sgf || JSON.stringify(positions[key].marks) !== JSON.stringify(snapshot.marks))) key = `${base}-${suffix++}`;
        positions[key] = snapshot;
        message.snapshotId = key;
      }
    } catch (_) { /* Keep the conversation if an optional board snapshot cannot be captured. */ }
    conversation.messages.push(message);
    conversation.revision = (conversation.revision || 0) + 1;
    if (role === 'user' || role === 'assistant') $('tutorHistorySelect').value = conversation.savedId || '';
    renderHistory();
  }
  function capturePosition() {
    try { return api?.captureHistorySnapshot?.() || null; } catch (_) { return null; }
  }
  function saveCurrentConversation() {
    if (!active || mode !== 'explain' || !conversation || !(conversation.messages || []).length) return false;
    const next = JSON.parse(JSON.stringify(conversation));
    next.id = conversation.savedId || conversation.id;
    next.savedAt = Date.now();
    const snapshot = capturePosition();
    if (snapshot?.sgf) next.savedSnapshot = snapshot;
    const previous = conversations.slice();
    const existing = conversations.findIndex(item => item.id === next.id);
    if (existing >= 0) conversations[existing] = next; else conversations.push(next);
    if (!persistConversation()) { conversations = previous; renderHistory(); return false; }
    conversation.savedId = next.id;
    conversation.savedRevision = conversation.revision || 0;
    conversation.positionDirty = false;
    $('tutorHistorySelect').value = next.id;
    renderHistory(true);
    document.dispatchEvent(new CustomEvent('got:tutor-history-updated'));
    set('tutorStatus', copy('课堂已保存到此浏览器。', 'Lesson saved in this browser.'));
    return true;
  }
  function deleteSavedConversation(id) {
    const index = conversations.findIndex(item => item.id === id);
    if (index < 0) return false;
    const previous = conversations.slice();
    conversations.splice(index, 1);
    if (!persistConversation()) { conversations = previous; return false; }
    if (conversation?.savedId === id) { conversation.savedId = ''; conversation.savedRevision = -1; }
    if ($('tutorHistorySelect')?.value === id) $('tutorHistorySelect').value = '';
    renderHistory(true);
    document.dispatchEvent(new CustomEvent('got:tutor-history-updated'));
    return true;
  }
  function getSavedConversations() {
    return conversations.slice().reverse().map(item => {
      const snapshot = item.savedSnapshot || Object.values(item.snapshots || {}).at(-1);
      const moveNumber = snapshot?.moveNumber || 0;
      return { id: item.id, title: item.title, at: item.at, savedAt: item.savedAt, moveNumber };
    });
  }
  const waits = new Map();
  let waitTicker = null;
  function renderWait() {
    const item = waits.get('engine') || waits.get('teacher');
    $('tutorWait').hidden = !item;
    $('tutorWait').setAttribute('aria-busy', String(!!item));
    $('tutorWait').dataset.kind = item?.kind || '';
    $('tutorConnectionState').hidden = !!item;
    if (!item) return;
    const seconds = Math.floor((Date.now() - item.started) / 1000);
    $('tutorWait').dataset.slow = String(seconds >= 20);
    const title = item.title || (item.kind === 'engine' ? copy('正在读取分数', 'Reading position scores') : copy('正在组织回复', 'Preparing a reply'));
    if ($('tutorWaitTitle').textContent !== title) set('tutorWaitTitle', title);
    set('tutorWaitTime', copy(`已等待 ${seconds} 秒`, `Waiting ${seconds}s`));
    const slow = seconds >= 20
      ? (item.kind === 'teacher'
        ? copy(' 已超过常见等待时间，仍在处理中；你可以停止讲解并重试。', ' This is taking longer than usual. You can stop the request and retry.')
        : copy(' 引擎响应较慢；棋局尚未改变。若长时间无变化，可结束课堂后检查引擎设置再试。', ' The engine is responding slowly; the board has not changed. If it remains here, end the lesson and check Engine settings before retrying.'))
      : '';
    const nearTimeout = item.kind === 'teacher' && seconds >= 75
      ? copy(' 即将达到请求时限；超时后可直接重试，棋局和课堂记录会保留。', ' The request is nearing its time limit. If it times out, retry; your board and lesson history will remain.') : '';
    set('tutorWaitDetail', item.detail + (seconds >= 20 ? slow : '') + nearTimeout);
  }
  function beginWait(kind, detail) {
    const item = { kind, detail, started: Date.now() };
    waits.set(kind, item); renderWait();
    if (!waitTicker) waitTicker = setInterval(renderWait, 1000);
    return item;
  }
  function endWait(item) {
    if (item && waits.get(item.kind) === item) waits.delete(item.kind);
    if (!waits.size) { clearInterval(waitTicker); waitTicker = null; }
    renderWait();
  }
  function revealTeacherReply(text, pending) {
    const segmenter = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const parts = segmenter ? [...segmenter.segment(text)].map(item => item.segment) : Array.from(text);
    pendingReplyText = ''; pendingReplyTyping = true; pendingReplyContent = '';
    if (pending.wait) { pending.wait.title = copy('老师正在讲解', 'Teacher is explaining'); pending.wait.detail = ''; renderWait(); }
    renderHistory(true);
    if (!parts.length) return Promise.resolve(true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pendingReplyContent = text;
      const content = $('tutorPendingReplyContent'); if (content) content.textContent = text;
      return Promise.resolve(true);
    }
    const duration = Math.min(2600, Math.max(500, parts.length * 14));
    return new Promise(resolve => {
      let started = 0, shown = 0;
      const frame = now => {
        if (request !== pending || pending.controller.signal.aborted || !active || paused || sessionId !== pending.session || api.stamp() !== pending.stamp) {
          resolve(false); return;
        }
        if (!started) started = now;
        const target = Math.min(parts.length, Math.max(shown + 1, Math.floor((now - started) / duration * parts.length)));
        if (target > shown) {
          shown = target; pendingReplyContent = parts.slice(0, shown).join('');
          const content = $('tutorPendingReplyContent');
          if (content) content.textContent = pendingReplyContent;
          const host = $('tutorTranscript');
          if (host && host.scrollHeight - host.clientHeight - host.scrollTop < 36) host.scrollTop = host.scrollHeight;
        }
        if (shown >= parts.length) resolve(true);
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
  function clearWaits() {
    waits.clear(); clearInterval(waitTicker); waitTicker = null; renderWait();
  }
  function stopRequest() {
    queuedExplanation = null;
    pendingReplyText = ''; pendingReplyTyping = false; pendingReplyContent = '';
    $('tutorPendingReply')?.remove();
    if (request?.timer) clearTimeout(request.timer);
    endWait(request?.wait);
    request?.controller.abort(); request = null;
    if ($('tutorSend')) $('tutorSend').disabled = false;
    if ($('tutorStop')) $('tutorStop').hidden = true;
  }
  function newConversation(title) {
    clearTimeout(positionExplainTimer); positionExplainTimer = null;
    clearWaits();
    stopRequest(); engineBusy = false; lastAnalysis = null; paused = false; reviewCheckpoint = null; moveCheckpoints.length = 0; workEpoch++;
    observedStamp = ''; pendingGameQuestion = null; clearTeacherMarks();
    lastQuestion = null; $('tutorRetryExplanation').hidden = true;
    set('tutorEngineStatus', ''); $('tutorRetryEngine').hidden = true; $('tutorQuestion').value = '';
    sessionId = root.crypto?.randomUUID?.() || String(Date.now());
    conversation = { id: sessionId, title, at: Date.now(), messages: [], snapshots: {}, revision: 0, savedRevision: -1, positionDirty: false, startSnapshot: capturePosition() };
    if ($('tutorHistorySelect')) $('tutorHistorySelect').value = '';
    renderHistory(true);
  }
  function clearTeacherMarks() {
    api?.clearTeacherMarks();
    set('tutorMarksLegend', ''); $('tutorClearMarks').hidden = true;
  }
  function applyTeacherAnnotations(text, stamp) {
    const size = api.getPosition().size, marks = [];
    const add = (coordinate, preferred) => {
      const parsed = /^([A-HJ-T])\s*(\d{1,2})$/i.exec(coordinate.trim());
      if (!parsed) return null;
      const column = parsed[1].toUpperCase(), row = Number(parsed[2]);
      const x = 'ABCDEFGHJKLMNOPQRST'.indexOf(column), y = size - row;
      if (x < 0 || x >= size || y < 0 || y >= size) return null;
      const existing = marks.find(m => m.x === x && m.y === y);
      if (existing) return existing;
      if (marks.length >= 3) return null;
      const label = preferred && !marks.some(m => m.label === preferred) ? preferred : [...'ABC'].find(c => !marks.some(m => m.label === c));
      const mark = { x, y, label, source: 'teacher', coordinate: column + row };
      marks.push(mark); return mark;
    };
    // Accept machine tokens and the human-readable forms models commonly emit.
    let formatted = text.replace(/[\[【]\s*([ABC])\s*[:：]\s*([A-HJ-T]\s*\d{1,2})\s*[\]】]/gi, (token, label, coordinate) => {
      const mark = add(coordinate, label.toUpperCase());
      return mark ? copy(`标记 ${mark.label}（${mark.coordinate}）`, `Mark ${mark.label} (${mark.coordinate})`) : coordinate;
    });
    for (const match of formatted.matchAll(/(?:老师标注|标注|标记|Teacher\s+mark|Mark)\s*([ABC])\s*(?:点)?\s*[（(:：]\s*([A-HJ-T]\s*\d{1,2})/gi)) add(match[2], match[1].toUpperCase());
    // Plain coordinates also get a visible label; do not require model formatting compliance.
    for (const match of formatted.matchAll(/(^|[^A-Za-z0-9])([A-HJ-T]\s*\d{1,2})(?![A-Za-z0-9])/gi)) add(match[2]);
    if (api.stamp() === stamp) {
      clearTeacherMarks();
      if (marks.length) {
        api.highlight(marks);
        set('tutorMarksLegend', copy('老师标注：', 'Teacher marks: ') + marks.map(m => `${m.label} · ${m.coordinate}`).join(' / '));
        $('tutorClearMarks').hidden = false;
      }
    } else if (marks.length) {
      set('tutorMarksLegend', copy('讲解对应先前局面，未在当前棋盘显示标记。', 'This explanation refers to an earlier position; its marks are not drawn on the current board.'));
    }
    return formatted;
  }
  function coordinateContext(value, size) {
    if (Array.isArray(value)) return value.map(item => coordinateContext(item, size));
    if (!value || typeof value !== 'object') return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, coordinateContext(item, size)]));
    if (value.pass) result.coordinate = 'pass';
    else if (Number.isInteger(value.x) && Number.isInteger(value.y) && value.x >= 0 && value.y >= 0 && value.x < size && value.y < size)
      result.coordinate = 'ABCDEFGHJKLMNOPQRST'[value.x] + (size - value.y);
    return result;
  }
  async function askTeacher(context, manual = false, capturedStamp = null) {
    if (!active || paused) return;
    if (!llmReady) { set('tutorStatus', copy('老师 API 尚未配置，请打开引擎设置。', 'Configure the teacher API in Engine settings.')); return; }
    stopRequest();
    context = { ...context, study: context.study || api.getStudyContext(), kataGo: context.kataGo ?? (lastAnalysis?.positionStamp === api.stamp() ? lastAnalysis : null) };
    lastQuestion = { context, manual, session: sessionId, stamp: capturedStamp || api.stamp() };
    $('tutorRetryExplanation').hidden = true;
    const pending = { controller: new AbortController(), session: sessionId, manual, phase, kind: context.kind, stamp: capturedStamp || api.stamp(), timedOut: false, timer: null };
    request = pending;
    $('tutorSend').disabled = manual; $('tutorStop').hidden = false;
    set('tutorStatus', '');
    pending.wait = beginWait('teacher', copy('老师正在把要点整理成讲解，上一段内容仍可阅读。', 'The teacher is putting the key ideas into words. You can still read the previous explanation.'));
    pendingReplyText = copy('正在组织回复', 'Preparing a reply');
    renderHistory(true);
    pending.timer = setTimeout(() => { pending.timedOut = true; pending.controller.abort(); }, 95000);
    const history = (conversation?.messages || []).filter(m => m.role === 'user' || m.role === 'assistant').slice(-8).map(m => ({ role: m.role, content: m.text }));
    try {
      const pedagogy = root.GoTTutorPedagogy;
      const messages = [
        { role: 'system', content: pedagogy.system(lang(), root.GoTPersonalization?.getTutorPreferences?.()) },
        ...history.map(m => ({ ...m, content: pedagogy.naturalize(m.content, lang()) })),
        { role: 'user', content: pedagogy.brief(coordinateContext({ ...context, learnerProgress: progress() }, context.study?.boardSize || api.getPosition().size)) }
      ];
      const send = async () => {
        const result = await root.GoTTutorConnection.call('turn', { sessionId, tools: [], messages }, { signal: pending.controller.signal });
        if (typeof result.message !== 'string' || !result.message.trim()) throw Object.assign(new Error(copy('老师没有返回讲解，请重试', 'No explanation received; please retry')), { code: 'empty_answer' });
        return result;
      };
      let data = await send();
      if (request !== pending || sessionId !== pending.session || !active || paused || api.stamp() !== pending.stamp) return;
      // One bounded repair for leaked implementation language. Ordinary replies cost one request.
      if (pedagogy.needsRewrite(data.message)) {
        pending.wait.detail = copy('已收到老师回复，正在整理成清楚自然的围棋讲解。', 'The reply arrived. Turning it into a clear, natural Go explanation.'); renderWait();
        pendingReplyText = copy('正在整理讲解', 'Polishing the explanation'); renderHistory();
        messages.push({ role: 'assistant', content: data.message }, { role: 'user', content: 'Rewrite the previous explanation as a short, natural Go lesson. Preserve its supported meaning and valid [A:D4]-style board annotations. Remove code, variable names and data-field narration; do not add any new chess/go facts or scores. Give only the revised explanation.' });
        data = await send();
      }
      data.message = pedagogy.naturalize(data.message, lang());
      if (pedagogy.needsRewrite(data.message)) throw new Error(copy('这段讲解还没有整理清楚，请重试。', 'This explanation needs another attempt. Please retry.'));
      if (request !== pending || sessionId !== pending.session || !active || paused || api.stamp() !== pending.stamp) return;
      const source = data.model || $('tutorModel')?.value || 'LLM';
      syncTutorIdentity(source);
      const annotated = applyTeacherAnnotations(data.message, pending.stamp);
      const text = api.stamp() === pending.stamp ? annotated : copy('【先前局面的讲解，标注未画到当前棋盘】', '[Earlier position; marks are not applied to the current board] ') + annotated;
      if (!await revealTeacherReply(text, pending)) return;
      pendingReplyTyping = false; pendingReplyContent = '';
      record('assistant', text, source);
      set('tutorSpeech', text); set('tutorSource', source);
      renderHistory();
      set('tutorStatus', '');
    } catch (error) {
      if (request !== pending || sessionId !== pending.session || api.stamp() !== pending.stamp) return;
      pendingReplyText = ''; pendingReplyTyping = false; pendingReplyContent = '';
      const message = error.name === 'AbortError'
        ? (pending.timedOut ? copy('老师服务在 90 秒内没有完成回复，本次请求已超时。可以重试或换一个模型；棋局和课堂记录已保留。', 'The teacher service did not finish within 90 seconds. Retry or switch models; your board and lesson history are preserved.')
          : copy('老师请求已中断。可以重试；棋局和课堂记录已保留。', 'The teacher request was interrupted. You can retry; your board and lesson history are preserved.'))
        : connectionError(error);
      record('local', message, copy('连接提示 · 本地', 'Connection notice · Local'));
      set('tutorStatus', message);
      set('tutorSource', copy('讲解未完成 · 连接提示', 'Explanation unavailable · Connection notice'));
      set('tutorSpeech', message); $('tutorRetryExplanation').hidden = false;
      // Do not automatically spend another request after a provider failure.
      queuedExplanation = null;
    } finally {
      clearTimeout(pending.timer); endWait(pending.wait);
      if (request === pending) {
        pendingReplyText = ''; pendingReplyTyping = false; pendingReplyContent = '';
        request = null; $('tutorSend').disabled = false; $('tutorStop').hidden = true;
        renderHistory();
        const queued = queuedExplanation; queuedExplanation = null;
        if (queued && active && queued.session === sessionId) void askTeacher(queued.context, false, queued.stamp);
      }
    }
  }
  function teacherLine(context, fallback) {
    // Display the local instruction immediately; one independent model request enriches it.
    const token = sessionId, epoch = workEpoch, stamp = api.stamp();
    setTimeout(() => { if (active && !paused && epoch === workEpoch && api.stamp() === stamp && sessionId === token) void askTeacher(context); }, 0);
    return fallback;
  }
  function submitQuestion(event) {
    event?.preventDefault();
    const field = $('tutorQuestion'), question = field.value.trim();
    if (!active || paused || request?.manual) return;
    if (!question) { explainCurrentManually(); return; }
    record('user', question, copy('你', 'You')); field.value = '';
    syncComposerButton();
    // Keep history collapsed while asking; the latest response is already visible above.
    if (mode === 'game' && engineBusy) {
      pendingGameQuestion = question; $('tutorSend').disabled = true;
      set('tutorStatus', copy('问题已收到，等待这手评分后一起讲解…', 'Question received; waiting for this move’s evaluation…'));
      return;
    }
    void askTeacher({ kind: 'learner-question', question, lesson: mode, phase }, true);
  }
  function show({ title, speech, step, total, hint = false, next = true, options = null, phase: p = '', recordLocal = true }) {
    lastPresentation = { title, speech, step, total, hint, next, options, phase: p };
    const previousPhase = phase;
    phase = p;
    set('tutorSource', copy('课堂提示 · 本地规则', 'Lesson instruction · Local rules'));
    if (recordLocal) record('local', speech, copy('课堂提示 · 本地规则', 'Lesson instruction · Local rules'));
    $('gotTutorPanel').hidden = false;
    $('gotTutorPanel').closest('.analysis-column')?.classList.add('tutor-focused');
    $('gotTutorPanel').dataset.mode = mode;
    root.GoTPersonalization?.apply(document.body.dataset.workspace === 'review' ? 'research' : 'play');
    set('tutorContextTitle', title);
    set('tutorSpeech', speech);
    set('tutorProgressLabel', copy(`第 ${step} 步 · 共 ${total} 步`, `Step ${step} of ${total}`));
    $('tutorProgressBar').style.width = `${Math.max(4, Math.round(step / total * 100))}%`;
    $('tutorHint').hidden = !hint;
    $('tutorContinue').hidden = !next;
    $('tutorContinue').textContent = mode === 'lesson' && phase === 'finished' || phase === 'puzzle-finished' ? copy('完成', 'Finish') : copy('继续', 'Continue');
    const boardAnswer = phase === 'capture-answer' || phase === 'puzzle-answer' || phase === 'game';
    // Keep feedback readable; only make room for the board when entering an exercise.
    if (!boardAnswer || previousPhase !== phase) api.setTutorPanelOpen(!boardAnswer, speech);
    else api.setTutorPanelOpen(true);
    syncClassControls();
    const host = $('tutorOptions'); host.replaceChildren();
    if (options) {
      $('tutorContinue').hidden = true;
      options.forEach(item => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = item.label; b.addEventListener('click', item.run); host.append(b); });
    }
  }
  async function startLesson() {
    if (active) exit();
    active = true; mode = 'lesson'; answerAttempts = 0; lessonStep = 1; sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const startingSession = sessionId;
    const configured = await configure();
    if (!active || sessionId !== startingSession) return;
    if (!configured) { active = false; document.dispatchEvent(new CustomEvent('got:tutor-settings')); return; }
    newConversation(copy('气与提子', 'Liberties and capture'));
    api.begin({ size: 9, toMove: 1, setup: { black: [[4, 4]], white: [] } });
    api.highlight([]);
    document.dispatchEvent(new CustomEvent('got:tutor-show-tab'));
    const welcome = teacherLine({ kind: 'lesson-start', lesson: 'liberties-and-capture', position: api.getPosition() }, copy('我们先从一颗没有被围住的棋开始。围棋里，上下左右相邻的空交叉点，就是这颗棋的“气”。', 'Let’s begin with one stone. Its empty adjacent intersections are its liberties.'));
    show({ title: copy('气与提子', 'Liberties and capture'), speech: welcome, step: 1, total: 5, phase: 'intro' });
  }
  function continueLesson() {
    if (!active || paused) return;
    stopRequest();
    if (phase === 'intro') {
      const libs = api.getPosition().groups[0]?.liberties || [];
      api.highlight(libs.map(i => ({ x: i % 9, y: Math.floor(i / 9), label: '气' })));
      show({ title: copy('先数一数', 'Count the liberties'), speech: copy('我把四个气标出来了。你觉得这颗黑棋现在有几口气？', 'I marked the four liberties. How many does this black stone have?'), step: 2, total: 5, phase: 'count', next: false, options: [2, 3, 4].map(n => ({ label: String(n), run: () => answerLiberties(n) })) });
    } else if (phase === 'exercise-intro') {
      api.begin({ size: 9, toMove: 1, setup: { black: [[3, 4], [5, 4], [4, 5]], white: [[4, 4]] } });
      api.highlight([{ x: 4, y: 4, label: '被打吃' }]);
      show({ title: copy('轮到你落子', 'Your turn'), speech: copy('白棋只剩一口气。请在棋盘上落子提掉它。下错时我会先给你提示。', 'White has one liberty left. Play on the board to capture it. If you miss, I’ll give you a hint first.'), step: 4, total: 5, hint: true, next: false, phase: 'capture-answer' });
    } else if (phase === 'finished') { finish('liberties'); }
    else if (phase === 'puzzle-finished') { finish('tsumego'); }
  }
  function answerLiberties(n) {
    if (n === 4) {
      show({ title: copy('答对了', 'Correct'), speech: copy('答对了。气只看上下左右，而且要按整块棋来数。接着试试用落子提掉一顆只剩一口气的棋。', 'That’s right. Liberties connect orthogonally, and you count them for the whole group. Now capture a stone in atari.'), step: 3, total: 5, phase: 'exercise-intro' });
    } else {
      answerAttempts++;
      saveProgress('liberties', 'count-liberties');
      show({ title: copy('再观察一下', 'Take another look'), speech: copy('只数上下左右的空点。斜角不算气，再数一次试试。', 'Count only empty orthogonal neighbors. Diagonals are not liberties. Try once more.'), step: 2, total: 5, phase: 'intro', next: false, options: [2, 3, 4].map(x => ({ label: String(x), run: () => answerLiberties(x) })) });
    }
  }
  function onBoardMove(move) {
    if (active && mode === 'game') { onGameMove(move).catch(() => {}); return true; }
    if (!active || mode !== 'lesson' || phase !== 'capture-answer') return false;
    const study = api.getStudyContext();
    const pos = api.getPosition(), target = 4 * 9 + 4;
    const correct = move.x === 4 && move.y === 3 && !pos.board[target];
    if (correct) {
      api.highlight([{ x: 4, y: 3, label: '提子' }]);
      show({ title: copy('提子成功', 'Captured'), speech: copy('很好！落在白棋最后一口气上，白棋被提走。记住：气是空点；填掉对方最后一口气，就能提子。', 'Well done. Playing on White’s last liberty captures the stone. A liberty is an empty point; occupy the final one to capture.'), step: 5, total: 5, phase: 'finished' });
    } else {
      answerAttempts++; discardRejectedMoveCheckpoint(); api.undo(); saveProgress('liberties', 'capture-atari');
      show({ title: copy('先找最后一口气', 'Find the last liberty'), speech: copy('这手没有提掉白棋。看它上下左右还剩哪一个空点，再试一次。', 'That move did not capture White. Check which orthogonal liberty remains, then try again.'), step: 4, total: 5, hint: true, next: false, phase: 'capture-answer' });
    }
    void askTeacher({ kind: 'capture-answer-feedback', learnerMove: move, study, correct, attempts: answerAttempts, kataGo: { ok: false }, instruction: correct ? 'Explain why this move captured the white stone.' : 'Give one specific hint about the attempted move; do not reveal the answer.' });
    return true;
  }
  function puzzleList() { return root.GOT_PROBLEMS?.problems || []; }
  function choosePuzzle() {
    const candidates = puzzleList().filter(p => p.solution?.length <= 5 && Number(p.rankNum) <= 10).sort((a, b) => a.rankNum - b.rankNum || a.solution.length - b.solution.length);
    return candidates[0] || puzzleList().find(p => p.solution?.length <= 5) || puzzleList()[0];
  }
  async function startPuzzle() {
    if (active) exit();
    puzzle = choosePuzzle();
    if (!puzzle) { show({ title: copy('题库未加载', 'Puzzle library unavailable'), speech: copy('当前没有找到本地死活题资料。', 'The local life-and-death library is not available.'), step: 1, total: 1, phase: 'puzzle-finished' }); return; }
    active = true; mode = 'puzzle'; puzzleIndex = 0; answerAttempts = 0; humanColor = puzzle.toMove === 'B' ? 1 : 2; sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const startingSession = sessionId;
    const configured = await configure();
    if (!active || sessionId !== startingSession) return;
    if (!configured) { active = false; document.dispatchEvent(new CustomEvent('got:tutor-settings')); return; }
    newConversation(copy('死活题课堂', 'Life and death'));
    api.loadPuzzle(puzzle);
    document.dispatchEvent(new CustomEvent('got:tutor-show-tab'));
    const welcome = teacherLine({ kind: 'puzzle-start', id: puzzle.id, toMove: humanColor === 1 ? 'black' : 'white', position: api.getPosition() }, copy(`题目 ${puzzle.id}，${humanColor === 1 ? '黑' : '白'}先。先观察棋块的眼位与出路，然后直接在棋盘上落子。`, `Puzzle ${puzzle.id}. ${humanColor === 1 ? 'Black' : 'White'} to play. Read the eyes and escape routes, then play directly on the board.`));
    show({ title: copy('死活题 · 开始读棋', 'Life and death · Read the position'), speech: welcome, step: 1, total: puzzle.solution.length, hint: true, next: false, phase: 'puzzle-answer' });
  }
  async function startGuidedGame() {
    const startingSession = sessionId;
    if (!(await configure()) || sessionId !== startingSession) return;
    if (active) exit();
    active = true; mode = 'game'; lessonStep = 0; humanColor = 1;
    newConversation(copy('19 路指导棋', '19×19 guided game'));
    api.begin({ size: 19, toMove: 1, komi: 7.5 });
    document.dispatchEvent(new CustomEvent('got:tutor-show-tab'));
    show({ title: copy('19 路指导棋 · 你执黑', '19×19 guided game · You play Black'), speech: copy('你执黑先行，KataGo 执白自动应手。开启“自动回复”后，老师会在每手后讲解；关闭时可点“讲解当前”或直接提问。', 'You play Black; KataGo replies as White. Turn on Auto reply for commentary after each move, or choose Explain current and ask questions with it off.'), step: 1, total: 1, next: false, phase: 'game' });
    if (autoReply) void askTeacher({ kind: 'guided-game-start', instruction: 'Explain one opening principle for Black before the first move. Do not wait for engine analysis.' });
  }
  async function onGameMove(move) {
    if (!active || paused || mode !== 'game' || engineBusy) return false;
    engineBusy = true;
    const token = sessionId, stamp = api.stamp(), epoch = workEpoch;
    const valid = () => active && mode === 'game' && sessionId === token && epoch === workEpoch && !paused && api.stamp() === stamp;
    if (!move.retry) record('local', move.pass ? copy('你选择停一手', 'You passed') : copy(`你已落子（${api.coordinate(move)}），等待评分与白棋应手。`, `You played (${api.coordinate(move)}); waiting for White.`), copy('棋盘记录 · 本地', 'Board record · Local'));
    const waiting = beginWait('engine', copy('正在检查落子前后的局面（第 1 步：落子前）。请稍候再落子。', 'Checking before and after your move (step 1: before the move). Please wait before playing.'));
    set('tutorEngineStatus', '');
    $('tutorRetryEngine').hidden = true;
    try {
      if (api.isFinished()) { phase = 'game-finished'; set('tutorEngineStatus', copy('双方停着，对局结束；棋谱已保留。', 'Both players passed. Game finished; record preserved.')); return true; }
      const evaluation = await api.evaluateTutorMove({ onProgress: stage => {
        waiting.detail = stage === 'after'
          ? copy('落子前评分完成，正在分析当前局面（第 2 步 / 2）。', 'Before-move evaluation finished. Analyzing the current position (step 2 of 2).')
          : copy('正在分析落子前局面（第 1 步 / 2）。', 'Analyzing the position before your move (step 1 of 2).');
        renderWait();
      } });
      if (!valid()) return false;
      const analysis = evaluation.after;
      if (!analysis?.ok) throw new Error(copy('KataGo 未连接。请在引擎设置中加载或连接，然后重试应手。', 'KataGo is unavailable. Load or connect it in Engine settings, then retry.'));
      if (!evaluation.ok) throw new Error(copy('这手前后的 KataGo 评分不完整，暂不判断好坏。请重试评分与应手。', 'Before/after KataGo scores are incomplete. Retry evaluation and reply.'));
      const study = api.getStudyContext();
      const question = pendingGameQuestion;
      lastAnalysis = { ...evaluation, positionStamp: stamp };
      waiting.detail = copy('评分完成，正在验证白棋的候选应手。', 'Evaluation finished. Checking White’s candidate replies.'); renderWait();
      let played = null;
      for (const candidate of analysis.candidates || []) {
        if (!valid()) return false;
        const result = await api.play({ color: 2, ...candidate });
        if (result.ok) { played = candidate; break; }
      }
      if (!played) throw new Error(copy('引擎未返回可用落点，请重试应手。', 'No legal engine move was returned. Retry the reply.'));
      lessonStep += 2;
      record('engine', played.pass ? copy('白棋停一手。', 'White passed.') : copy(`白棋已自动应手（${api.coordinate(played)}）。`, `White replied at (${api.coordinate(played)}).`), analysis.engine || 'KataGo');
      const replyStamp = api.stamp();
      let nextTurn;
      if (autoReply || pendingGameQuestion || question) {
        waiting.detail = copy('白棋已应手，正在检查下一手黑棋的方向。', 'White has replied. Checking the next direction for Black.'); renderWait();
        try { nextTurn = await api.analyzeKataGo(); } catch (_) { nextTurn = { ok: false }; }
      } else nextTurn = { ok: false };
      if (!active || paused || epoch !== workEpoch || sessionId !== token || api.stamp() !== replyStamp) return false;
      lastAnalysis = { ...evaluation, nextTurn, positionStamp: replyStamp };
      const teacherQuestion = pendingGameQuestion || question;
      if (autoReply || teacherQuestion) {
        void askTeacher({ kind: 'guided-game-evaluated-move', learnerMove: study.currentMove, learnerStudy: study,
          study: api.getStudyContext(), kataGo: lastAnalysis, question: teacherQuestion,
          instruction: 'Explain the learner move from before/after evaluation and BEFORE-move alternatives. The board now includes White reply. Use nextTurn (Black to play) for current suggestions only when available. Mark up to three relevant points on the CURRENT displayed board using annotation tokens. Clearly distinguish retrospective alternatives from next-turn suggestions. Answer the learner question if supplied.' }, !!teacherQuestion, replyStamp);
      } else {
        set('tutorStatus', copy('白棋已应手。需要讲解时，点“讲解当前”或直接提问。', 'White has replied. Choose Explain current or ask a question whenever you want commentary.'));
      }
      pendingGameQuestion = null;
      phase = api.isFinished() ? 'game-finished' : 'game';
      set('tutorEngineStatus', phase === 'game' ? copy('轮到你执黑落子', 'Your turn as Black') : copy('对局结束；棋谱已保留', 'Game finished; record preserved'));
      return true;
    } catch (error) {
      if (valid()) { set('tutorEngineStatus', error.message); record('local', error.message, copy('引擎提示 · 本地', 'Engine notice · Local')); $('tutorRetryEngine').hidden = false; }
      return false;
    } finally { endWait(waiting); if (sessionId === token && epoch === workEpoch) { engineBusy = false; if (!request?.manual) $('tutorSend').disabled = false; api.refreshBoardUI(); } }
  }
  async function explainCurrentPosition(source = 'analysis') {
    if (active && mode !== 'explain') exit(true);
    active = true; mode = 'explain'; phase = 'explain'; sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    $('gotTutorPanel').hidden = false;
    $('gotTutorPanel').closest('.analysis-column')?.classList.add('tutor-focused');
    $('gotTutorPanel').dataset.mode = mode;
    document.dispatchEvent(new CustomEvent('got:tutor-show-tab'));
    api.setTutorPanelOpen(true);
    const startingSession = sessionId;
    const configured = await configure();
    if (!active || sessionId !== startingSession) return;
    if (!configured) {
      show({ title: copy('AI 老师讲解', 'Ask the AI teacher'), speech: copy('先配置 DeepSeek API 或 OpenCode Go，之后我就能结合当前局面和 KataGo 分析讲解。', 'Configure DeepSeek API or OpenCode Go first. Then I can explain this position alongside KataGo analysis.'), step: 1, total: 1, next: false, phase: 'explain' });
      document.dispatchEvent(new CustomEvent('got:tutor-settings'));
      return;
    }
    newConversation(source === 'review' ? copy('逐手复盘', 'Move review') : copy('局面讲解', 'Position explanation'));
    observedStamp = api.stamp();
    const fallback = source === 'review'
      ? copy('我会先对照这手之前的计算候选，再看实战落点造成的变化，说明可选的最优方向、当前走法的问题和它是否足够好。', 'I’ll compare the move with the previous position’s engine candidates, then explain the best direction, any issue with the played move, and whether it was good enough.')
      : copy('先看当前局面的急所与全盘方向。我会参考已有复盘结果；需要时再调用 KataGo 计算候选点。', 'Let’s look at the urgent points and whole-board direction. I’ll use any existing review, and call KataGo for candidates when needed.');
    const speech = fallback;
    show({ title: source === 'review' ? copy('AI 老师 · 逐手复盘', 'AI teacher · Move review') : copy('AI 老师 · 局面讲解', 'AI teacher · Position lesson'), speech, step: 1, total: 1, next: false, hint: false, phase: 'explain', recordLocal: false });
    await explainEvaluatedPosition(observedStamp);
  }
  function positionStudyWithoutAnalysis() {
    const study = api.getStudyContext();
    study.currentAnalysis = null; study.beforeMoveAnalysis = null; study.review = null;
    return study;
  }
  async function explainEvaluatedPosition(stamp) {
    const token = sessionId, epoch = ++workEpoch;
    pendingReplyText = copy('正在读取局面分数', 'Reading position scores');
    pendingReplyTyping = false; pendingReplyContent = '';
    renderHistory(true);
    const waiting = beginWait('engine', copy('正在检查这手棋前后的局面（第 1 步：落子前）。', 'Checking the positions before and after this move (step 1: before).'));
    set('tutorStatus', '');
    try {
      const evaluation = await api.evaluateTutorMove({ onProgress: stage => {
        waiting.detail = stage === 'after'
          ? copy('落子前评分完成，正在分析当前局面（第 2 步 / 2）。', 'Before-move evaluation finished. Analyzing the current position (step 2 of 2).')
          : copy('正在分析落子前局面（第 1 步 / 2）。', 'Analyzing the position before the move (step 1 of 2).');
        renderWait();
      } });
      if (!active || paused || epoch !== workEpoch || sessionId !== token || api.stamp() !== stamp) return;
      if (!evaluation?.ok) {
        waiting.detail = copy('KataGo 暂不可用，老师会先根据棋盘局面讲解，不引用评分。', 'KataGo is unavailable. The teacher will explain the board without using score estimates.');
        renderWait();
        void askTeacher({ kind: 'position-without-katago', study: positionStudyWithoutAnalysis(), kataGo: { ok: false }, instruction: 'KataGo evaluation is unavailable. Explain only what can be observed from the supplied board position and move record. Do not invent scores, win rates, engine candidates, or claim an engine evaluation. If a point cannot be established from the board, say so plainly.' }, false, stamp);
        return;
      }
      lastAnalysis = { ...evaluation, positionStamp: stamp };
      waiting.detail = copy('棋局评分已就绪，正在请老师组织讲解。', 'The evaluation is ready. Asking the teacher to explain the position.'); renderWait();
      void askTeacher({ kind: 'position-evaluated', study: api.getStudyContext(), kataGo: evaluation, instruction: 'Explain the selected move from its before/after scores and BEFORE-move candidates. Use coordinate labels and qualify short-search estimates.' }, false, stamp);
    } catch (error) {
      if (!active || paused || epoch !== workEpoch || sessionId !== token || api.stamp() !== stamp) return;
      waiting.detail = copy('KataGo 暂不可用，老师会先根据棋盘局面讲解，不引用评分。', 'KataGo is unavailable. The teacher will explain the board without using score estimates.');
      renderWait();
      void askTeacher({ kind: 'position-without-katago', study: positionStudyWithoutAnalysis(), kataGo: { ok: false }, instruction: 'KataGo evaluation failed. Explain only what can be observed from the supplied board position and move record. Do not invent scores, win rates, engine candidates, or claim an engine evaluation. If a point cannot be established from the board, say so plainly.' }, false, stamp);
    } finally {
      endWait(waiting);
      if (epoch === workEpoch && stamp === observedStamp && api.stamp() === stamp && request?.stamp !== stamp) {
        pendingReplyText = ''; pendingReplyTyping = false; pendingReplyContent = '';
        renderHistory();
      }
    }
  }
  function onPositionChanged() {
    if (!active) return;
    if (request && request.stamp !== api.stamp()) stopRequest();
    if (lastQuestion?.stamp !== api.stamp()) { lastQuestion = null; $('tutorRetryExplanation').hidden = true; }
    if (mode === 'game' && !paused) set('tutorSource', copy('上一局面的讲解', 'Previous position explanation'));
    clearTeacherMarks();
    if (mode !== 'explain' || paused) return;
    const stamp = api.stamp(), token = sessionId;
    if (stamp === observedStamp) return;
    observedStamp = stamp; workEpoch++; api.cancelTeachingAnalysis(); clearWaits();
    if (mode === 'explain' && conversation) { conversation.positionDirty = true; renderHistory(); }
    clearTimeout(positionExplainTimer);
    if (!autoReply) {
      pendingReplyText = ''; pendingReplyTyping = false; pendingReplyContent = '';
      renderHistory(true);
      set('tutorSpeech', copy('局面已更新。需要讲解时，点“讲解当前”或直接提问。', 'Position updated. Choose Explain current or ask a question whenever you want commentary.'));
      set('tutorSource', copy('课堂提示', 'Lesson notice'));
      set('tutorStatus', copy('局面已更新。需要讲解时，点“讲解当前”或直接提问。', 'Position updated. Choose Explain current or ask a question whenever you want commentary.'));
      return;
    }
    if (!llmReady) {
      set('tutorStatus', copy('老师服务尚未连接；请检查 API 设置后重试。', 'The teacher service is not connected. Check API settings and retry.'));
      return;
    }
    pendingReplyText = copy('等待落子稳定', 'Waiting for your next move');
    pendingReplyTyping = false; pendingReplyContent = '';
    renderHistory(true);
    set('tutorSpeech', copy('局面已更新，停在这一手后我会重新分析。', 'Position changed. I will analyze once you stop on a move.'));
    set('tutorSource', copy('课堂提示', 'Lesson notice'));
    positionExplainTimer = setTimeout(() => {
      positionExplainTimer = null;
      if (active && sessionId === token && observedStamp === stamp && api.stamp() === stamp) void explainEvaluatedPosition(stamp);
    }, 600);
  }
  function setAutoReply(enabled) {
    autoReply = !!enabled;
    const button = $('tutorAutoReply');
    button?.setAttribute('aria-pressed', String(autoReply));
    try { localStorage.setItem(autoReplyKey, String(autoReply)); } catch (_) {}
    set('tutorStatus', autoReply
      ? copy('自动回复已开启；局面稳定后老师会自动讲解。', 'Auto reply is on. The teacher will comment after the position settles.')
      : copy('自动回复已关闭；可点击“讲解当前”或直接提问。', 'Auto reply is off. Choose Explain current or ask a question.'));
  }
  function syncComposerButton() {
    const field = $('tutorQuestion'), button = $('tutorSend');
    if (!field || !button) return;
    const hasText = !!field.value.trim();
    button.textContent = hasText ? copy('发送', 'Send') : copy('讲解当前', 'Explain current');
    button.setAttribute('aria-label', button.textContent);
    button.dataset.action = hasText ? 'send-question' : 'explain-position';
  }
  function explainCurrentManually() {
    if (!active || paused) return;
    const stamp = api.stamp();
    clearTimeout(positionExplainTimer); positionExplainTimer = null;
    observedStamp = stamp;
    if (mode === 'explain') {
      stopRequest(); clearWaits(); api.cancelTeachingAnalysis();
      void explainEvaluatedPosition(stamp);
      return;
    }
    const study = api.getStudyContext();
    void askTeacher({ kind: 'manual-current-position', lesson: mode, phase, study,
      kataGo: lastAnalysis?.positionStamp === stamp ? lastAnalysis : { ok: false },
      instruction: 'The learner explicitly asked for an explanation of the board as it is displayed now. Explain the current position and relevant recent move. Use only supplied analysis when available; do not invent scores or engine recommendations.' }, true, stamp);
  }
  async function onPuzzleMove(move) {
    if (!active || paused || mode !== 'puzzle' || phase !== 'puzzle-answer' || move.color !== humanColor) return false;
    const attemptedStudy = api.getStudyContext(), attemptedStamp = api.stamp(), epoch = workEpoch, token = sessionId;
    const expected = puzzle.solution[puzzleIndex];
    if (!expected || expected[0] !== (move.color === 1 ? 'B' : 'W') || expected[1] !== move.x || expected[2] !== move.y) {
      answerAttempts++; discardRejectedMoveCheckpoint(); api.undo();
      const hint = copy('这手不在题库记录的变化里，我暂时不能确认它是否成立。棋盘已恢复；可以按已记录的变化再试，或退出课堂到题库自由研究。', 'This move is not in the variation recorded for this problem, so I cannot tell whether it works. I restored the board. You can try the recorded line or leave the lesson to explore the problem freely.');
      show({ title: copy('还没有确认这手', 'This move is unverified'), speech: hint, step: puzzleIndex + 1, total: puzzle.solution.length, hint: true, next: false, phase: 'puzzle-answer' });
      void askTeacher({ kind: 'puzzle-attempt-feedback', id: puzzle.id, learnerMove: move, study: attemptedStudy, correct: null, attempts: answerAttempts, kataGo: { ok: false }, instruction: 'This move differs from the only variation recorded in the puzzle data. Its correctness has NOT been proven either way. Explain this limitation briefly, do not say the move is wrong or correct, do not invent a refutation, and do not reveal the recorded answer. Invite the learner to try the recorded variation or explore the puzzle outside the lesson.' }, false, api.stamp());
      return true;
    }
    puzzleIndex++;
    while (puzzleIndex < puzzle.solution.length && (puzzle.solution[puzzleIndex][0] === 'B' ? 1 : 2) !== humanColor) {
      const [c, x, y] = puzzle.solution[puzzleIndex++];
      if (!active || paused || epoch !== workEpoch || sessionId !== token) return false;
      await api.play({ color: c === 'B' ? 1 : 2, x, y });
    }
    if (!active || paused || epoch !== workEpoch || sessionId !== token) return false;
    if (puzzleIndex >= puzzle.solution.length) {
      api.finishPuzzle(puzzle);
      show({ title: copy('题目完成', 'Puzzle complete'), speech: teacherLine({ kind: 'puzzle-complete', id: puzzle.id, moves: puzzle.solution }, copy('整条变化已完成。关键在於先手要點在急所，對方應手後再確認眼位與死活結果。', 'You completed the variation. The key is to play the vital point first, then recheck the eyes and life-and-death status after the response.')), step: puzzle.solution.length, total: puzzle.solution.length, phase: 'puzzle-finished' });
    } else {
      show({ title: copy('轮到你继续', 'Your move again'), speech: teacherLine({ kind: 'puzzle-next', id: puzzle.id, move: puzzleIndex, total: puzzle.solution.length }, copy('对方已经应了一手。观察棋形变化后，继续完成这道题。', 'Your opponent has replied. Read the changed shape and continue the problem.')), step: puzzleIndex + 1, total: puzzle.solution.length, hint: true, next: false, phase: 'puzzle-answer' });
    }
    return true;
  }
  function hint() {
    if (!active || paused) return;
    if (mode === 'lesson' && phase === 'capture-answer') api.highlight([{ x: 4, y: 3, label: copy('最后一口气', 'Last liberty') }]);
    else if (mode === 'puzzle' && puzzle) {
      const next = puzzle.solution[puzzleIndex];
      if (next && answerAttempts >= 1) api.highlight([{ x: next[1], y: next[2], label: copy('要点', 'Vital point') }]);
      answerAttempts++; saveProgress('tsumego', `puzzle:${puzzle.id}`);
      set('tutorSource', copy('课堂提示 · 本地规则', 'Lesson instruction · Local rules'));
      set('tutorSpeech', answerAttempts < 2 ? copy('提示：先检查紧气的棋块及其眼位。', 'Hint: inspect groups in atari and their eye shape.') : copy('我已在棋盘上标出要点；请亲自落子，之后再看变化。', 'I marked the vital point. Play it yourself, then we will review the variation.'));
    }
  }
  function finish(key) { saveProgress(key); exit(); }
  function restoreHistoryPosition(savedConversation, savedSnapshot) {
    if (!savedConversation || !savedSnapshot?.sgf || !api?.restoreHistorySnapshot) return false;
    if (!api.restoreHistorySnapshot(savedSnapshot)) return false;
    invalidateWork();
    pendingReplyText = ''; pendingReplyTyping = false; pendingReplyContent = '';
    paused = false; reviewCheckpoint = null; moveCheckpoints.length = 0; engineBusy = false;
    active = true; mode = 'explain'; phase = 'explain'; sessionId = root.crypto?.randomUUID?.() || String(Date.now());
    conversation = JSON.parse(JSON.stringify(savedConversation));
    conversation.id = sessionId; conversation.savedId = ''; conversation.revision = 0;
    conversation.savedRevision = 0; conversation.positionDirty = false; conversation.startSnapshot = savedSnapshot;
    lastQuestion = null; queuedExplanation = null;
    observedStamp = api.stamp();
    $('gotTutorPanel').hidden = false;
    $('gotTutorPanel').closest('.analysis-column')?.classList.add('tutor-focused');
    $('gotTutorPanel').dataset.mode = 'explain';
    if ($('tutorHistorySelect')) $('tutorHistorySelect').value = '';
    set('tutorStatus', copy('已恢复这段讲解对应的棋局与标注，可以继续提问。', 'Restored the board and marks for this explanation. You can continue asking questions.'));
    syncClassControls(); renderHistory(true);
    document.dispatchEvent(new CustomEvent('got:tutor-show-tab'));
    api.setTutorPanelOpen(true);
    return true;
  }
  function loadSavedConversation(id) {
    const item = conversations.find(entry => entry.id === id);
    if (!item) return false;
    let snapshot = item.savedSnapshot || null;
    if (!snapshot?.sgf) {
      const lastWithPosition = [...(item.messages || [])].reverse().find(message => message.snapshotId && item.snapshots?.[message.snapshotId]);
      snapshot = lastWithPosition ? item.snapshots[lastWithPosition.snapshotId] : item.startSnapshot;
    }
    return restoreHistoryPosition(item, snapshot);
  }
  function exit(keepBoard = mode === 'game') {
    clearTimeout(positionExplainTimer); positionExplainTimer = null;
    if (paused && reviewCheckpoint) api.restoreBookmark(reviewCheckpoint.board);
    paused = false; reviewCheckpoint = null; moveCheckpoints.length = 0; workEpoch++;
    clearWaits();
    api?.cancelTeachingAnalysis();
    clearTeacherMarks();
    const wasActive = active, previousMode = mode; active = false; mode = ''; phase = ''; sessionId = ''; engineBusy = false; stopRequest();
    if (wasActive && previousMode !== 'explain') api.end(keepBoard);
    $('gotTutorPanel').hidden = true;
    $('gotTutorPanel').closest('.analysis-column')?.classList.remove('tutor-focused');
    api?.setTutorPanelOpen(false);
    document.dispatchEvent(new CustomEvent('got:tutor-ended'));
  }
  function mount(boardTools) {
    api = boardTools;
    try { autoReply = localStorage.getItem(autoReplyKey) === 'true'; } catch (_) { autoReply = false; }
    $('tutorAutoReply').setAttribute('aria-pressed', String(autoReply));
    populateModels();
    renderHistory();
    if (lang() === 'en') {
      set('tutorTitle', 'AI teacher'); set('tutorRetryExplanation', 'Retry explanation'); set('tutorRetryEngine', 'Retry engine reply'); set('tutorClearMarks', 'Clear marks'); set('tutorSend', 'Send'); set('tutorLatest', 'Back to latest'); set('tutorStop', 'Stop explanation');
      $('tutorHistory').querySelector('summary').textContent = 'Saved lessons';
      document.querySelector('label[for="tutorHistorySelect"]').textContent = 'View a saved lesson';
      document.querySelector('label[for="tutorQuestion"]').textContent = 'Ask the teacher';
      $('tutorQuestion').placeholder = 'Ask a question or follow up on this move…';
    }
    syncTutorIdentity();
    $('tutorSaveConversation').addEventListener('click', () => {
      if (!saveCurrentConversation()) set('tutorStatus', copy('当前没有可保存的讲解内容。', 'There is no explanation to save yet.'));
    });
    $('tutorQuestionForm').addEventListener('submit', submitQuestion);
    $('tutorAutoReply').addEventListener('click', () => setAutoReply(!autoReply));
    $('tutorQuestion').addEventListener('input', syncComposerButton);
    syncComposerButton();
    $('tutorModel').addEventListener('change', () => syncTutorIdentity());
    $('tutorQuestion').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitQuestion(); } });
    $('tutorHistorySelect').addEventListener('change', () => renderHistory(true));
    $('tutorLatest').addEventListener('click', () => {
      const host = $('tutorTranscript');
      host.scrollTo({ top: host.scrollHeight, behavior: root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    $('tutorTranscript').addEventListener('scroll', () => {
      const host = $('tutorTranscript');
      $('tutorLatest').hidden = host.scrollHeight - host.clientHeight - host.scrollTop < 32;
    }, { passive: true });
    $('tutorStop').addEventListener('click', () => { stopRequest(); set('tutorStatus', copy('已停止讲解请求，可以继续提问', 'Explanation stopped; you can ask again')); });
    $('tutorRetryExplanation').addEventListener('click', () => { if (lastQuestion?.session !== sessionId) return; if (lastQuestion.context.kind === 'retry-evaluation') void explainEvaluatedPosition(api.stamp()); else void askTeacher(lastQuestion.context, true, lastQuestion.stamp); });
    $('tutorRetryEngine').addEventListener('click', () => onGameMove({ retry: true }));
    $('tutorClearMarks').addEventListener('click', clearTeacherMarks);
    $('tutorContinue').addEventListener('click', continueLesson);
    $('tutorHint').addEventListener('click', hint);
    $('tutorUndo').addEventListener('click', undoClass);
    $('tutorReturn').addEventListener('click', resumeClass);
    $('tutorApiSave').addEventListener('click', saveConfig);
    $('tutorModelsRefresh').addEventListener('click', () => loadModels(currentProvider(), $('tutorApiKey').value));
    $('tutorVerify').addEventListener('click', async () => {
      if (!(await saveConfig())) return;
      const provider = currentProvider();
      const models = await loadModels(provider);
      if (provider === 'custom' && models.length && $('tutorCustomModel').value.trim() &&
          $('tutorCustomModel').value.trim() !== root.GoTTutorConnection.info('custom').model) {
        await saveConfig();
      }
    });
    $('tutorForget').addEventListener('click', async () => {
      if (active) exit();
      root.GoTTutorConnection.forget(currentProvider()); $('tutorApiKey').value = ''; modelRequest++;
      const result = await refreshConfig(true);
      document.dispatchEvent(new CustomEvent('got:tutor-config-changed', { detail: result }));
    });
    $('tutorProvider').addEventListener('change', () => {
      modelRequest++;
      set('tutorModelsStatus', '');
      const provider = currentProvider();
      const saved = root.GoTTutorConnection.info(provider);
      set('tutorApiStatus', copy('保存此供应商设置后，可验证连接。密钥只保存在当前标签页会话，关闭后需重新填写。', 'Save this provider before verifying. Keys stay in this tab session and must be re-entered after it closes.'));
      // A draft credential belongs to the provider for which it was entered.
      $('tutorApiKey').value = '';
      $('tutorCustomBaseUrl').value = saved.baseUrl || '';
      $('tutorCustomModel').value = provider === 'custom' ? (saved.model || '') : '';
      syncCustomProviderFields();
      $('tutorApiKeyLabel').textContent = provider === 'deepseek' ? 'DeepSeek API Key' : provider === 'custom' ? copy('自定义 API Key', 'Custom API key') : 'OpenCode Go API Key';
      $('tutorModel').value = saved.model || defaultModel(provider);
      syncTutorIdentity();
      const cacheKey = modelCacheKey(provider, saved.baseUrl || '');
      if (modelCache.has(cacheKey)) showModels(modelCache.get(cacheKey), saved.model || defaultModel(provider));
      else showModels(defaultModel(provider) ? [{ id: defaultModel(provider), name: defaultModel(provider) }] : [], defaultModel(provider));
      if ($('tutorApiKey').value) loadModels(provider, $('tutorApiKey').value);
    });
    $('tutorCustomBaseUrl').addEventListener('input', () => {
      modelRequest++;
      set('tutorModelsStatus', '');
      set('tutorApiStatus', copy('地址有更改，请保存后验证。', 'Address changed; save it before verifying.'));
      syncTutorIdentity();
    });
    $('tutorCustomModel').addEventListener('input', () => syncTutorIdentity());
    $('tutorModel').addEventListener('change', () => {
      if (currentProvider() === 'custom') $('tutorCustomModel').value = $('tutorModel').value;
      syncTutorIdentity();
    });
    document.addEventListener('got:tutor-credentials-changed', () => {
      if (active) exit(); modelRequest++;
      $('tutorApiKey').value = '';
      void refreshConfig(true).then(result => document.dispatchEvent(new CustomEvent('got:tutor-config-changed', { detail: result })));
    });
    for (const event of ['online','offline']) root.addEventListener(event, () => {
      void refreshConfig().then(result => document.dispatchEvent(new CustomEvent('got:tutor-config-changed', { detail: result })));
    });
    void refreshConfig(true);
    document.dispatchEvent(new CustomEvent('got:tutor-history-updated'));
  }
  root.GoTTutor = { get restorableGame() { return mode === 'game' && !paused; }, get mode() { return mode; }, pauseForReview, resumeClass, undoClass, rememberMove, toolSchemas, exit, clearTeacherMarks, saveCurrentConversation, deleteSavedConversation, getSavedConversations, loadSavedConversation, restoreHistoryPosition, onPositionChanged, get canPlay() { return !paused && (mode !== 'game' ? this.waiting : !engineBusy && phase === 'game' && api.getPosition().toMove === 'black'); }, mount, startLesson, startPuzzle, startGuidedGame, explainCurrentPosition, onBoardMove, onPuzzleMove, refreshConfig, saveConfig, get active() { return active; }, get waiting() { return phase === 'capture-answer' || phase === 'puzzle-answer' || phase === 'game'; }, get progress() { return progress(); } };
})(window);
