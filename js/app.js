/* GoT — application controller.
 * Game flow, engine orchestration (built-in MCTS worker + GTP bridge),
 * analysis panel, game tree, scoring, i18n, persistence. */
(function () {
  'use strict';
  /* 版本单一来源：js/version.js（sw.js 与构建脚本同读此值）。
   * 兜底刻意留空——写死字面量曾造成"离线时 version.js 取不到 → 误判版本变化
   * → 清空缓存并重载 → 缓存已空而服务未起 → 掉进浏览器错误页"。取不到就不做版本判断。 */
  const APP_VER = (typeof window !== 'undefined' && window.GOT_VERSION) || '';
  const GE = window.GoEngine;
  const Strength = window.Strength;   // 棋力/段位策略（js/strength.js）
  const Clock = window.Clock;         // 对局计时（js/clock.js）
  const { BLACK, WHITE, EMPTY } = GE;
  const $ = (id) => document.getElementById(id);
  let assessment = null;
  function assessmentStrength() { return assessment && assessment.game === game() && !assessment.finished ? assessment.level : state.strength; }
  function renderAssessment() {
    let panel=document.getElementById('assessmentStatus');
    if(!panel){panel=document.createElement('section');panel.id='assessmentStatus';panel.className='assessment-status';document.querySelector('.analysis-column')?.prepend(panel);}
    panel.hidden=!assessment || assessment.game!==game();
    if(panel.hidden)return;
    if(game().result && !assessment.finished){
      assessment.finished=true;
      const res=game().result, winner=res.startsWith('B+')?BLACK:res.startsWith('W+')?WHITE:0;
      if(winner || res==='0' || res==='Draw')window.GoTGrowth?.result(assessment.engine,assessment.level,winner?(winner===assessment.human?1:0):0.5);
    }
    panel.replaceChildren();const label=document.createElement('p');
    label.textContent=(lang==='zh'?'棋力测评 · ':'Assessment · ')+(assessment.engine==='gtp'?'KataGo':'MCTS')+' · '+(lang==='zh'?'第 ':'Level ')+assessment.level+(lang==='zh'?' 档':'')+(assessment.finished?(lang==='zh'?' · 本盘已完成':' · Completed'):'');panel.append(label);
    const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent=assessment.finished?(lang==='zh'?'查看结果与下一盘':'Results & next game'):(lang==='zh'?'结束测评，继续普通对局':'End assessment, keep playing');button.onclick=()=>{if(assessment?.finished){setWorkspace('learn');window.GoTLearning.setSection('growth');}else{assessment=null;renderAll();}};panel.append(button);
  }

  /* ================= i18n ================= */
  const I18N = {
    zh: {
      recordLibrary: '棋谱', exportRecord: '导出棋谱',
      homeWorkspace: '首页', shellSettings: '设置', backToBoard: '返回棋盘', browseRecords: '浏览棋谱',
      settingsTitle: '设置', settingsSectionPlay: '对局', settingsSectionEngine: '引擎',
      settingsSectionBoard: '棋盘与显示', settingsSectionMore: '语言与关于',
      settingsAbout: '关于 GoT', settingsCurrent: '当前：',
      workspaceNav: '工作区', boardLabel: '棋盘', boardCanvasAria: '围棋棋盘', gameToolbar: '对局控制', moveNav: '手数导航', evalGraphAria: '胜率曲线', scoreModeAria: '点目工具', analysisColumn: '棋手与分析', matchInfo: '棋手信息', gameInfo: '对局信息', analysisTabs: '分析面板', winrateAria: '黑方胜率', candidateAria: '候选着法', reviewTableAria: '每手评测', scoreTableAria: '点目明细', gameTreeAria: '棋谱树', strengthAria: '棋力', languageToggle: '切换语言',
      themeLabel: '主题', themeMode: '界面主题', themeObsidian: '石墨木纹', themePaper: '纸张暖白', themeForest: '森林青绿', themeHint: '界面与棋盘配色会一起更新，并记住你的选择。',
      viewActual: '实战变化', viewBest: '推荐变化', reviewFailed: '未完成局面',
      pointsUnit: '目', deepen: '加深分析', analyzeMove: '指定着点', equalize: '等量比较', searchComplete: '搜索完成 · 可加深', analysisFailed: '分析未完成', reviewDeepening: '复核失误', nativeRequired: '需要 Node 服务的 KataGo 专用分析协议', searchBudgetHint: '加深提高本次搜索预算；等量比较为各候选分配相同预算', pickMoveHint: '点击空点分析该着，不落子；再点按钮取消', comparingMoves: '候选比较中', comparisonDone: '比较完成', candidateDetail: '行棋方胜率 / 相对损目 / 搜索量', priorLabel: '策略先验', analysisGuide: '损目是 AI 估计值；2目起标记失误，5目起标记重大失误。低搜索量结果需加深复核。',
      boardDisplay: '棋盘显示', operationPreferences: '操作偏好', soundLabel: '音效',
      shortcutHelp: '← → 浏览棋谱 · U 悔棋 · R 恢复悔棋 · M 音效',
      analysisStart: '开始分析', analysisPause: '暂停分析', analysisPaused: '分析已暂停',
      analysisIntro: '直接在棋盘上落子开始对局。需要参考时，可开启 AI 分析。', analysisEmptyTitle: '分析从这里开始', analysisEmptyBody: '当前局面还没有分析结果。开启 AI 分析后，候选着法、胜率和形势会显示在这里。', treeEmpty: '还没有棋谱节点。落子或打开一份棋谱后，变化会显示在这里。',
      reviewIntro: '逐手浏览棋谱，开启分析查看当前局面，或运行 AI 复盘评估整局。',
      browsingPosition: '浏览棋谱 · 自动落子已暂停', resumeHere: '从此处续弈',
      problemInstructions: '请依次走出双方的正确应对。', chooseProblem: '选择题目',
      problemBlackTurn: '当前黑方走', problemWhiteTurn: '当前白方走',
      problemIndependent: '独立完成', problemAssisted: '提示后完成', problemViewed: '已查看正解',
      playWorkspace: '对局', reviewWorkspace: '复盘', learnWorkspace: '学习', learnWorkspaceTitle: '学习工作区', learningWorkspaceStatus: '学习中心', learningGuessStarted: '已打开猜着练习：先自己落子，再查看 AI', displayOptions: '棋盘工具', focusBoard: '专注', firstMove: '首手', previousMove: '上一手', nextMove: '下一手', lastMoveNav: '末手', graphLegend: '蓝线：黑方胜率 · 金线：目差 ±15', reviewPosition: '复盘中 · 自动落子已暂停',
      brandSub: '围棋', newGame: '新对局', openSgf: '打开', saveSgf: '保存', engineSettings: '引擎',
      engineOff: '内置引擎', black: '黑方', white: '白方', captures: '提子',
      rule: '规则', komi: '贴目', handicap: '让子', moveCount: '手数', result: '结果',
      lastMove: '上一手', autosaved: '已自动保存', undo: '悔棋', redo: '恢复悔棋', pass: '停着',
      resign: '认输', showNumbers: '手数', analysis: '分析', scoreMode: '点目',
      tabAnalysis: 'AI 分析', tabTree: '棋谱树', scoreLead: '形势判断', evalGraph: '胜率曲线',
      candidates: '候选着法', ownership: '形势', backMain: '回到主线',
      treeHint: '← → 换手 · ↑ ↓ 分支 · [ ] 失误', livePosition: '实时局面', previewing: '预览中',
      ready: '就绪', newGameTitle: '新对局', boardSize: '棋盘', ruleChinese: '中国规则 · 数子',
      ruleJapanese: '日本规则 · 数目', ruleKorean: '韩国规则 · 数目', youPlay: '执子', auto: '自动',
      opponent: '对手', builtinAI: '内置 AI', gtpAI: 'KataGo', human: '双人', strength: '棋力',
      strengthRankNote: '段位为约合值：对手按此强度走子（KataGo 调思考量 + 让子评估，低段位会随机选点）；分析 / 点目 / 复盘始终满强度',
      thinkTime: '用时', timeControl: '计时', timeOff: '不计时', timeBlitz: '1分 + 3×20秒',
      timeStandard: '5分 + 3×30秒', timeLong: '10分 + 5×30秒', timeCasual: '15分（无读秒）', timeoutLoss: '超时判负',
      timeFischer: '3分 + 每手加2秒', opponentStrength: '对手棋力', strengthChanged: '对手棋力已调整',
      cancel: '取消', start: '开始对局', engineSettingsTitle: 'GTP 引擎设置',
      engineHint: '启动器会自动连接本目录的 KataGo。为保护隐私，只允许 localhost / 127.0.0.1 / ::1 本机桥接。',
      bridgeUrl: '桥接地址', close: '关闭', connect: '连接', scoreTitle: '点目结果',
      keepPlaying: '继续对局', confirmResult: '确认结果', resignConfirm: '确认认输？',
      aboutText: '专业围棋工作台：内置 MCTS 引擎 + GTP 外部引擎（KataGo 等）+ 实时胜率分析 + 棋谱树。SGF 4 完整支持。',
      you: '你', youTurn: '轮到你落子', gameOver: '对局结束',
      illegalOccupied: '此处已有棋子', illegalSuicide: '禁着点（自杀）', illegalKo: '劫争，需先寻劫',
      bothPassed: '双方连续停着，进入点目',
      resigned: '中盘胜', scoreLeadB: '黑优', scoreLeadW: '白优',
      qualityGood: '好棋', qualityBad: '缓着', qualityAwful: '败着',
      copied: '已复制到剪贴板', loadedSgf: '棋谱已载入', loadFail: '载入失败：', recordFolderEmpty: '文件夹中没有找到 SGF 棋谱。', recordFolderLoaded: '已读取 {n} 份 SGF 棋谱',
      connectOk: '已连接：', connectFail: '连接失败：', needConnect: '请先在「引擎」中连接 GTP 桥接',
      autoDeadDone: '已按形势标注死子', ruleCn: '中国规则', ruleJp: '日本规则', ruleKr: '韩国规则',
      scoreStripHint: '点击棋子标记 / 取消死子', autoMark: 'AI 标注', clearMarks: '清除',
      confirmScore: '确认点目', stonesRow: '棋子', territoryRow: '领地',
      aiRefRow: 'AI 参考', aiRefNa: 'AI 未参与（引擎不可用）',
      aiMismatch: '与 AI 参考分差异较大：请检查死子标记与未归属的公气',
      dameRow: '公气 / 未定', dameNote: '局面尚未定型：{n} 点公气/未定，AI 点目仅供参考',
      scoredByAi: 'AI 判定（KataGo 形势）', scoredByBuiltin: 'AI 判定（内置形势）', scoredByRules: '规则数子',
      heuristicDeadUsed: 'AI 不可用：已按双真眼启发式预标死子，请在棋盘上手动校正',
      prisonersRow: '提子（含死子）', methodArea: '数子法', methodTerr: '数目法',
      analysisTime: 'AI 分析用时', quickLocal: '本机 KataGo（同源）', quickPy: 'Python 桥接 :8766',
      bridgeDown: '无法连接桥接服务——请先运行本目录启动脚本或 node server.js，再点击连接',
      ngEngineOff: 'KataGo 未连接——请先运行本目录启动脚本；未连接时将以内置 AI 对局',
      tabReview: '复盘', runReview: 'AI 复盘', stopReview: '停止', reviewSection: '复盘训练',
      reviewDepth: '分析深度', reviewDepthHint: '快速先筛选重点；标准适合日常复盘；深度会使用更多搜索量。', reviewDepthQuick: '快速', reviewDepthStandard: '标准', reviewDepthDeep: '深度',
      autoPreview: '自动推演', autoPreviewHint: '悬停候选圈立即推演；其他空点稍候，引擎推演该点之后的最佳应接',
      analyzing: '分析中…',
      reviewEmpty: '运行 AI 复盘：生成双方 AI 吻合度、平均损失、评级分布与每手详细胜率评测，点击任意一手可在棋盘上跳转。',
      reviewFocus: '重点训练', reviewFocusHint: '按损目排序的优先练习点。数据只保留在当前棋谱会话中。', reviewFocusPractice: '练习', reviewFocusLocate: '定位', reviewFocusEmpty: '暂未发现需要重点训练的落子。',
      reviewDone: '复盘完成', reviewStop: '已停止', reviewRunning: '复盘中',
      aiMatch: 'AI 吻合度', top3Match: '前三吻合', avgLoss: '平均损目', worstMove: '最差一手',
      gradeOk: '正常', thCoord: '坐标', thWinrate: '胜率', thScore: '目差', thLoss: '损目', thGrade: '评级', thAi: 'AI',
      reviewNoMoves: '尚无落子',
      prevBlunder: '◀ 上一失误', nextBlunder: '下一失误 ▶', noBlunders: '未找到失误——请先运行 AI 复盘',
      commentLabel: '备注', commentPlaceholder: '为本手添加备注（随 SGF 保存）',
      soundOn: '音效已开启', soundOff: '音效已静音',
      flip: '翻转', confirmMove: '落子确认', showCoords: '坐标',
      autoplay: '播放', autoplayStop: '暂停',
      practice: '练习', practiceTip: '回到失误前，与 AI 重练这一处',
      practiceStart: '练习开始——轮到你了，AI 扮演对手',
      practiceActive: '练习中', practiceExit: '结束练习', practiceRetry: '重来',
      practiceVerdictOk: '正解', practiceVerdictMiss: '未中 AI 首选',
      practiceMissToast: 'AI 首选 {c}', practiceNoBest: '未取到 AI 首选着法，无法判定',
      practiceTargetPrefix: '目标 第 ', practiceTargetSuffix: ' 手',
      gameOverHint: '对局已结束：可到「复盘」工作区直接试下，或新建一局',
      branchCreated: '已创建新分支（见棋谱树）',
      engineTimeout: '引擎响应超时——请检查「引擎」连接',
      pendingConfirm: '再次点击确认落子 · Esc 取消',
      candEmptyHint: '开启「分析」或等待 AI 计算，即可查看候选着法与胜率',
      pvTitle: '变化图：点击某手可推演到该手为止；再点一次显示完整后续',
      fallbackBuiltin: 'KataGo 不可用——已自动改用内置 AI 对局',
      gtpRestored: 'KataGo 已恢复连接',
      serverDown: '本地服务未运行：AI 桥接不可用，已用内置 AI（运行 StartGoT.bat 或 node server.js 可用 KataGo）',
      clearCache: '清除缓存并重载',
      cacheCleared: '缓存已清除，正在重载…',
      newVersion: '已更新到新版本，正在重载…',
      displaySettings: '显示设置',
      displaySettingsHint: '显示与操作偏好即时生效。坐标、翻转、音效与落子确认会记住；棋局仅保留在本次会话。',
      candColorMode: '棋盘候选圈颜色',
      candColorWinrate: '按胜率（绿高红低）',
      candColorRank: '按排名（第 1 最绿）',
      candSortMode: '候选列表排序',
      candSortVisits: '按访问量（AI 偏好）',
      candSortWinrate: '按胜率',
      problems: '死活题', problemsTitle: '死活题 · 古典棋谱', problemsSet: '棋谱集',
      problemsLoadFail: '死活题数据加载失败：请确认 problems/ 目录存在并包含 problems.js',
      problemsEmpty: '暂无死活题', problemsHint: '提示', problemsReset: '重摆',
      problemsSolution: '查看正解', problemsNext: '下一题', problemsPrev: '上一题',
      problemsExit: '返回棋局', problemsRandom: '随机一题', problemsSolved: '✓ 正解达成',
      problemsCorrect: '正确！', problemsWrong: '与正解不符', problemsHintShown: '已标出正解下一手',
      problemsL1: '这手不对，再想想（已替你悔掉这手）',
      problemsL2: '正解在{region}，全程共 {n} 手',
      problemsL3: '这是正解的这一手，后续仍由你自己走完',
      problemsL4: '还是想不出来？点「正解」看完整演示',
      problemsRank: '段位', problemsRankAll: '全部',
      problemsRankNote: '段位按正解手数推定，仅供参考', problemProgress: '本题进度', problemSetProgress: '本集完成 {done} / {total} · 看过 {viewed}', problemSetButton: '{done} / {total} 完成', problemCompleteMark: '已完成', problemViewedMark: '看过正解', problemNotStarted: '未开始', problemAttempts: '尝试 {n} 次', problemBestProgress: '最好 {best} / {total}', problemNumber: '题目', movesShort: '手', problemProgressHint: '完成后会记住最好进度；查看正解不会计入完成。', problemsLegend: '✓ 已完成 · ◐ 看过正解'
    },
    en: {
      recordLibrary: 'Records', exportRecord: 'Export SGF',
      homeWorkspace: 'Home', shellSettings: 'Settings', backToBoard: 'Back to board', browseRecords: 'Browse records',
      settingsTitle: 'Settings', settingsSectionPlay: 'Play', settingsSectionEngine: 'Engine',
      settingsSectionBoard: 'Board and display', settingsSectionMore: 'Language and about',
      settingsAbout: 'About GoT', settingsCurrent: 'Current: ',
      workspaceNav: 'Workspace', boardLabel: 'Go board', boardCanvasAria: 'Go board', gameToolbar: 'Game controls', moveNav: 'Move navigation', evalGraphAria: 'Winrate graph', scoreModeAria: 'Scoring tools', analysisColumn: 'Players and analysis', matchInfo: 'Players', gameInfo: 'Game information', analysisTabs: 'Analysis panels', winrateAria: 'Black winrate', candidateAria: 'Candidate moves', reviewTableAria: 'Per-move review', scoreTableAria: 'Score breakdown', gameTreeAria: 'Game tree', strengthAria: 'Strength', languageToggle: 'Switch language',
      themeLabel: 'Theme', themeMode: 'Interface theme', themeObsidian: 'Graphite wood', themePaper: 'Warm paper', themeForest: 'Forest green', themeHint: 'The interface and board palette change together and stay remembered.',
      viewActual: 'Played line', viewBest: 'Best line', reviewFailed: 'Incomplete positions',
      pointsUnit: 'pt', deepen: 'Deeper', analyzeMove: 'Pick move', equalize: 'Equal budget', searchComplete: 'Search complete · deepen available', analysisFailed: 'Analysis incomplete', reviewDeepening: 'Checking mistakes', nativeRequired: 'Requires the Node server with native KataGo analysis', searchBudgetHint: 'Deeper increases this search budget; compare gives each move the same budget', pickMoveHint: 'Click an empty point to analyze without playing; click Pick move again to cancel', comparingMoves: 'Comparing moves', comparisonDone: 'Comparison complete', candidateDetail: 'Mover win rate / point loss / visits', priorLabel: 'Policy prior', analysisGuide: 'AI point-loss estimates: mistake ≥2pt, major mistake ≥5pt. Deepen low-visit results before drawing conclusions.',
      boardDisplay: 'Board display', operationPreferences: 'Move preferences', soundLabel: 'Sound',
      shortcutHelp: '← → Browse · U Undo · R Redo · M Sound',
      analysisStart: 'Start analysis', analysisPause: 'Pause analysis', analysisPaused: 'Analysis paused',
      analysisIntro: 'Play on the board to begin. Start AI analysis whenever you want guidance.', analysisEmptyTitle: 'Analysis starts here', analysisEmptyBody: 'This position has no analysis yet. Start AI analysis to see candidates, win rate and ownership here.', treeEmpty: 'No game tree yet. Play a move or open a record to see variations here.',
      reviewIntro: 'Browse moves, analyze this position, or run AI Review to evaluate the whole game.',
      browsingPosition: 'Browsing · AI moves paused', resumeHere: 'Play from here',
      problemInstructions: 'Play the correct responses for both sides in order.', chooseProblem: 'Choose problem',
      problemBlackTurn: 'Black to play now', problemWhiteTurn: 'White to play now',
      problemIndependent: 'Solved independently', problemAssisted: 'Solved with hints', problemViewed: 'Solution viewed',
      playWorkspace: 'Play', reviewWorkspace: 'Review', learnWorkspace: 'Learn', learnWorkspaceTitle: 'Learning workspace', learningWorkspaceStatus: 'Learning center', learningGuessStarted: 'Guess-the-move practice is open: play first, then check the AI', displayOptions: 'Board tools', focusBoard: 'Focus', firstMove: 'First', previousMove: 'Previous', nextMove: 'Next', lastMoveNav: 'Last', graphLegend: 'Blue: Black winrate · Gold: score ±15', reviewPosition: 'Review · AI moves paused',
      brandSub: 'GO', newGame: 'New', openSgf: 'Open', saveSgf: 'Save', engineSettings: 'Engine',
      engineOff: 'Built-in engine', black: 'Black', white: 'White', captures: 'Caps',
      rule: 'Rule', komi: 'Komi', handicap: 'Handicap', moveCount: 'Moves', result: 'Result',
      lastMove: 'Last move', autosaved: 'Autosaved', undo: 'Undo', redo: 'Redo', pass: 'Pass',
      resign: 'Resign', showNumbers: 'Numbers', analysis: 'Analysis', scoreMode: 'Score',
      tabAnalysis: 'AI Analysis', tabTree: 'Game Tree', scoreLead: 'Score lead', evalGraph: 'Winrate graph',
      candidates: 'Candidates', ownership: 'Zone', backMain: 'Main line',
      treeHint: '← → moves · ↑ ↓ branches · [ ] blunders', livePosition: 'LIVE POSITION', previewing: 'Previewing',
      ready: 'Ready', newGameTitle: 'New Game', boardSize: 'Board', ruleChinese: 'Chinese · area',
      ruleJapanese: 'Japanese · territory', ruleKorean: 'Korean · territory', youPlay: 'You play', auto: 'Auto',
      opponent: 'Opponent', builtinAI: 'Built-in AI', gtpAI: 'KataGo (GTP)', human: 'Human', strength: 'Strength',
      strengthRankNote: 'Approximate rank: the opponent plays at this strength (KataGo tunes visits + playout advantage, low ranks add randomness); analysis, scoring and review always run at full strength',
      thinkTime: 'Time', timeControl: 'Clock', timeOff: 'No clock', timeBlitz: '1 min + 3×20s',
      timeStandard: '5 min + 3×30s', timeLong: '10 min + 5×30s', timeCasual: '15 min (no byo-yomi)', timeoutLoss: 'Lost on time',
      timeFischer: '3 min + 2s/move', opponentStrength: 'Opponent strength', strengthChanged: 'Opponent strength updated',
      cancel: 'Cancel', start: 'Start', engineSettingsTitle: 'GTP Engine Setup',
      engineHint: 'The launcher auto-connects KataGo in this folder. For privacy, only localhost, 127.0.0.1, and ::1 bridges are permitted.',
      bridgeUrl: 'Bridge URL', close: 'Close', connect: 'Connect', scoreTitle: 'Score Result',
      keepPlaying: 'Keep playing', confirmResult: 'Confirm result', resignConfirm: 'Resign the game?',
      aboutText: 'Professional Go workbench: built-in MCTS engine + GTP engines (KataGo etc.) + live winrate analysis + game tree. Full SGF 4 support.',
      you: 'You', youTurn: 'Your move', gameOver: 'Game over',
      illegalOccupied: 'Point occupied', illegalSuicide: 'Suicide is forbidden', illegalKo: 'Ko — play a ko threat first',
      bothPassed: 'Both passed — scoring',
      resigned: 'wins by resignation', scoreLeadB: 'B+', scoreLeadW: 'W+',
      qualityGood: 'Good', qualityBad: 'Slow', qualityAwful: 'Mistake',
      copied: 'Copied to clipboard', loadedSgf: 'Game loaded', loadFail: 'Load failed: ', recordFolderEmpty: 'No SGF records were found in that folder.', recordFolderLoaded: 'Loaded {n} SGF records',
      connectOk: 'Connected: ', connectFail: 'Connection failed: ', needConnect: 'Connect the GTP bridge in "Engine" first',
      autoDeadDone: 'Dead stones marked by zone estimate', ruleCn: 'Chinese', ruleJp: 'Japanese', ruleKr: 'Korean',
      scoreStripHint: 'Click stones to toggle dead', autoMark: 'AI mark', clearMarks: 'Clear',
      confirmScore: 'Confirm', stonesRow: 'Stones', territoryRow: 'Territory',
      aiRefRow: 'AI reference', aiRefNa: 'AI unavailable',
      aiMismatch: 'Differs notably from AI: check dead stones and neutral points',
      dameRow: 'Neutral / undecided', dameNote: 'Position not settled: {n} neutral points — AI score is indicative only',
      scoredByAi: 'AI-scored (KataGo zone)', scoredByBuiltin: 'AI-scored (built-in zone)', scoredByRules: 'rule-based',
      heuristicDeadUsed: 'AI unavailable: dead stones pre-marked by two-eye heuristic — please review on the board',
      prisonersRow: 'Captures (dead incl.)', methodArea: 'area scoring', methodTerr: 'territory scoring',
      analysisTime: 'Analysis time', quickLocal: 'Local KataGo (same-origin)', quickPy: 'Python bridge :8766',
      bridgeDown: 'Bridge not running — run this folder\'s launcher (or "node server.js") first, then connect',
      ngEngineOff: 'KataGo not connected — run this folder\'s launcher first; falls back to built-in AI',
      tabReview: 'Review', runReview: 'AI Review', stopReview: 'Stop', reviewSection: 'Review',
      reviewDepth: 'Analysis depth', reviewDepthHint: 'Quick finds priorities; Standard fits daily review; Deep spends more search on hard positions.', reviewDepthQuick: 'Quick', reviewDepthStandard: 'Standard', reviewDepthDeep: 'Deep',
      autoPreview: 'Auto PV', autoPreviewHint: 'Hover a candidate to preview instantly; hover elsewhere briefly for the engine line',
      analyzing: 'Analyzing…',
      prevBlunder: '◀ Prev blunder', nextBlunder: 'Next blunder ▶', noBlunders: 'No blunders found — run AI Review first',
      commentLabel: 'Note', commentPlaceholder: 'Add a note for this move (stored in SGF)',
      soundOn: 'Sound on', soundOff: 'Sound muted',
      reviewEmpty: 'Run AI Review: per-player AI match rate, average winrate loss (percentage points), grade distribution and per-move winrate report. Click any move to jump on the board.',
      reviewFocus: 'Training focus', reviewFocusHint: 'Priority practice points sorted by point loss. Data stays in this game session only.', reviewFocusPractice: 'Practice', reviewFocusLocate: 'Locate', reviewFocusEmpty: 'No moves need focused practice yet.',
      reviewDone: 'Review complete', reviewStop: 'Stopped', reviewRunning: 'Reviewing',
      aiMatch: 'AI match', top3Match: 'Top-3 match', avgLoss: 'Avg point loss', worstMove: 'Worst move',
      gradeOk: 'Fine', thCoord: 'Coord', thWinrate: 'Winrate', thScore: 'Score', thLoss: 'Loss (pt)', thGrade: 'Grade', thAi: 'AI',
      reviewNoMoves: 'No moves yet',
      flip: 'Flip', confirmMove: 'Confirm move', showCoords: 'Coords',
      autoplay: 'Play', autoplayStop: 'Pause',
      practice: 'Drill', practiceTip: 'Go back and re-practice this position vs AI',
      practiceStart: 'Practice started — your move, AI takes the opponent',
      practiceActive: 'Practice', practiceExit: 'End practice', practiceRetry: 'Retry',
      practiceVerdictOk: 'Correct', practiceVerdictMiss: 'Missed AI top move',
      practiceMissToast: 'AI top move: {c}', practiceNoBest: 'No AI top move available',
      practiceTargetPrefix: 'Move ', practiceTargetSuffix: '',
      gameOverHint: 'Game is over — try moves in the Review workspace, or start a new game',
      branchCreated: 'New variation created (see game tree)',
      engineTimeout: 'Engine timed out — check the "Engine" connection',
      pendingConfirm: 'Click again to confirm · Esc to cancel',
      candEmptyHint: 'Turn on "Analysis" (or wait for the AI) to see candidates and winrates',
      pvTitle: 'PV line: click a move to preview up to it; click again for the full line',
      fallbackBuiltin: 'KataGo unavailable — switched to the built-in AI',
      gtpRestored: 'KataGo connection restored',
      serverDown: 'Local server is not running: AI bridge unavailable, using built-in AI (run StartGoT.bat or node server.js for KataGo)',
      clearCache: 'Clear cache & reload',
      cacheCleared: 'Cache cleared — reloading…',
      newVersion: 'Updated to a new version — reloading…',
      displaySettings: 'Display settings',
      displaySettingsHint: 'Changes apply instantly. Coordinates, flip, sound and move confirmation are remembered; games stay in this session only.',
      candColorMode: 'Board candidate color',
      candColorWinrate: 'By winrate (green high, red low)',
      candColorRank: 'By rank (best = greenest)',
      candSortMode: 'Candidate list order',
      candSortVisits: 'By visits (AI preference)',
      candSortWinrate: 'By winrate',
      problems: 'Problems', problemsTitle: 'Life & Death · Classic', problemsSet: 'Collections',
      problemsLoadFail: 'Failed to load problems: ensure problems/problems.js exists',
      problemsEmpty: 'No problems', problemsHint: 'Hint', problemsReset: 'Reset',
      problemsSolution: 'Solution', problemsNext: 'Next', problemsPrev: 'Prev',
      problemsExit: 'Return to game', problemsRandom: 'Random', problemsSolved: 'Solved!',
      problemsCorrect: 'Correct!', problemsWrong: 'Not the solution', problemsHintShown: 'Next move highlighted',
      problemsL1: 'Not quite — that move is undone, think again',
      problemsL2: 'The solution lies in the {region}, {n} moves in total',
      problemsL3: 'This is the key move — play the rest yourself',
      problemsL4: 'Still stuck? Hit "Solution" for the full line',
      problemsRank: 'Rank', problemsRankAll: 'All',
      problemsRankNote: 'Rank estimated from solution length — indicative only', problemProgress: 'Problem progress', problemSetProgress: 'Collection {done} / {total} complete · {viewed} viewed', problemSetButton: '{done} / {total} complete', problemCompleteMark: 'Completed', problemViewedMark: 'Solution viewed', problemNotStarted: 'Not started', problemAttempts: '{n} attempts', problemBestProgress: 'Best {best} / {total}', problemNumber: 'Problem', movesShort: 'moves', problemProgressHint: 'Your best progress is remembered; viewing the solution does not count as a solve.', problemsLegend: '✓ Completed · ◐ Solution viewed'
    }
  };
  let lang = localStorage.getItem('got.lang') || 'zh';
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.zh[k] || k;

  /* ================= state ================= */
  const state = {
    game: null,
    workspace: 'play',
    browsing: false,
    activeTab: 'analysis',   // 默认显示当前任务与可直接开启的分析
    mode: 'play',            // play | score
    previewNode: null,       // null | 'pv'
    deadStones: new Set(),
    showNumbers: false,
    analysisOn: false,
    autoPreview: false,      // 悬停交叉点自动推演后续局面（会话级，不持久化）
    showOwnership: false,
    opponent: 'builtin',     // builtin | gtp | human
    humanColor: BLACK,
    strength: 5,
    timeMs: 1000,
    clock: null,             // 对局计时状态（js/clock.js），null = 不计时
    clockPreset: 'off',      // off | blitz | standard | long | casual
    clockLast: 0,            // 上次 tick 的时间戳
    analysisSeconds: 2,      // GTP 分析用时
    reviewDepth: 'standard',  // quick | standard | deep；仅影响复盘搜索预算
    scoreOwnership: null,    // 点目时使用的 AI 形势数组
    aiScoreLead: null,       // 点目时的 AI 参考分（scoreLead，黑正含贴目）
    aiScoreSource: null,     // 点目形势来源：'gtp'（KataGo）| 'builtin' | null
    reviewRunning: false,
    reviewStop: false,
    soundOn: true,
    flip: false,           // 棋盘翻转 180°（腾讯/野狐风格）
    confirmMove: false,    // 落子确认模式：点两次才落子（触屏防误点）
    showCoords: true,      // 坐标显示
    pendingMove: null,     // 确认模式下的待确认落子 {x,y}
    autoplay: false,       // 复盘自动播放
    autoplayTimer: 0,
    candColor: 'winrate',  // 棋盘候选圈颜色：winrate 按胜率 | rank 按排名
    candSort: 'visits',    // 候选列表排序：visits 按访问量 | winrate 按胜率
    theme: 'paper',      // 界面与棋盘主题
    problem: null,         // 死活题运行态：{ p, items, idx, progress, done, wrong }
    problemPrev: null,     // 进入死活题前的对手/执子，退出时还原
    practice: null         // 复盘练习运行态 { prev, mover, moveNo }；非空时允许在已结束的棋谱上落子
  };
  const savedSettings = (() => {
    try { return JSON.parse(localStorage.getItem('got.settings')); } catch (e) { return null; }
  })();
  /* 只恢复"无害偏好"：**对局状态一律不跨会话**——对手是谁、你执黑还是执白属于
   * 一局游戏的设定，恢复它们会让"打开即新局"名存实亡（更糟的是上次选了 KataGo，
   * 这次桥没起来 → AI 一动不动，看起来像"缓存把 AI 卡死了"）。
   * 连接地址是环境配置（本机桥接端口），保留。 */
  if (savedSettings) {
    if (savedSettings.strength) state.strength = savedSettings.strength;
    if (savedSettings.timeMs) state.timeMs = savedSettings.timeMs;
    if (savedSettings.analysisSeconds) state.analysisSeconds = savedSettings.analysisSeconds;
    if (['quick', 'standard', 'deep'].includes(savedSettings.reviewDepth)) state.reviewDepth = savedSettings.reviewDepth;
    if (savedSettings.soundOn === false) state.soundOn = false;
    if (typeof savedSettings.confirmMove === 'boolean') state.confirmMove = savedSettings.confirmMove;
    if (typeof savedSettings.showCoords === 'boolean') state.showCoords = savedSettings.showCoords;
    if (savedSettings.flip === true) state.flip = true;
    if (savedSettings.candColor === 'winrate' || savedSettings.candColor === 'rank') state.candColor = savedSettings.candColor;
    if (savedSettings.candSort === 'visits' || savedSettings.candSort === 'winrate') state.candSort = savedSettings.candSort;
    if (['obsidian', 'paper', 'forest'].includes(savedSettings.theme)) state.theme = savedSettings.theme;
    if (savedSettings.clockPreset && Clock.PRESETS[savedSettings.clockPreset]) state.clockPreset = savedSettings.clockPreset;
  }

  function saveSettings() {
    try {
      localStorage.setItem('got.settings', JSON.stringify({
        strength: state.strength, timeMs: state.timeMs,
        analysisSeconds: state.analysisSeconds, reviewDepth: state.reviewDepth, soundOn: state.soundOn,
        bridgeUrl: $('bridgeUrl').value,
        confirmMove: state.problemPrev ? state.problemPrev.confirmMove : state.confirmMove, showCoords: state.showCoords,
        flip: state.flip, candColor: state.candColor, candSort: state.candSort, theme: state.theme,
        clockPreset: state.clockPreset
      }));
    } catch (e) { /* ignore */ }
  }
  /* 把底层 fetch 报错翻译成可操作的提示 */
  function friendlyFetchError(err) {
    const raw = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw)) return t('bridgeDown');
    return raw;
  }
  const analysisCache = new Map();   // nodeId -> normalized analysis
  let analysisSeq = 0;
  let requestedAnalysisMarker = '';
  let analysisController = null, reviewController = null, pickAnalysisMove = false;
  function cancelNativeAnalysis() {
    if (analysisController) analysisController.abort();
    analysisController = null;
    pickAnalysisMove = false;
  }
  let moveSeq = 0;
  let requestedAnalysisNode = null;
  let reviewRunId = 0;
  let pendingGtp = 0;
  let gtpAnalysisQueued = false;     // GTP 分析在途时到达的新请求：完成后自动补发，而不是丢弃
  /* 放弃在途引擎走子：换手/导航/换局都用它（而不只是 moveSeq++）——
   * 否则在途结果的 seq 护卫直接 return，engineThinking 无人清理 → 思考中常亮、悬停推演整局失效 */
  function abandonEngine() {
    moveSeq++;
    setThinking(null, false);
  }

  /* ================= engines ================= */
  function createEngineWorker() {
    // inline blob source (filled in the single-file build) → works on file:// too
    const inline = document.getElementById('got-ai-worker-src');
    if (inline && inline.textContent && inline.textContent.trim()) {
      try {
        const url = URL.createObjectURL(new Blob([inline.textContent], { type: 'application/javascript' }));
        return new Worker(url);
      } catch (e) { /* fall through to external */ }
    }
    /* 外链 Worker 在 file:// 下会被浏览器以 origin 'null' 拒绝构造（SecurityError）。
     * 构造失败绝不能连累整个 app.js —— 否则棋盘与界面全部不渲染。退化为空引擎桩，
     * 页面照常可用，只是内置 AI 暂时不工作并给出控制台提示。 */
    try {
      return new Worker('js/ai-worker.js');
    } catch (e) {
      console.error('AI worker unavailable (page likely opened via file://):', e && e.message);
      return {
        onmessage: null, onerror: null,
        postMessage() {}, terminate() {},
        addEventListener() {}, removeEventListener() {}
      };
    }
  }

  const worker = createEngineWorker();
  const defaultBridge = (location.protocol.indexOf('http') === 0) ? '' : 'http://127.0.0.1:4173';
  const savedBridge = savedSettings && savedSettings.bridgeUrl !== undefined && savedSettings.bridgeUrl !== null
    ? String(savedSettings.bridgeUrl).replace(/\/$/, '') : '';
  /* Older releases saved the fixed 4173 URL even when the page was served by
   * the launcher on a fallback port. In that case same-origin is authoritative
   * and avoids accidentally connecting to another local process on 4173. Keep
   * explicitly chosen non-default bridges (for example a Python bridge:8766). */
  const legacyBridge = 'http://127.0.0.1:4173';
  const bridgeUrl = location.protocol.indexOf('http') === 0 && (!savedBridge || savedBridge === legacyBridge)
    ? '' : (savedBridge || defaultBridge);
  const gtp = new window.GtpClient(bridgeUrl);

  worker.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type !== 'result') return;
    if (msg.error) { console.error('AI worker:', msg.error); return; }
    // 只接受"主局面分析"结果，且必须携带与当前请求一致的位置标识——
    // 引擎行棋/预览/复盘/点目的晚到结果不允许冒充局面分析
    const want = requestedAnalysisNode;
    if (!want || msg.marker !== requestedAnalysisMarker) return;
    ingestAnalysis('builtin', msg, msg.done !== false);
  };
  worker.onerror = (e) => console.error('AI worker:', e.message);

  /* ================= helpers ================= */
  function game() { return state.game; }
  /* 分析用引擎：只要 GTP 引擎（KataGo 等）在线且支持 analyze 就优先用（最强），否则内置 */
  function analysisEngineKind() {
    return (gtp.info && gtp.info.supportsAnalyze !== false) ? 'gtp' : 'builtin';
  }
  /* 真正执子的对手：选了 KataGo 但桥没连上时不干等——自动用内置 AI 顶上；
   * 桥一恢复，下一次轮到引擎又自动切回 KataGo。
   * 这里不改 state.opponent（用户的对局设定保持不变），只影响"这次谁来下"。
   * 曾经的行为：opp==='gtp' 且 !gtp.info → 只弹提示、谁也不下——整局卡死在等待。 */
  let gtpDownNotified = false;
  function effOpponent() {
    return (state.opponent === 'gtp' && !gtp.info) ? 'builtin' : state.opponent;
  }
  function noteGtpFallback() {
    if (gtpDownNotified) return;
    gtpDownNotified = true;
    showToast(t('fallbackBuiltin'));
  }
  function position() { return game().positionAt(game().current); }
  function toMove() { return position().turn; }
  function isHumanTurn() {
    if (state.mode !== 'play' || ['learn', 'home'].includes(state.workspace)) return false;
    /* 复盘工作区本来就是给"已结束的棋谱"试下变化用的，不能被 RE[] 一票否决 */
    if (state.workspace === 'review' || state.opponent === 'human') return true;
    /* 练习的目标棋谱几乎都带 RE[]，result 非空是常态——练习中必须放行 */
    if (game().result && !state.practice) return false;
    return toMove() === state.humanColor;
  }
  function moveNumberOf(node) {
    let count = 0;
    for (const n of game().pathFromRoot(node)) if (n.move) count++;
    return count;
  }
  function coordOf(node) {
    if (!node || !node.move) return '—';
    if (node.move.pass) return lang === 'zh' ? '停着' : 'pass';
    return GE.coordName(game().size, node.move.x, node.move.y);
  }
  function showToast(msg) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function movesListTo(node) {
    return game().pathFromRoot(node).filter(n => n.move)
      .map(n => ({ color: n.move.color, x: n.move.x, y: n.move.y, pass: n.move.pass }));
  }
  function rootSetup() {
    const s = game().root.setup;
    return s ? { AB: s.AB || [], AW: s.AW || [] } : null;
  }

  /* ================= analysis ingestion ================= */
  function ingestAnalysis(kind, raw, done) {
    const node = requestedAnalysisNode;
    if (!node) return;
    const toMoveC = raw.toMove !== undefined ? raw.toMove : game().positionAt(node).turn;
    const analysis = GtpClient.normalizeAnalysis(kind, raw, toMoveC);
    const label = kind === 'builtin' ? 'MCTS' : ((gtp.info && gtp.info.name) || 'GTP');
    analysis.node = node;
    analysis.label = label + ' · ' + analysis.visits + 'v';
    analysis.rules = game().rules;
    analysisCache.set(node.id, analysis);
    node.analysisWrBlack = analysis.wrBlack;
    node.analysisScoreLeadBlack = analysis.scoreLeadBlack;
    if (done !== false) requestedAnalysisNode = null;
    updateAnalysisUI(analysis, done === false);
    /* 分析数据落定后刷新"上一手"质量卡——否则它一直停在"…"占位符 */
    if (!done) return;
    updateQuality();
  }

  /* 悬停推演（假设分析）的在途失效：任何会打断 worker 的请求都先调它 */
  function invalidatePreview() { previewSeq++; previewBusy = false; }
  function requestAnalysis(node, opts) {
    if (!state.analysisOn || state.mode === 'score' || state.problem || state.reviewRunning || ['learn', 'home'].includes(state.workspace)) return;
    if(assessment && assessment.game===game() && !assessment.finished){assessment=null;showToast(lang==='zh'?'开启分析，本盘转为普通对局。':'Analysis enabled; this game is now unrated.');}
    invalidatePreview();
    if (!$('candidateList').children.length) $('candMeta').textContent = t('analyzing');
    const pos = game().positionAt(node);
    const spec = {
      size: game().size, komi: game().komi, rules: game().rules,
      toMove: pos.turn,
      moves: movesListTo(node),
      setup: rootSetup()
    };
    cancelNativeAnalysis();
    const mySeq = ++analysisSeq;
    requestedAnalysisMarker = 'position:' + node.id + ':' + mySeq;
    requestedAnalysisNode = node;
    // 分析始终用最强引擎：连接了 KataGo 等支持分析的 GTP 引擎就优先用，
    // 否则用内置 MCTS 的最高分析档（9 段、无探索噪声）
    const kind = (opts && opts.forceBuiltin) ? 'builtin' : analysisEngineKind();
    if (kind === 'builtin') {
      worker.postMessage({ type: 'stop' });
      worker.postMessage({
        type: 'analyze',
        position: { size: spec.size, komi: spec.komi, toMove: spec.toMove, moves: spec.moves, setup: spec.setup },
        opts: Object.assign({
          strength: 9, topN: 5, analysis: true,
          timeMs: Math.max(2500, state.analysisSeconds * 1000)
        }, opts || {}),
        // marker 带节点 id：worker 同步排队，晚到的旧结果无法冒充新局面
        marker: requestedAnalysisMarker
      });
    } else if (gtp.info && gtp.info.nativeAnalysis) {
      analysisController = new AbortController();
      const cached = analysisCache.get(node.id);
      const budget = opts && opts.deepen ? Math.min(100000, Math.max(1600, (cached ? cached.visits : 800) * 2)) : 800;
      gtp.analyze(Object.assign({}, spec, { seconds: opts && opts.deepen ? 30 : Math.max(2, state.analysisSeconds),
        maxVisits: budget, topN: 5, ownership: true }), {
        priority: 5, signal: analysisController.signal,
        onUpdate: res => { if (mySeq === analysisSeq) ingestAnalysis('gtp', res, false); }
      }).then(res => {
        if (mySeq !== analysisSeq) return;
        ingestAnalysis('gtp', res, true);
        $('analysisState').textContent = t('searchComplete');
      }).catch(e => {
        if (mySeq !== analysisSeq || e.name === 'AbortError') return;
        requestedAnalysisNode = null;
        $('analysisState').textContent = t('analysisFailed');
        showToast(t('analysisFailed') + ': ' + e.message);
      });
    } else {
      // GTP 在途时不丢弃请求（丢弃会卡死"分析中…"）——记为待补发，在途结束后重试
      if (pendingGtp >= 1) { gtpAnalysisQueued = true; return; }
      pendingGtp++;
      // settled 防负漂移：then/catch 双路径只能减一次（ingest 等同步异常不吞计数）
      let settled = false;
      const release = () => { if (!settled) { settled = true; pendingGtp--; } };
      gtp.analyze(Object.assign({
        seconds: Math.max(1, state.analysisSeconds),
        topN: 5, ownership: true
      }, spec), { priority: 1 })
        .then(res => {
          release();
          if (mySeq !== analysisSeq) { retryQueuedGtpAnalysis(); return; }
          if (res.ok) ingestAnalysis('gtp', Object.assign({ toMove: spec.toMove }, res), true);
          else {
            // 分析失败（引擎崩了/503）：不再干挂在"分析中…"——改用内置 MCTS 顶上
            if (opts && opts.forceBuiltin) { $('candMeta').textContent = ''; return; }
            requestAnalysis(node, { forceBuiltin: true });
          }
        })
        .catch(() => {
          release();
          if (mySeq !== analysisSeq) { retryQueuedGtpAnalysis(); return; }
          if (opts && opts.forceBuiltin) { $('candMeta').textContent = ''; return; }
          // 网络/桥接错误：回落内置引擎，保证分析面板与候选圈始终可用
          requestAnalysis(node, { forceBuiltin: true });
        });
    }
  }
  /* 在途 GTP 分析结束后，若期间有被搁置的请求，对最新局面补发一次 */
  function retryQueuedGtpAnalysis() {
    if (!gtpAnalysisQueued || pendingGtp > 0) return;
    gtpAnalysisQueued = false;
    const node = requestedAnalysisNode;
    if (node && state.analysisOn && state.mode !== 'score') requestAnalysis(node);
  }

    /* 导航/换局后立刻清掉上一局面的候选圈与形势叠层，避免残影误导 */
    function clearAnalysisOverlay() {
      renderer.set({ candidates: [], ownership: null });
      renderer.requestRender();
      $('candidateList').textContent = '';
      $('candEmpty').hidden = false;
      $('pvLine').textContent = '';
      $('candMeta').textContent = '';
    }

  /* ================= clock ================= */
  let clockTimer = 0;
  let clockWarnedColor = null;   // 已播过"低时"提醒的颜色，避免每秒重复
  /* 只有"人对局"的那一方走子时才走钟：AI 对手的思考由「用时」控制，不占这里的钟。
   * 非对局状态（浏览/复盘/死活/点目/终局）一律暂停，暂停时间不计入。 */
  function clockLiveColor() {
    if (!state.clock || state.clock.flagged) return null;
    if (state.mode !== 'play' || state.workspace !== 'play' || state.problem || state.browsing || game().result) return null;
    const c = toMove();
    if (state.opponent === 'human') return c;
    return c === state.humanColor ? c : null;
  }
  function updateClockUI() {
    const cb = $('clockBlack'), cw = $('clockWhite');
    if (!cb || !cw) return;
    const clk = state.clock;
    if (!clk) { cb.hidden = true; cw.hidden = true; return; }
    const humanOnly = state.opponent !== 'human';
    cb.hidden = humanOnly && state.humanColor !== BLACK;
    cw.hidden = humanOnly && state.humanColor !== WHITE;
    cb.textContent = Clock.format(clk, BLACK, lang);
    cw.textContent = Clock.format(clk, WHITE, lang);
    const active = clockLiveColor();
    cb.classList.toggle('active', active === BLACK);
    cw.classList.toggle('active', active === WHITE);
    cb.classList.toggle('flagged', clk.flagged === BLACK);
    cw.classList.toggle('flagged', clk.flagged === WHITE);
    /* 低时（≤10s）变琥珀，与超时红区分 */
    const remB = Clock.remaining(clk, BLACK), remW = Clock.remaining(clk, WHITE);
    cb.classList.toggle('low', remB > 0 && remB <= 10);
    cw.classList.toggle('low', remW > 0 && remW <= 10);
  }
  function clockTimeout(color) {
    if (!state.clock || state.clock.flagged) return;
    state.clock.flagged = color;
    game().result = (color === BLACK ? 'W' : 'B') + '+T';   // SGF RE：超时判负
    game().infoProps();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    updateClockUI();
    renderAll();
    showToast(t('timeoutLoss'));
  }
  function clockTick() {
    const clk = state.clock;
    const now = Date.now();
    const dt = state.clockLast ? now - state.clockLast : 0;
    state.clockLast = now;                       // 暂停期间也推进，暂停时间不计入
    if (!clk) return;
    const color = clockLiveColor();
    if (color && dt > 0) {
      const flagged = Clock.tick(clk, color, dt);
      if (flagged) { clockTimeout(flagged); return; }
      /* 低时提醒：首次进入 ≤10s 播一次；时间回到 10s 以上（落子/加秒）后重置 */
      const rem = Clock.remaining(clk, color);
      if (rem > 10) clockWarnedColor = null;
      else if (rem > 0 && clockWarnedColor !== color) { clockWarnedColor = color; playLowTimeSound(); }
    }
    updateClockUI();
  }
  function setClock(presetKey) {
    state.clockPreset = Clock.PRESETS[presetKey] ? presetKey : 'off';
    state.clock = Clock.create(state.clockPreset);
    state.clockLast = Date.now();
    clockWarnedColor = null;
    updateClockUI();
  }
  function resetClock() {
    state.clock = null;
    clockWarnedColor = null;
    state.clockLast = 0;
    updateClockUI();
  }
  clockTimer = setInterval(clockTick, 200);   // 常驻轻量心跳；无钟时仅隐藏显示

  /* ================= engine move ================= */
  let engineThinking = false;   // 引擎是否在思考（悬停推演据此让路）
  function setThinking(color, on) {
    engineThinking = on;
    $('blackThinking').hidden = !(on && color === BLACK);
    $('whiteThinking').hidden = !(on && color === WHITE);
    $('enginePill').classList.toggle('thinking', on);
  }

  function requestEngineMove() {
    invalidatePreview();
    if (state.workspace === 'review' || ['learn', 'home'].includes(state.workspace) || state.problem || state.browsing) return;
    if (state.mode !== 'play' || game().result) return;
    const opp = effOpponent();
    if(assessment && assessment.game===game() && opp!==assessment.engine){assessment=null;showToast(lang==='zh'?'引擎已切换，本盘不计入测评。':'Engine changed; this game will not count.');}
    if (opp !== state.opponent) noteGtpFallback();   // 选了 KataGo 但桥不可用 → 内置 AI 顶上
    if (opp === 'human') return;
    const color = toMove();
    if (color === state.humanColor) return;
    const node = game().current;
    const mySeq = ++moveSeq;
    setThinking(color, true);
    const playBest = (best) => {
      if (mySeq !== moveSeq) return;
      setThinking(color, false);
      if (!best) return;
      if (best.pass) { game().pass(color); afterMove(); return; }
      const r = game().play(color, best.x, best.y);
      if (!r.ok) { showToast(t('illegalOccupied')); return; }
      afterMove();
    };
    if (opp === 'gtp') {
      if (!gtp.info) { setThinking(color, false); showToast(t('needConnect')); return; }
      /* 棋力：KataGo 走子按档位限制搜索量、加 PDA，低档随机选点（见 js/strength.js）。
       * 分析 / 点目 / 复盘不经过这里，始终满强度。 */
      const sb = Strength.kataGo(assessmentStrength());
      // 看门狗：引擎较慢（队列积压/负载高）时收起"思考中"并提示一次，
      // 但【不】丢弃迟到的合法结果——只要局面没变（mySeq 未变）就照常落子，
      // 否则 AI 回合会永久卡死（人类点不动、AI 也不下）。
      // 真卡死的引擎由请求级 timeoutMs（fetch abort）兜底，中断后释放整条队列。
      let warned = false;
      const guardMs = Math.max(20000, state.timeMs * 4);
      const watchdog = setTimeout(() => {
        warned = true;
        if (mySeq === moveSeq) { setThinking(color, false); showToast(t('engineTimeout')); }
      }, guardMs);
      gtp.analyze({
        size: game().size, komi: game().komi, rules: game().rules, toMove: color,
        moves: movesListTo(node), setup: rootSetup(),
        seconds: assessment && assessment.game===game() ? 2 : Math.max(0.5, state.timeMs / 1000), topN: 5,
        maxVisits: sb.maxVisits, pda: sb.pda,
        wideRootNoise: 0     // 对弈不加根噪声：同一 KataGo 进程默认 0.04 会让对手偏弱/随机
      }, { timeoutMs: guardMs + 5000, priority: 1 })
        .then(res => {
          clearTimeout(watchdog);
          if (mySeq !== moveSeq) return;      // 局面已变：放弃本次落子
          setThinking(color, false);
          if (!res.ok) {
            if (!warned) showToast(t('connectFail') + friendlyFetchError(res.error || ''));
            return;
          }
          /* 低档随机选点：从候选中按温度采样；无候选时退回引擎最佳手 */
          const pick = (res.candidates && res.candidates.length)
            ? Strength.pickMove(res.candidates, sb.temperature)
            : res.bestMove;
          if (!pick) {
            if (!warned) showToast(t('connectFail') + friendlyFetchError(res.error || ''));
            return;
          }
          playBest(pick.pass ? { pass: true } : { x: pick.x, y: pick.y });
        })
        .catch(err => {
          clearTimeout(watchdog);
          if (mySeq !== moveSeq) return;
          setThinking(color, false);
          // 连接类错误（fetch 失败/abort）：abort 只发生在 watchdog 已提示之后
          if (!warned) showToast(t('connectFail') + friendlyFetchError(err));
        });
      return;
    }
    // built-in worker: single final result with matching marker
    // 动态 marker（含 mySeq）：worker 串行单任务、排队 stop 无效且必跑完并广播——
    // 常量 marker 会让两个在途监听器互相吃结果（旧局面着法落到新局面）。按 seq 精确配对
    const marker = 'move:' + mySeq;
    worker.postMessage({
      type: 'analyze',
      position: { size: game().size, komi: game().komi, rules: game().rules, toMove: color, moves: movesListTo(node), setup: rootSetup() },
      opts: { strength: assessmentStrength(), topN: 3, timeMs: assessment && assessment.game===game() ? 1000 : state.timeMs },
      marker
    });
    const onResult = (e) => {
      const msg = e.data || {};
      if (msg.type !== 'result' || msg.marker !== marker) return;
      worker.removeEventListener('message', onResult);
      if (mySeq !== moveSeq) return;
      setThinking(color, false);
      if (msg.error || !msg.done || !msg.best) return;
      playBest(msg.best);
    };
    worker.addEventListener('message', onResult);
  }

  /* ================= board ================= */
  let renderer = new window.BoardRenderer($('boardCanvas'));
  function applyTheme(name, persist) {
    const next = ['obsidian', 'paper', 'forest'].includes(name) ? name : 'obsidian';
    state.theme = next;
    document.documentElement.dataset.theme = next;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const themeColors = { obsidian: '#1d2126', paper: '#e8e5de', forest: '#152422' };
      themeMeta.setAttribute('content', themeColors[next]);
    }
    const select = $('themeSelect');
    if (select) select.value = next;
    if (renderer) {
      renderer.set({ theme: next });
      renderer.requestRender();
    }
    if (persist) saveSettings();
  }
  const stage = $('boardStage');
  const ro = new ResizeObserver(() => renderer.resizeTo(stage));
  ro.observe(stage);

  /* hover 状态去重：同一交叉点不重复渲染，坐标栏仅在变化时写 DOM */
  let lastHoverIdx = -1;
  /* 自动推演：悬停候选圈立即用现成 PV 推演；悬停其他空点约 0.35s 后做一次轻量
   * 「假设分析」（当前局面 + 该手），推演之后双方的最佳应接。结果按 (局面,点)
   * 缓存，再次悬停零等待。预览不吞点击：单击即落子；移动鼠标可流畅切换。 */
  let autoPreviewTimer = 0, autoPreviewIdx = -1;
  let previewBusy = false, previewSeq = 0;
  const previewCache = new Map();
  function cancelAutoPreview() {
    if (autoPreviewTimer) { clearTimeout(autoPreviewTimer); autoPreviewTimer = 0; }
    autoPreviewIdx = -1;
  }
  function scheduleAutoPreview(idx, p) {
    cancelAutoPreview();
    if (!state.autoPreview || !state.analysisOn || state.mode !== 'play' || game().result) return;
    if (idx < 0 || position().board[idx] || state.pendingMove) return;
    /* 合法性预检：非法点（自杀/劫禁）不发起假设分析——否则引擎对"幻觉局面"
     * 静默重放失败照样给出一条从未存在过的 PV */
    if (!position().checkPlay(toMove(), idx).ok) return;
    const a = analysisCache.get(game().current.id);
    const cand = a && a.candidates && a.candidates.find(c => !c.pass && c.x === p.x && c.y === p.y);
    if (cand) { previewPv(cand); return; }        // 候选圈：现成 PV，零等待
    autoPreviewIdx = idx;
    autoPreviewTimer = setTimeout(() => {
      autoPreviewTimer = 0;
      if (autoPreviewIdx !== lastHoverIdx || !state.autoPreview) return;
      requestHypoPreview(idx, p);
    }, 350);
  }
  function previewLine(pv, startColor, badgePct) {
    const preview = [];
    let color = startColor;
    let n = 0;
    for (const m of (pv || [])) {
      if (m.pass) { preview.push({ pass: true, color }); break; }
      n++;
      preview.push({ x: m.x, y: m.y, color, n });
      color = color === BLACK ? WHITE : BLACK;
    }
    if (!preview.length) return;
    state.previewNode = 'pv';
    $('previewBadge').hidden = false;
    $('previewBadge').textContent = t('previewing') +
      (typeof badgePct === 'number' && isFinite(badgePct) ? ' · ' + badgePct + '%' : '');
    renderer.set({ preview, hover: null });
    renderer.requestRender();
  }
  function showHypoPreview(hit, idx) {
    const hp = { x: idx % game().size, y: Math.floor(idx / game().size) };
    if (position().board[hp.y * game().size + hp.x]) return;
    previewLine([{ x: hp.x, y: hp.y }].concat(hit.pv || []), toMove(), hit.wrPct);
  }
  /* 轻量假设分析：只求一条最佳应接 PV，不占用也不污染主分析结果 */
  function requestHypoPreview(idx, p) {
    if (engineThinking || previewBusy || requestedAnalysisNode || pickAnalysisMove) return;
    if (analysisEngineKind() === 'gtp' && pendingGtp > 0) return;
    const node = game().current;
    const key = node.id + ':' + idx;
    const hit = previewCache.get(key);
    if (hit) { showHypoPreview(hit, idx); return; }
    const mover = position().turn;
    const reply = mover === BLACK ? WHITE : BLACK;
    const spec = {
      size: game().size, komi: game().komi, rules: game().rules, toMove: reply,
      moves: movesListTo(node).concat([{ color: mover, x: p.x, y: p.y, pass: false }]),
      setup: rootSetup()
    };
    previewBusy = true;
    const mySeq = ++previewSeq;
    const done = (res, kind) => {
      if (mySeq === previewSeq) previewBusy = false;
      if (mySeq !== previewSeq || !res) return;
      const c0 = res.candidates && res.candidates[0];
      if (!c0 || !c0.pv || !c0.pv.length) return;
      /* 徽章显示【落子方(mover)】胜率。假设分析的请求方是 reply（对手应手）：
       * - server/GTP：candidates.winrate = 行棋方(reply)视角百分比 → mover = 1 - pct
       * - 内置引擎：candidates.winrate 恒为黑方视角(0..1) → 先换算 reply 视角再取反 */
      let wrMover;
      if (kind === 'builtin') {
        const wrB = Math.max(0, Math.min(1, c0.winrate));
        wrMover = reply === BLACK ? 1 - wrB : wrB;
      } else {
        const pct = Math.max(0, Math.min(100, c0.winrate));
        wrMover = 1 - pct / 100;
      }
      const hitNew = { pv: c0.pv, wrPct: Math.round(wrMover * 100) };
      previewCache.set(key, hitNew);
      if (previewCache.size > 60) previewCache.delete(previewCache.keys().next().value);
      if (autoPreviewIdx !== lastHoverIdx || !state.autoPreview) return;
      if (state.previewNode || state.pendingMove) return;
      showHypoPreview(hitNew, idx);
    };
    if (analysisEngineKind() === 'gtp') {
      gtp.analyze(Object.assign({ seconds: 0.6, topN: 1, ownership: false }, spec))
        .then(res => done(res && res.ok ? res : null, 'gtp'))
        .catch(() => done(null, 'gtp'));
    } else {
      // 动态 marker：防在途旧预览与新点的监听器交叉消费（旧 PV 写进新点缓存）
      const marker = 'preview:' + previewSeq;
      worker.postMessage({
        type: 'analyze',
        position: { size: spec.size, komi: spec.komi, toMove: spec.toMove, moves: spec.moves, setup: spec.setup },
        opts: { strength: 9, topN: 1, analysis: true, timeMs: 700 },
        marker
      });
      const onMsg = (e) => {
        const msg = e.data || {};
        if (msg.type !== 'result' || msg.marker !== marker) return;
        worker.removeEventListener('message', onMsg);
        done(msg.error ? null : msg, 'builtin');
      };
      worker.addEventListener('message', onMsg);
    }
  }
  $('autoPreviewBtn').addEventListener('click', () => {
    state.autoPreview = !state.autoPreview;
    $('autoPreviewBtn').setAttribute('aria-pressed', String(state.autoPreview));
    cancelAutoPreview();
    if (!state.autoPreview) clearPreview();
  });
  $('boardCanvas').addEventListener('mousemove', (e) => {
    const p = renderer.pointAt(e.clientX, e.clientY);
    const idx = p ? p.y * game().size + p.x : -1;
    if (idx === lastHoverIdx) return;
    lastHoverIdx = idx;
    $('statusCoord').textContent = idx >= 0 ? GE.coordName(game().size, p.x, p.y) : '—';
    /* 预览跟随鼠标：移到新的空点自动切换推演目标；离开棋盘或移到棋子上即收起 */
    if (state.previewNode) exitPreview();
    const wantHover = idx >= 0 && state.mode === 'play' && isHumanTurn() &&
      !state.previewNode && !position().board[idx];
    const hasHover = !!renderer.opts.hover;
    if (wantHover) {
      if (!hasHover || renderer.opts.hover.x !== p.x || renderer.opts.hover.y !== p.y) {
        renderer.set({ hover: { x: p.x, y: p.y, color: toMove() } });
        renderer.requestRender();
      }
    } else if (hasHover) {
      renderer.set({ hover: null });
      renderer.requestRender();
    }
    scheduleAutoPreview(idx, p);
  });
  $('boardCanvas').addEventListener('mouseleave', () => {
    lastHoverIdx = -1;
    cancelAutoPreview();
    if (renderer.opts.hover) { renderer.set({ hover: null }); renderer.requestRender(); }
    clearPreview();
  });
  /* 人类落子统一入口：合法性提示 + 产生新变着分支时提示（腾讯/野狐会在树上看到分叉） */
  function playHumanMove(x, y) {
    const cur = game().current;
    const isNewBranch = cur.children.length > 0 &&
      !game().findChild(cur, { color: toMove(), x, y, pass: false });
    const r = game().play(toMove(), x, y);
    if (!r.ok) {
      showToast(r.reason === 'occupied' ? t('illegalOccupied') : r.reason === 'ko' ? t('illegalKo') : t('illegalSuicide'));
      return false;
    }
    if (isNewBranch) showToast(t('branchCreated'));
    if(state.workspace==='play' && !state.problem)window.GoTGrowth?.activity('play','daily');
    afterMove();
    return true;
  }
  function humanPass() {
    if (state.problem) return;
    state.browsing = false;
    const cur = game().current;
    const isNewBranch = cur.children.length > 0 &&
      !game().findChild(cur, { color: toMove(), pass: true });
    game().pass(toMove());
    if (isNewBranch) showToast(t('branchCreated'));
    afterMove();
  }

  $('boardCanvas').addEventListener('click', (e) => {
    const p = renderer.pointAt(e.clientX, e.clientY);
    if (!p) return;
    if (state.mode === 'score') { toggleDead(p.x, p.y); return; }
    if (pickAnalysisMove) {
      if (position().board[p.y * game().size + p.x] !== EMPTY) return;
      const test = position().checkPlay(toMove(), p.y * game().size + p.x, undefined, !!GE.RULES[game().rules].superko);
      if (!test.ok) { showToast(t('illegalKo')); return; }
      analyzeSelectedMoves([{ x: p.x, y: p.y, pass: false }]);
      return;
    }
    if (state.previewNode) exitPreview();   // 预览不吞点击：收起后继续正常落子
    if (!isHumanTurn()) {
      /* 唯一"点了完全没反应"的分支是 result 非空——必须给提示，否则看起来像 bug */
      if (game().result && !state.practice) showToast(t('gameOverHint'));
      return;
    }
    // 落子确认模式（腾讯围棋风格）：第一次点击放待确认子，点同一位置确认，点别处改选
    if (state.confirmMove) {
      const pd = state.pendingMove;
      if (pd && pd.x === p.x && pd.y === p.y) {
        state.pendingMove = null;
        playHumanMove(p.x, p.y);
      } else {
        state.pendingMove = { x: p.x, y: p.y };
        renderBoard();
        renderSide();
      }
      return;
    }
    playHumanMove(p.x, p.y);
  });

  function afterMove() {
    state.browsing = false;
    moveSeq++;
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    state.pendingMove = null;
    exitPreview();
    clearAnalysisOverlay();
    const mv = game().current.move;
    if (mv && !mv.pass) playStoneSound(mv.color);
    if (mv && state.clock) Clock.onMove(state.clock, mv.color);   // 落子：读秒阶段重置本阶段
    renderAll();
    const pos = position();
    const prev = game().current.parent;
    const bothPassed = pos.lastWasPass && prev && prev.move && prev.move.pass;
    if (bothPassed && !game().result) {
      showToast(t('bothPassed'));
      enterScoreMode();
      return;
    }
    if (!game().result) {
      /* 引擎即将行棋时不再抢占分析通道（避免 stop/analyze 互相打架），其落子后随 afterMove 再析 */
      const engineNext = state.mode === 'play' && state.workspace !== 'review' &&
        state.opponent !== 'human' && toMove() !== state.humanColor;
      if (!engineNext) requestAnalysis(game().current);
      requestEngineMove();
    }
    if (state.problem && !state.problem.done) checkProblemMove();   // 死活题：逐手对照正解
    if (state.practice) judgePractice();                            // 复盘练习：对照 AI 首选
    updateQuality();
  }

  /* ================= scoring ================= */
  function enterScoreMode() {
    state.mode = 'score';
    $('scoreBtn').setAttribute('aria-pressed', 'true');
    $('scoreStrip').classList.remove('hidden');
    updateScoreUI();
    renderAll();
    autoMarkDead().then(() => { updateScoreUI(); renderBoard(); });
  }
  function exitScoreMode() {
    state.mode = 'play';
    state.deadStones.clear();
    state.scoreOwnership = null;
    state.aiScoreLead = null;
    state.aiScoreSource = null;
    $('scoreBtn').setAttribute('aria-pressed', 'false');
    $('scoreStrip').classList.add('hidden');
    renderAll();
  }
  function quickOwnership() {
    return new Promise((resolve) => {
      let settled = false;
      const nodeId = game().current.id;
      const onMsg = (e) => {
        const msg = e.data || {};
        if (msg.type === 'result' && msg.done && msg.ownership && msg.marker === 'ownership:' + nodeId) {
          settled = true;
          worker.removeEventListener('message', onMsg);
          /* 点目需要 AI 全套估算：ownership（死子/公气判定）+ scoreLead（AI 参考分） */
          resolve({ ownership: msg.ownership, scoreLead: typeof msg.scoreLead === 'number' ? msg.scoreLead : null, source: 'builtin' });
        }
      };
      worker.addEventListener('message', onMsg);
      invalidatePreview();
      worker.postMessage({ type: 'stop' });
      worker.postMessage({
        type: 'analyze',
        position: { size: game().size, komi: game().komi, rules: game().rules, toMove: toMove(), moves: movesListTo(game().current), setup: rootSetup() },
        opts: { strength: 6, topN: 1, timeMs: 1200, analysis: true },
        marker: 'ownership:' + nodeId
      });
      setTimeout(() => {
        worker.removeEventListener('message', onMsg);
        if (!settled) resolve(null);
      }, 4000);
    });
  }
  /* AI 估算（ownership + scoreLead）优先级：分析缓存 → GTP 引擎（KataGo）→ 内置 MCTS。
   * 点目要最强 AI：KataGo 在线时即使缓存来自内置引擎也重算一次；
   * GTP 失败则回退内置 MCTS，保证点目不会因引擎抖动而完全失去 AI。 */
  function fetchAiEstimate(force) {
    const node = game().current;
    const gtpReady = analysisEngineKind() === 'gtp';
    if (!force) {
      const cached = analysisCache.get(node.id);
      const usable = cached && (cached.ownership || typeof cached.scoreLeadBlack === 'number');
      // 缓存来自内置引擎但 KataGo 已在线：忽略缓存，改用 KataGo 重算
      if (usable && (!gtpReady || cached.kind === 'gtp')) {
        return Promise.resolve({
          ownership: cached.ownership || null,
          scoreLead: typeof cached.scoreLeadBlack === 'number' ? cached.scoreLeadBlack : null,
          source: cached.kind || null
        });
      }
    }
    if (gtpReady) {
      return gtp.analyze({
        size: game().size, komi: game().komi, rules: game().rules, toMove: toMove(),
        moves: movesListTo(node), setup: rootSetup(),
        seconds: 1.5, topN: 1, ownership: true
      }, { priority: 1 }).then(res => (res.ok)
        ? { ownership: res.ownership || null, scoreLead: typeof res.scoreLead === 'number' ? res.scoreLead : null, source: 'gtp' }
        : quickOwnership()).catch(() => quickOwnership());
    }
    return quickOwnership();
  }
  const fetchOwnership = fetchAiEstimate;   // 兼容旧调用名
  async function autoMarkDead(force) {
    state.deadStones.clear();
    const g = state.game;
    const ai = await fetchAiEstimate(force);
    /* 异步返回时可能已换局/退出数子，拒绝过期结果 */
    if (state.game !== g || state.mode !== 'score') return;
    const pos = position();
    const alive = GE.bensonAlive(pos);       // 无条件活块：任何路径都绝不判死
    state.scoreOwnership = (ai && ai.ownership) ? ai.ownership : null;
    state.aiScoreLead = ai ? ai.scoreLead : null;
    state.aiScoreSource = ai ? (ai.source || null) : null;
    if (ai && ai.ownership) {
      const ownership = ai.ownership;
      const b = pos.board;
      const seen = new Set();
      for (let i = 0; i < b.length; i++) {
        if (!b[i] || seen.has(i)) continue;
        const grp = pos.group(i);
        for (const s of grp.stones) seen.add(s);
        let sum = 0;
        for (const s of grp.stones) sum += ownership[s] || 0;
        const mean = sum / grp.stones.length;
        if ((b[i] === BLACK && mean < -0.45) || (b[i] === WHITE && mean > 0.45)) {
          for (const s of grp.stones) if (!alive.has(s)) state.deadStones.add(s);
        }
      }
      showToast(t('autoDeadDone'));
    } else {
      /* AI 不可用：Benson 全活保护下的双真眼启发式兜底，结果仅作初始建议（可点击翻转） */
      for (const s of GE.heuristicDead(pos, alive)) state.deadStones.add(s);
      showToast(t('heuristicDeadUsed'));
    }
  }
  function toggleDead(x, y) {
    const pos = position();
    const idx = y * game().size + x;
    if (!pos.board[idx]) return;
    const grp = pos.group(idx);
    const isDead = state.deadStones.has(idx);
    for (const s of grp.stones) {
      if (isDead) state.deadStones.delete(s); else state.deadStones.add(s);
    }
    updateScoreUI();
    renderBoard();
  }
  function currentScore() {
    return GE.scorePosition(position(), {
      dead: state.deadStones,
      komi: game().komi,
      scoring: (GE.RULES[game().rules] && GE.RULES[game().rules].scoring) || 'area',
      ownership: state.scoreOwnership,
      /* 有 AI 形势就用它逐点判全盘归属：黑/白点数直接来自引擎（KataGo 优先），
       * 而非纯 JS 洪泛。无 AI 时 ownership 为 null，自动回退规则算法。 */
      ownershipFull: !!state.scoreOwnership
    });
  }
  function updateScoreUI() {
    const g = game();
    const pos = position();
    const sc = currentScore();
    const rules = GE.RULES[g.rules] || GE.RULES.chinese;
    const isTerritory = rules.scoring === 'territory';
    $('scoreBlackPts').textContent = sc.black;
    $('scoreWhitePts').textContent = sc.white;
    $('scoreResultText').textContent = sc.result;
    $('stripBlack').textContent = sc.black;
    $('stripWhite').textContent = sc.white;
    // 明细行
    const deadB = sc.deadStones.filter(i => pos.board[i] === BLACK).length;
    const deadW = sc.deadStones.filter(i => pos.board[i] === WHITE).length;
    if (isTerritory) {
      $('sdStonesRow').style.display = 'none';
      $('sdPrisRow').style.display = '';
      $('sdPrisB').textContent = pos.captures[BLACK] + deadW;
      $('sdPrisW').textContent = pos.captures[WHITE] + deadB;
    } else {
      $('sdStonesRow').style.display = '';
      $('sdPrisRow').style.display = 'none';
      $('sdStonesB').textContent = sc.stonesB;
      $('sdStonesW').textContent = sc.stonesW;
    }
    $('sdTerrB').textContent = sc.terrB;
    $('sdTerrW').textContent = sc.terrW;
    $('sdKomi').textContent = g.komi;
    /* 公气 / 未定：让「黑+白−贴目 < 棋盘」有解释——中盘点目或 AI 归属不明确的点
     * 会落在这里。占比高时提示"局面未定型"，避免用户以为算错。 */
    const dameEl = $('sdDame');
    if (dameEl) dameEl.textContent = sc.dame;
    const dameHigh = sc.dame >= Math.max(3, g.size * g.size * 0.05);
    const dameNote = $('sdDameNote');
    if (dameNote) {
      dameNote.hidden = !dameHigh;
      if (dameHigh) dameNote.textContent = t('dameNote').replace('{n}', sc.dame);
    }
    /* AI 参考分行：scoreLead（黑正、含贴目）与规则数子互为对照——
     * 两者差距大 = 死子没标对；但局面未定型（公气多）时差异属正常，不再重复告警 */
    const aiEl = $('sdAiVal');
    if (aiEl) {
      const note = $('sdAiNote');
      if (typeof state.aiScoreLead === 'number') {
        const v = state.aiScoreLead;
        aiEl.textContent = (v >= 0 ? 'B+' : 'W+') + Math.abs(v).toFixed(1) + (lang === 'zh' ? ' 目' : '');
        const gap = Math.abs((sc.black - sc.white) - v);
        if (note) {
          note.hidden = dameHigh || gap <= 5;
          if (!note.hidden) note.textContent = t('aiMismatch') + ' (' + (lang === 'zh' ? '差 ' : 'diff ') + gap.toFixed(1) + ')';
        }
      } else {
        aiEl.textContent = t('aiRefNa');
        if (note) note.hidden = true;
      }
    }
    const ruleKeys = { chinese: 'ruleCn', japanese: 'ruleJp', korean: 'ruleKr' };
    const method = isTerritory ? t('methodTerr') : t('methodArea');
    /* 明确告知黑/白点数是谁给的：KataGo 形势 / 内置形势 / 纯规则算法 */
    const srcKey = state.aiScoreSource === 'gtp' ? 'scoredByAi'
      : state.aiScoreSource === 'builtin' ? 'scoredByBuiltin'
        : 'scoredByRules';
    $('sdRule').textContent = t(ruleKeys[g.rules] || 'ruleCn') + ' · ' + method +
      (g.handicap ? ' · ' + t('handicap') + ' ' + g.handicap : '') + ' · ' + t(srcKey);
  }

  /* ================= analysis UI ================= */
  function updateAnalysisUI(a, isProgress) {
    const hasWr = Number.isFinite(a.wrBlack);
    const wr = hasWr ? Math.max(0, Math.min(1, a.wrBlack)) : 0.5;
    $('winrateFill').style.width = (wr * 100).toFixed(1) + '%';
    $('winrateBlackLabel').textContent = hasWr ? Math.round(wr * 100) + '%' : '—';
    $('winrateWhiteLabel').textContent = hasWr ? Math.round((1 - wr) * 100) + '%' : '—';
    const sl = a.scoreLeadBlack;
    $('scoreLead').textContent = Number.isFinite(sl) ? (sl >= 0 ? 'B+' : 'W+') + Math.abs(sl).toFixed(1) : '—';
    $('engineMeta').textContent = a.label + (a.nps ? ' · ' + a.nps + ' n/s' : '') + (isProgress ? ' …' : '');
    $('engineMeta').title = [a.model, a.rules || game().rules, 'komi ' + game().komi, a.visits + ' visits'].filter(Boolean).join(' · ');
    $('candMeta').textContent = a.label || (a.visits ? a.visits + ' visits' : '');
    const list = $('candidateList');
    list.textContent = '';
    const rootV = a.candidates.length ? Math.max.apply(null, a.candidates.map(c => c.visits)) : 1;
    /* 排序方式可配置：visits = AI 偏好序（引擎输出原序），winrate = 纯胜率降序。
     * 缓存里的 a.candidates 始终保持 visits 序，这里只影响展示。 */
    const ordered = state.candSort === 'winrate'
      ? a.candidates.slice().sort((p, q) => (q.wrToMove || 0) - (p.wrToMove || 0))
      : a.candidates;
    const shown = ordered.slice(0, 5);
    const lastK = shown.length - 1;
    shown.forEach((c, k) => {
      const row = document.createElement('div');
      row.tabIndex = 0;
      row.className = 'candidate-row' + (k === 0 ? ' best' : '');
      row.setAttribute('role', 'option');
      const wrPct = Number.isFinite(c.wrToMove) ? (c.wrToMove * 100).toFixed(1) + '%' : '—';
      const loss = GtpClient.moveLoss(Number.isFinite(a.candidates[0] && a.candidates[0].scoreLeadBlack) ? a.candidates[0] : a, c, toMove());
      row.title = t('candidateDetail') + ' · ' + t('priorLabel') + ': ' + (Number.isFinite(c.prior) ? (c.prior * 100).toFixed(1) + '%' : '—');
      const moverColor = toMove() === BLACK ? '#0c0d0e' : '#ecebe4';
      const coordText = c.pass ? (lang === 'zh' ? '停着' : 'pass') : GE.coordName(game().size, c.x, c.y);
      /* 颜色按候选间相对排名：第 1 名绿、末位红，与绝对胜率无关 */
      const wrColor = k === 0 ? '#9fd8ae' : (k === lastK && lastK > 0 ? '#eb9a98' : 'var(--text-dim)');
      row.innerHTML =
        '<span class="cand-coord"><i style="background:' + moverColor + '"></i>' + coordText + '</span>' +
        '<span class="cand-wr" style="color:' + wrColor + '">' + wrPct + '</span>' +
        '<span class="cand-loss">' + (loss === null ? '—' : '−' + loss.toFixed(1) + t('pointsUnit')) + '</span>' +
        '<span class="cand-visits">' + c.visits + '</span>';
      row.addEventListener('focus', () => previewPv(c));
      row.addEventListener('blur', clearPreview);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); playCandidate(c); } });
      row.addEventListener('mouseenter', () => previewPv(c));
      row.addEventListener('mouseleave', clearPreview);
      row.addEventListener('click', () => playCandidate(c));
      list.appendChild(row);
    });
    /* PV 变化图：pvLine 升级为可点击的坐标 chip——
     * 点击第 k 手 → 推演前 1..k 手；再点当前已选 chip → 展开完整推演 */
    const pvEl = $('pvLine');
    pvEl.textContent = '';
    const pvCand = a.candidates.length ? a.candidates[0] : null;
    if (pvCand && pvCand.pv && pvCand.pv.length) {
      const pvPct = (typeof pvCand.wrToMove === 'number' && isFinite(pvCand.wrToMove)) ?
        Math.round(pvCand.wrToMove * 100) : null;
      let onChip = -1;
      pvCand.pv.forEach((m, i) => {
        const chip = document.createElement('span');
        chip.className = 'pv-chip';
        chip.tabIndex = 0;
        chip.textContent = m.pass ? (lang === 'zh' ? '停着' : 'pass')
          : GE.coordName(game().size, m.x, m.y);
        const showPrefix = (k) => {
          previewLine(pvCand.pv.slice(0, k + 1), toMove(), k === pvCand.pv.length - 1 ? pvPct : null);
          for (const el of pvEl.children) el.classList.toggle('on', el === chip);
          onChip = k;
        };
        const showFull = () => {
          previewLine(pvCand.pv, toMove(), pvPct);
          for (const el of pvEl.children) el.classList.toggle('on', el === chip);
          onChip = pvCand.pv.length - 1;
        };
        chip.addEventListener('click', () => { onChip === i ? showFull() : showPrefix(i); });
        chip.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChip === i ? showFull() : showPrefix(i); }
        });
        pvEl.appendChild(chip);
      });
    }
    $('candEmpty').hidden = a.candidates.length > 0;
    drawEvalGraph();
    if (state.mode === 'score') updateScoreUI();
    renderBoard();
  }

  function previewPv(cand) {
    const pct = (typeof cand.wrToMove === 'number' && isFinite(cand.wrToMove)) ? Math.round(cand.wrToMove * 100) : null;
    previewLine(cand.pv, toMove(), pct);
  }
  /* 变化图 chip 的选中态跟随预览：预览收起即取消高亮 */
  function clearPvChips() {
    const pvEl = $('pvLine');
    if (!pvEl) return;
    for (const el of pvEl.children) el.classList.remove('on');
  }
  function clearPreview() {
    clearPvChips();
    if (state.previewNode === 'pv') {
      state.previewNode = null;
      $('previewBadge').hidden = true;
      renderer.set({ preview: null });
      renderer.requestRender();
    }
  }
  function exitPreview() {
    cancelAutoPreview();
    clearPvChips();               // 否则收起预览后 chip 仍保持高亮
    state.previewNode = null;
    $('previewBadge').hidden = true;
    renderer.set({ preview: null });
  }
  function playCandidate(cand) {
    clearPreview();
    if (state.mode !== 'play') return;
    if (cand.pass) { if (isHumanTurn()) humanPass(); return; }
    const existing = game().findChild(game().current, { color: toMove(), x: cand.x, y: cand.y, pass: false });
    if (existing) { game().current = existing; afterMove(); return; }
    if (!isHumanTurn()) return;
    playHumanMove(cand.x, cand.y);
  }

  /* eval graph：胜率主曲线 + 目差副曲线 + 失误红点，点击任意位置跳转该手。
   * 曲线跟随当前所在路径（根→当前节点）——在分支变着里游走时所见即所析。 */
  function drawEvalGraph() {
    const canvas = $('evalGraph');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300, h = 72;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(139, 143, 153, .3)';
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    const nodes = timelineNodes();
    if (nodes.length < 2) return;
    const X = (i) => w * i / (nodes.length - 1);
    const yWr = (v) => h - v * h;
    const ySl = (v) => h * (1 - (Math.max(-15, Math.min(15, v)) + 15) / 30);
    // 胜率填充 + 主曲线
    const wrPts = [];
    nodes.forEach((n, i) => { if (typeof n.analysisWrBlack === 'number') wrPts.push([i, n.analysisWrBlack]); });
    if (wrPts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(X(wrPts[0][0]), h);
      wrPts.forEach(([i, v]) => ctx.lineTo(X(i), yWr(v)));
      ctx.lineTo(X(wrPts[wrPts.length - 1][0]), h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(147, 160, 201, .16)';
      ctx.fill();
      ctx.beginPath();
      wrPts.forEach(([i, v], k) => { if (k === 0) ctx.moveTo(X(i), yWr(v)); else ctx.lineTo(X(i), yWr(v)); });
      ctx.strokeStyle = '#93a0c9';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // 目差副曲线（琥珀色，±15 目量程）
    const slPts = [];
    nodes.forEach((n, i) => { if (typeof n.analysisScoreLeadBlack === 'number') slPts.push([i, n.analysisScoreLeadBlack]); });
    if (slPts.length >= 2) {
      ctx.beginPath();
      slPts.forEach(([i, v], k) => { if (k === 0) ctx.moveTo(X(i), ySl(v)); else ctx.lineTo(X(i), ySl(v)); });
      ctx.strokeStyle = 'rgba(217, 173, 96, .75)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // 失误红点（坏棋/败着）
    nodes.forEach((n, i) => {
      if (!n.review || (n.review.grade !== 'bad' && n.review.grade !== 'awful')) return;
      if (typeof n.analysisWrBlack !== 'number') return;
      ctx.beginPath();
      ctx.arc(X(i), yWr(n.analysisWrBlack), 3.2, 0, 7);
      ctx.fillStyle = n.review.grade === 'awful' ? '#eb9a98' : '#e8b977';
      ctx.fill();
    });
    // 当前位置
    const cur = game().current;
    const ci = nodes.indexOf(cur);
    if (ci >= 0 && typeof cur.analysisWrBlack === 'number') {
      ctx.beginPath();
      ctx.arc(X(ci), yWr(cur.analysisWrBlack), 3, 0, 7);
      ctx.fillStyle = '#d9ad60';
      ctx.fill();
    }
  }
  $('evalGraph').addEventListener('click', (e) => {
    const nodes = timelineNodes();
    if (nodes.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(nodes.length - 1,
      Math.round((e.clientX - rect.left) / Math.max(1, rect.width) * (nodes.length - 1))));
    goToNode(nodes[i]);
  });

  /* Workspace and navigation stay separate from scoring and game rules. */
  let timelineAnchor = null;
  function timelineNodes() {
    const g = game();
    const anchorPath = timelineAnchor ? g.pathFromRoot(timelineAnchor) : [];
    let nodes = anchorPath[0] === g.root && anchorPath.includes(g.current)
      ? anchorPath : g.pathFromRoot(g.current);
    nodes = nodes.slice();
    let tail = nodes[nodes.length - 1];
    while (tail && tail.children.length) { tail = tail.children[0]; nodes.push(tail); }
    timelineAnchor = tail;
    return nodes;
  }
  function updateTimeline() {
    const nodes = timelineNodes();
    const index = nodes.indexOf(game().current);
    $('timelinePosition').textContent = index + ' / ' + (nodes.length - 1);
    $('firstMoveBtn').disabled = $('previousMoveBtn').disabled = index <= 0;
    $('lastMoveBtn').disabled = $('nextMoveBtn').disabled = index >= nodes.length - 1;
  }
  function navigateTimeline(target) {
    const nodes = timelineNodes();
    const index = nodes.indexOf(game().current);
    const next = target === 'first' ? 0 : target === 'last' ? nodes.length - 1 : index + target;
    goToNode(nodes[Math.max(0, Math.min(nodes.length - 1, next))]);
  }
  function setWorkspace(name) {
    if(name==='review' && assessment && !assessment.finished){assessment=null;showToast(lang==='zh'?'进入复盘，本盘不计入测评':'Review opened; this game will not count toward assessment');}
    setMobilePanel(false);
    closeDialog('settingsDialog');
    closeDialog('problemDialog');
    if (window.GoTRecords) window.GoTRecords.close();
    const restored = !!state.problem;
    if (restored) problemExit(false);
    if (name !== 'play') exitPractice();   // 离开对局工作区即结束练习（还原对手/执子偏好）
    if (state.workspace === name) {
      syncWorkspaceUI();
      if (name === 'learn' && window.GoTLearning) window.GoTLearning.mount();
      if (restored) { requestAnalysis(game().current); requestEngineMove(); }
      return;
    }
    if (state.mode === 'score') exitScoreMode();
    cancelWorkspaceWork();
    stopAutoplay();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    invalidatePreview();
    worker.postMessage({ type: 'stop' });
    setThinking(BLACK, false); setThinking(WHITE, false);
    state.pendingMove = null;
    exitPreview();
    state.workspace = name;
    document.body.dataset.workspace = name;
    $('reviewToggleBtn').setAttribute('aria-pressed', String(name === 'review'));
    const learning = $('learningWorkspace');
    if (learning) learning.hidden = name !== 'learn';
    switchTab('analysis'); // 内部已 renderAll，不再重复调用
    if (name === 'review') scrollReviewIntoView();
    if (name === 'learn' && window.GoTLearning) window.GoTLearning.mount();
    if (!['learn', 'home'].includes(name)) requestAnalysis(game().current);
    if (name === 'play') requestEngineMove();
  }
  document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); setWorkspace('home'); });
  $('homeWorkspaceBtn').addEventListener('click', () => setWorkspace('home'));
  /* ================= 设置页 =================
   * 原来的「设置」只是转发到显示设置弹窗，点开毫无设置感；现在是真正的分区设置页，
   * 专项弹窗（引擎 / 显示 / 新对局）作为二级入口——同一控件只在原处存一份状态。 */
  function syncSettingsDialog() {
    const sel = $('setStrength');
    if (sel) {
      if (sel.options.length !== 9) {
        sel.textContent = '';
        const isGtp = analysisEngineKind() === 'gtp';
        for (let s = 1; s <= 9; s++) {
          const o = document.createElement('option');
          o.value = String(s);
          o.textContent = rankText(strengthRankNum(s, isGtp));
          sel.appendChild(o);
        }
      }
      sel.value = String(state.strength || 5);
    }
    const time = $('setTime'); if (time) time.value = String(state.timeMs || 1000);
    const st = $('setEngineState');
    if (st) st.textContent = t('settingsCurrent') + ($('enginePillText') ? $('enginePillText').textContent : '—');
    const ver = $('setVersion');
    if (ver) ver.textContent = 'GoT ' + (window.GOT_VERSION || '');
    const lb = $('setLang'); if (lb) lb.textContent = lang === 'zh' ? 'EN' : '中';
  }
  const settingsNav=document.createElement('nav'); settingsNav.className='settings-categories';
  const settingsSections=Array.from(document.querySelectorAll('#settingsDialog .settings-section'));
  // Reuse live controls: one set of values and handlers, no duplicated settings.
  const settingsPanels = [['engineDialog',1],['displayDialog',2]].map(([id,index]) => {
    const form = $(id).querySelector('form');
    const panel = document.createElement('div'); panel.className = 'settings-inline-panel';
    settingsSections[index].append(panel);
    return { form, panel, nodes: Array.from(form.children).filter(el => el.tagName !== 'H2') };
  });
  function placeSettingsPanels(inline) {
    for (const {form,panel,nodes} of settingsPanels) for (const node of nodes) (inline ? panel : form).append(node);
    $('settingsDialog').classList.toggle('settings-inline', inline);
  }
  const settingsButtons=settingsSections.map((section,index)=>{
    const button=document.createElement('button');button.type='button';button.className='tool-button';
    const heading=section.querySelector('h3');button.setAttribute('data-i18n',heading.dataset.i18n);button.textContent=heading.textContent;
    button.setAttribute('aria-pressed',String(index===0));section.hidden=index!==0;
    button.onclick=()=>{settingsSections.forEach((el,i)=>el.hidden=i!==index);settingsButtons.forEach((el,i)=>el.setAttribute('aria-pressed',String(i===index)));};
    settingsNav.append(button);return button;
  });
  document.querySelector('#settingsDialog .settings-page').before(settingsNav);
  $('shellSettingsBtn').addEventListener('click', () => {
    if ($('settingsDialog').open) { closeDialog('settingsDialog'); return; }
    closeDialog('problemDialog'); window.GoTRecords?.close(); syncSettingsDialog();
    $('bridgeUrl').value = gtp.baseUrl;
    $('engSeconds').value = String(state.analysisSeconds);
    $('dsCandColor').value = state.candColor; $('dsCandSort').value = state.candSort; $('themeSelect').value = state.theme;
    placeSettingsPanels(true);
    openDialog('settingsDialog'); $('shellSettingsBtn').setAttribute('aria-pressed', 'true');
  });
  $('settingsDialog').addEventListener('close', () => { if (!$('settingsDialog').open) { placeSettingsPanels(false); $('shellSettingsBtn').setAttribute('aria-pressed', 'false'); } });
  $('setStrength').addEventListener('change', () => {
    state.strength = Number($('setStrength').value) || 5;
    saveSettings(); refreshQuickStrength(); renderSide();
  });
  $('setTime').addEventListener('change', () => { state.timeMs = Number($('setTime').value) || 1000; saveSettings(); });
  $('setNewGame').addEventListener('click', () => { closeDialog('settingsDialog'); $('newGameBtn').click(); });
  $('setDisplay').addEventListener('click', () => { closeDialog('settingsDialog'); $('displaySettingsBtn').click(); });
  $('setLang').addEventListener('click', () => $('languageToggle').click());
  $('setAbout').addEventListener('click', () => { closeDialog('settingsDialog'); openDialog('aboutDialog'); });
  $('setClose').addEventListener('click', () => closeDialog('settingsDialog'));
  document.addEventListener('got:home-action', (e) => {
    const action = e.detail;
    if (action === 'play') setWorkspace('play');
    else if(action === 'review') setWorkspace('review');
    else if (action === 'import') $('openBtn').click();
    else { setWorkspace('learn'); if (window.GoTLearning) window.GoTLearning.setSection(action); }
  });
  $('reviewToggleBtn').addEventListener('click', () => setWorkspace('review'));
  $('playWorkspaceBtn').addEventListener('click', () => setWorkspace('play'));
  $('learnWorkspaceBtn').addEventListener('click', () => setWorkspace('learn'));
  function cancelWorkspaceWork() {
    reviewRunId++;
    if (state.reviewRunning) $('reviewProgress').textContent = t('reviewStop');
    state.reviewStop = true; if (reviewController) reviewController.abort();
    state.reviewRunning = false;
    $('reviewStartBtn').classList.remove('hidden');
    $('reviewStopBtn').classList.add('hidden');
    stopAutoplay();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    gtpAnalysisQueued = false;
    invalidatePreview();
    exitPreview();
  }
  function syncWorkspaceUI() {
    $('mobilePanelLabel').textContent = state.problem ? (lang === 'zh' ? '题目与选题' : 'Problem and directory') : (lang === 'zh' ? '分析与棋谱树' : 'Analysis and tree');
    $('taskContextTitle').textContent = game().gotTitle || (lang === 'zh' ? '当前棋局' : 'Current game');
    $('taskContextState').textContent = state.workspace === 'review' ? (lang === 'zh' ? '复盘 · 浏览与研究' : 'Review · Explore the game') : state.browsing ? (lang === 'zh' ? '浏览历史 · 从此处续弈可返回对局' : 'Browsing history · Resume here to play') : (lang === 'zh' ? '对局 · 当前局面' : 'Play · Current position');
    $('returnRecordsBtn').hidden = state.workspace !== 'review';
    document.body.dataset.workspace = state.workspace;
    const currentNav = {
      homeWorkspaceBtn: state.workspace === 'home',
      playWorkspaceBtn: !state.problem && state.workspace === 'play',
      learnWorkspaceBtn: !state.problem && state.workspace === 'learn',
      problemBtn: !!state.problem,
      reviewToggleBtn: !state.problem && state.workspace === 'review'
    };
    for (const [id, active] of Object.entries(currentNav)) {
      if (active) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
    }
    $('homeWorkspaceBtn').setAttribute('aria-pressed', String(state.workspace === 'home'));
    $('homeWorkspace').hidden = state.workspace !== 'home';
    if (state.workspace === 'home' && window.GoTHome) window.GoTHome.render({ size: game().size, stones: position().board, moves: moveNumberOf(game().current), lang, theme: state.theme });
    document.body.classList.toggle('analysis-active', state.analysisOn || analysisCache.has(game().current.id));
    $('playWorkspaceBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'play'));
    $('reviewToggleBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'review'));
    $('learnWorkspaceBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'learn'));
    const learning = $('learningWorkspace');
    if (learning) learning.hidden = state.workspace !== 'learn';
    $('problemBtn').setAttribute('aria-pressed', String(!!state.problem));
    $('analysisBtn').setAttribute('aria-pressed', String(state.analysisOn));
    $('analysisAction').textContent = t(state.analysisOn ? 'analysisPause' : 'analysisStart');
    $('analysisBtn').setAttribute('aria-label', $('analysisAction').textContent);
    $('analysisIntro').textContent = t(state.workspace === 'review' ? 'reviewIntro' : 'analysisIntro');
    const hasCurrentAnalysis = analysisCache.has(game().current.id);
    $('pageAnalysis').classList.toggle('analysis-empty', !state.analysisOn && !hasCurrentAnalysis);
    $('analysisEmptyState').hidden = state.analysisOn || hasCurrentAnalysis;
    $('resumePlayBtn').hidden = !state.browsing || state.workspace !== 'play' || !!state.problem || !!game().result;
    $('analysisState').textContent = state.analysisOn
      ? (analysisEngineKind() === 'gtp' ? (gtp.info.name || 'KataGo') : 'MCTS') : t('analysisPaused');
    $('ownershipBtn').disabled = !analysisCache.has(game().current.id) && !state.analysisOn;
    const native = !!(gtp.info && gtp.info.nativeAnalysis);
    for (const id of ['deepenBtn', 'analyzeMoveBtn', 'equalizeBtn']) {
      $(id).disabled = !native || !!state.problem || state.mode === 'score' || state.reviewRunning;
      $(id).title = t(native ? 'searchBudgetHint' : 'nativeRequired');
    }
    $('analyzeMoveBtn').setAttribute('aria-pressed', String(pickAnalysisMove));
    $('soundBtn').setAttribute('aria-pressed', String(state.soundOn));
    const depthSelect = $('reviewDepthSelect');
    if (depthSelect) {
      depthSelect.value = state.reviewDepth;
      depthSelect.disabled = state.reviewRunning;
      depthSelect.title = t('reviewDepthHint');
    }
    if (state.workspace === 'learn' && window.GoTLearning) window.GoTLearning.mount();
  }
  $('resumePlayBtn').addEventListener('click', () => {
    state.browsing = false;
    renderAll();
    requestEngineMove();
  });
  $('firstMoveBtn').addEventListener('click', () => navigateTimeline('first'));
  $('previousMoveBtn').addEventListener('click', () => navigateTimeline(-1));
  $('nextMoveBtn').addEventListener('click', () => navigateTimeline(1));
  $('lastMoveBtn').addEventListener('click', () => navigateTimeline('last'));
  $('focusBtn').addEventListener('click', () => {
    const focused = document.body.classList.toggle('focus-board');
    $('focusBtn').setAttribute('aria-pressed', String(focused));
  });
  new ResizeObserver(() => drawEvalGraph()).observe($('evalGraph'));

  /* ================= game tree ================= */
  function renderTree() {
    if (state.activeTab !== 'tree') return;
    const container = $('gameTree');
    container.textContent = '';
    const g = game();
    if (!g.root.children.length) {
      const empty = document.createElement('p');
      empty.className = 'tree-empty';
      empty.textContent = t('treeEmpty');
      container.appendChild(empty);
      return;
    }
    function walk(node, depth) {
      if (node !== g.root) {
        const row = document.createElement('div');
        row.className = 'tree-row';
        row.style.paddingLeft = Math.min(depth * 14, 220) + 'px';
        const nodeEl = document.createElement('span');
        const isCur = node === g.current;
        nodeEl.className = 'tree-node' + (isCur ? ' current' : '');
        const num = moveNumberOf(node);
        const label = node.move
          ? (node.move.pass ? (lang === 'zh' ? '停' : 'pass') : GE.coordName(g.size, node.move.x, node.move.y))
          : (node.setup ? '⊕' : '·');
        const branchMark = (node.parent && node.parent.children.length > 1 && node.parent.children[0] !== node)
          ? '▸ ' : '';
        nodeEl.innerHTML = '<b>' + num + '</b> ' + branchMark + label;
        nodeEl.addEventListener('click', () => goToNode(node));
        row.appendChild(nodeEl);
        container.appendChild(row);
      }
      node.children.forEach((c) => walk(c, depth + 1));
    }
    walk(g.root, 0);
    const cur = container.querySelector('.tree-node.current');
    if (cur && typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'nearest' });
  }
  function goToNode(node) {
    stopAutoplay();
    state.browsing = true;
    stopAutoplay();
    if (state.mode === 'score') exitScoreMode();
    game().current = node;
    syncProblemProgress();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    state.pendingMove = null;
    exitPreview();
    clearAnalysisOverlay();
    renderAll();
    requestAnalysis(node);
  }

  /* ================= move quality ================= */
  async function analyzeSelectedMoves(moves) {
    if (!gtp.info || !gtp.info.nativeAnalysis || state.reviewRunning || state.problem) return;
    const node = game().current, spec = specFor(node);
    const original = analysisCache.get(node.id);
    analysisSeq++; cancelNativeAnalysis();
    const seq = analysisSeq;
    requestedAnalysisNode = null;
    analysisController = new AbortController();
    const signal = analysisController.signal;
    state.analysisOn = true;
    syncWorkspaceUI();
    $('analysisState').textContent = t('comparingMoves');
    const results = [];
    try {
      // No time cap in normal operation: each restricted root receives 800 visits.
      // The server's 60s ceiling still bounds unexpectedly slow hardware.
      for (const selected of moves) {
        const raw = await gtp.analyze(Object.assign({}, spec, {
          allowMove: selected, maxVisits: 800, seconds: 60, topN: 1, ownership: false
        }), { signal, priority: 5 });
        if (seq !== analysisSeq) return;
        const a = GtpClient.normalizeAnalysis('gtp', raw, spec.toMove);
        if (a.candidates.length) results.push(a.candidates[0]);
      }
      const old = original && original.kind === 'gtp' ? original.candidates : [];
      const same = (a, b) => a.pass && b.pass || !a.pass && !b.pass && a.x === b.x && a.y === b.y;
      const candidates = results.concat(old.filter(c => !results.some(r => same(r,c))));
      const moverScore = c => Number.isFinite(c.scoreLeadBlack) ? c.scoreLeadBlack * (spec.toMove === BLACK ? 1 : -1) : -Infinity;
      candidates.sort((a,b) => moverScore(b) - moverScore(a));
      // Keep the explicitly requested move visible even when it is worse than the previous top five.
      while (candidates.length > 5) {
        const idx = candidates.map(c => !results.includes(c)).lastIndexOf(true);
        candidates.splice(idx < 0 ? candidates.length - 1 : idx, 1);
      }
      const a = Object.assign({}, original || {}, { kind: 'gtp', model: gtp.info.model || '', rules: game().rules,
        candidates, visits: original ? original.visits : 0,
        wrBlack: original ? original.wrBlack : null, scoreLeadBlack: original ? original.scoreLeadBlack : null,
        label: 'KataGo · ' + t('comparisonDone'), ownership: original ? original.ownership : null });
      // A forced move's root is not an unrestricted position evaluation.
      // Store compared candidates while retaining the original root baseline.
      analysisCache.set(node.id, a);
      updateAnalysisUI(a, false);
      $('analysisState').textContent = t('comparisonDone');
    } catch (e) {
      if (seq === analysisSeq && e.name !== 'AbortError') {
        $('analysisState').textContent = t('analysisFailed'); showToast(t('analysisFailed') + ': ' + e.message);
      }
    }
  }
  $('deepenBtn').addEventListener('click', () => {
    state.analysisOn = true; syncWorkspaceUI(); requestAnalysis(game().current, { deepen: true });
  });
  $('analyzeMoveBtn').addEventListener('click', () => {
    const selecting = !pickAnalysisMove;
    analysisSeq++; cancelNativeAnalysis(); requestedAnalysisNode = null;
    pickAnalysisMove = selecting;
    syncWorkspaceUI();
    if (selecting) { clearPreview(); showToast(t('pickMoveHint')); }
  });
  $('equalizeBtn').addEventListener('click', () => {
    const a = analysisCache.get(game().current.id);
    if (!a || !a.candidates.length) { showToast(t('analysisStart')); return; }
    analyzeSelectedMoves(a.candidates.slice(0, 5));
  });

  function updateQuality() {
    const node = game().current;
    const parent = node.parent;
    if (!node.move || !parent) {
      $('lastMoveCoord').textContent = '—';
      $('lastMoveQuality').textContent = '—';
      $('lastMoveQuality').className = 'quality-tag neutral';
      $('lastMoveDelta').textContent = '';
      return;
    }
    $('lastMoveCoord').textContent = coordOf(node);
    const loss = GtpClient.moveLoss(analysisCache.get(parent.id) || parent.review, analysisCache.get(node.id) || node.review, node.move.color);
    if (loss === null) {
      /* 分析进行中等待数据 → "…"；分析关闭（永远不会有数据）→ "—" */
      $('lastMoveQuality').textContent = state.analysisOn ? '…' : '—';
      $('lastMoveQuality').className = 'quality-tag neutral';
      $('lastMoveDelta').textContent = '';
      return;
    }
    const key = loss >= 5 ? 'qualityAwful' : loss >= 2 ? 'qualityBad' : 'qualityGood';
    $('lastMoveQuality').textContent = t(key);
    $('lastMoveQuality').className = 'quality-tag ' + (loss >= 5 ? 'awful' : loss >= 2 ? 'bad' : 'good');
    $('lastMoveDelta').textContent = '−' + loss.toFixed(1) + t('pointsUnit');
  }

  /* ================= review / training report ================= */
  /* 1.4 复盘深度：同一条复盘流程提供三个预算档位。棋局和分析结果仍只在
   * 当前会话内存中，档位本身是无害的界面偏好，可随设置记住。 */
  const REVIEW_DEPTHS = Object.freeze({
    quick: {
      scanVisits: 120, scanFactor: 0.2, scanMin: 0.25, scanMax: 1,
      deepenVisits: 800, deepenSeconds: 4, timeoutMs: 10000,
      builtinVisits: 100, builtinTimeMs: 220
    },
    standard: {
      scanVisits: 200, scanFactor: 0.4, scanMin: 0.4, scanMax: 4,
      deepenVisits: 1600, deepenSeconds: 8, timeoutMs: 15000,
      builtinVisits: 160, builtinTimeMs: 320
    },
    deep: {
      scanVisits: 400, scanFactor: 0.75, scanMin: 0.8, scanMax: 8,
      deepenVisits: 3200, deepenSeconds: 16, timeoutMs: 26000,
      builtinVisits: 320, builtinTimeMs: 650
    }
  });
  function reviewDepthProfile() {
    return REVIEW_DEPTHS[state.reviewDepth] || REVIEW_DEPTHS.standard;
  }
  function reviewNodes() {
    return [game().root].concat(game().mainLine());
  }
  function specFor(node) {
    const pos = game().positionAt(node);
    return {
      size: game().size, komi: game().komi, rules: game().rules, toMove: pos.turn,
      moves: movesListTo(node), setup: rootSetup()
    };
  }
  function analyzeNodeForReview(node, useGtp, stepIdx, deepen) {
    return new Promise((resolve) => {
      const depth = reviewDepthProfile();
      let settled = false;
      const done = (review) => {
        if (settled) return;
        settled = true;
        if (!useGtp) worker.removeEventListener('message', onMsg);
        resolve(review);
      };
      if (useGtp) {
        if (!gtp.info) return resolve(null);
        const spec = specFor(node);
        // 看门狗：桥接卡死时单手不能挂 90s——超时按失败处理，复盘可继续/可停止。
        // 请求级 timeoutMs 略大于看门狗：请求本身不会占队列 90s（默认超时）。
        let timedOut = false;
        const watchdog = setTimeout(() => { timedOut = true; done(null); }, depth.timeoutMs);
        const reviewSeconds = deepen ? depth.deepenSeconds :
          Math.max(depth.scanMin, Math.min(depth.scanMax, state.analysisSeconds * depth.scanFactor));
        const maxVisits = deepen ? depth.deepenVisits : depth.scanVisits;
        gtp.analyze(Object.assign({ seconds: reviewSeconds, maxVisits, topN: 5, ownership: false }, spec),
          { timeoutMs: depth.timeoutMs + 2000, signal: reviewController && reviewController.signal })
          .then(res => {
            clearTimeout(watchdog);
            if (timedOut) return;
            if (!res.ok || !res.candidates || !res.candidates.length) return done(null);
            const a = GtpClient.normalizeAnalysis('gtp', res, spec.toMove);
            done(Object.assign(a, { best: a.candidates[0] || null, cands: a.candidates }));
          })
          .catch(() => { clearTimeout(watchdog); if (!timedOut) done(null); });
        return;
      }
      // 内置引擎：小预算快扫（动态 marker 在 postMessage 前定义）
      const marker = 'review:' + reviewRunId + ':' + node.id + ':' + stepIdx;
      const onMsg = (e) => {
        const msg = e.data || {};
        if (msg.type !== 'result' || msg.marker !== marker) return;
        if (msg.error || !msg.done) return;
        done({
          kind: 'builtin', visits: msg.visits, wrBlack: msg.winrate,
          scoreLeadBlack: msg.scoreLead,
          best: msg.best || null,
          cands: (msg.candidates || []).map(c => c.pass ? { pass: true } : { x: c.x, y: c.y })
        });
      };
      worker.addEventListener('message', onMsg);
      invalidatePreview();
      worker.postMessage({
        type: 'analyze',
        position: specFor(node),
        opts: { maxVisits: depth.builtinVisits, timeMs: depth.builtinTimeMs, topN: 3, analysis: false },
        marker
      });
      setTimeout(() => done(null), Math.max(8000, depth.timeoutMs));
    });
  }
  function computeReviewMove(node, parent) {
    const rv = node.review || {};
    const p = parent.review || {};
    const actual = p.cands && p.cands.find(c => c.pass && node.move.pass || !c.pass && !node.move.pass && c.x === node.move.x && c.y === node.move.y);
    // Prefer the actual move evaluated in the same root search when sufficiently searched.
    const loss = node.move ? GtpClient.moveLoss(p, actual && actual.visits >= 100 && Number.isFinite(actual.scoreLeadBlack) ? actual : rv, node.move.color) : null;
    rv.loss = loss === null ? undefined : loss;
    rv.grade = loss === null ? undefined : loss < 0.5 ? 'best' : loss < 2 ? 'ok' : loss < 5 ? 'bad' : 'awful';
    rv.winrateLoss = Number.isFinite(p.wrBlack) && Number.isFinite(rv.wrBlack)
      ? Math.max(0, (p.wrBlack - rv.wrBlack) * (node.move.color === BLACK ? 1 : -1)) : null;
    // AI 吻合名次：实际落子在前一手 AI 候选中的排名（1=最佳）
    rv.matchRank = 0;
    if (p.cands && node.move) {
      for (let k = 0; k < p.cands.length; k++) {
        const c = p.cands[k];
        if (c.pass && node.move.pass) { rv.matchRank = k + 1; break; }
        if (!c.pass && !node.move.pass && c.x === node.move.x && c.y === node.move.y) { rv.matchRank = k + 1; break; }
      }
    }
    // 复盘结果回流：胜率曲线 / 逐手质量卡可直接使用
    if (typeof rv.wrBlack === 'number') {
      node.analysisWrBlack = rv.wrBlack;
      if (Number.isFinite(rv.scoreLeadBlack)) {
        node.analysisScoreLeadBlack = rv.scoreLeadBlack;
      }
    }
    node.review = rv;
  }
  async function runReview() {
    if (state.reviewRunning || state.problem) return;
    setWorkspace('review');
    const nodes = reviewNodes();
    if (nodes.length < 2) { showToast(t('reviewNoMoves')); return; }
    const useGtp = analysisEngineKind() === 'gtp';
    state.reviewRunning = true;
    syncWorkspaceUI();
    state.reviewStop = false;
    reviewController = new AbortController();
    const runId = ++reviewRunId;
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis(); requestedAnalysisNode = null; // 暂停实时分析
    $('reviewStartBtn').classList.add('hidden');
    $('reviewStopBtn').classList.remove('hidden');
    let completed = 0;
    for (const n of nodes) {
      delete n.review; delete n.analysisWrBlack; delete n.analysisScoreLeadBlack;
      analysisCache.delete(n.id);
    }
    for (let i = 0; i < nodes.length; i++) {
      if (state.reviewStop) break;
      setReviewProgress(i, nodes.length, false);
      const node = nodes[i];
      const rv = await analyzeNodeForReview(node, useGtp, i);
      if (runId !== reviewRunId) return;
      if (state.reviewStop) break;
      node.review = rv || { failed: true };
      completed = i + 1;
      if (rv) analysisCache.set(node.id, Object.assign({}, rv, { candidates: rv.candidates || [], label: (useGtp ? 'KataGo / GTP' : 'MCTS') + ' · ' + (rv.visits || 0) + 'v' }));
      if (typeof node.review.wrBlack === 'number' && node.analysisWrBlack === undefined) {
        node.analysisWrBlack = node.review.wrBlack;
        if (typeof node.review.scoreLeadBlack === 'number') node.analysisScoreLeadBlack = node.review.scoreLeadBlack;
      }
      if (i === 0) { /* root：仅记录基准胜率 */ }
      else computeReviewMove(node, nodes[i - 1]);
      renderReview(node);
      drawEvalGraph();
    }
    // Deepen both sides of a suspected mistake using the same budget.
    if (useGtp && gtp.info && gtp.info.nativeAnalysis && !state.reviewStop) {
      const targets = new Set();
      for (let i = 1; i < nodes.length; i++) if (nodes[i].review && nodes[i].review.loss >= 2) { targets.add(i - 1); targets.add(i); }
      let count = 0;
      for (const i of targets) {
        if (state.reviewStop) break;
        $('reviewProgress').textContent = t('reviewDeepening') + ' ' + (++count) + '/' + targets.size;
        const rv = await analyzeNodeForReview(nodes[i], true, i, true);
        if (runId !== reviewRunId) return;
        if (state.reviewStop) break;
        if (rv) {
          nodes[i].review = rv;
          analysisCache.set(nodes[i].id, Object.assign({}, rv, { label: 'KataGo · ' + rv.visits + 'v' }));
        }
      }
      for (let i = 1; i < nodes.length; i++) computeReviewMove(nodes[i], nodes[i - 1]);
    }
    setReviewProgress(completed, nodes.length, true);
    const failed = nodes.filter(n => !n.review || !Number.isFinite(n.review.scoreLeadBlack)).length;
    if (failed) $('reviewProgress').textContent += ' · ' + t('reviewFailed') + ' ' + failed;
    state.reviewRunning = false;
    $('reviewStartBtn').classList.remove('hidden');
    $('reviewStopBtn').classList.add('hidden');
    syncWorkspaceUI();
    renderReview();
    showToast(state.reviewStop ? t('reviewStop') : t('reviewDone'));
  }
  function stopReview() { state.reviewStop = true; if (reviewController) reviewController.abort(); }

  /* ================= 复盘自动播放（野狐/腾讯风格） ================= */
  function updateAutoplayBtn() {
    const b = $('autoplayBtn');
    b.setAttribute('aria-pressed', String(state.autoplay));
    const label = state.autoplay ? t('autoplayStop') : t('autoplay');
    b.title = label;
    b.setAttribute('aria-label', label);
  }
  function stopAutoplay() {
    if (!state.autoplay) return;
    state.autoplay = false;
    clearInterval(state.autoplayTimer);
    state.autoplayTimer = 0;
    updateAutoplayBtn();
  }
  function toggleAutoplay() {
    if (state.autoplay) { stopAutoplay(); return; }
    if (!game().current.children.length) { showToast(t('reviewNoMoves')); return; }
    state.autoplay = true;
    updateAutoplayBtn();
    state.autoplayTimer = setInterval(() => {
      const g = game();
      if (!g.current.children.length) { stopAutoplay(); renderAll(); renderReview(); return; }
      g.navChild(0);
      abandonEngine();
      analysisSeq++; cancelNativeAnalysis();
      requestedAnalysisNode = null;
      state.pendingMove = null;
      exitPreview();
      renderAll();
      renderReview();
      requestAnalysis(g.current);
    }, 900);
  }

  /* ================= KaTrain 风格"再练一手" =================
   * 回到失误前一手：人类执失误方，最强在线引擎（KataGo 优先）扮演对手 */
  function startPractice(node) {
    if (state.analysisOn) $('analysisBtn').click();
    stopAutoplay();
    const mover = node.move ? node.move.color : game().positionAt(node).turn;
    const target = node.parent || game().root;
    /* 连续练习时沿用最初的偏好，否则会把"上一次的练习态"当成原始值还原 */
    const prev = state.practice ? state.practice.prev : {
      humanColor: state.humanColor, opponent: state.opponent, engineKind: state.engineKind
    };
    if (state.mode === 'score') exitScoreMode();
    state.opponent = gtp.info ? 'gtp' : 'builtin';
    state.engineKind = state.opponent === 'gtp' ? 'gtp' : 'builtin';
    state.humanColor = mover;
    state.mode = 'play';
    /* 判定基准就是该局面的 AI 首选着法——复盘已经算过，落子后无需再跑引擎 */
    const pr = target.review || {};
    const best = pr.best || (pr.cands && pr.cands[0]) || null;
    state.practice = { prev, mover, moveNo: moveNumberOf(node), target, best, judged: false, result: null };
    saveSettings();
    goToNode(target);
    setWorkspace('play');
    switchTab('analysis');
    renderPractice();
    showToast(t('practiceStart'));
  }
  /* 退出练习：还原进入前的对手/执子偏好（不清空棋谱，练习分支保留在棋谱树里） */
  function exitPractice() {
    if (!state.practice) return;
    const p = state.practice;
    state.practice = null;
    state.humanColor = p.prev.humanColor;
    state.opponent = p.prev.opponent;
    state.engineKind = p.prev.engineKind;
    renderPractice();
  }
  function endPractice() {
    if (!state.practice) return;
    exitPractice();
    setWorkspace('review');
    switchTab('analysis');
    scrollReviewIntoView();
  }
  /* 练习判定：只比对"是否命中 AI 首选"，不做损失估算——估算需要重新跑引擎，
   * 且在候选数不足时会把合理着法误判成失误。未命中就直说 AI 推荐哪里，事实明确。 */
  function judgePractice() {
    const p = state.practice;
    if (!p || p.judged) return;
    const mv = game().current.move;
    if (!mv || mv.color !== p.mover) return;
    p.judged = true;
    const best = p.best;
    if (best && !best.pass && !mv.pass && best.x === mv.x && best.y === mv.y) {
      p.result = 'ok';
      showToast(t('practiceVerdictOk'));
    } else if (best && !best.pass) {
      p.result = 'miss';
      showToast(t('practiceMissToast').replace('{c}', GE.coordName(game().size, best.x, best.y)));
    } else {
      p.result = 'none';
      showToast(t('practiceNoBest'));
    }
    renderPractice();
  }
  /* 重来：回到失误前一手，保留你刚才的尝试作为分支（棋谱树里能看到） */
  function retryPractice() {
    const p = state.practice;
    if (!p || !p.target) return;
    goToNode(p.target);
    p.judged = false;
    p.result = null;
    renderPractice();
  }
  /* 练习提示条：常驻棋盘上方，说明执色与目标手数，判定后给出结果与重来入口 */
  function renderPractice() {
    const strip = $('practiceStrip');
    if (!strip) return;
    const p = state.practice;
    strip.classList.toggle('hidden', !p);
    if (!p) return;
    $('practiceStone').classList.toggle('white', p.mover === WHITE);
    $('practiceColor').textContent = (lang === 'zh' ? '你执' : 'You: ') + t(p.mover === BLACK ? 'black' : 'white');
    $('practiceTarget').textContent = t('practiceTargetPrefix') + p.moveNo + t('practiceTargetSuffix');
    const res = $('practiceResult');
    const best = p.best && !p.best.pass ? ' ' + GE.coordName(game().size, p.best.x, p.best.y) : '';
    res.textContent = p.result === 'ok' ? '✓ ' + t('practiceVerdictOk')
      : p.result === 'miss' ? '✗ ' + t('practiceVerdictMiss') + best
        : p.result === 'none' ? t('practiceNoBest') : '';
    res.className = p.result === 'ok' ? 'ps-ok' : p.result === 'miss' ? 'ps-miss' : '';
    $('practiceRetryBtn').hidden = !p.judged;
  }
  /* 失误跳转：沿主线找上一处/下一处损失 ≥ 2 目的手（与评测表的「练习」门槛一致） */
  function navBlunder(dir) {
    const main = game().mainLine();
    const blunders = main.filter(n => n.move && n.review && n.review.loss >= 2);
    if (!blunders.length) { showToast(t('noBlunders')); return; }
    const ci = main.indexOf(game().current);
    let target = null;
    if (dir > 0) { for (const n of blunders) { if (main.indexOf(n) > ci) { target = n; break; } } }
    else { for (let k = blunders.length - 1; k >= 0; k--) { if (main.indexOf(blunders[k]) < ci) { target = blunders[k]; break; } } }
    if (!target) { showToast(t('noBlunders')); return; }
    goToNode(target);
    switchTab('analysis');
    scrollReviewIntoView();
  }
  /* 落子音效：合成清脆的真实棋子声——高频敲击 + 木质共鸣 + 桌体低频 */
  let audioCtx = null;
  /* 解题成功的正反馈音：上行三音琶音（C5-E5-G5，三角波）。教育类产品里
   * "答对"必须有可感知的奖励，仅一行小字太弱。与落子音共用 AudioContext 与音效开关。 */
  function playSuccessSound() {
    if (!state.soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { });
      const t0 = audioCtx.currentTime;
      [[523.25, 0], [659.25, 0.09], [783.99, 0.18]].forEach(([f, dt]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.28);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + dt); o.stop(t0 + dt + 0.3);
      });
    } catch (e) { /* 音频不可用不影响解题 */ }
  }
  /* 低时提醒：两声短促方波"滴滴"（≤10s 首次触发一次，避免每秒都响）。 */
  function playLowTimeSound() {
    if (!state.soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { });
      const t0 = audioCtx.currentTime;
      [0, 0.16].forEach(dt => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.09);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + dt); o.stop(t0 + dt + 0.1);
      });
    } catch (e) { /* 音频不可用不影响对局 */ }
  }
  function playStoneSound(color) {
    if (!state.soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { });
      const t0 = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.gain.value = 0.9;
      master.connect(audioCtx.destination);
      const pitch = (color === BLACK ? 0.94 : 1.05) * (0.98 + Math.random() * 0.04);
      // 1) 敲击瞬态：短噪声过带通，形成清脆 "嗒"
      const len = Math.floor(audioCtx.sampleRate * 0.05);
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600 * pitch;
      bp.Q.value = 0.9;
      const nGain = audioCtx.createGain();
      nGain.gain.setValueAtTime(0.85, t0);
      nGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
      noise.connect(bp); bp.connect(nGain); nGain.connect(master);
      noise.start(t0);
      // 2) 木质共鸣：两枚快速衰减的泛音
      [[2093 * pitch, 0.09, 0.30], [3150 * pitch, 0.05, 0.14]].forEach(([f, dur, vol]) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(master);
        osc.start(t0); osc.stop(t0 + dur + 0.01);
      });
      // 3) 棋盘低频 "咚"（触底感）
      const thump = audioCtx.createOscillator();
      const tGain = audioCtx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(175 * pitch, t0);
      thump.frequency.exponentialRampToValueAtTime(120 * pitch, t0 + 0.07);
      tGain.gain.setValueAtTime(0.28, t0);
      tGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      thump.connect(tGain); tGain.connect(master);
      thump.start(t0); thump.stop(t0 + 0.1);
    } catch (e) { /* 音频不可用则静默 */ }
  }
  function setReviewProgress(done, total, finished) {
    const pct = total ? Math.round(100 * done / total) : 0;
    $('reviewBar').style.width = pct + '%';
    $('reviewProgress').textContent =
      finished ? (state.reviewStop ? t('reviewStop') : t('reviewDone')) : t('reviewRunning') + ' ' + done + '/' + total;
  }
  function fmtWrPct(wrBlack, mover) {
    if (typeof wrBlack !== 'number') return '—';
    const wr = mover === BLACK ? wrBlack : 1 - wrBlack;
    return Math.round(wr * 100) + '%';
  }
  function reviewRowHtml(node, moveNo) {
    const rv = node.review || {};
    const mover = node.move.color;
    const coord = node.move.pass ? t('pass') : GE.coordName(game().size, node.move.x, node.move.y);
    let slTxt = '—';
    if (typeof rv.scoreLeadBlack === 'number') slTxt = (rv.scoreLeadBlack >= 0 ? 'B+' : 'W+') + Math.abs(rv.scoreLeadBlack).toFixed(1);
    const lossTxt = rv.loss !== undefined ? '-' + rv.loss.toFixed(1) + t('pointsUnit') : '—';
    const lossCls = rv.loss !== undefined ? (rv.loss >= 5 ? 'rv-loss-awful' : rv.loss >= 2 ? 'rv-loss-neg' : '') : '';
    let gradeTxt = '—', gradeCls = 'ok';
    if (rv.grade) {
      gradeCls = rv.grade;
      gradeTxt = rv.grade === 'best' ? t('qualityGood') : rv.grade === 'ok' ? t('gradeOk') :
        rv.grade === 'bad' ? t('qualityBad') : t('qualityAwful');
    }
    let aiTxt = '—', aiCls = '';
    if (rv.matchRank === 1) { aiTxt = '#1'; aiCls = 'rank1'; }
    else if (rv.matchRank === 2 || rv.matchRank === 3) { aiTxt = '#' + rv.matchRank; aiCls = 'rank23'; }
    else if (rv.matchRank === 0 && rv.wrBlack !== undefined) { aiTxt = '✗'; aiCls = 'miss'; }
    const canDrill = rv.loss !== undefined && rv.loss >= 2 && !node.move.pass && !state.reviewRunning;
    return {
      cls: 'rv-move' + (node === game().current ? ' current' : ''),
      html:
        '<td>' + moveNo + '</td>' +
        '<td><i class="rv-stone ' + (mover === BLACK ? 'black' : 'white') + '"></i></td>' +
        '<td class="rv-coord">' + coord + '</td>' +
        '<td>' + fmtWrPct(rv.wrBlack, mover) + '</td>' +
        '<td>' + slTxt + '</td>' +
        '<td class="' + lossCls + '">' + lossTxt + '</td>' +
        '<td><span class="grade-badge ' + gradeCls + '">' + gradeTxt + '</span></td>' +
        '<td><span class="rv-ai ' + aiCls + '">' + aiTxt + '</span></td>' +
        '<td>' + (canDrill ? '<button type="button" class="rv-practice" title="' + t('practiceTip') + '">' + t('practice') + '</button>' : '') + '</td>'
    };
  }
  function reviewBindRow(tr, node) {
    const rv = node.review || {};
    tr.title = [rv.kind || '', rv.model || '', (rv.visits || 0) + ' visits',
      Number.isFinite(rv.winrateLoss) ? 'ΔWR −' + (rv.winrateLoss * 100).toFixed(1) + 'pp' : ''].filter(Boolean).join(' · ');
    tr.addEventListener('click', () => goToNode(node));
    const parentBest = node.parent && node.parent.review && node.parent.review.cands && node.parent.review.cands[0];
    if (parentBest && parentBest.pv && parentBest.pv.length) {
      for (const actual of [true, false]) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = actual ? 'rv-actual' : 'rv-best';
        button.textContent = t(actual ? 'viewActual' : 'viewBest');
        button.addEventListener('click', e => {
          e.stopPropagation(); goToNode(node.parent);
          analysisSeq++; cancelNativeAnalysis(); requestedAnalysisNode = null;
          const reply = node.review && node.review.cands && node.review.cands[0];
          previewLine(actual ? [node.move].concat(reply && reply.pv || []) : parentBest.pv, node.move.color, null);
          $('previewBadge').textContent = t(actual ? 'viewActual' : 'viewBest');
        });
        tr.lastElementChild.appendChild(button);
      }
    }
    const drillBtn = tr.querySelector('.rv-practice');
    if (drillBtn) drillBtn.addEventListener('click', (e) => { e.stopPropagation(); startPractice(node); });
  }
  /* 复盘完成后把最值得重练的几手提到表格上方，减少在长棋谱里寻找失误的
   * 认知负担。这里建立的是当前会话的派生视图，不会创建棋谱缓存或写磁盘。 */
  function renderReviewFocus(moves) {
    const el = $('reviewFocus');
    if (!el) return;
    const focus = moves.filter(n => n.move && !n.move.pass && n.review &&
      Number.isFinite(n.review.loss) && n.review.loss >= 2)
      .sort((a, b) => b.review.loss - a.review.loss)
      .slice(0, 5);
    if (!focus.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = '';
    const head = document.createElement('div');
    head.className = 'review-focus-head';
    const title = document.createElement('strong');
    title.textContent = t('reviewFocus');
    const hint = document.createElement('span');
    hint.textContent = t('reviewFocusHint');
    head.append(title, hint);
    el.appendChild(head);
    const list = document.createElement('div');
    list.className = 'review-focus-list';
    const timeline = reviewNodes();
    focus.forEach((node, index) => {
      const item = document.createElement('div');
      item.className = 'review-focus-item';
      item.title = t('reviewFocusLocate');
      const rank = document.createElement('span');
      rank.className = 'review-focus-rank';
      rank.textContent = String(index + 1);
      const move = document.createElement('button');
      move.type = 'button';
      move.className = 'review-focus-move';
      move.title = t('reviewFocusLocate');
      const moveNo = document.createElement('b');
      moveNo.textContent = '#' + Math.max(1, timeline.indexOf(node));
      const stone = document.createElement('i');
      stone.className = 'rv-stone ' + (node.move.color === BLACK ? 'black' : 'white');
      const coord = document.createElement('span');
      coord.textContent = GE.coordName(game().size, node.move.x, node.move.y);
      move.append(moveNo, stone, coord);
      move.addEventListener('click', () => goToNode(node));
      const loss = document.createElement('span');
      loss.className = 'review-focus-loss';
      loss.textContent = '-' + node.review.loss.toFixed(1) + t('pointsUnit');
      const drill = document.createElement('button');
      drill.type = 'button';
      drill.className = 'review-focus-practice';
      drill.textContent = t('practice');   // 与每手评测表的「练习」按钮文案保持一致
      drill.addEventListener('click', () => startPractice(node));
      item.append(rank, move, loss, drill);
      list.appendChild(item);
    });
    el.appendChild(list);
  }
  /* updatedNode：runReview 每分析完一手传入，仅更新该行（200 手对局由 O(n²) 降到 O(n)）；
   * 其余调用（导航/换局/语言/复盘结束）全量重建。 */
  function renderReview(updatedNode) {
    if (state.activeTab !== 'analysis') return;
    const nodes = reviewNodes();
    const moves = nodes.filter(n => n.move);
    const hasData = moves.some(n => n.review && Number.isFinite(n.review.wrBlack));
    $('reviewEmpty').hidden = hasData || state.reviewRunning;
    // —— 技术统计卡 ——
    const summary = $('reviewSummary');
    if (!hasData) { summary.hidden = true; summary.textContent = ''; renderReviewFocus([]); }
    else {
      summary.hidden = false;
      summary.textContent = '';
      const stat = (color) => {
        const ms = moves.filter(n => n.move.color === color && n.review && n.review.loss !== undefined);
        const n = ms.length;
        const match1 = ms.filter(m => m.review.matchRank === 1).length;
        const match3 = ms.filter(m => m.review.matchRank >= 1 && m.review.matchRank <= 3).length;
        const avgLoss = n ? ms.reduce((a, m) => a + m.review.loss, 0) / n : 0;
        const grades = { best: 0, ok: 0, bad: 0, awful: 0 };
        ms.forEach(m => grades[m.review.grade]++);
        let worst = null;
        for (const m of ms) if (!worst || m.review.loss > worst.review.loss) worst = m;
        return { color, n, match1, match3, avgLoss, grades, worst };
      };
      for (const color of [BLACK, WHITE]) {
        const s = stat(color);
        const card = document.createElement('div');
        card.className = 'review-card';
        const worstTxt = s.worst
          ? (s.worst.move.pass ? t('pass') : GE.coordName(game().size, s.worst.move.x, s.worst.move.y)) +
            ' -' + s.worst.review.loss.toFixed(1) + t('pointsUnit')
          : '—';
        const rate1 = s.n ? Math.round(100 * s.match1 / s.n) : 0;
        const rate3 = s.n ? Math.round(100 * s.match3 / s.n) : 0;
        card.innerHTML =
          '<h4><i class="rv-stone ' + (color === BLACK ? 'black' : 'white') + '"></i>' +
          (game().playerNames[color] || (color === BLACK ? t('black') : t('white'))) + '</h4>' +
          '<div class="review-stats">' +
          '<span>' + t('aiMatch') + '</span><b class="' + (rate1 >= 60 ? 'match-hi' : rate1 < 35 ? 'match-lo' : '') + '">' + rate1 + '%</b>' +
          '<span>' + t('top3Match') + '</span><b>' + rate3 + '%</b>' +
          '<span>' + t('avgLoss') + '</span><b>-' + s.avgLoss.toFixed(2) + t('pointsUnit') + '</b>' +
          '<span>' + t('qualityGood') + '/' + t('gradeOk') + '</span><b>' + s.grades.best + ' / ' + s.grades.ok + '</b>' +
          '<span>' + t('qualityBad') + '/' + t('qualityAwful') + '</span><b>' + s.grades.bad + ' / ' + s.grades.awful + '</b>' +
          '<span>' + t('worstMove') + '</span><b>' + worstTxt + '</b>' +
          '</div>';
        summary.appendChild(card);
      }
      renderReviewFocus(moves);
    }
    // —— 每手明细表 ——
    const table = $('reviewTable');
    // 增量路径：复盘中且指定了刚分析完的节点 → 只更新该行
    if (updatedNode && state.reviewRunning && table.tBodies.length === 1) {
      const idx = moves.indexOf(updatedNode);
      if (idx >= 0) {
        const tr = table.tBodies[0].rows[idx];
        if (tr) {
          const row = reviewRowHtml(updatedNode, idx + 1);
          const fresh = document.createElement('tr');
          fresh.className = row.cls;
          fresh.innerHTML = row.html;
          reviewBindRow(fresh, updatedNode);
          tr.replaceWith(fresh);
          return;
        }
      }
    }
    table.textContent = '';
    if (!hasData && !state.reviewRunning) return;
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>#</th><th></th><th>' + t('thCoord') + '</th><th>' + t('thWinrate') + '</th><th>' +
      t('thScore') + '</th><th>' + t('thLoss') + '</th><th>' + t('thGrade') + '</th><th>' + t('thAi') + '</th><th></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    let moveNo = 0;
    for (const node of nodes) {
      if (!node.move) continue;
      moveNo++;
      const row = reviewRowHtml(node, moveNo);
      const tr = document.createElement('tr');
      tr.className = row.cls;
      tr.innerHTML = row.html;
      reviewBindRow(tr, node);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  /* ================= master render ================= */
  function renderBoard() {
    const pos = position();
    const g = game();
    const cached = analysisCache.get(g.current.id);
    let candidateData = (state.analysisOn && cached && cached.candidates || []).map(c => ({
      x: c.x, y: c.y, visits: c.visits, pass: c.pass, wrToMove: c.wrToMove
    }));
    if (state.candSort === 'winrate') {
      candidateData = candidateData.slice().sort((p, q) => (q.wrToMove || 0) - (p.wrToMove || 0));
    }
    renderer.set({
      size: g.size,
      stones: pos.board,
      lastMove: pos.lastMove,
      moveNumbers: state.showNumbers ? buildNumbersFromPath() : null,
      candidates: candidateData,
      candColorMode: state.candColor,
      ownership: cached ? cached.ownership : null,
      showOwnership: state.showOwnership && state.analysisOn && !state.problem,
      territory: state.mode === 'score' ? currentScore().territory : null,
      dame: state.mode === 'score' ? currentScore().dameMask : null,
      dead: state.mode === 'score' ? state.deadStones : null,
      preview: renderer.opts.preview,
      hover: renderer.opts.hover,
      pending: state.pendingMove ? { x: state.pendingMove.x, y: state.pendingMove.y, color: toMove() } : null,
      flip: state.flip,
      showCoords: state.showCoords,
      showNumbers: state.showNumbers,
      theme: state.theme,
      toMove: pos.turn
    });
    renderer.requestRender();
  }
  function buildNumbersFromPath() {
    const map = new Map();
    let n = 0;
    for (const node of game().pathFromRoot(game().current)) {
      if (node.move && !node.move.pass) map.set(node.move.y * game().size + node.move.x, ++n);
    }
    return map;
  }
  function sideIsEngine(color) {
    if (state.opponent === 'human') return false;
    return color !== state.humanColor;
  }
  function engineLabel() {
    if (state.opponent === 'gtp') return (gtp.info && gtp.info.name) || 'GTP';
    return (lang === 'zh' ? '内置 MCTS · ' : 'MCTS · ') + rankText(strengthRankNum(assessmentStrength(), false));
  }
  function renderSide() {
    const g = game();
    const pos = position();
    $('blackCaptures').textContent = pos.captures[BLACK];
    $('whiteCaptures').textContent = pos.captures[WHITE];
    const ruleKeys = { chinese: 'ruleCn', japanese: 'ruleJp', korean: 'ruleKr' };
    $('infoRule').textContent = t(ruleKeys[g.rules] || 'ruleCn');
    $('infoKomi').textContent = g.komi;
    $('infoHandicap').textContent = g.handicap || 0;
    $('infoMoves').textContent = moveNumberOf(g.current);
    $('infoResult').textContent = g.result || '—';
    $('infoHandicapItem').hidden = !(g.handicap > 0);
    $('infoResultItem').hidden = !g.result;
    $('blackName').textContent = g.playerNames[BLACK] || t('black');
    $('whiteName').textContent = g.playerNames[WHITE] || t('white');
    /* 段位/引擎说明与名字语义重复时（如"MCTS 5"配"内置 MCTS · 5"）不再显示第二行 */
    const core = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
    const rankOf = (color) => {
      const name = g.playerNames[color] || '';
      const rank = g.playerRanks[color] || (sideIsEngine(color) ? engineLabel() : '');
      if (!rank || !name) return rank;
      const cn = core(name), cr = core(rank);
      return (cn && cr && (cn.indexOf(cr) >= 0 || cr.indexOf(cn) >= 0)) ? '' : rank;
    };
    $('blackRank').textContent = rankOf(BLACK);
    $('whiteRank').textContent = rankOf(WHITE);
    $('blackCard').classList.toggle('active', pos.turn === BLACK && !g.result && state.mode === 'play');
    $('whiteCard').classList.toggle('active', pos.turn === WHITE && !g.result && state.mode === 'play');
    $('statusNav').textContent = state.previewNode ? t('previewing')
      : state.pendingMove ? t('pendingConfirm')
        : state.browsing ? t('browsingPosition') : t('livePosition');
    updateClockUI();
    refreshQuickStrength();
  }
  function renderAll() {
    if (!state.game) return;
    renderAssessment();
    syncWorkspaceUI();
    if (state.problem) renderProblemBanner();
    renderBoard();
    renderSide();
    renderTree();
    syncCommentBox();
    renderReview();
    updateQuality();
    const cached = analysisCache.get(game().current.id);
    if (cached) updateAnalysisUI(cached);
    else {
      $('winrateFill').style.width = '50%';
      $('winrateBlackLabel').textContent = '—';
      $('winrateWhiteLabel').textContent = '—';
      $('scoreLead').textContent = '—';
      $('candidateList').textContent = '';
      $('pvLine').textContent = '';
      $('candEmpty').hidden = false;
    }
    updateTimeline();
    drawEvalGraph();
    $('undoBtn').disabled = !game().current.parent;
    $('redoBtn').disabled = !game().current.children.length;
    $('statusEngine').textContent = state.practice ? t('practiceActive')
      : state.workspace === 'home' ? t('homeWorkspace')
      : state.workspace === 'learn' ? t('learningWorkspaceStatus')
      : state.workspace === 'review' ? t('reviewPosition')
      : game().result ? t('gameOver') : (isHumanTurn() ? t('youTurn') : t('ready'));
  }

  /* ================= actions ================= */
  function doUndo() {
    if(assessment && assessment.game===game())assessment=null;
    state.browsing = false;
    const g = game();
    if (!g.current.parent) return;
    stopAutoplay();
    if (state.mode === 'score') exitScoreMode();
    g.navParent();
    if (!state.problem || !state.problem.undoing) syncProblemProgress();
    if (state.workspace === 'play' && state.opponent !== 'human' && state.mode === 'play') {
      let guard = 3;
      while (guard-- > 0 && g.current.parent && !game().result && position().turn !== state.humanColor) {
        g.navParent();
      }
    }
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    state.pendingMove = null;
    exitPreview();
    clearAnalysisOverlay();
    renderAll();
    requestAnalysis(g.current);
  }
  function doRedo() {
    const g = game();
    if (!g.current.children.length) return;
    stopAutoplay();
    if (state.mode === 'score') exitScoreMode();
    g.navChild(0);
    state.browsing = !!g.current.children.length;
    syncProblemProgress();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    state.pendingMove = null;
    exitPreview();
    clearAnalysisOverlay();
    renderAll();
    /* 仅当重放到线尾且轮到引擎时才请求引擎续弈，中途重放不再让引擎重新生成（避免分叉） */
    if (!g.current.children.length && state.workspace === 'play' && effOpponent() !== 'human' &&
        state.mode === 'play' && !game().result && position().turn !== state.humanColor) {
      requestEngineMove();
    } else {
      requestAnalysis(g.current);
    }
  }
  function newGame(opts) {
    assessment=null;
    setMobilePanel(false);
    cancelWorkspaceWork();
    restoreProblemPreferences();
    state.problemPrev = null;
    state.browsing = false;
    if (state.practice) { state.practice = null; renderPractice(); }   // 新局不继承练习态
    /* 退出死活题模式：新对局即回到正常对弈（还原对手偏好在 problemExit 已完成） */
    if (state.problem) {
      state.problem = null;
      const pb = $('problemBanner'); if (pb) pb.classList.add('hidden');
      renderer.set({ preview: [] });
    }
    syncProblemMode();   // 无条件同步：problemExit 可能已先置空，路径不同但标记必须一致
    /* 中断进行中的复盘与数子，避免旧状态污染新对局 */
    if (state.reviewRunning) {
      state.reviewStop = true; state.reviewRunning = false;
      $('reviewStartBtn').classList.remove('hidden');
      $('reviewStopBtn').classList.add('hidden');
    }
    if (state.mode === 'score') exitScoreMode();
    state.workspace = 'play';
    document.body.dataset.workspace = 'play';
    $('reviewToggleBtn').setAttribute('aria-pressed', 'false');
    const learning = $('learningWorkspace'); if (learning) learning.hidden = true;
    state.game = new GE.Game(opts);
    if (opts.names) {
      game().playerNames[BLACK] = opts.names[BLACK] || '';
      game().playerNames[WHITE] = opts.names[WHITE] || '';
    }
    if (opts.ranks) {
      game().playerRanks[BLACK] = opts.ranks[BLACK] || '';
      game().playerRanks[WHITE] = opts.ranks[WHITE] || '';
    }
    state.mode = 'play';
    clearPvChips();               // 新局：清掉上一局残留的 chip 高亮
    state.previewNode = null;
    state.pendingMove = null;
    state.deadStones.clear();
    clearAnalysisOverlay();
    stopAutoplay();
    analysisCache.clear();
    setClock(state.clockPreset);   // 按当前计时档重建（off → null，不显示时钟）
    game().timeControl = state.clock
      ? { main: state.clock.main, byo: state.clock.byo, periods: state.clock.periods } : null;
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    renderAll();
    requestAnalysis(game().current);
    if (effOpponent() !== 'human' && position().turn !== state.humanColor) requestEngineMove();
  }
  /* 棋局内容【不】再写入 localStorage（2026-09-07 用户要求）：
   * localStorage 只存设置（got.settings / got.lang），对局数据一律在内存里，
   * 想留存棋谱用「保存」下载 SGF 文件。原先的 got.sgf 自动存盘已整体移除。 */

  /* ================= 死活题（Life & Death） =================
   * 数据来自 problems/problems.js（window.GOT_PROBLEMS），全部取自公有领域古典棋谱。
   * 模式要点：opponent='human' → 人类走双方、引擎不自动应手、分析通道不抢占；
   * 仅把题目初始局面摆到棋盘，对照预存正解序列逐手判定对错。 */
  function getProblemData() {
    return (typeof window !== 'undefined' && window.GOT_PROBLEMS) ? window.GOT_PROBLEMS : null;
  }
  const problemExpanded = new Set(['xxqj']);
  let problemQuery = '', problemCompletion = 'all';
  let problemScrollTop = 0;
  let problemListEl = null;     // 死活题网格容器（动态创建，避免 $() 查询未落 DOM 的 id）
  let problemCountEl = null;    // 与棋谱目录共用的匹配数量状态
  let problemRankEl = null;     // 段位筛选行
  let problemRank = 'all';      // 当前段位筛选：'all' 或 rankNum 数值
  const PROBLEM_PROGRESS_KEY = 'got.problemProgress';
  let problemProgress = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PROBLEM_PROGRESS_KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const out = {};
      for (const [id, value] of Object.entries(raw)) {
        if (!value || typeof value !== 'object') continue;
        out[id] = {
          solved: value.solved === true,
          viewed: value.viewed === true,
          assisted: value.assisted === true,
          attempts: Number.isFinite(value.attempts) ? Math.max(0, Math.floor(value.attempts)) : 0,
          hints: Number.isFinite(value.hints) ? Math.max(0, Math.floor(value.hints)) : 0,
          bestProgress: Number.isFinite(value.bestProgress) ? Math.max(0, Math.floor(value.bestProgress)) : 0,
          mode: typeof value.mode === 'string' ? value.mode : '',
          completedAt: typeof value.completedAt === 'string' ? value.completedAt : ''
        };
      }
      return out;
    } catch (e) { return {}; }
  })();
  function saveProblemProgress() {
    try { localStorage.setItem(PROBLEM_PROGRESS_KEY, JSON.stringify(problemProgress)); } catch (e) { /* private mode */ }
    try { document.dispatchEvent(new CustomEvent('got:problem-progress')); } catch (e) { /* test/private mode */ }
  }
  const EMPTY_PROBLEM_REC = { solved: false, viewed: false, assisted: false, attempts: 0, hints: 0, bestProgress: 0, mode: '', completedAt: '' };
  /* 只读查询：绝不因"读"而写入 problemProgress——否则打开题目对话框就会给
   * 全部题目建空记录，之后任何一次 saveProblemProgress 都会把它们持久化。 */
  function problemRecOrNull(problemOrId) {
    const id = typeof problemOrId === 'string' ? problemOrId : problemOrId && problemOrId.id;
    return (id && problemProgress[id]) || null;
  }
  function problemView(problemOrId) { return problemRecOrNull(problemOrId) || EMPTY_PROBLEM_REC; }
  /* 写入路径专用：确保记录存在后返回可改对象 */
  function problemRecord(problemOrId) {
    const id = typeof problemOrId === 'string' ? problemOrId : problemOrId && problemOrId.id;
    if (!id) return Object.assign({}, EMPTY_PROBLEM_REC);
    if (!problemProgress[id]) problemProgress[id] = Object.assign({}, EMPTY_PROBLEM_REC);
    return problemProgress[id];
  }
  function problemSetCounts(data, setId) {
    const all = (data && data.problems || []).filter(p => p.set === setId);
    let done = 0, viewed = 0;
    for (const p of all) {
      const r = problemRecOrNull(p);
      if (!r) continue;
      if (r.solved) done++;
      else if (r.viewed) viewed++;
    }
    return { total: all.length, done, viewed };
  }
  function refreshProblemDialog() {
    const data = getProblemData();
    if (!data || !problemListEl) return;
    buildRankRow(data);
    renderProblemGrid(data);
  }
  function openProblemDialog() {
    const savedScroll = problemScrollTop;
    const data = getProblemData();
    const body = $('problemDialogBody');
    body.innerHTML = '';
    problemCountEl = null;
    if (!data || !data.problems || !data.problems.length) {
      const p = document.createElement('p');
      p.className = 'dialog-hint';
      p.textContent = t('problemsLoadFail');
      body.appendChild(p);
      openDialog('problemDialog');
      return;
    }
    if (!data.sets.some(set => problemExpanded.has(set.id))) problemExpanded.add(data.sets[0].id);
    const ranks = document.createElement('select');
    problemRankEl = ranks;
    ranks.addEventListener('change', () => { problemRank = ranks.value; renderProblemGrid(data); });
    const list = document.createElement('div');
    list.className = 'problem-grid catalog-list';
    problemListEl = list;
    // Categories are rendered as expandable groups below.
    const legend = document.createElement('p');
    legend.className = 'problem-legend';
    legend.textContent = t('problemsLegend');
    body.appendChild(legend);

    const filters = document.createElement('div');
    filters.className = 'browse-filters catalog-filters';
    const search = document.createElement('input'); search.type = 'search';
    search.placeholder = lang === 'zh' ? '搜索题号、段位' : 'Search number or rank';
    search.setAttribute('aria-label', search.placeholder); search.value = problemQuery;
    const completion = document.createElement('select');
    completion.setAttribute('aria-label', lang === 'zh' ? '完成状态' : 'Completion');
    for (const [value, zh, en] of [['all','全部状态','All progress'],['new','未开始','Not started'],['started','尝试过','Attempted'],['done','已完成','Solved'],['viewed','看过正解','Solution viewed']]) {
      const opt = document.createElement('option'); opt.value=value; opt.textContent=lang==='zh'?zh:en; completion.append(opt);
    }
    completion.value=problemCompletion;
    search.addEventListener('input', () => { problemQuery=search.value.trim().toLowerCase(); renderProblemGrid(data); });
    completion.addEventListener('change', () => { problemCompletion=completion.value; renderProblemGrid(data); });
    filters.append(search,ranks,completion); body.append(filters);
    const count = document.createElement('p');
    count.className = 'browse-count catalog-count';
    count.setAttribute('role', 'status');
    problemCountEl = count;
    body.append(count);
    body.appendChild(list);
    buildRankRow(data);
    renderProblemGrid(data);
    openDialog('problemDialog');
    $('problemDialog').scrollTop = savedScroll;
  }
  // Rank filtering spans all expandable collections.
  function buildRankRow(data) {
    const box = problemRankEl;
    if (!box) return;
    box.replaceChildren();
    box.setAttribute('aria-label', t('problemsRankAll'));
    const add = (value, label) => {
      const option = document.createElement('option');
      option.value = value; option.textContent = label; box.append(option);
    };
    add('all', t('problemsRankAll'));
    const ranks = [...new Set(data.problems.map(p => p.rankNum))].sort((a,b) => a-b);
    for (const rank of ranks) {
      const sample = data.problems.find(p => p.rankNum === rank);
      add(String(rank), lang === 'zh' ? sample.rank : sample.rankEn);
    }
    box.value = String(problemRank);
  }
  function renderProblemGrid(data) {
    const list = problemListEl;
    if (!list) return;
    list.innerHTML = '';
    const items = [];
    for (const p of data.problems) {
      if (problemRank !== 'all' && p.rankNum !== Number(problemRank)) continue;
      const r = problemView(p);
      if (problemQuery && ![p.no,p.rank,p.rankEn,p.id].join(' ').toLowerCase().includes(problemQuery)) continue;
      if (problemCompletion === 'done' && !r.solved || problemCompletion === 'viewed' && !r.viewed || problemCompletion === 'started' && !r.attempts || problemCompletion === 'new' && (r.attempts || r.solved || r.viewed)) continue;
      items.push(p);
    }
    list.setAttribute('aria-label', (lang === 'zh' ? '匹配题目：' : 'Matching problems: ') + items.length);
    if (problemCountEl) problemCountEl.textContent = lang === 'zh' ? ('匹配 ' + items.length + ' 题') : (items.length + ' problems');
    if (!items.length) {
      const e = document.createElement('p');
      e.className = 'dialog-hint';
      e.textContent = t('problemsEmpty');
      list.appendChild(e);
      return;
    }
    const frags = document.createDocumentFragment();
    const groups = new Map();
    for (const set of data.sets) {
      const matched=items.filter(p=>p.set===set.id); if(!matched.length)continue;
      const group=document.createElement('details'); group.className='catalog-group';
      group.open=problemQuery.length>0 || problemExpanded.has(set.id);
      group.addEventListener('toggle',()=>{if(group.open)problemExpanded.add(set.id);else problemExpanded.delete(set.id);});
      const summary=document.createElement('summary');
      summary.textContent=(lang==='zh'?set.name:set.nameEn)+' · '+matched.length;
      const grid=document.createElement('div'); grid.className='catalog-tiles';
      group.append(summary,grid); groups.set(set.id,grid); frags.append(group);
    }
    items.forEach((p, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      const rec = problemView(p);
      c.className = 'problem-chip' + (rec.solved ? ' completed' : rec.viewed ? ' viewed' : '');
      const rank = lang === 'zh' ? p.rank : p.rankEn;
      const status = rec.solved ? t('problemCompleteMark') : rec.viewed ? t('problemViewedMark') : t('problemNotStarted');
      c.setAttribute('aria-label', t('problemNumber') + ' ' + p.no + ' · ' + rank + ' · ' + status);
      c.innerHTML = '<span class="problem-chip-no">' + String(p.no) + '</span><span class="problem-chip-mark" aria-hidden="true">' +
        (rec.solved ? '✓' : rec.viewed ? '◐' : '') + '</span>';
      const detail = document.createElement('span'); detail.className='problem-row-detail';
      detail.textContent=rank+' · '+(p.toMove==='B'?(lang==='zh'?'黑先':'Black'):(lang==='zh'?'白先':'White'))+' · '+p.moves+' '+t('movesShort');
      const progressLabel=document.createElement('span'); progressLabel.className='problem-row-status'; progressLabel.textContent=status;
      c.append(detail,progressLabel);
      const attempts = rec.attempts ? ' · ' + t('problemAttempts').replace('{n}', rec.attempts) : '';
      c.title = status + ' · ' + rank + ' · ' + p.moves + ' ' + t('movesShort') + attempts;
      c.addEventListener('click', () => loadProblem(p, items, i));
      groups.get(p.set).appendChild(c);
    });
    list.appendChild(frags);
  }
  function loadProblem(p, items, idx) {
    setMobilePanel(false);
    if (state.mode === 'score') exitScoreMode();
    if (!state.problem) state.problemPrev = {
      game: state.game, opponent: state.opponent, humanColor: state.humanColor,
      workspace: state.workspace, activeTab: state.activeTab, timelineAnchor,
      browsing: state.browsing,
      analysisOn: state.analysisOn, autoPreview: state.autoPreview,
      showOwnership: state.showOwnership, confirmMove: state.confirmMove,
      analysisCache: new Map(analysisCache)
    };
    cancelWorkspaceWork();
    analysisCache.clear();
    previewCache.clear();
    timelineAnchor = null;
    const g = new GE.Game({ size: p.size, rules: 'chinese', komi: 0 });
    const AB = (p.black || []).map(([x, y]) => y * p.size + x);
    const AW = (p.white || []).map(([x, y]) => y * p.size + x);
    g.root.setup = { AB, AW, AE: [] };
    g.root.props.PL = (p.toMove === 'B') ? 'B' : 'W';   // 先手方（黑先题必须显式声明）
    if (state.mode === 'score') exitScoreMode();
    if (state.workspace !== 'play') {
      state.workspace = 'play';
      document.body.dataset.workspace = 'play';
      $('reviewToggleBtn').setAttribute('aria-pressed', 'false');
    }
    const learning = $('learningWorkspace'); if (learning) learning.hidden = true;
    state.game = g;
    state.browsing = false;
    state.mode = 'play';
    state.opponent = 'human';                 // 死活题：人类走双方
    state.humanColor = (p.toMove === 'B') ? BLACK : WHITE;
    state.autoPreview = false;
    state.analysisOn = false;
    state.showOwnership = false;
    state.confirmMove = false;
    state.problem = { p, items, idx, progress: 0, done: false, wrong: false, wrongCount: 0, undoing: false, assisted: false, viewed: false, started: false };
    document.body.classList.remove('focus-board');
    $('focusBtn').setAttribute('aria-pressed', 'false');
    clearPvChips();
    state.previewNode = null;
    state.pendingMove = null;
    state.deadStones.clear();
    clearAnalysisOverlay();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    renderer.set({ preview: [] });
    closeDialog('problemDialog');
    renderProblemBanner();
    problemStatus('');                       // 切题清空上一题的状态/提示
    syncProblemMode();
    renderAll();
    if (state.analysisOn) requestAnalysis(g.current);
  }
  function renderProblemBanner() {
    const pr = state.problem;
    const banner = $('problemBanner');
    if (!pr || !banner) { if (banner) banner.classList.add('hidden'); return; }
    const p = pr.p;
    const s = (getProblemData().sets || []).find(s => s.id === p.set);
    $('problemSetName').textContent = s ? (lang === 'zh' ? s.name : s.nameEn) : p.set;
    $('problemNo').textContent = '#' + p.no;
    const lvEl = $('problemLevel');
    lvEl.textContent = lang === 'zh' ? p.rank : p.rankEn;
    lvEl.title = t('problemsRankNote');        // 说明段位是手数推定值，非精确评级
    const total = p.solution.length;
    const current = Math.max(0, Math.min(total, pr.progress));
    const pct = total ? Math.round(current / total * 100) : 0;
    const rec = problemView(p);
    const best = Math.max(current, rec.bestProgress || 0);
    const valueEl = $('problemProgressValue');
    const barEl = $('problemProgressBar');
    const trackEl = $('problemProgressTrack');
    const setEl = $('problemSetProgress');
    const bestText = !rec.solved && best > current
      ? ' · ' + t('problemBestProgress').replace('{best}', best).replace('{total}', total)
      : '';
    if (valueEl) valueEl.textContent = current + ' / ' + total + ' · ' + pct + '%' + bestText;
    if (barEl) barEl.style.width = pct + '%';
    if (trackEl) {
      trackEl.setAttribute('aria-valuemin', '0');
      trackEl.setAttribute('aria-valuemax', String(total));
      trackEl.setAttribute('aria-valuenow', String(current));
      trackEl.setAttribute('aria-valuetext', current + ' / ' + total + ' · ' + pct + '%');
    }
    const data = getProblemData();
    const setStats = problemSetCounts(data, p.set);
    if (setEl) setEl.textContent = t('problemSetProgress')
      .replace('{done}', setStats.done).replace('{total}', setStats.total).replace('{viewed}', setStats.viewed);
    const completionEl = $('problemCompletion');
    if (completionEl) {
      completionEl.hidden = !(rec.solved || rec.viewed);
      completionEl.className = 'problem-completion' + (rec.solved ? ' complete' : ' viewed');
      completionEl.textContent = rec.solved ? '✓ ' + t('problemCompleteMark') : '◐ ' + t('problemViewedMark');
      completionEl.title = rec.attempts ? t('problemAttempts').replace('{n}', rec.attempts) : t('problemNotStarted');
    }
    $('problemTurn').textContent = pr.done ? t(pr.viewed ? 'problemViewed' : pr.assisted ? 'problemAssisted' : 'problemIndependent') : t(toMove() === BLACK ? 'problemBlackTurn' : 'problemWhiteTurn');
    $('problemNext').classList.toggle('primary', pr.done);
    if (pr.done) problemStatus(t(pr.viewed ? 'problemViewed' : pr.assisted ? 'problemAssisted' : 'problemIndependent'), 'ok');
    /* 注意：这里【不要】碰 #problemStatus。判错提示（L1/L2/L3）由 problemStatus() 写入后，
     * 若本函数再渲染一次横幅就会把刚设的提示清成空串——用户会以为"点了没反应"。
     * 状态文案的生命周期完全交给 problemStatus()，切题时由 loadProblem 显式清空。 */
    banner.classList.remove('hidden');
  }
  function problemStatus(msg, kind) {
    const el = $('problemStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'problem-status' + (kind ? ' ' + kind : '');
  }
  /* 死活题使用专属右栏；与解题无关的对局和分析操作同时由状态逻辑与 CSS 隔离。 */
  function syncProblemMode() {
    document.body.classList.toggle('problem-mode', !!state.problem);
  }
  /* 死活题判定 + 四级提示阶梯
   * 原则：答错绝不直接甩答案，每级只多给一点信息，把"自己想出来"的机会留给用户。
   *   L1（第 1 次错）：只说"不对"，自动悔掉这手 → 自己再想（不泄露任何着点）
   *   L2（第 2 次错）：提示正解所在区域 + 全程手数 → 仍不给着点
   *   L3（第 3 次错）：高亮正解的这一手 → 后续几手仍自己走完
   *   L4（主动求助）：完整演示，走「正解」按钮，不自动触发
   */
  function regionName(x, y, size) {
    const t3 = size / 3;
    const col = x < t3 ? 0 : (x < t3 * 2 ? 1 : 2);
    const row = y < t3 ? 0 : (y < t3 * 2 ? 1 : 2);
    const zh = [['左上角', '上边', '右上角'], ['左边', '中央', '右边'], ['左下角', '下边', '右下角']];
    const en = [['top-left', 'top', 'top-right'], ['left', 'center', 'right'], ['bottom-left', 'bottom', 'bottom-right']];
    return (lang === 'zh' ? zh : en)[row][col];
  }
  function checkProblemMove() {
    const pr = state.problem;
    if (!pr || pr.done || pr.undoing) return;   // undoing：悔棋引发的 afterMove 不参与判定
    const mv = game().current.move;
    if (!mv || mv.pass) return;                 // 死活题以正解落子为准，不支持停着
    if (!pr.started) {
      pr.started = true;
      const rec = problemRecord(pr.p);
      rec.attempts++;
      saveProblemProgress();
    }
    const expected = pr.p.solution[pr.progress];
    if (!expected) { pr.done = true; return; }
    const expColor = expected[0] === 'B' ? BLACK : WHITE;
    const ok = expColor === mv.color && expected[1] === mv.x && expected[2] === mv.y;
    if (ok) {
      pr.wrongCount = 0;                        // 走对即重置阶梯，下一手从头开始
      pr.progress++;
      const rec = problemRecord(pr.p);
      rec.bestProgress = Math.max(rec.bestProgress, pr.progress);
      renderer.set({ preview: [] });            // 清掉 L3 留下的首手高亮
      if (pr.progress >= pr.p.solution.length) {
        pr.done = true;
        rec.solved = true;
        rec.assisted = rec.assisted || pr.assisted;
        rec.mode = pr.assisted ? 'assisted' : 'independent';
        rec.completedAt = new Date().toISOString();
        saveProblemProgress();
        playSuccessSound();                     // 正反馈：答对要有可感知的奖励
        problemStatus(t(pr.assisted ? 'problemAssisted' : 'problemIndependent'), 'ok');
        const nx = $('problemNext'); if (nx) nx.focus();
      } else {
        saveProblemProgress();
        problemStatus(t('problemsCorrect'), 'ok');
      }
      renderProblemBanner();
      return;
    }
    /* 答错：撤回并移除错误分支，浏览前进不会再次进入已判错的着法。 */
    const rejected = game().current;
    pr.wrongCount = (pr.wrongCount || 0) + 1;
    pr.undoing = true;
    doUndo();
    rejected.parent.children = rejected.parent.children.filter(n => n !== rejected);
    pr.undoing = false;
    renderAll();
    let msg, kind;
    if (pr.wrongCount === 1) {
      msg = t('problemsL1'); kind = 'bad';
    } else if (pr.wrongCount === 2) {
      pr.assisted = true;
      const rec = problemRecord(pr.p);
      rec.assisted = true;
      saveProblemProgress();
      const rg = regionName(expected[1], expected[2], pr.p.size);
      msg = t('problemsL2').replace('{region}', rg).replace('{n}', pr.p.solution.length); kind = 'bad';
    } else {
      hintExpected();                            // L3：高亮正解这一手
      if (pr.wrongCount >= 4) {
        const sb = $('problemSolution'); if (sb) sb.focus();
        msg = t('problemsHintShown') + ' · ' + t('problemsL4');
      } else {
        msg = t('problemsHintShown') + ' · ' + t('problemsL3');
      }
      kind = 'info';
    }
    problemStatus(msg, kind);
    showToast(msg);      // 横幅小字容易被忽略，错手必须有醒目反馈，否则像"点了没反应"
    renderProblemBanner();
  }
  function hintExpected() {
    const pr = state.problem;
    if (!pr) return;
    const expected = pr.p.solution[pr.progress];
    if (!expected) return;
    pr.assisted = true;
    const rec = problemRecord(pr.p);
    rec.assisted = true;
    rec.hints++;
    saveProblemProgress();
    const color = expected[0] === 'B' ? BLACK : WHITE;
    renderer.set({ preview: [{ x: expected[1], y: expected[2], color }] });
    renderer.requestRender();
    problemStatus(t('problemsHintShown'), 'info');
  }
  function problemReset() { const pr = state.problem; if (pr) loadProblem(pr.p, pr.items, pr.idx); }
  function syncProblemProgress() {
    const pr = state.problem;
    if (!pr || pr.undoing) return;
    const moves = game().pathFromRoot(game().current).filter(n => n.move).map(n => n.move);
    let count = 0;
    for (const move of moves) {
      const expected = pr.p.solution[count];
      if (!expected || move.pass || move.color !== (expected[0] === 'B' ? BLACK : WHITE) || move.x !== expected[1] || move.y !== expected[2]) break;
      count++;
    }
    pr.progress = count;
    pr.done = count === pr.p.solution.length;
    const rec = problemRecord(pr.p);
    rec.bestProgress = Math.max(rec.bestProgress, count);
    if (pr.done) {
      rec.solved = true;
      rec.assisted = rec.assisted || pr.assisted;
      rec.mode = pr.assisted ? 'assisted' : 'independent';
      rec.completedAt = rec.completedAt || new Date().toISOString();
    }
    saveProblemProgress();
    problemStatus('');
  }
  function restoreProblemPreferences() {
    if (!state.problemPrev) return;
    for (const key of ['analysisOn', 'autoPreview', 'showOwnership', 'confirmMove']) state[key] = state.problemPrev[key];
    $('autoPreviewBtn').setAttribute('aria-pressed', String(state.autoPreview));
    $('ownershipBtn').setAttribute('aria-pressed', String(state.showOwnership));
    $('confirmBtn').setAttribute('aria-pressed', String(state.confirmMove));
  }
  function problemStep(dir) {
    const pr = state.problem;
    if (!pr) return;
    const items = pr.items;
    let i = pr.idx + dir;
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    loadProblem(items[i], items, i);
  }
  function problemExit(resume = true) {
    setMobilePanel(false);
    if (!state.problem) return;
    cancelWorkspaceWork();
    const prev = state.problemPrev;
    state.problem = null;
    state.problemPrev = null;
    syncProblemMode();
    renderer.set({ preview: [] });
    const banner = $('problemBanner');
    if (banner) banner.classList.add('hidden');
    if (!prev || !prev.game) { newGame({ size: 19, rules: 'chinese', komi: 7.5 }); return; }
    const { analysisCache: savedCache, timelineAnchor: savedAnchor, ...savedState } = prev;
    Object.assign(state, savedState);
    timelineAnchor = savedAnchor;
    const learning = $('learningWorkspace'); if (learning) learning.hidden = state.workspace !== 'learn';
    analysisCache.clear();
    for (const [id, value] of savedCache) analysisCache.set(id, value);
    previewCache.clear();
    $('autoPreviewBtn').setAttribute('aria-pressed', String(state.autoPreview));
    $('ownershipBtn').setAttribute('aria-pressed', String(state.showOwnership));
    $('confirmBtn').setAttribute('aria-pressed', String(state.confirmMove));
    clearAnalysisOverlay();
    switchTab(state.activeTab);
    renderAll();
    if (state.workspace === 'learn' && window.GoTLearning) window.GoTLearning.mount();
    if (resume) { requestAnalysis(game().current); requestEngineMove(); }
  }
  function showSolution() {
    const pr = state.problem;
    if (!pr) return;
    state.game.current = state.game.root;           // 从初始局面起演示，避免接在错误分支上
    pr.progress = 0;
    pr.viewed = true;
    const rec = problemRecord(pr.p);
    rec.viewed = true;
    saveProblemProgress();
    while (pr.progress < pr.p.solution.length) {
      const [c, x, y] = pr.p.solution[pr.progress];
      const r = game().play(c === 'B' ? BLACK : WHITE, x, y);
      if (!r.ok) break;
      pr.progress++;
    }
    pr.done = true;
    state.previewNode = null;
    clearAnalysisOverlay();
    afterMove();
    problemStatus(t('problemViewed'), 'ok');
    renderProblemBanner();
  }
  $('problemBtn').addEventListener('click', () => {
    closeDialog('settingsDialog'); window.GoTRecords?.close(); closeDialog('problemDialog');
    if (state.problem) return;
    const data = getProblemData();
    if (!data || !data.problems.length) { openProblemDialog(); return; }
    const p = data.problems.find(p => !problemView(p).solved) || data.problems[0];
    const items = data.problems.filter(q => q.set === p.set);
    loadProblem(p, items, items.indexOf(p));
  });
  document.addEventListener('got:assessment-start',()=>{
    if(!window.GoTGrowth)return;
    const engine=gtp.info?'gtp':'builtin',level=window.GoTGrowth.nextLevel(engine);
    newGame({size:19,rules:'chinese',komi:7.5});
    abandonEngine();state.opponent=engine;state.humanColor=BLACK;userPickedOpponent=true;
    state.analysisOn=false;state.autoPreview=false;
    $('analysisBtn').setAttribute('aria-pressed','false');$('autoPreviewBtn').setAttribute('aria-pressed','false');
    assessment={game:game(),engine,level,human:BLACK,finished:false};
    setWorkspace('play');renderAll();
  });
  document.addEventListener('click',e=>{
    if(!assessment || assessment.finished || assessment.game!==game())return;
    const b=e.target.closest('button,select');
    if(b && ['undoBtn','redoBtn','analysisBtn','autoPreviewBtn','ownershipBtn','resumePlayBtn'].includes(b.id)){
      assessment=null;showToast(lang==='zh'?'已使用辅助，本盘转为普通对局，不计入测评。':'Assistance used; continuing as an unrated game.');renderAll();
    }
  },true);
  $('problemHint').addEventListener('click', hintExpected);
  $('problemReset').addEventListener('click', problemReset);
  $('problemSolution').addEventListener('click', showSolution);
  $('problemNext').addEventListener('click', () => problemStep(1));
  $('problemPrev').addEventListener('click', () => problemStep(-1));
  $('problemExit').addEventListener('click', () => problemExit());
  $('problemChoose').addEventListener('click', openProblemDialog);
  const prClose = $('problemDialogClose');
  $('problemDialog').addEventListener('scroll', () => { problemScrollTop = $('problemDialog').scrollTop; });
  if (prClose) prClose.addEventListener('click', () => closeDialog('problemDialog'));
  const prRand = $('problemRandom');
  if (prRand) prRand.addEventListener('click', () => {
    const data = getProblemData();
    if (!data || !data.problems.length) return;
    const p = data.problems[Math.floor(Math.random() * data.problems.length)];
    const items = data.problems.filter(q => q.set === p.set);
    loadProblem(p, items, items.indexOf(p));
  });

  /* ================= dialogs ================= */
  function openDialog(id) { try { if (id === 'problemDialog' || id === 'settingsDialog') { window.GoTRecords.close(); $(id).show(); } else $(id).showModal(); } catch (e) { } }
  function closeDialog(id) { try { if (id === 'settingsDialog' && $(id).open) { placeSettingsPanels(false); $('shellSettingsBtn').setAttribute('aria-pressed', 'false'); } $(id).close(); } catch (e) { } }
  function segmented(id, onChange) {
    $(id).addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !$(id).contains(btn)) return;
      for (const b of $(id).querySelectorAll('button')) b.classList.remove('selected');
      btn.classList.add('selected');
      if (onChange) onChange(btn);
    });
  }
  segmented('ngSize');
  segmented('ngSide');
  /* KataGo 在线就是默认对手（最强 AI）：boot 时桥还没探完，对话框往往先按
   * "未连接"渲染成内置 AI，等 health 回来再补切一次。已开局或用户手动选过就不抢。 */
  let userPickedOpponent = false;

  /* 棋力档位 → 段位标签 + KataGo 对弈预算（诚实分段）
   * 1.3 起「棋力」真正生效：KataGo 走子按档位限制 maxVisits、加 PDA、低档随机选点
   * （见 js/strength.js）；内置 MCTS 走 ai-worker 的 budgetFor。分析与复盘始终满强度。
   * 两个引擎真实棋力天差地别，故段位上限不同，不统一虚标：
   *   内置 MCTS：轻量 PUCT + 启发式，真实上限约业余 3 段 → 最高只标 3 段
   *   KataGo   ：b18 网络满血远超职业九段，靠限制思考量/PDA 降档 → 可标到 9 段
   * 均为"约合"值，tooltip 明确说明，避免误导。 */
  function strengthRankNum(s, isGtp) { return Strength.rankNum(s, isGtp); }
  function rankText(r) { return Strength.rankText(r, lang); }
  function refreshStrengthLabels() {
    const box = $('ngStrength');
    if (!box) return;
    const sel = $('ngOpponent') && $('ngOpponent').querySelector('.selected');
    const isGtp = !!sel && sel.dataset.opp === 'gtp';
    const note = t('strengthRankNote');
    for (const b of box.children) {
      b.textContent = rankText(strengthRankNum(Number(b.dataset.s), isGtp));
      b.title = note;
    }
    refreshQuickStrength();
  }
  /* 对局中快速切换对手棋力（不重开对局）：右栏下拉，仅对 AI 对局显示。 */
  let quickStrengthKind = '';
  function refreshQuickStrength() {
    const wrap = $('strengthQuick'), sel = $('quickStrength');
    if (!wrap || !sel) return;
    const isGtp = analysisEngineKind() === 'gtp';
    const kind = isGtp ? 'gtp' : 'builtin';
    if (quickStrengthKind !== kind || sel.options.length !== 9) {
      quickStrengthKind = kind;
      sel.textContent = '';
      for (let s = 1; s <= 9; s++) {
        const o = document.createElement('option');
        o.value = String(s);
        o.textContent = rankText(strengthRankNum(s, isGtp));
        sel.appendChild(o);
      }
    }
    sel.value = String(assessmentStrength());
    sel.disabled=!!(assessment && assessment.game===game() && !assessment.finished);
    sel.title = t('strengthRankNote');
    wrap.hidden = state.opponent === 'human' || !!state.problem;
  }
  $('quickStrength').addEventListener('change', () => {
    state.strength = Number($('quickStrength').value) || 5;
    saveSettings();
    refreshQuickStrength();
    renderSide();
    showToast(t('strengthChanged'));
  });
  segmented('ngOpponent', (btn) => {
    userPickedOpponent = true;                 // 手动选过 → 不再被"默认 KataGo"覆盖
    $('ngStrengthLabel').style.display = btn.dataset.opp === 'human' ? 'none' : '';
    refreshStrengthLabels();                   // 换引擎 → 段位上限不同，标签需重算
    updateNgEngineHint();
  });
  segmented('ngStrength');
  function applyDefaultOpponent() {
    if (state.problem) return;
    if (userPickedOpponent || !gtp.info) return;
    const g = game();
    if (g && g.current !== g.root) return;      // 已经落子 → 不中途换引擎打扰对局
    state.opponent = 'gtp';
    const box = $('ngOpponent');
    if (!box) return;
    for (const b of box.querySelectorAll('button')) b.classList.toggle('selected', b.dataset.opp === 'gtp');
    $('ngStrengthLabel').style.display = '';
    refreshStrengthLabels();
    updateNgEngineHint();
  }

  /* 新对局对话框：所选对手为 KataGo 时显示引擎连接状态 */
  function updateNgEngineHint() {
    const el = $('ngEngineHint');
    if (!el) return;
    const sel = $('ngOpponent').querySelector('.selected');
    if (!sel || sel.dataset.opp !== 'gtp') { el.hidden = true; return; }
    el.hidden = false;
    if (gtp.info) {
      el.classList.add('online');
      el.textContent = t('connectOk') + gtp.info.name + ' ' + (gtp.info.version || '');
    } else {
      el.classList.remove('online');
      el.textContent = t('ngEngineOff');
    }
  }

  $('newGameBtn').addEventListener('click', () => {
    openDialog('newGameDialog');
    syncNewGameDialog();
    updateNgEngineHint();
  });
  /* 新对局对话框固定默认：中国规则 · 19 路 · 自动执子 · 棋力 5 · 让子 0；
   * 对手默认 KataGo——未连接时先选内置 AI，health 回来后由 applyDefaultOpponent 补切。
   * 用时保持上次设置。 */
  function syncNewGameDialog() {
    const sel = (id, attr, val) => {
      for (const b of $(id).querySelectorAll('button')) b.classList.toggle('selected', b.dataset[attr] === String(val));
    };
    userPickedOpponent = false;
    sel('ngSize', 'size', 19);
    sel('ngSide', 'side', 'auto');
    sel('ngOpponent', 'opp', gtp.info ? 'gtp' : 'builtin');
    sel('ngStrength', 's', 5);
    $('ngRule').value = 'chinese';
    $('ngHandicap').value = '0';
    $('ngTime').value = String(state.timeMs);
    if ($('ngTimeControl')) $('ngTimeControl').value = state.clockPreset;   // 记住上次计时档（默认不计时）
    $('ngStrengthLabel').style.display = '';
    refreshStrengthLabels();
  }
  $('ngCancel').addEventListener('click', () => closeDialog('newGameDialog'));
  $('ngStart').addEventListener('click', () => {
    const size = Number($('ngSize').querySelector('.selected').dataset.size);
    const rules = $('ngRule').value;
    const handicap = Number($('ngHandicap').value);
    const side = $('ngSide').querySelector('.selected').dataset.side;
    const opp = $('ngOpponent').querySelector('.selected').dataset.opp;
    const strength = Number($('ngStrength').querySelector('.selected').dataset.s);
    const timeMs = Number($('ngTime').value);
    const clockPreset = $('ngTimeControl') ? $('ngTimeControl').value : 'off';
    state.opponent = opp;
    state.strength = strength;
    state.timeMs = timeMs;
    state.clockPreset = Clock.PRESETS[clockPreset] ? clockPreset : 'off';
    state.humanColor = side === 'auto' ? (Math.random() < 0.5 ? BLACK : WHITE) : (side === 'white' ? WHITE : BLACK);
    saveSettings();
    /* 让子局惯例贴 0.5（或 0）——分先规则贴目不该原样带进让子局 */
    const baseKomi = (GE.RULES[rules] && GE.RULES[rules].komi) || 7.5;
    const komi = handicap >= 2 ? 0.5 : baseKomi;
    const names = {};
    names[BLACK] = ''; names[WHITE] = '';
    names[state.humanColor] = t('you');
    const engineName = opp === 'gtp' ? ((gtp.info && gtp.info.name) || 'KataGo') : (lang === 'zh' ? '内置 AI ' : 'MCTS ') + strength;
    names[state.humanColor === BLACK ? WHITE : BLACK] = opp === 'human' ? (lang === 'zh' ? '棋手' : 'Player') : engineName;
    closeDialog('newGameDialog');
    newGame({ size, rules, komi, handicap, names });
    /* 选了 KataGo 但桥不可用：不再只弹提示干等（那会让 AI 一手都不下）——
     * 明确告知已改用内置 AI，requestEngineMove 会自动降级续弈。 */
    if (opp === 'gtp' && !gtp.info) { gtpDownNotified = false; noteGtpFallback(); }
    updateEnginePill();
  });

  $('engineSettingsBtn').addEventListener('click', () => {
    $('bridgeUrl').value = gtp.baseUrl;
    $('engSeconds').value = String(state.analysisSeconds);
    $('engStatus').classList.remove('online');
    $('engStatus').textContent = gtp.info ? t('connectOk') + gtp.info.name + ' ' + (gtp.info.version || '') : '';
    openDialog('engineDialog');
  });
  /* 显示设置：候选圈颜色 / 列表排序，改动即时生效并持久化 */
  $('displaySettingsBtn').addEventListener('click', () => {
    syncWorkspaceUI();
    $('dsCandColor').value = state.candColor;
    $('dsCandSort').value = state.candSort;
    $('themeSelect').value = state.theme;
    openDialog('displayDialog');
  });
  $('themeSelect').addEventListener('change', () => applyTheme($('themeSelect').value, true));
  $('soundBtn').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    saveSettings();
    syncWorkspaceUI();
  });
  $('dsCandColor').addEventListener('change', () => {
    state.candColor = $('dsCandColor').value === 'rank' ? 'rank' : 'winrate';
    saveSettings();
    renderBoard();
  });
  $('dsCandSort').addEventListener('change', () => {
    state.candSort = $('dsCandSort').value === 'winrate' ? 'winrate' : 'visits';
    saveSettings();
    const cached = analysisCache.get(game().current.id);
    if (cached) updateAnalysisUI(cached, false);   // 重建右栏列表顺序
    renderBoard();
  });
  $('engQuick').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-url]');
    if (!btn) return;
    $('bridgeUrl').value = btn.dataset.url;
  });
  $('engClose').addEventListener('click', () => closeDialog('engineDialog'));
  $('engConnect').addEventListener('click', async () => {
    state.analysisSeconds = Number($('engSeconds').value) || 2;
    gtp.baseUrl = $('bridgeUrl').value.replace(/\/$/, '');
    saveSettings();
    $('engStatus').classList.remove('online');
    $('engStatus').textContent = '…';
    const res = await gtp.health(6000);
    if (res.ok) {
      gtp.info = res.engine;
      $('engStatus').classList.add('online');
      $('engStatus').textContent = t('connectOk') + res.engine.name + ' ' + (res.engine.version || '') +
        (res.engine.supportsAnalyze ? '' : (lang === 'zh' ? '（仅 genmove）' : ' (genmove only)'));
      updateEnginePill();
      showToast(t('connectOk') + res.engine.name);
    } else {
      $('engStatus').textContent = t('connectFail') + friendlyFetchError(res.error || '');
    }
  });
  function updateEnginePill() {
    const pill = $('enginePill');
    if (gtp.info) {
      pill.classList.add('online');
      $('enginePillText').textContent = gtp.info.name + (gtp.info.version ? ' ' + gtp.info.version : '');
    } else {
      pill.classList.remove('online');
      $('enginePillText').textContent = t('engineOff');
    }
  }

  /* 手动逃生舱：怀疑"看到的还是旧代码"时一键清缓存重载（SW 保留，离线仍可用） */
  const clearCacheBtn = $('clearCacheBtn');
  if (clearCacheBtn) clearCacheBtn.addEventListener('click', () => purgeCaches().then(() => reloadFresh(t('cacheCleared'))));

  $('resignBtn').addEventListener('click', () => {
    if (game().result) return;
    openDialog('resignDialog');
  });
  $('rsCancel').addEventListener('click', () => closeDialog('resignDialog'));
  $('rsConfirm').addEventListener('click', () => {
    closeDialog('resignDialog');
    const loser = state.opponent === 'human' ? toMove() : state.humanColor;
    const winner = loser === BLACK ? 'W' : 'B';
    game().result = winner + '+R';
    game().infoProps();
    setThinking(BLACK, false); setThinking(WHITE, false);
    moveSeq++; analysisSeq++; cancelNativeAnalysis();
    renderAll();
  });

  $('scoreBtn').addEventListener('click', () => {
    if (state.problem) return;
    if (state.mode === 'score') exitScoreMode();
    else enterScoreMode();
  });
  $('scoreAutoBtn').addEventListener('click', () => {
    if (state.mode !== 'score') return;
    autoMarkDead(true).then(() => { updateScoreUI(); renderBoard(); });
  });
  $('scoreClearBtn').addEventListener('click', () => {
    if (state.mode !== 'score') return;
    state.deadStones.clear();
    updateScoreUI();
    renderBoard();
  });
  $('scoreDoneBtn').addEventListener('click', () => openDialog('scoreDialog'));
  $('scKeep').addEventListener('click', () => { closeDialog('scoreDialog'); exitScoreMode(); });
  $('scConfirm').addEventListener('click', () => {
    const sc = currentScore();
    game().result = sc.result;
    game().infoProps();
    closeDialog('scoreDialog');
    exitScoreMode();
    renderAll();
  });

  $('undoBtn').addEventListener('click', doUndo);
  $('redoBtn').addEventListener('click', doRedo);
  $('passBtn').addEventListener('click', () => { if (isHumanTurn()) humanPass(); });
  $('numbersBtn').addEventListener('click', () => {
    state.showNumbers = !state.showNumbers;
    $('numbersBtn').setAttribute('aria-pressed', String(state.showNumbers));
    renderBoard();
  });
  $('analysisBtn').addEventListener('click', () => {
    if (state.problem) return;
    state.analysisOn = !state.analysisOn;
    $('analysisBtn').setAttribute('aria-pressed', String(state.analysisOn));
    if (state.analysisOn) {
      /* 开分析自动带上自动推演：候选/悬停推演即刻可用（会话级） */
      if (!state.autoPreview) {
        state.autoPreview = true;
        $('autoPreviewBtn').setAttribute('aria-pressed', 'true');
      }
      requestAnalysis(game().current);
    } else {
      // 关闭分析：在途请求一并作废，避免晚到结果重新点亮候选区；推演一并收起
      analysisSeq++; cancelNativeAnalysis();
      requestedAnalysisNode = null;
      if (state.autoPreview) {
        state.autoPreview = false;
        $('autoPreviewBtn').setAttribute('aria-pressed', 'false');
      }
      cancelAutoPreview();
      clearPreview();
      renderer.set({ candidates: [], ownership: null });
      renderBoard();
    }
    switchTab('analysis');
    syncWorkspaceUI();
  });
  $('ownershipBtn').addEventListener('click', () => {
    state.showOwnership = !state.showOwnership;
    $('ownershipBtn').setAttribute('aria-pressed', String(state.showOwnership));
    renderBoard();
  });
  $('flipBtn').addEventListener('click', () => {
    state.flip = !state.flip;
    $('flipBtn').setAttribute('aria-pressed', String(state.flip));
    saveSettings();
    renderBoard();
  });
  $('confirmBtn').addEventListener('click', () => {
    state.confirmMove = !state.confirmMove;
    $('confirmBtn').setAttribute('aria-pressed', String(state.confirmMove));
    if (!state.confirmMove && state.pendingMove) { state.pendingMove = null; renderBoard(); }
    saveSettings();
    renderSide();
  });
  $('coordsBtn').addEventListener('click', () => {
    state.showCoords = !state.showCoords;
    $('coordsBtn').setAttribute('aria-pressed', String(state.showCoords));
    saveSettings();
    renderBoard();
  });
  $('autoplayBtn').addEventListener('click', toggleAutoplay);

  $('tabAnalysis').addEventListener('click', () => switchTab('analysis'));
  $('tabTree').addEventListener('click', () => switchTab('tree'));
  for (const id of ['tabAnalysis', 'tabTree']) {
    $(id).addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const name = e.key === 'Home' ? 'analysis' : e.key === 'End' ? 'tree' : state.activeTab === 'tree' ? 'analysis' : 'tree';
      switchTab(name);
      $(name === 'analysis' ? 'tabAnalysis' : 'tabTree').focus();
    });
  }
  function switchTab(name) {
    state.activeTab = name;
    const pages = { analysis: 'pageAnalysis', tree: 'pageTree' };
    const tabs = { analysis: 'tabAnalysis', tree: 'tabTree' };
    for (const k of Object.keys(pages)) {
      $(pages[k]).classList.toggle('hidden', k !== name);
      $(tabs[k]).classList.toggle('selected', k === name);
      $(tabs[k]).setAttribute('aria-selected', String(k === name));
      $(tabs[k]).tabIndex = k === name ? 0 : -1;
    }
    if (name === 'analysis') renderAll();
    else renderTree();
  }
  /* 复盘训练区已并入分析页：进入复盘工作区/失误跳转时滚到该区 */
  function scrollReviewIntoView() {
    const el = document.querySelector('#pageAnalysis .review-divider');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }
  $('practiceExitBtn').addEventListener('click', endPractice);
  $('practiceRetryBtn').addEventListener('click', retryPractice);
  $('reviewStartBtn').addEventListener('click', runReview);
  $('reviewStopBtn').addEventListener('click', stopReview);
  $('reviewDepthSelect').addEventListener('change', () => {
    const value = $('reviewDepthSelect').value;
    state.reviewDepth = REVIEW_DEPTHS[value] ? value : 'standard';
    $('reviewDepthSelect').value = state.reviewDepth;
    saveSettings();
  });
  $('treeMainBtn').addEventListener('click', () => {
    let n = game().root;
    while (n.children.length) n = n.children[0];
    goToNode(n);
  });

  /* 学习工作区打开棋谱的统一入口。它与文件导入共用同一套复盘初始化，
   * 但不会把学习内容或当前棋局写入 localStorage。 */
  function loadSgfForLearning(text, title, guess) {
    assessment=null;
    const g = GE.sgfToGame(String(text || ''));
    g.gotTitle = String(title || '');
    setMobilePanel(false);
    cancelWorkspaceWork();
    restoreProblemPreferences();
    state.problemPrev = null;
    state.game = g;
    if (state.practice) { state.practice = null; renderPractice(); }   // 载入新棋谱不继承练习态
    state.mode = 'play';
    state.opponent = 'human';
    state.humanColor = toMove();
    state.problem = null;
    resetClock();
    syncProblemMode();
    const pb = $('problemBanner'); if (pb) pb.classList.add('hidden');
    renderer.set({ preview: [] });
    analysisCache.clear();
    state.workspace = 'review';
    state.activeTab = 'analysis';
    while (g.current.children.length) g.navChild(0);
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    clearAnalysisOverlay();
    const learning = $('learningWorkspace'); if (learning) learning.hidden = true;
    updateEnginePill();
    switchTab('analysis');
    renderAll();
    requestAnalysis(g.current);
    showToast(title ? t('loadedSgf') + ' · ' + title : t('loadedSgf'));
    if (guess) showToast(t('learningGuessStarted'));
  }
  document.addEventListener('got:learning-open-sgf', (e) => {
    const d = e && e.detail || {};
    try { if (d.sgf) loadSgfForLearning(d.sgf, d.title, d.guess); }
    catch (err) { showToast(t('loadFail') + err.message); }
  });
  document.addEventListener('got:learning-open-problem-dialog', () => openProblemDialog());
  document.addEventListener('got:learning-open-problem', (e) => {
    const id = e && e.detail && e.detail.id;
    const data = getProblemData();
    if (!id || !data || !data.problems) return;
    const p = data.problems.find((x) => String(x.id) === String(id));
    if (!p) return;
    const items = data.problems.filter((x) => x.set === p.set);
    loadProblem(p, items, Math.max(0, items.indexOf(p)));
  });
  function setMobilePanel(open) {
    document.body.classList.toggle('mobile-inspector', open);
    $('mobilePanelBtn').setAttribute('aria-expanded', String(open));
  }
  $('mobilePanelBtn').addEventListener('click', () => { setMobilePanel(true); $('mobilePanelClose').focus(); });
  $('mobilePanelClose').addEventListener('click', () => { setMobilePanel(false); $('mobilePanelBtn').focus(); });
  $('returnRecordsBtn').addEventListener('click', () => { setMobilePanel(false); window.GoTRecords.open(lang); });
  $('openBtn').addEventListener('click', () => { setWorkspace('review'); window.GoTRecords.open(lang); });
  function importRecordFiles(fileList, options) {
    const opts = options || {};
    const folder = !!opts.folder;
    const files = Array.from(fileList || []).filter((file) => {
      if (!file || !file.name) return false;
      return folder ? /\.sgf$/i.test(file.name) : true;
    });
    if (!files.length) {
      if (folder) showToast(t('recordFolderEmpty'));
      return;
    }
    let pending = files.length;
    let loaded = 0;
    let failed = 0;
    let opened = false;
    const finish = () => {
      pending -= 1;
      if (pending || !folder) return;
      if (loaded) {
        const message = t('recordFolderLoaded').replace('{n}', String(loaded));
        showToast(failed ? `${message} · ${failed} ${lang === 'zh' ? '份失败' : 'failed'}` : message);
      } else showToast(t('recordFolderEmpty'));
    };
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = String(reader.result || '').replace(/^\uFEFF/, '');
          const trimmed = raw.trim();
          const isSgf = trimmed.startsWith('(');
          const g = isSgf ? GE.sgfToGame(raw) : importJson(raw);
          if (!g) throw new Error('format');
          /* 保留 JSON 兼容性；标准 SGF 原文继续原样导入，便于往返保存。 */
          const sgf = isSgf ? raw : GE.gameToSgf(g);
          window.GoTRecords.add(file.name, sgf, g, lang);
          loaded += 1;
          if (!folder && files.length === 1 && !opened) {
            opened = true;
            window.GoTRecords.close();
            loadSgfForLearning(sgf, file.name);
          }
        } catch (err) {
          failed += 1;
          if (!folder) showToast(t('loadFail') + (err && err.message ? err.message : file.name));
        } finally {
          finish();
        }
      };
      reader.onerror = () => {
        failed += 1;
        if (!folder) showToast(t('loadFail') + file.name);
        finish();
      };
      reader.readAsText(file);
    }
  }
  $('fileInput').addEventListener('change', (e) => {
    importRecordFiles(e.target.files, { folder: false });
    e.target.value = '';
  });
  $('folderInput')?.addEventListener('change', (e) => {
    importRecordFiles(e.target.files, { folder: true });
    e.target.value = '';
  });
  function importJson(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.moves)) return null;
    const g = new GE.Game({ size: data.size || 19, rules: data.rules || 'chinese', komi: data.komi });
    for (const m of data.moves) {
      if (m.pass) g.pass(m.color); else g.play(m.color, m.x, m.y);
    }
    return g;
  }
  /* 把已知的每手胜率/损失/评级写入节点备注（Lizzie/KaTrain 风格），随 SGF 一起导出 */
  function annotateSgfComments() {
    for (const node of game().mainLine()) {
      if (!node.move || node._annotated) continue;
      const rv = node.review || {};
      const wr = typeof node.analysisWrBlack === 'number' ? node.analysisWrBlack : rv.wrBlack;
      if (typeof wr !== 'number') continue;
      const mover = node.move.color;
      const wrMover = mover === BLACK ? wr : 1 - wr;
      let line = (lang === 'zh' ? '胜率 ' : 'WR ') + Math.round(wrMover * 100) + '%';
      if (rv.loss !== undefined && !node.move.pass) {
        line += (lang === 'zh' ? ' · 损失 -' : ' · Loss -') + rv.loss.toFixed(1) + t('pointsUnit');
        if (rv.grade) {
          line += ' · ' + (rv.grade === 'best' ? t('qualityGood') : rv.grade === 'ok' ? t('gradeOk') :
            rv.grade === 'bad' ? t('qualityBad') : t('qualityAwful'));
        }
      }
      if (typeof node.analysisScoreLeadBlack === 'number') {
        const sl = node.analysisScoreLeadBlack;
        line += ' · ' + (sl >= 0 ? 'B+' : 'W+') + Math.abs(sl).toFixed(1);
      }
      node.comment = node.comment ? node.comment + '\n' + line : line;
      node._annotated = true;
    }
  }
  $('saveBtn').addEventListener('click', () => {
    annotateSgfComments();
    const sgf = GE.gameToSgf(game());
    const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'got-' + new Date().toISOString().slice(0, 10) + '.sgf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* 当前手备注编辑（写入 SGF C[]），与自动存盘共用同一防抖 */
  $('commentBox').addEventListener('input', () => {
    if (!state.game) return;
    game().current.comment = $('commentBox').value;
  });
  function syncCommentBox() {
    const cb = $('commentBox');
    if (document.activeElement !== cb) cb.value = game().current.comment || '';
  }

  function applyI18n() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $('languageToggleText').textContent = lang === 'zh' ? 'English' : '简体中文';
    for (const el of document.querySelectorAll('[data-i18n]')) {
      const key = el.getAttribute('data-i18n');
      if (I18N[lang][key] !== undefined) el.textContent = I18N[lang][key];
    }
    for (const el of document.querySelectorAll('[data-i18n-title]')) {
      const key = el.getAttribute('data-i18n-title');
      if (I18N[lang][key] !== undefined) el.title = I18N[lang][key];
    }
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (I18N[lang][key] !== undefined) el.placeholder = I18N[lang][key];
    }
    for (const el of document.querySelectorAll('[data-i18n-aria]')) {
      const key = el.getAttribute('data-i18n-aria');
      if (I18N[lang][key] !== undefined) el.setAttribute('aria-label', I18N[lang][key]);
    }
    $('languageToggle').setAttribute('aria-label', t('languageToggle'));
    applyTheme(state.theme);
    updateAutoplayBtn(); // 播放/暂停是动态文案，data-i18n 覆盖后需按状态重设
    updateEnginePill();  // 引擎徽章文案同样可能被 data-i18n 覆盖
    refreshStrengthLabels();  // 段位标签随语言切换（级 / kyu、段 / dan）
    syncWorkspaceUI();
    if (window.GoTLearning) window.GoTLearning.setLanguage(lang);
    if (window.GoTRecords) window.GoTRecords.setLanguage(lang);
    if (state.problem) renderProblemBanner();
    if ($('problemDialog').open) refreshProblemDialog();
  }
  $('languageToggle').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('got.lang', lang);
    applyI18n();
    renderAll();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog:modal')) {
      setMobilePanel(false);
      closeDialog('settingsDialog');
      closeDialog('problemDialog');
      window.GoTRecords?.close();
      return;
    }
    if (['learn', 'home'].includes(state.workspace)) return;
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const g = game();
    switch (e.key) {
      case 'Home': navigateTimeline('first'); e.preventDefault(); break;
      case 'End': navigateTimeline('last'); e.preventDefault(); break;
      case 'ArrowLeft': navigateTimeline(-1); e.preventDefault(); break;
      case 'ArrowRight': navigateTimeline(1); e.preventDefault(); break;
      case 'u': case 'U': doUndo(); e.preventDefault(); break;
      case 'r': case 'R': doRedo(); e.preventDefault(); break;
      case 'ArrowUp': {
        const p = g.current.parent;
        if (p) {
          const i = p.children.indexOf(g.current);
          if (i > 0) { goToNode(p.children[i - 1]); e.preventDefault(); }
        }
        break;
      }
      case 'ArrowDown': {
        const p = g.current.parent;
        if (p) {
          const i = p.children.indexOf(g.current);
          if (i < p.children.length - 1) { goToNode(p.children[i + 1]); e.preventDefault(); }
        }
        break;
      }
      case 'p': case 'P': if (!state.problem && isHumanTurn()) humanPass(); break;
      case 'n': case 'N': $('numbersBtn').click(); break;
      case 'a': case 'A': $('analysisBtn').click(); break;
      case 'o': case 'O': if (!state.problem) $('ownershipBtn').click(); break;
      case 's': case 'S': if (!state.problem) $('scoreBtn').click(); break;
      case 'm': case 'M':
        state.soundOn = !state.soundOn;
        saveSettings();
        showToast(state.soundOn ? t('soundOn') : t('soundOff'));
        syncWorkspaceUI();
        break;
      case 'f': case 'F': $('flipBtn').click(); break;
      case '[': navBlunder(-1); break;
      case ']': navBlunder(1); break;
      case 'Escape':
        if (state.pendingMove) { state.pendingMove = null; renderBoard(); renderSide(); }
        else if (state.previewNode) { exitPreview(); renderBoard(); }
        break;
    }
  });

  /* ================= 缓存自净 =================
   * 旧版 SW 是"缓存优先"，用户的浏览器可能长期停在旧代码上（改了文件也不生效，
   * 甚至服务没开时还从缓存打开页面 → AI 永远连不上）。这里给三道保险：
   *   1) 版本号变了 → 清空 CacheStorage 并重载一次（每会话只重载一次，防循环）
   *   2) SW 更新完成 → 立刻接管并重载一次
   *   3) 「关于」里的「清除缓存并重载」手动逃生舱；URL 加 ?nosw 可彻底注销 SW */
  function purgeCaches() {
    if (typeof caches === 'undefined' || !caches || !caches.keys) return Promise.resolve();
    return caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => { });
  }
  function reloadGuardOk() {
    let last = 0;
    try { last = Number(sessionStorage.getItem('got.reload') || 0); } catch (e) { }
    if (Date.now() - last < 5000) return false;     // 会话内 5s 内不重复重载
    try { sessionStorage.setItem('got.reload', String(Date.now())); } catch (e) { }
    return true;
  }
  /* 版本升级 → 重载一次让新代码接管。
   * 注意：**这里不清 CacheStorage**。清空 + 重载是一组危险动作——万一重载时
   * 本地服务已关，SW 就没有任何东西可兜底，用户只会看到浏览器错误页。
   * 缓存自净交给 SW 自己（activate 时按版本名删除旧缓存）；只有用户手动点
   * 「清除缓存并重载」才会真清。 */
  function reloadFresh(msg) {
    if (!reloadGuardOk()) return;
    showToast(msg || t('newVersion'));
    const u = new URL(location.href);
    u.searchParams.set('_t', String(Date.now()));   // 时间戳绕过残留缓存
    location.replace(u.toString());
  }
  function checkVersionCache() {
    let seen = null;
    try { seen = localStorage.getItem('got.ver'); } catch (e) { }
    if (!APP_VER) return false;                     // 取不到版本：不做任何判断
    try { localStorage.setItem('got.ver', APP_VER); } catch (e) { }
    if (!seen || seen === APP_VER) return false;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      reloadFresh(t('newVersion'));
      return true;
    }
    return false;
  }
  /* 每次打开都是新一局：把上一会话残留的对局态与所有派生缓存清空 */
  function hardResetSession() {
    state.opponent = gtp.info ? 'gtp' : 'builtin';
    state.humanColor = BLACK;
    state.mode = 'play';
    state.workspace = 'play';
    state.browsing = false;
    clearPvChips();               // 会话重置：清掉残留的 chip 高亮
    state.previewNode = null;
    state.pendingMove = null;
    state.deadStones.clear();
    state.reviewRunning = false;
    state.reviewStop = false;
    state.autoplay = false;
    if (state.autoplayTimer) { clearInterval(state.autoplayTimer); state.autoplayTimer = 0; }
    state.scoreOwnership = null;
    analysisCache.clear();
    previewCache.clear();
    gtpDownNotified = false;
    setThinking(BLACK, false);
  }

  /* 桥接心跳：连上之后每 20s 复核。KataGo/本地服务被关掉时立刻降级提示，
   * 恢复后自动切回，并在"引擎该走却卡住"时补一手——不再等到下次轮到引擎才发现。 */
  let heartbeatTimer = 0;
  function maybeResumeEngineTurn() {
    if (!game() || state.mode !== 'play' || game().result) return;
    if (state.workspace === 'review' || effOpponent() === 'human') return;
    if (isHumanTurn() || engineThinking) return;
    requestEngineMove();
  }
  function startBridgeHeartbeat() {
    if (heartbeatTimer || location.protocol.indexOf('http') !== 0) return;
    heartbeatTimer = setInterval(async () => {
      const res = await gtp.health(4000);
      if (res.ok) {
        if (!gtp.info) {
          gtp.info = res.engine;
          gtpDownNotified = false;
          updateEnginePill();
          showToast(t('gtpRestored'));
          applyDefaultOpponent();
          if ($('newGameDialog').open) updateNgEngineHint();
          maybeResumeEngineTurn();
        }
        return;
      }
      if (gtp.info) {
        gtp.info = null;
        updateEnginePill();
        if ($('newGameDialog').open) updateNgEngineHint();
        if (effOpponent() !== state.opponent) noteGtpFallback();
      }
    }, 20000);
  }

  /* ================= boot ================= */
  function boot() {
    /* 每次打开都是全新对局，直接进入空棋盘：
     * - 棋局内容不落 localStorage（用户要求），旧版的 got.sgf 自动存盘已移除；
     *   这里顺手清掉老版本残留的存盘数据。
     * - 设置（got.settings / got.lang）照常持久化。 */
    try { localStorage.removeItem('got.sgf'); } catch (e) { }
    if (checkVersionCache()) return;    // 版本升级：清缓存后重载，本轮不再初始化
    /* 逃生舱：?nosw 注销全部 Service Worker 并清缓存（SW 行为异常时用一次即可） */
    try {
      if (new URLSearchParams(location.search).has('nosw') && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          Promise.all(regs.map((r) => r.unregister())).then(() => purgeCaches());
        }).catch(() => { });
      }
    } catch (e) { /* ignore */ }
    hardResetSession();
    state.game = new GE.Game({ size: 19, rules: 'chinese' });
    switchTab('analysis');
    applyI18n();
    $('analysisBtn').setAttribute('aria-pressed', String(state.analysisOn));
    /* 分析开关持久化恢复时同步点亮自动推演（与"开分析即开推演"行为一致） */
    if (state.analysisOn) {
      state.autoPreview = true;
      $('autoPreviewBtn').setAttribute('aria-pressed', 'true');
    }
    $('confirmBtn').setAttribute('aria-pressed', String(state.confirmMove));
    $('coordsBtn').setAttribute('aria-pressed', String(state.showCoords));
    $('flipBtn').setAttribute('aria-pressed', String(state.flip));
    updateAutoplayBtn();
    console.log('%cGoT %c' + APP_VER, 'font-weight:bold', 'color:#d9ad60;font-weight:bold');
    const av = $('aboutVersion');
    if (av) av.textContent = 'v' + (APP_VER || '—');
    renderer.resizeTo(stage);
    renderAll();
    updateEnginePill();
  /* 引擎桥接探测：立即尝试一次；若桥已启动但引擎未就绪（如 KataGo 首次调优）
   * 则每 4 秒重试，最多约 2 分钟。file:// 下桥不可达时不空转。 */
  async function tryConnectEngine() {
    const res = await gtp.health(4000);
    if (res.ok) {
      gtp.info = res.engine;
      updateEnginePill();
      /* 桥接恢复：清掉"已降级"提示标记，并在引擎该走却卡住时补一手 */
      gtpDownNotified = false;
      maybeResumeEngineTurn();
      /* KataGo 在线即默认对手（最强 AI）：不管是不是首次使用，只要用户没手动
       * 选过对手、也还没落子就切过去。以前判 !savedSettings，导致第二次起
       * 永远停在内置 AI。 */
      applyDefaultOpponent();
      /* 桥接连上只刷新引擎提示，不重跑 syncNewGameDialog——
       * 用户可能正在对话框里改棋盘/棋力/执子，此刻重置回默认很恼人 */
      if ($('newGameDialog').open) updateNgEngineHint();
      return true;
    }
    return res;
  }
  (async function pollEngine() {
    const first = await tryConnectEngine();
    if (first === true) { startBridgeHeartbeat(); return; }
    const UNREACHABLE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;
    const reachable = !(first && first.error && UNREACHABLE.test(String(first.error)));
    if (!reachable && location.protocol.indexOf('http') !== 0) return;
    /* http 下连不上 = 本地服务没开（或页面只是 SW 缓存里的旧副本）。
     * 明确说一次，免得用户面对"AI 一动不动"而不知所措。 */
    if (!reachable && location.protocol.indexOf('http') === 0) showToast(t('serverDown'));
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000));
      if ((await tryConnectEngine()) === true) { startBridgeHeartbeat(); return; }
      if (location.protocol.indexOf('http') !== 0) return; // http 下桥在线才持续重试
    }
    startBridgeHeartbeat();   // 两分钟内没起来也保持心跳，之后手动开服务可自动接管
  })();
  /* SW：注册 + 更新即接管（每会话最多重载一次）。
   * 不这么做的话，新版本 SW 会一直停在 waiting，用户关页面再开仍是旧代码。 */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;
    const hadController = !!navigator.serviceWorker.controller;   // 首次访问不该触发"更新重载"
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (!reg) return;
      if (hadController && reg.waiting) { reloadFresh(t('newVersion')); return; }
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && hadController && navigator.serviceWorker.controller) reloadFresh(t('newVersion'));
        });
      });
    }).catch(() => { });
  }
  registerServiceWorker();
    /* 打开即直接进入空棋盘（不弹新对局对话框）：19 路 · 中国规则 · 你执黑 ·
     * 对手为 AI（KataGo 在线自动用 KataGo，否则内置）。想自选规则/让子/执白，
     * 点「新对局」即可。 */
    syncNewGameDialog();
    updateNgEngineHint();
    requestAnalysis(game().current);
  }
  boot();
  setWorkspace('home');
})();
