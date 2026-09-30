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
  let aiMatch = null;
  function isAIMatch() { return !!aiMatch && aiMatch.game === game() && !state.problem && !state.practice; }
  function matchSide(color) { return aiMatch.sides[color]; }
  function renderAIMatch() {
    const active = isAIMatch() && state.workspace === 'play';
    $('aiMatchControls').hidden = !active;
    if (!active) return;
    const stopped = aiMatch.paused || state.mode !== 'play' || !!game().result;
    $('aiMatchStatus').textContent = (isZh() ? 'AI 对 AI · ' : 'AI vs AI · ') + (game().result || (state.mode==='score' ? (isZh()?'双方停着，等待点目':'Both passed; scoring') : stopped ? (isZh()?'已暂停':'Paused') : (isZh()?'对弈中':'Playing')));
    $('aiMatchToggle').textContent = stopped ? (isZh()?'继续对弈':'Resume') : (isZh()?'暂停对弈':'Pause');
    $('aiMatchStep').textContent = isZh()?'只走一手':'One move';
    $('aiMatchToggle').disabled = state.mode!=='play' || !!game().result;
    $('aiMatchStep').disabled = !stopped || aiMatch.inFlight || state.mode!=='play' || !!game().result;
    $('aiMatchHint').textContent = isZh()?'双方分别使用所选棋力。浏览棋谱、切换页面或打开编辑器会暂停；可保存棋谱后复盘。':'Each side uses its chosen rank. Navigation or editing pauses play. Save the SGF to review it later.';
  }
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
    const assessmentKind = assessment.engine === 'builtin' ? 'mcts' : assessment.engine === 'gtp' ? 'b18' : assessment.engine;
    const assessmentName = strengthKindName(assessmentKind, !isZh());
    label.textContent=(isZh()?'棋力测评 · ':'Assessment · ')+assessmentName+' · '+difficultyText(assessment.level, assessmentKind)+(assessment.finished?(isZh()?' · 本盘已完成':' · Completed'):'');panel.append(label);
    const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent=assessment.finished?(isZh()?'查看结果与下一盘':'Results & next game'):(isZh()?'结束测评，继续普通对局':'End assessment, keep playing');button.onclick=()=>{if(assessment?.finished){setWorkspace('learn');window.GoTLearning.setSection('growth');}else{assessment=null;renderAll();}};panel.append(button);
  }

  /* ================= i18n ================= */
  const I18N = {
    zh: {
      board25dQualityLabel:'画质',qualityAuto:'自动适配设备',qualityLow:'省电 · 接触阴影',qualityBalanced:'均衡 · 柔和阴影',qualityHigh:'精细 · 高清材质',board2dMotionLabel:'2D 落子与提子动画',board2dMotionHint:'只控制经典 2D 棋盘；3D 动画可单独设置。',board25dMotionLabel:'落子与提子动画',motionOn:'开启',motionOff:'关闭',board25dMotionHint:'只控制 3D 棋盘；2D 动画可在操作偏好中单独设置。复盘逐手浏览始终直接更新。',boardAnimationSpeedLabel:'棋盘动画速度',boardAnimationSpeedHint:'同时应用于 2D 与 3D；两种棋盘的动画开关仍然独立。',animationSpeedSlow:'舒缓 · 0.75×',animationSpeedNormal:'标准 · 1×',animationSpeedQuick:'稍快 · 1.25×',animationSpeedFast:'快速 · 1.5×',
      recordLibrary: '棋谱', exportRecord: '导出棋谱',
      homeWorkspace: '首页', shellSettings: '设置', backToBoard: '返回棋盘', tutorExit: '结束', browseRecords: '浏览棋谱',
      appearanceReset: '恢复棋盘默认外观', appearanceResetTitle: '恢复默认外观？', appearanceResetHelp: '恢复主题、棋盘与棋子材质、坐标、视角、自然落点及动画设置。当前棋盘模式保留。', appearanceResetMessage: '只恢复棋盘外观。棋局、棋谱、API Key、学习记录、音效和落子确认设置都会保留。', appearanceResetDone: '已恢复默认外观', appearanceResetUnsaved: '外观已恢复，但浏览器未能保存；重新打开后可能恢复旧设置。', themeSettingsTitle: '界面主题', classicAppearance: '经典 2D 棋盘外观', classicAppearancePreviewLabel: '经典 2D 棋盘局部样式预览', analysisDisplay: '分析显示', settingsMaintenance: '安装与更新', settingsResources: '帮助与项目信息', engineCompute: '围棋计算引擎',
      settingsTitle: '设置', settingsSectionPlay: '对局', settingsSectionEngine: '引擎',
      tutorStorageTitle: '本地存储管理 · 历史课堂', tutorStorageHint: '课堂默认不保存。点击课堂里的“保存课堂”后，记录和棋局快照才会保存在此浏览器。', tutorStorageEmpty: '还没有保存的课堂。', tutorStorageUntitled: 'AI 老师课堂', tutorStorageLoad: '载入', tutorStorageDelete: '删除', tutorStorageDeleted: '课堂记录已删除。', tutorStorageDeleteFailed: '删除失败，请检查浏览器存储空间。', tutorStorageLoadFailed: '这段课堂没有可恢复的棋局快照。', tutorRecordDeleteTitle: '删除这段课堂记录？', tutorRecordDeleteConfirm: '这会从此浏览器删除选中的课堂记录和棋局快照，无法撤销。', tutorRecordDeleteAction: '删除记录', tutorPrivacyHelp: '课堂默认不保存；点击“保存课堂”后，记录只保存在当前网站的此浏览器。提问时，当前棋局、问题及必要课堂上下文会发送给所选模型供应商。',
      versionScheme: '正式版采用 v1.0.0；开发版以 a 开头并标注 Alpha，例如 a2.7.8。v1.0.0 对应内部开发版 a2.7.8。', tutorUndo: '撤回我的上一手', tutorReturn: '返回课堂继续', tutorVerify: '验证并读取模型', tutorForget: '删除此供应商密钥', tutorApiHeading: '老师 AI API', tutorApiHelp: '选择 DeepSeek API、OpenCode Go，或填写兼容 OpenAI Chat Completions 的自定义服务。API Key 仅保存在当前标签页会话，关闭标签页后需要重新填写；自定义服务地址和请求内容会经老师接口转发。', tutorPrivacyTitle: '隐私与课堂记录', tutorPrivacyHelp: '课堂对话只保存在当前网站的这个浏览器，不会自动同步。提问时，当前棋局、问题及必要的课堂上下文会发送给所选模型供应商。清除课堂记录不会删除密钥、棋局或学习进度。', tutorHistoryClear: '清除本机课堂记录', tutorHistoryClearTitle: '清除本机课堂记录？', tutorHistoryClearConfirm: '这只会删除当前浏览器保存的老师对话记录，不会删除 API Key、棋局或学习进度。', tutorHistoryClearAction: '清除课堂记录', tutorHistoryCleared: '本机老师对话记录已清除', tutorHistoryClearFailed: '浏览器未能清除课堂记录，请检查网站存储权限后重试。', tutorRateLimited: '老师请求较频繁，请稍后再试；课堂内容已保留。', tutorApiProvider: '供应商', tutorProviderCustom: '自定义', tutorCustomEndpoint: 'API 根地址', tutorCustomEndpointHint: '仅支持公开 HTTPS 地址，需支持工具调用的 Chat Completions；/models 不可用时可手动填模型 ID。填写 API 根地址，通常以 /v1 结尾。', tutorCustomEndpointPlaceholder: 'https://api.example.com/v1', tutorCustomModel: '自定义模型 ID', tutorCustomModelPlaceholder: '读取模型列表或输入模型 ID', tutorApiModel: '模型', tutorApiKeyLabel: 'API Key', tutorModelsRefresh: '读取可用模型', tutorApiSave: '保存老师 AI 设置', tutorExplainPosition: 'AI 老师讲解', tutorExplainMove: '老师讲解本手', tutorAutoReply: '自动回复', tutorExplainCurrent: '讲解当前',
      tutorPrivacyHelp: '课堂默认不保存；点击“保存课堂”后，记录只保存在当前网站的此浏览器。提问时，当前棋局、问题及必要课堂上下文会发送给所选模型供应商。',
      settingsSectionBoard: '棋盘与显示', settingsSectionMore: '语言与关于', settingsSectionPersonalization: '个性化', personalizationAppearanceTitle: '棋盘外观',
      workspaceWidthTitle: '工作区宽度', workspaceWidthHint: '左边是导航，中间是棋盘，右边是工作区。桌面端生效；AI 老师课堂使用独立布局。', workspaceLayoutsTitle: '对弈与复盘面板', treeStyleTitle: '棋谱树样式', layoutPlay: '对弈', layoutReview: '复盘', workspaceLayoutsReset: '恢复默认设置',
      tutorPreferencesTitle: 'AI 老师偏好', tutorStyleLabel: '教学风格', tutorStylePatient: '耐心引导', tutorStyleDirect: '简明直接', tutorStyleSocratic: '启发提问', tutorDepthLabel: '讲解深度', tutorDepthBrief: '简短', tutorDepthBalanced: '适中', tutorDepthDetailed: '深入', tutorHintsLabel: '提示方式', tutorHintsProgressive: '逐步提示', tutorHintsGentle: '温和提示', tutorHintsExplicit: '明确提示', tutorPreferencesHint: '偏好保存在本机，只影响老师的表达与提示方式，不会更改课程答案或棋局。',
      settingsAbout: '关于 GoT', updateLog: '更新日志', privacyPolicy: '隐私政策', termsOfUse: '使用条款', installApp: '安装 GoT', installFromBrowser: '请打开浏览器菜单，选择“安装 GoT”或“添加到主屏幕”。', installStarted: '已开始安装 GoT。', installCancelled: '已取消安装。', installComplete: 'GoT 已安装，可从应用列表打开。', settingsCurrent: '当前：', languageLabel: '界面语言', noticeAbout: '使用指南',
      workspaceNav: '工作区', boardLabel: '棋盘', boardCanvasAria: '围棋棋盘', gameToolbar: '对局控制', moveNav: '手数导航', evalGraphAria: '胜率曲线', scoreModeAria: '点目工具', analysisColumn: '棋手与分析', matchInfo: '棋手信息', gameInfo: '对局信息', analysisTabs: '分析、复盘与棋谱面板', winrateAria: '黑方胜率', candidateAria: '候选着法', reviewTableAria: '每手评测', scoreTableAria: '点目明细', gameTreeAria: '棋谱树', strengthAria: '棋力', languageToggle: '切换语言',
      themeLabel: '主题', themeMode: '界面主题', themeObsidian: '石墨木纹', themePaper: '纸张暖白', themeForest: '森林青绿', themeHint: '界面与棋盘配色会一起更新，并记住你的选择。',
      materialMode: '棋盘材质', materialKaya: '榧木清韵', materialKayaPhoto:'榧木实景', materialTea: '古榧茶香', materialEbony: '玄檀静夜', materialAlphaGo: '浅金流光', materialMapleLight: '枫影疏晴', materialWalnutDark: '胡桃暮色', materialPaperAntique: '素笺怀古', materialSlateDark: '青石幽境', materialIvoryModern: '象牙凝霜', materialCinnabar: '朱漆流金', materialIndigo: '青岩叠嶂', materialCeladon: '碧瓷凝翠', materialHint: '木纹与棋子质感即时生效并记住选择。',
      stoneMode: '棋子材质', stoneYunzi: '云子含章', stoneClassic: '玄素雅韵', stoneMatte: '素石无华', stoneAlphaGo: '温润玄素', stoneSoftGloss: '柔光凝露', stonePhotorealistic: '莹然如真', stoneShellSlate: '贝雪岩墨', stoneJade: '琼玉生辉', stoneAntique: '象牙古韵', stonePorcelain: '瓷光映雪', stoneGoldenSatin: '玄曜凝光', stoneShellBrushed: '贝纹柔光', stoneInkFlat: '墨韵留白',
      board25dBackground:'场景背景',sceneDark:'墨色静境',sceneWood:'木案清谈',sceneTatami:'和室草席',sceneStone:'庭院石台',board25dAppearance: '3D 棋盘外观', board25dAppearanceHint: '只影响 3D 棋盘；可调整材质、色调、光泽、棋子、视角、棋盘格范围、光线与画质。', board25dFinishMode: '盘面材质', board25dToneMode: '盘面色调', board25dGlossMode:'表面光泽',board25dStoneMaterialMode:'棋子材质',board25dStoneMode: '棋子形状', board25dLightingMode: '棋盘光线', sharedLighting:'共享光照',enhancedShadows:'增强阴影',board25dCameraAngle:'俯视角度',board25dAngleNatural:'24° · 自然',board25dAngleRealistic:'36° · 实景',board25dGridScale:'棋盘格范围',board25dStoneDetail:'棋子立体预览', finishKaya: '榧木', finishMaple: '枫木', finishWalnut: '胡桃木', finishRosewood: '花梨木', finishBamboo: '竹纹', finishSlate: '青石', finishWalnutPbr:'胡桃实纹',finishOakPbr:'浅橡木',finishStonePbr:'岩层青石',toneNatural: '原色', toneLight: '浅色', toneDeep: '深色',glossMatte:'哑光',glossSatin:'缎面',glossPolished:'抛光',stoneMaterialYunzi:'温润云子',stoneMaterialStone:'山岩石子',stoneMaterialPremium:'高阶云子', stoneSingle: '单凸云子', stoneDouble: '双凸云子', lightDaylight: '自然日光', lightSidelight: '侧窗光', lightWarm: '柔和室内灯光',
      viewActual: '实战变化', viewBest: '推荐变化', reviewFailed: '未完成局面',
      pointsUnit: '目', deepen: '加深分析', analyzeMove: '指定着点', equalize: '等量比较', showAdvancedAnalysis: '显示高级分析工具', ownershipLoading: '正在计算形势…', ownershipUnavailable: '暂时无法计算形势，请稍后重试。', scoreEstimateFallback: 'AI 未能及时返回，已改用本地点目估算；可以继续手动标记死子。', searchComplete: '搜索完成 · 可加深', analysisFailed: '分析未完成', reviewDeepening: '复核失误', nativeRequired: '需要 Node 服务的 KataGo 专用分析协议', searchBudgetHint: '加深提高本次搜索预算；等量比较为各候选分配相同预算', pickMoveHint: '点击空点分析该着，不落子；再点按钮取消', comparingMoves: '候选比较中', comparisonDone: '比较完成', candidateDetail: '行棋方胜率 / 相对损目 / 搜索量', priorLabel: '策略先验', analysisGuide: '损目是 AI 估计值；2目起标记失误，5目起标记重大失误。低搜索量结果需加深复核。',
      boardDisplay: '棋盘显示', boardView25d: '3D 棋盘', boardView2d: '经典 2D 棋盘', board3dFallback: '3D 渲染不可用，已恢复经典棋盘。', boardAngleSliderLabel:'3D 棋盘快速设置', operationPreferences: '操作偏好', soundLabel: '音效', naturalPlacementLabel:'自然落点',naturalPlacementHint:'棋子显示位置轻移网格间距约 3%–5%；不影响实际落点。',boardPhotoExport:'导出棋盘 PNG',boardPhotoSaved:'棋盘 PNG 已导出。',boardPhotoFailed:'棋盘图片导出失败，请稍后重试。',
      shortcutHelp: '← → 浏览棋谱 · U 悔棋 · R 恢复悔棋 · M 音效 · Ctrl+1…4 切换分区',
      moreMenu: '更多', coreActions: '核心操作',
      inspectorCollapse: '收起面板', inspectorShow: '分析面板',
      historyRecords: '历史记录', playLocalTitle: '本地双人',
      analysisStart: '开始分析', analysisPause: '暂停分析', analysisPaused: '分析已暂停',
      analysisIntro: '直接在棋盘上落子开始对局。需要参考时，可开启 AI 分析。', analysisEmptyTitle: '分析从这里开始', analysisEmptyBody: '当前局面还没有分析结果。开启 AI 分析后，候选着法、胜率和形势会显示在这里。', treeEmpty: '落子后，棋谱会在这里留下脚印。需要研究时，再打开分支和备注。',
      browsingPosition: '浏览棋谱 · 自动落子已暂停', resumeHere: '从此处续弈',
      problemInstructions: '请依次走出双方的正确应对。', chooseProblem: '选择题目',
      problemBlackTurn: '当前黑方走', problemWhiteTurn: '当前白方走',
      problemIndependent: '独立完成', problemAssisted: '提示后完成', problemViewed: '已查看正解',
      playWorkspace: '对弈', reviewWorkspace: '复盘', learnWorkspace: '学习', learnWorkspaceTitle: '学习工作区', learningWorkspaceStatus: '学习中心', learningGuessStarted: '已打开猜着练习：先自己落子，再查看 AI', displayOptions: '棋盘设置', firstMove: '首手', previousMove: '上一手', nextMove: '下一手', lastMoveNav: '末手', graphLegend: '蓝线：黑方胜率 · 金线：目差 ±15', reviewPosition: '复盘中 · 自动落子已暂停',
      brandSub: '围棋', newGame: '新对局', openSgf: '打开', saveSgf: '保存', engineSettings: '引擎',
      engineOff: '内置引擎', black: '黑方', white: '白方', captures: '提子',
      rule: '规则', komi: '贴目', handicap: '让子', moveCount: '手数', result: '结果',
      lastMove: '上一手', autosaved: '已自动保存', undo: '悔棋', redo: '恢复悔棋', pass: '停着',
      resign: '认输', showNumbers: '手数', analysis: '分析', scoreMode: '点目',
      tabAnalysis: 'AI 分析', tabTutor: 'AI 讲解', tabTree: '棋谱树', scoreLead: '形势判断', evalGraph: '胜率曲线',
      candidates: '候选着法', ownership: '形势', backMain: '回到主线',
      treeBackVariation:'返回上一支路',treeBreadcrumbLabel:'变化路径',treeMainCrumb:'实战主线',treeEnterVariation:'进入变化',treeVariationName:'变化 {n}',treeStartsAt:'第 {n} 手起',treeVariationMoves:'共 {n} 手',treeCurrentMove:'当前手',livePosition: '实时局面', previewing: '预览中',
      ready: '就绪', newGameTitle: '新对局', boardSize: '棋盘', ruleChinese: '中国规则 · 数子',
      ruleJapanese: '日本规则 · 数目', ruleKorean: '韩国规则 · 数目', youPlay: '执子', auto: '自动',
      opponent: '对手', builtinAI: '内置 AI', gtpAI: 'KataGo', human: '双人', strength: '棋力',
      strengthRankNote: '级位/段位是约合值：不同引擎使用不同区间，对手按此强度走子；分析 / 点目 / 复盘始终满强度',
      thinkTime: '用时', timeControl: '计时', timeOff: '不计时', timeBlitz: '1分 + 3×20秒',
      timeStandard: '5分 + 3×30秒', timeLong: '10分 + 5×30秒', timeCasual: '15分（无读秒）', timeoutLoss: '超时判负',
      timeFischer: '3分 + 每手加2秒', opponentStrength: '对手棋力', strengthChanged: '对手棋力已调整',
      cancel: '取消', start: '开始对局', engineSettingsTitle: '引擎设置',
      engineHint: '浏览器内置棋力会在首次使用时自动加载；本机引擎可通过下方连接选项连接。',
      engineAdvancedOptions: '连接选项',
      browserKataGo: '浏览器 KataGo · g170-b6c96 轻量模型', browserEngineChecking: '检测浏览器能力…', browserEngineReady: '首次使用时自动加载', browserEngineLoading: '正在加载模型与推理运行时…', browserEngineLoaded: '已就绪', browserEngineUnavailable: '当前浏览器不支持本地 Web Worker', browserEngineNeedsHttp: '需通过 http(s) 打开：file:// 下浏览器禁止 Web Worker，请用本地服务或部署后访问', browserEngineFailed: '加载失败：', browserEngineLoad: '加载',
      engineChooseHint: '选择推理引擎；所选引擎不可用时自动回退内置 MCTS。',
      engineMcts: '内置 MCTS 算法', engineMctsDesc: '无需模型文件 · 本地搜索 · 九档约 18 级至 1 段（估算）', engineAlwaysOn: '始终可用',
      engineWorkerUnavailable: '内置 MCTS 当前不可用：请通过本机服务或 GoT.html 打开页面。',
      engineB6: '内置 KataGo g170-b6c96（浏览器）', engineB6Desc: '3.6 MB 模型 · 本地计算 · 九档约 18 级至 3 段（估算）',
      engineB10: '内置 KataGo kata1-b10c128-s1141046784-d204142634（浏览器）', engineB10Desc: '14.5 MB 模型 · 本地计算 · 九档约 18 级至 6 段（估算）',
      engineB18: '外置 KataGo kata1-b18c384nbt（本机桥接）', engineB18Desc: '模型大小随本机安装版本而异 · 本地计算 · 九档约 18 级至 9 段（估算）',
      engineStateReady: '可用', engineStateUnavailable: '不可用', engineActive: '当前使用',
      engineNeedBridge: '未检测到本机桥接', engineNeedsHttp: '需 http(s) 打开',
      engineFallbackHint: '所选引擎当前不可用，已回退内置 MCTS。', engineSwitchedMcts: '已切换到内置 MCTS 算法',
      bridgeUrl: '桥接地址', close: '关闭', connect: '连接', scoreTitle: '点目结果',
      keepPlaying: '继续对局', confirmResult: '确认结果', resignConfirm: '确认认输？',
      aboutText: 'GoT 是开源围棋工作台，提供对弈、学习、死活题、棋谱与复盘。',
      aboutCurrentTitle: '首次公开发布', aboutCurrentBody: '现代化界面与沉浸式 2D/3D 棋盘，支持 KataGo 智能分析、AI 交互教学、棋谱树浏览和个性化棋具选择。', versionAlpha: 'Alpha 开发版', aboutDevelopmentTitle: '稳定性与兼容性', aboutDevelopmentBody: '修复长棋谱处理、课堂快照提示和 3D 离线资源；改善老师密钥的本机保存方式。',
      aboutBoardTitle: '2.6.9 · 3D 棋盘升级', aboutBoardBody: '升级棋盘材质与棋子模型，并加入可调视角和棋盘格范围；俯视时与 2D 棋盘格距一致。',
      aboutComputeTitle: '网站版算力说明', aboutComputeBody: '网站版受浏览器和设备算力限制。需要更强的棋力与分析能力，可安装本机版并启用本地 KataGo。', aboutLicenseTitle:'开源许可',aboutLicenseSummary:'可使用、修改和再发布；再分发时请保留版权与许可声明。',aboutLicenseRead:'查看完整许可',aboutThirdParty:'第三方组件',aboutThirdPartySummary:'KataGo、Web KaTrain、TensorFlow.js 与网络模型按各自许可和声明文件提供。',aboutThirdPartyRead:'查看组件说明',aboutSourceLabel: 'GitHub 源码与本机版说明 ↗',
      aboutTutorTitle: '2.5 · AI 围棋老师（体验阶段）', aboutTutorBody: '气与提子、基础死活题和 19 路指导棋；等待棋力评估后讲解，支持提问、课堂记录和棋盘标注。教学反馈仍在持续完善。', aboutTutorAccess: '可使用自己的 DeepSeek、OpenCode Go 或兼容服务密钥，费用由所选服务商承担。API Key 仅保存在当前标签页会话，关闭标签页后需要重新填写；调用时经老师接口转发问题和相关局面。在线版需部署老师接口，本机版使用本机服务。',
      you: '你', youTurn: '轮到你落子', playGuideYourTurn: '轮到你了', playGuideOpponent: '对手正在思考', playGuideHint: '先看清局面，再决定下一手。需要参考时，切到 AI 分析页签。', playGuideOpponentHint: '不用急，等对手落子后继续。', gameOver: '对局结束',
      illegalOccupied: '此处已有棋子', illegalSuicide: '禁着点（自杀）', illegalKo: '劫争，需先寻劫',
      bothPassed: '双方连续停着，进入点目',
      resigned: '中盘胜', scoreLeadB: '黑优', scoreLeadW: '白优',
      qualityGood: '好棋', qualityBad: '缓着', qualityAwful: '败着',
      copied: '已复制到剪贴板', loadedSgf: '棋谱已载入', loadFail: '载入失败：', recordFolderEmpty: '文件夹中没有找到 SGF 棋谱。', recordFolderLoaded: '已读取 {n} 份 SGF 棋谱',
      connectOk: '已连接：', connectFail: '连接失败：', needConnect: '请先在「引擎」中连接 GTP 桥接',
      autoDeadDone: '已按形势标注死子', ruleCn: '中国规则', ruleJp: '日本规则', ruleKr: '韩国规则',
      scoreStripHint: '点击棋子标记 / 取消死子', scoreCalculating:'AI 正在计算点目…', autoMark: 'AI 标注', clearMarks: '清除',
      confirmScore: '确认', stonesRow: '棋子', territoryRow: '领地',
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
      reviewDepth: '深度', reviewDepthHint: '快速先筛选重点；标准适合日常复盘；深度会使用更多搜索量。', reviewDepthQuick: '快速', reviewDepthStandard: '标准', reviewDepthDeep: '深度',
      autoPreview: '自动推演', autoPreviewHint: '悬停候选圈立即推演；其他空点稍候，引擎推演该点之后的最佳应接',
      analyzing: '分析中…',
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
      branchCreated: '已切换到新支路',
      engineTimeout: '引擎响应超时——请检查「引擎」连接',
      pendingConfirm: '已预选落点，请确认或取消',
      pendingConfirmDouble: '已预选落点，双击同一位置确认', confirmModeLabel: '落子确认方式', confirmModeButton: '点击确认按钮', confirmModeDouble: '双击同一位置',
      commitMove: '确认落子', fullscreenBoard: '全屏棋盘', exitFullscreen: '退出全屏',
      zoomBoard: '放大棋盘', fitBoard: '完整棋盘', zoomBoardHint: '拖动看局部 · 轻点选落点',
      candEmptyHint: '开启「分析」或等待 AI 计算，即可查看候选着法与胜率',
      pvTitle: '变化图：点击某手可推演到该手为止；再点一次显示完整后续',
      fallbackBuiltin: 'KataGo 不可用——已自动改用内置 AI 对局',
      gtpRestored: 'KataGo 已恢复连接',
      serverDown: '本地服务未运行：AI 桥接不可用，已用内置 AI（运行 StartGoT.bat 或 node server.js 可用 KataGo）',
      applyUpdate: '更新页面', updateReady: '发现更新，请在方便时点击「更新页面」',
      clearCache: '清空缓存并重载',
      clearCacheConfirmTitle: '清空缓存并重载？',
      clearCacheConfirmMessage: '将清除此浏览器保存的 GoT 页面缓存并重新载入。棋局记录和设置不会被清除。',
      clearCacheConfirm: '清空并重载',
      cacheCleared: '缓存已清除，正在重载…',
      newVersion: '正在更新页面…',
      displaySettings: '显示设置',
      displaySettingsHint: '设置即时生效并保存在此浏览器。先选择棋盘模式，再调整对应的外观；操作与分析显示可分别设置。',
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
      board25dQualityLabel:'Quality',qualityAuto:'Match this device',qualityLow:'Battery saver · contact shadows',qualityBalanced:'Balanced · soft shadows',qualityHigh:'Fine · HD materials',board2dMotionLabel:'2D placement & capture animation',board2dMotionHint:'Controls the classic 2D board only; 3D motion has its own setting.',board25dMotionLabel:'Placement & capture motion',motionOn:'On',motionOff:'Off',board25dMotionHint:'Controls the 3D board only; set 2D motion separately under Move preferences. Review navigation always updates immediately.',boardAnimationSpeedLabel:'Board animation speed',boardAnimationSpeedHint:'Applies to both 2D and 3D; each board keeps its own animation switch.',animationSpeedSlow:'Gentle · 0.75×',animationSpeedNormal:'Standard · 1×',animationSpeedQuick:'Slightly faster · 1.25×',animationSpeedFast:'Fast · 1.5×',
      recordLibrary: 'Records', exportRecord: 'Export SGF',
      homeWorkspace: 'Home', shellSettings: 'Settings', backToBoard: 'Back to board', tutorExit: 'End', browseRecords: 'Browse records',
      appearanceReset: 'Reset board appearance', appearanceResetTitle: 'Restore default appearance?', appearanceResetHelp: 'Restore theme, board and stone materials, coordinates, angle, natural placement and animation. Keep the current board mode.', appearanceResetMessage: 'Only board appearance is reset. Games, records, API keys, learning progress, sound and move confirmation are kept.', appearanceResetDone: 'Default appearance restored', appearanceResetUnsaved: 'Appearance restored, but this browser could not save it. Old settings may return after reopening.', themeSettingsTitle: 'Interface theme', classicAppearance: 'Classic 2D board appearance', classicAppearancePreviewLabel: 'Corner sample from the classic 2D board', analysisDisplay: 'Analysis display', settingsMaintenance: 'Install and update', settingsResources: 'Help and project information', engineCompute: 'Go calculation engine',
      settingsTitle: 'Settings', settingsSectionPlay: 'Play', settingsSectionEngine: 'Engine',
      tutorStorageTitle: 'Local storage · Saved lessons', tutorStorageHint: 'Lessons are not saved automatically. They are stored in this browser only after you choose Save lesson.', tutorStorageEmpty: 'No saved lessons yet.', tutorStorageUntitled: 'AI teacher lesson', tutorStorageLoad: 'Load', tutorStorageDelete: 'Delete', tutorStorageDeleted: 'Lesson record deleted.', tutorStorageDeleteFailed: 'Could not delete the record. Check available browser storage.', tutorStorageLoadFailed: 'This lesson has no restorable board snapshot.', tutorRecordDeleteTitle: 'Delete this lesson record?', tutorRecordDeleteConfirm: 'This removes the selected lesson and its board snapshots from this browser. This cannot be undone.', tutorRecordDeleteAction: 'Delete record', tutorPrivacyHelp: 'Lessons are not saved automatically. After choosing Save lesson, the record stays in this browser for this site. When you ask the teacher, the current board, question and relevant lesson context are sent to the selected model provider.',
      versionScheme: 'Stable releases use v1.0.0. Alpha development builds use an a prefix, such as a2.7.8. v1.0.0 is based on a2.7.8.', tutorUndo: 'Undo my last move', tutorReturn: 'Return to lesson', tutorVerify: 'Verify and load models', tutorForget: 'Remove provider key', tutorApiHeading: 'Teacher AI API', tutorApiHelp: 'Choose DeepSeek API, OpenCode Go, or a custom OpenAI Chat Completions compatible service. API keys stay in this tab session and must be entered again after the tab closes; custom service URLs and requests pass through the teacher gateway.', tutorPrivacyTitle: 'Privacy and lesson history', tutorPrivacyHelp: 'Lesson conversations stay in this browser for this site and are not synced automatically. When you ask the teacher, the current board position, question and relevant lesson context are sent to the selected model provider. Clearing lesson history does not remove your key, games or learning progress.', tutorHistoryClear: 'Clear local lesson history', tutorHistoryClearTitle: 'Clear local lesson history?', tutorHistoryClearConfirm: 'This removes only teacher conversations saved in this browser. Your API key, games and learning progress will stay.', tutorHistoryClearAction: 'Clear lesson history', tutorHistoryCleared: 'Local teacher conversations cleared', tutorHistoryClearFailed: 'The browser could not clear lesson history. Check this site’s storage permissions and retry.', tutorRateLimited: 'Too many teacher requests. Wait a moment and retry; your lesson is preserved.', tutorApiProvider: 'Provider', tutorProviderCustom: 'Custom', tutorCustomEndpoint: 'API base URL', tutorCustomEndpointHint: 'Public HTTPS only. The service must support tool-calling Chat Completions. If /models is unavailable, enter a model ID manually. Enter the API base URL, usually ending in /v1.', tutorCustomEndpointPlaceholder: 'https://api.example.com/v1', tutorCustomModel: 'Custom model ID', tutorCustomModelPlaceholder: 'Load models or enter a model ID', tutorApiModel: 'Model', tutorApiKeyLabel: 'API key', tutorModelsRefresh: 'Load available models', tutorApiSave: 'Save teacher AI settings', tutorExplainPosition: 'Ask AI teacher', tutorExplainMove: 'Explain this move', tutorAutoReply: 'Auto reply', tutorExplainCurrent: 'Explain current',
      tutorPrivacyHelp: 'Lessons are not saved automatically. After choosing Save lesson, the record stays in this browser for this site. When you ask the teacher, the current board, question and relevant lesson context are sent to the selected model provider.',
      settingsSectionBoard: 'Board and display', settingsSectionMore: 'Language and about', settingsSectionPersonalization: 'Personalization', personalizationAppearanceTitle: 'Board appearance',
      workspaceWidthTitle: 'Workspace widths', workspaceWidthHint: 'Navigation on the left, board in the center and workspace on the right. Applies on desktop; AI Tutor uses its own layout.', workspaceLayoutsTitle: 'Play and review panels', treeStyleTitle: 'Game tree style', layoutPlay: 'Play', layoutReview: 'Review', workspaceLayoutsReset: 'Restore defaults',
      tutorPreferencesTitle: 'AI teacher preferences', tutorStyleLabel: 'Teaching style', tutorStylePatient: 'Patient guidance', tutorStyleDirect: 'Clear and direct', tutorStyleSocratic: 'Guided questions', tutorDepthLabel: 'Explanation depth', tutorDepthBrief: 'Brief', tutorDepthBalanced: 'Balanced', tutorDepthDetailed: 'Detailed', tutorHintsLabel: 'Hint style', tutorHintsProgressive: 'Step by step', tutorHintsGentle: 'Gentle', tutorHintsExplicit: 'Explicit', tutorPreferencesHint: 'Saved on this device. These preferences affect the teacher’s wording and hints, not lesson answers or the board.',
      settingsAbout: 'About GoT', updateLog: 'Release notes', privacyPolicy: 'Privacy policy', termsOfUse: 'Terms of use', installApp: 'Install GoT', installFromBrowser: 'Open the browser menu and choose “Install GoT” or “Add to Home screen”.', installStarted: 'GoT installation started.', installCancelled: 'Installation was cancelled.', installComplete: 'GoT is installed. Open it from your apps.', settingsCurrent: 'Current: ', languageLabel: 'Language', noticeAbout: 'User guide',
      workspaceNav: 'Workspace', boardLabel: 'Go board', boardCanvasAria: 'Go board', gameToolbar: 'Game controls', moveNav: 'Move navigation', evalGraphAria: 'Winrate graph', scoreModeAria: 'Scoring tools', analysisColumn: 'Players and analysis', matchInfo: 'Players', gameInfo: 'Game information', analysisTabs: 'Analysis, review and game tree', winrateAria: 'Black winrate', candidateAria: 'Candidate moves', reviewTableAria: 'Per-move review', scoreTableAria: 'Score breakdown', gameTreeAria: 'Game tree', strengthAria: 'Strength', languageToggle: 'Switch language',
      themeLabel: 'Theme', themeMode: 'Interface theme', themeObsidian: 'Graphite wood', themePaper: 'Warm paper', themeForest: 'Forest green', themeHint: 'The interface and board palette change together and stay remembered.',
      materialMode: 'Board material', materialKaya: 'Natural kaya', materialKayaPhoto:'Photographic kaya', materialTea: 'Teak brown', materialEbony: 'Ebony', materialAlphaGo: 'Golden wood', materialMapleLight: 'Light maple', materialWalnutDark: 'Dark walnut', materialPaperAntique: 'Antique paper', materialSlateDark: 'Dark slate', materialIvoryModern: 'Modern ivory', materialCinnabar: 'Cinnabar lacquer', materialIndigo: 'Indigo stone', materialCeladon: 'Celadon glaze', materialHint: 'Wood grain and stone finish apply instantly and are remembered.',
      stoneMode: 'Stone finish', stoneYunzi: 'Yunzi (soft satin)', stoneClassic: 'Classic (original)', stoneMatte: 'Matte (low glare)', stoneAlphaGo: 'Soft black & white stones', stoneSoftGloss: 'Soft gloss', stonePhotorealistic: 'Photorealistic', stoneShellSlate: 'Shell & slate', stoneJade: 'Jade', stoneAntique: 'Antique ivory', stonePorcelain: 'Glazed porcelain', stoneGoldenSatin: 'Golden satin', stoneShellBrushed: 'Brushed shell', stoneInkFlat: 'Flat ink',
      board25dBackground:'Scene background',sceneDark:'Quiet dark',sceneWood:'Wooden table',sceneTatami:'Tatami',sceneStone:'Garden stone table',board25dAppearance: '3D board appearance', board25dAppearanceHint: 'For the 3D board: adjust material, tone, gloss, stones, viewing angle, grid span, lighting and quality.', board25dFinishMode: 'Board surface', board25dToneMode: 'Surface tone', board25dGlossMode:'Surface gloss',board25dStoneMaterialMode:'Stone material',board25dStoneMode: 'Stone shape', board25dLightingMode: 'Board lighting', sharedLighting:'Shared lighting',enhancedShadows:'Enhanced shadows',board25dCameraAngle:'Viewing angle',board25dAngleNatural:'24° · Natural',board25dAngleRealistic:'36° · Realistic',board25dGridScale:'Grid span',board25dStoneDetail:'3D stone preview', finishKaya: 'Kaya', finishMaple: 'Maple', finishWalnut: 'Walnut', finishRosewood: 'Rosewood', finishBamboo: 'Bamboo', finishSlate: 'Slate',finishWalnutPbr:'Walnut grain',finishOakPbr:'Light oak',finishStonePbr:'Layered slate', toneNatural: 'Natural', toneLight: 'Light', toneDeep: 'Dark',glossMatte:'Matte',glossSatin:'Satin',glossPolished:'Polished',stoneMaterialYunzi:'Soft Yunzi',stoneMaterialStone:'Natural stone',stoneMaterialPremium:'Premium Yunzi', stoneSingle: 'Single-convex', stoneDouble: 'Double-convex', lightDaylight: 'Natural daylight', lightSidelight: 'Side window', lightWarm: 'Soft indoor light',
      viewActual: 'Played line', viewBest: 'Best line', reviewFailed: 'Incomplete positions',
      pointsUnit: 'pt', deepen: 'Deeper', analyzeMove: 'Pick move', equalize: 'Equal budget', ownershipLoading: 'Calculating position…', ownershipUnavailable: 'Position estimate is temporarily unavailable. Please try again.', scoreEstimateFallback: 'The AI did not respond in time. Local scoring is shown; you can still mark dead stones.', searchComplete: 'Search complete · deepen available', analysisFailed: 'Analysis incomplete', reviewDeepening: 'Checking mistakes', nativeRequired: 'Requires the Node server with native KataGo analysis', searchBudgetHint: 'Deeper increases this search budget; compare gives each move the same budget', pickMoveHint: 'Click an empty point to analyze without playing; click Pick move again to cancel', comparingMoves: 'Comparing moves', comparisonDone: 'Comparison complete', candidateDetail: 'Mover win rate / point loss / visits', priorLabel: 'Policy prior', analysisGuide: 'AI point-loss estimates: mistake ≥2pt, major mistake ≥5pt. Deepen low-visit results before drawing conclusions.',
      boardDisplay: 'Board display', boardView25d: '3D board', boardView2d: 'Classic 2D board', board3dFallback: '3D rendering is unavailable. The classic board has been restored.', boardAngleSliderLabel:'3D board quick settings', operationPreferences: 'Move preferences', soundLabel: 'Sound', naturalPlacementLabel:'Natural stone placement',naturalPlacementHint:'Stones sit 3–5% of a grid space off center; game coordinates do not change.',boardPhotoExport:'Export board PNG',boardPhotoSaved:'Board PNG exported.',boardPhotoFailed:'Could not export the board image. Please try again.',
      shortcutHelp: '← → Browse · U Undo · R Redo · M Sound · Ctrl+1…4 Sections',
      moreMenu: 'More', coreActions: 'Core actions',
      inspectorCollapse: 'Hide panel', inspectorShow: 'Side panel',
      historyRecords: 'History', playLocalTitle: 'Local two-player',
      analysisStart: 'Start analysis', analysisPause: 'Pause analysis', analysisPaused: 'Analysis paused', showAdvancedAnalysis: 'Show advanced analysis tools',
      analysisIntro: 'Play on the board to begin. Start AI analysis whenever you want guidance.', analysisEmptyTitle: 'Analysis starts here', analysisEmptyBody: 'This position has no analysis yet. Start AI analysis to see candidates, win rate and ownership here.', treeEmpty: 'Your moves will leave a trail here. Open branches and comments whenever you want to study.',
      browsingPosition: 'Browsing · AI moves paused', resumeHere: 'Play from here',
      problemInstructions: 'Play the correct responses for both sides in order.', chooseProblem: 'Choose problem',
      problemBlackTurn: 'Black to play now', problemWhiteTurn: 'White to play now',
      problemIndependent: 'Solved independently', problemAssisted: 'Solved with hints', problemViewed: 'Solution viewed',
      playWorkspace: 'Play', reviewWorkspace: 'Review', learnWorkspace: 'Learn', learnWorkspaceTitle: 'Learning workspace', learningWorkspaceStatus: 'Learning center', learningGuessStarted: 'Guess-the-move practice is open: play first, then check the AI', displayOptions: 'Board settings', firstMove: 'First', previousMove: 'Previous', nextMove: 'Next', lastMoveNav: 'Last', graphLegend: 'Blue: Black winrate · Gold: score ±15', reviewPosition: 'Review · AI moves paused',
      brandSub: 'GO', newGame: 'New', openSgf: 'Open', saveSgf: 'Save', engineSettings: 'Engine',
      engineOff: 'Built-in engine', black: 'Black', white: 'White', captures: 'Caps',
      rule: 'Rule', komi: 'Komi', handicap: 'Handicap', moveCount: 'Moves', result: 'Result',
      lastMove: 'Last move', autosaved: 'Autosaved', undo: 'Undo', redo: 'Redo', pass: 'Pass',
      resign: 'Resign', showNumbers: 'Numbers', analysis: 'Analysis', scoreMode: 'Score',
      tabAnalysis: 'AI Analysis', tabTutor: 'AI Explanation', tabTree: 'Game Tree', scoreLead: 'Score lead', evalGraph: 'Winrate graph',
      candidates: 'Candidates', ownership: 'Zone', backMain: 'Main line',
      treeBackVariation:'Back to previous line',treeBreadcrumbLabel:'Variation path',treeMainCrumb:'Main line',treeEnterVariation:'Enter variation',treeVariationName:'Variation {n}',treeStartsAt:'From move {n}',treeVariationMoves:'{n} moves',treeCurrentMove:'Current move',livePosition: 'LIVE POSITION', previewing: 'Previewing',
      ready: 'Ready', newGameTitle: 'New Game', boardSize: 'Board', ruleChinese: 'Chinese · area',
      ruleJapanese: 'Japanese · territory', ruleKorean: 'Korean · territory', youPlay: 'You play', auto: 'Auto',
      opponent: 'Opponent', builtinAI: 'Built-in AI', gtpAI: 'KataGo (GTP)', human: 'Human', strength: 'Strength',
      strengthRankNote: 'Approximate kyu/dan only: each engine uses its own range; analysis, scoring and review always run at full strength',
      thinkTime: 'Time', timeControl: 'Clock', timeOff: 'No clock', timeBlitz: '1 min + 3×20s',
      timeStandard: '5 min + 3×30s', timeLong: '10 min + 5×30s', timeCasual: '15 min (no byo-yomi)', timeoutLoss: 'Lost on time',
      timeFischer: '3 min + 2s/move', opponentStrength: 'Opponent strength', strengthChanged: 'Opponent strength updated',
      cancel: 'Cancel', start: 'Start', engineSettingsTitle: 'Engine settings',
      engineHint: 'Browser-based play loads automatically on first use. Connect a local engine from the options below.',
      engineAdvancedOptions: 'Connection options',
      browserKataGo: 'Browser KataGo · g170-b6c96 lightweight model', browserEngineChecking: 'Checking browser support…', browserEngineReady: 'Loads automatically on first use', browserEngineLoading: 'Loading the model and inference runtime…', browserEngineLoaded: 'Ready', browserEngineUnavailable: 'This browser cannot run a local Web Worker', browserEngineNeedsHttp: 'Needs http(s): file:// pages cannot create Web Workers. Serve the folder locally or deploy it, then reopen.', browserEngineFailed: 'Load failed: ', browserEngineLoad: 'Load',
      engineChooseHint: 'Pick the inference engine; if the choice is unavailable it falls back to built-in MCTS.',
      engineMcts: 'Built-in MCTS', engineMctsDesc: 'No model file · Local search · Nine levels: about 18 kyu to 1 dan (estimate)', engineAlwaysOn: 'Always available',
      engineWorkerUnavailable: 'Built-in MCTS is unavailable. Open the app through the local server or GoT.html.',
      engineB6: 'Built-in KataGo g170-b6c96 (browser)', engineB6Desc: '3.6 MB model · Local inference · Nine levels: about 18 kyu to 3 dan (estimate)',
      engineB10: 'Built-in KataGo kata1-b10c128-s1141046784-d204142634 (browser)', engineB10Desc: '14.5 MB model · Local inference · Nine levels: about 18 kyu to 6 dan (estimate)',
      engineB18: 'External KataGo kata1-b18c384nbt (local bridge)', engineB18Desc: 'Model size depends on the local installation · Local inference · Nine levels: about 18 kyu to 9 dan (estimate)',
      engineStateReady: 'Available', engineStateUnavailable: 'Unavailable', engineActive: 'Active',
      engineNeedBridge: 'No local bridge detected', engineNeedsHttp: 'Needs http(s)',
      engineFallbackHint: 'The selected engine is unavailable; fell back to built-in MCTS.', engineSwitchedMcts: 'Switched to built-in MCTS',
      bridgeUrl: 'Bridge URL', close: 'Close', connect: 'Connect', scoreTitle: 'Score Result',
      keepPlaying: 'Keep playing', confirmResult: 'Confirm result', resignConfirm: 'Resign the game?',
      aboutText: 'GoT is an open-source Go workspace for playing, learning, solving life-and-death problems, browsing records and reviewing games.',
      aboutCurrentTitle: 'First Public Release', aboutCurrentBody: 'A modern Go workspace with immersive 2D/3D boards, KataGo analysis, interactive AI lessons, a game tree and customizable boards and stones.', versionAlpha: 'Alpha', aboutDevelopmentTitle: 'Stability and compatibility', aboutDevelopmentBody: 'Improved long-record handling, lesson snapshot notices, offline 3D assets and local handling of teacher API keys.',
      aboutBoardTitle: '2.6.9 · 3D board upgrade', aboutBoardBody: 'Updated board materials and stone models, with adjustable viewing angle and board span calibrated to the 2D grid in top view.',
      aboutComputeTitle: 'About computing on the website', aboutComputeBody: 'The website version is limited by browser and device performance. For stronger play and deeper analysis, install the local edition and enable local KataGo.', aboutLicenseTitle:'Open-source license',aboutLicenseSummary:'Use, modify and redistribute GoT while retaining copyright and license notices.',aboutLicenseRead:'Read the full license',aboutThirdParty:'Third-party components',aboutThirdPartySummary:'KataGo, Web KaTrain, TensorFlow.js and networks follow their own licenses and notices.',aboutThirdPartyRead:'Component notices',aboutSourceLabel: 'GitHub source and local edition guide ↗',
      aboutTutorTitle: '2.5 · AI Go teacher (preview)', aboutTutorBody: 'Liberties and capture, basic life-and-death lessons, and 19×19 guided games. Explanations follow engine evaluation, with questions, lesson history and board annotations. Teaching feedback is still being refined.', aboutTutorAccess: 'Use your own DeepSeek, OpenCode Go or compatible-service key; charges come from the selected provider. API keys stay in this tab session and must be entered again after closing it. Requests forward the key, questions and relevant positions through the teacher gateway. Online hosting requires the gateway; the local edition uses its local service.',
      you: 'You', youTurn: 'Your move', playGuideYourTurn: 'Your turn', playGuideOpponent: 'Opponent is thinking', playGuideHint: 'Take in the position first. Open the AI analysis tab whenever you want a second opinion.', playGuideOpponentHint: 'No rush. Your game will continue when the move arrives.', gameOver: 'Game over',
      illegalOccupied: 'Point occupied', illegalSuicide: 'Suicide is forbidden', illegalKo: 'Ko — play a ko threat first',
      bothPassed: 'Both passed — scoring',
      resigned: 'wins by resignation', scoreLeadB: 'B+', scoreLeadW: 'W+',
      qualityGood: 'Good', qualityBad: 'Slow', qualityAwful: 'Mistake',
      copied: 'Copied to clipboard', loadedSgf: 'Game loaded', loadFail: 'Load failed: ', recordFolderEmpty: 'No SGF records were found in that folder.', recordFolderLoaded: 'Loaded {n} SGF records',
      connectOk: 'Connected: ', connectFail: 'Connection failed: ', needConnect: 'Connect the GTP bridge in "Engine" first',
      autoDeadDone: 'Dead stones marked by zone estimate', ruleCn: 'Chinese', ruleJp: 'Japanese', ruleKr: 'Korean',
      scoreStripHint: 'Click stones to toggle dead', scoreCalculating:'AI is estimating the score…', autoMark: 'AI mark', clearMarks: 'Clear',
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
      reviewDepth: 'Depth', reviewDepthHint: 'Quick finds priorities; Standard fits daily review; Deep spends more search on hard positions.', reviewDepthQuick: 'Quick', reviewDepthStandard: 'Standard', reviewDepthDeep: 'Deep',
      autoPreview: 'Auto PV', autoPreviewHint: 'Hover a candidate to preview instantly; hover elsewhere briefly for the engine line',
      analyzing: 'Analyzing…',
      prevBlunder: '◀ Prev blunder', nextBlunder: 'Next blunder ▶', noBlunders: 'No blunders found — run AI Review first',
      commentLabel: 'Note', commentPlaceholder: 'Add a note for this move (stored in SGF)',
      soundOn: 'Sound on', soundOff: 'Sound muted',
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
      branchCreated: 'Switched to new variation',
      engineTimeout: 'Engine timed out — check the "Engine" connection',
      pendingConfirm: 'Move selected · Confirm or cancel',
      pendingConfirmDouble: 'Move selected · Double-click the same point to confirm', confirmModeLabel: 'Confirmation style', confirmModeButton: 'Tap that button to confirm', confirmModeDouble: 'Double-tap same point',
      commitMove: 'Confirm move', fullscreenBoard: 'Full screen', exitFullscreen: 'Exit full screen',
      zoomBoard: 'Zoom board', fitBoard: 'Whole board', zoomBoardHint: 'Drag to pan · Tap to select',
      candEmptyHint: 'Turn on "Analysis" (or wait for the AI) to see candidates and winrates',
      pvTitle: 'PV line: click a move to preview up to it; click again for the full line',
      fallbackBuiltin: 'KataGo unavailable — switched to the built-in AI',
      gtpRestored: 'KataGo connection restored',
      serverDown: 'Local server is not running: AI bridge unavailable, using built-in AI (run StartGoT.bat or node server.js for KataGo)',
      applyUpdate: 'Update page', updateReady: 'Update ready. Select “Update page” when convenient',
      clearCache: 'Clear cache & reload',
      clearCacheConfirmTitle: 'Clear cache and reload?',
      clearCacheConfirmMessage: 'This clears the GoT page cache in this browser and reloads the app. Game records and settings will be kept.',
      clearCacheConfirm: 'Clear and reload',
      cacheCleared: 'Cache cleared — reloading…',
      newVersion: 'Updating the page…',
      displaySettings: 'Display settings',
      displaySettingsHint: 'Changes apply instantly and stay in this browser. Choose a board mode, then adjust its appearance. Interaction and analysis display have separate groups.',
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
  /* 韩语/日语/繁中只覆盖主界面；其他内容模块缺词统一回退英文。 */
  if (typeof window !== 'undefined' && window.GOT_I18N) Object.assign(I18N, window.GOT_I18N);
  const LANGS = ['zh', 'zhHant', 'en', 'ja', 'ko'];
  const LANG_NAMES = { zh: '简体中文', zhHant: '繁體中文', en: 'English', ja: '日本語', ko: '한국어' };
  const HTML_LANG = { zh: 'zh-CN', zhHant: 'zh-Hant', en: 'en', ja: 'ja', ko: 'ko' };
  let lang = localStorage.getItem('got.lang') || 'zh';
  if (!LANGS.includes(lang)) lang = 'zh';
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.zh[k] || k;
  const isZh = () => lang === 'zh' || lang === 'zhHant';
  function currentVersionLabel() {
    const version = window.GOT_VERSION || APP_VER || '—';
    return version + (window.GOT_VERSION_CHANNEL === 'alpha' ? ' · ' + t('versionAlpha') : '');
  }
  function syncVersionDisplay() {
    const label = currentVersionLabel();
    const badge = $('appVersionLabel');
    if (badge) {
      badge.textContent = label;
      badge.title = isZh() ? '软件版本' : 'Application version';
    }
    const about = $('aboutVersion');
    if (about) about.textContent = 'GoT ' + label;
    const development = window.GOT_VERSION_CHANNEL === 'alpha';
    const title = $('aboutCurrentTitle');
    if (title) title.textContent = t(development ? 'aboutDevelopmentTitle' : 'aboutCurrentTitle');
    const body = $('aboutCurrentBody');
    if (body) body.textContent = t(development ? 'aboutDevelopmentBody' : 'aboutCurrentBody');
    const settings = $('setVersion');
    if (settings) settings.textContent = 'GoT ' + label + ($('setApplyUpdate')?.dataset.ready === 'true' ? ' · ' + t('updateReady') : '');
  }

  /* ================= state ================= */
  let reviewReturnWorkspace = 'play'; // play | learn | records
  const mobileLayout = window.matchMedia('(max-width: 680px), (pointer: coarse)').matches;
  const state = {
    game: null,
    workspace: 'home',
    browsing: false,
    recoveryPaused: false,
    activeTab: 'tree',       // 对局先保持安静；进入复盘时再打开分析
    mode: 'play',            // play | score
    scorePending: false,
    scoreRunId: 0,
    previewNode: null,       // null | 'pv'
    deadStones: new Set(),
    showNumbers: false,
    analysisOn: false,
    autoPreview: false,      // 悬停交叉点自动推演后续局面（会话级，不持久化）
    showOwnership: false,
    showAdvancedAnalysis: false,
    opponent: 'builtin',     // builtin | gtp | human
    engine: 'auto',          // auto | mcts | b6 | b10 | b18 —— auto 为默认自动
    humanColor: BLACK,
    strength: 3,
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
    naturalPlacement: true,
    flip: false,           // 棋盘翻转 180°（腾讯/野狐风格）
    confirmMove: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
    confirmMode: 'button',   // Explicit confirmation is the touch default; saved preferences win.
    showCoords: !mobileLayout, // 默认：手机隐藏坐标，桌面显示坐标
    pendingMove: null,     // 确认模式下的待确认落子 {x,y}
    coachEnabled: false,
    autoplay: false,       // 复盘自动播放
    autoplayTimer: 0,
    candColor: 'winrate',  // 棋盘候选圈颜色：winrate 按胜率 | rank 按排名
    candSort: 'visits',    // 候选列表排序：visits 按访问量 | winrate 按胜率
    theme: 'obsidian',   // 界面与棋盘主题；首次打开默认深色
    material: 'kaya',    // 棋盘材质：kaya 原色木 | tea 茶色木 | ebony 黑檀木
    stone: 'classic',    // 棋子材质：yunzi 云子高光 | classic 经典原版 | matte 哑光低反光
    board25dFinish: 'kaya', board25dTone: 'deep', board25dBackground:'dark',board25dGloss:'satin',board25dStoneMaterial:'yunzi',board25dStoneShape: 'single', board25dLighting: 'daylight',board25dSharedLighting:true,board25dEnhancedShadows:true,board25dCameraAngle:54,board25dGridScale:100,
    showBoardAngleSlider: true,
    board25dQuality:'auto', board25dAnimations:true, board2dAnimations:true, boardAnimationSpeed:1.25,
    boardView25d: false, // Rendering mode is session-only; every launch starts in 2D.
    problem: null,         // 死活题运行态：{ p, items, idx, progress, done, wrong }
    problemPrev: null,     // 进入死活题前的对手/执子，退出时还原
    tutorMode: false,
    tutorMarks: [],
    practice: null,        // 复盘练习运行态 { prev, mover, moveNo }；非空时允许在已结束的棋谱上落子
    inspectorCollapsed: false  // 可折叠侧面板（桌面/平板并排时把视觉中心让给棋盘）；进got.settings
  };
  const appearanceKeys = ['theme','material','stone','showCoords','showNumbers','flip','naturalPlacement',
    'board25dBackground','board25dFinish','board25dTone','board25dGloss','board25dStoneMaterial','board25dStoneShape','board25dLighting','board25dSharedLighting','board25dEnhancedShadows','board25dCameraAngle','board25dGridScale','showBoardAngleSlider',
    'board25dQuality','board25dAnimations','board2dAnimations','boardAnimationSpeed'];
  const appearanceDefaults = Object.freeze(Object.fromEntries(appearanceKeys.map(key => [key, state[key]])));
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
    if (typeof savedSettings.naturalPlacement === 'boolean') state.naturalPlacement = savedSettings.naturalPlacement;
    if (typeof savedSettings.showAdvancedAnalysis === 'boolean') state.showAdvancedAnalysis = savedSettings.showAdvancedAnalysis;
    if (typeof savedSettings.confirmMove === 'boolean') state.confirmMove = savedSettings.confirmMove;
    state.coachEnabled = false;
    if (savedSettings.confirmMode === 'button' || savedSettings.confirmMode === 'double') state.confirmMode = savedSettings.confirmMode;
    const deviceCoords = mobileLayout ? savedSettings.showCoordsMobile : savedSettings.showCoordsDesktop;
    if (typeof deviceCoords === 'boolean') state.showCoords = deviceCoords;
    else if (!mobileLayout && typeof savedSettings.showCoords === 'boolean') state.showCoords = savedSettings.showCoords;
    if (savedSettings.flip === true) state.flip = true;
    if (savedSettings.candColor === 'winrate' || savedSettings.candColor === 'rank') state.candColor = savedSettings.candColor;
    if (savedSettings.candSort === 'visits' || savedSettings.candSort === 'winrate') state.candSort = savedSettings.candSort;
    if (['obsidian', 'paper', 'forest'].includes(savedSettings.theme)) state.theme = savedSettings.theme;
    if (['kaya', 'kaya-photo', 'tea', 'ebony', 'alphago', 'maple-light', 'walnut-dark', 'paper-antique', 'slate-dark', 'ivory-modern', 'cinnabar-lacquer', 'indigo-lacquer', 'celadon-lacquer'].includes(savedSettings.material)) state.material = savedSettings.material;
    if (['yunzi', 'classic', 'matte', 'alphago', 'soft-gloss', 'photorealistic', 'shell-slate', 'jade', 'antique', 'porcelain', 'golden-satin', 'shell-brushed', 'ink-flat'].includes(savedSettings.stone)) state.stone = savedSettings.stone;
    if (['kaya','maple','walnut','rosewood','bamboo','slate','walnut-pbr','oak-pbr','stone-pbr'].includes(savedSettings.board25dFinish)) state.board25dFinish=savedSettings.board25dFinish;
    if (['natural','light','deep'].includes(savedSettings.board25dTone)) state.board25dTone=savedSettings.board25dTone;
    if (['dark','wood','tatami','stone'].includes(savedSettings.board25dBackground)) state.board25dBackground=savedSettings.board25dBackground;
    if (['matte','satin','polished'].includes(savedSettings.board25dGloss)) state.board25dGloss=savedSettings.board25dGloss;
    if (['yunzi','premium-yunzi'].includes(savedSettings.board25dStoneMaterial)) state.board25dStoneMaterial=savedSettings.board25dStoneMaterial;
    if (['single','double'].includes(savedSettings.board25dStoneShape)) state.board25dStoneShape=savedSettings.board25dStoneShape;
    if (['daylight','sidelight','warm'].includes(savedSettings.board25dLighting)) state.board25dLighting=savedSettings.board25dLighting;
    if (typeof savedSettings.board25dSharedLighting==='boolean') state.board25dSharedLighting=savedSettings.board25dSharedLighting;
    if (typeof savedSettings.board25dEnhancedShadows==='boolean') state.board25dEnhancedShadows=savedSettings.board25dEnhancedShadows;
    if (Number.isFinite(savedSettings.board25dCameraAngle)) state.board25dCameraAngle=Math.max(0,Math.min(60,Math.round(savedSettings.board25dCameraAngle)));
    if (typeof savedSettings.showBoardAngleSlider === 'boolean') state.showBoardAngleSlider=savedSettings.showBoardAngleSlider;
    if (Number.isFinite(savedSettings.board25dGridScale)) state.board25dGridScale=Math.max(80,Math.min(100,Math.round(savedSettings.board25dGridScale)));
    if (['auto','low','balanced','high'].includes(savedSettings.board25dQuality)) state.board25dQuality=savedSettings.board25dQuality;
    if (typeof savedSettings.board25dAnimations==='boolean') state.board25dAnimations=savedSettings.board25dAnimations;
    if (typeof savedSettings.board2dAnimations==='boolean') state.board2dAnimations=savedSettings.board2dAnimations;
    if ([0.75,1,1.25,1.5].includes(savedSettings.boardAnimationSpeed)) state.boardAnimationSpeed=savedSettings.boardAnimationSpeed;
    if (savedSettings.clockPreset && Clock.PRESETS[savedSettings.clockPreset]) state.clockPreset = savedSettings.clockPreset;
    if (['auto', 'mcts', 'b6', 'b10', 'b18'].includes(savedSettings.engine)) state.engine = savedSettings.engine;
    if (typeof savedSettings.inspectorCollapsed === 'boolean') state.inspectorCollapsed = savedSettings.inspectorCollapsed;
  }

  function saveSettings() {
    try {
      localStorage.setItem('got.settings', JSON.stringify({
        strength: state.strength, timeMs: state.timeMs,
        analysisSeconds: state.analysisSeconds, reviewDepth: state.reviewDepth, soundOn: state.soundOn, naturalPlacement: state.naturalPlacement,
        bridgeUrl: $('bridgeUrl').value,
        confirmMove: state.problemPrev ? state.problemPrev.confirmMove : state.confirmMove, confirmMode: state.confirmMode, showCoords: state.showCoords,
        showCoordsDesktop: mobileLayout ? (savedSettings?.showCoordsDesktop ?? savedSettings?.showCoords ?? true) : state.showCoords,
        showCoordsMobile: mobileLayout ? state.showCoords : (savedSettings?.showCoordsMobile ?? false),
        flip: state.flip, candColor: state.candColor, candSort: state.candSort, theme: state.theme, material: state.material, stone: state.stone,
        board25dBackground:state.board25dBackground,board25dGloss:state.board25dGloss,board25dStoneMaterial:state.board25dStoneMaterial,board25dFinish:state.board25dFinish,board25dTone:state.board25dTone,board25dStoneShape:state.board25dStoneShape,board25dLighting:state.board25dLighting,board25dSharedLighting:state.board25dSharedLighting,board25dEnhancedShadows:state.board25dEnhancedShadows,board25dCameraAngle:state.board25dCameraAngle,board25dGridScale:state.board25dGridScale,showBoardAngleSlider:state.showBoardAngleSlider,
        board25dQuality:state.board25dQuality,board25dAnimations:state.board25dAnimations,board2dAnimations:state.board2dAnimations,boardAnimationSpeed:state.boardAnimationSpeed,
        clockPreset: state.clockPreset, engine: state.engine, coachEnabled: state.coachEnabled,
        inspectorCollapsed: state.inspectorCollapsed, showAdvancedAnalysis: state.showAdvancedAnalysis
      }));
      return true;
    } catch (e) { return false; }
  }
  /* 把底层 fetch 报错翻译成可操作的提示 */
  function friendlyFetchError(err) {
    const raw = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw)) return t('bridgeDown');
    return raw;
  }
  /* 转义来自 SGF/文件等外部数据的文本，避免拼进 innerHTML 时形成注入 */
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  const analysisCache = new Map();   // nodeId -> normalized analysis
  /* Keep KataGo ownership separate from move-analysis cache entries: a later
   * win-rate refresh must not evict the exact estimate shared by shape/score. */
  const ownershipResultCache = new WeakMap();
  let scoreReadyPromise = Promise.resolve();
  let resolveScoreReady = null;
  let ownershipRequestNode = null;
  let ownershipRequestKind = null;
  let ownershipRetryRequested = false;
  let ownershipAttemptedNode = null;
  let ownershipAttemptedKind = null;
  const aiEstimateInFlight = new WeakMap();
  let analysisSeq = 0;
  let requestedAnalysisMarker = '';
  let analysisController = null, reviewController = null, engineMoveController = null, pickAnalysisMove = false;
  function cancelNativeAnalysis() {
    if (analysisController) analysisController.abort();
    analysisController = null;
    pickAnalysisMove = false;
  }
  let moveSeq = 0;
  let engineWorkerCleanup = null;
  let requestedAnalysisNode = null;
  let reviewRunId = 0;
  let pendingGtp = 0;
  let gtpAnalysisQueued = false;     // GTP 分析在途时到达的新请求：完成后自动补发，而不是丢弃
  /* 放弃在途引擎走子：换手/导航/换局都用它（而不只是 moveSeq++）——
   * 否则在途结果的 seq 护卫直接 return，engineThinking 无人清理 → 思考中常亮、悬停推演整局失效 */
  function abandonEngine() {
    if (engineWorkerCleanup) { engineWorkerCleanup(); engineWorkerCleanup=null; }
    if (isAIMatch()) { aiMatch.paused=true; aiMatch.inFlight=false; aiMatch.single=false; clearTimeout(aiMatch.timer); }
    if (engineMoveController) engineMoveController.abort();
    engineMoveController = null;
    cancelCoach();
    if (gtp.browser && (gtp.browser._busy || gtp.browser.status === 'loading')) gtp.browser.cancel();
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
      if (window.GoTAI?.GoAI) {
        console.warn('Using the built-in MCTS on the main thread as a fallback.');
        const ai = new window.GoTAI.GoAI(), listeners = new Set();
        const emit = data => {
          const event = { data };
          if (typeof adapter.onmessage === 'function') adapter.onmessage(event);
          for (const fn of listeners) fn(event);
        };
        const adapter = {
          onmessage: null, onerror: null,
          postMessage(message) {
            if (message?.type === 'stop') { ai.stop(); return; }
            if (message?.type !== 'analyze') return;
            setTimeout(() => {
              try { const result = ai.analyze(message.position || {}, message.opts || {}); if (message.marker) result.marker = message.marker; emit(result); }
              catch (error) { emit({ type: 'result', error: String(error && error.stack || error), done: true, marker: message.marker }); }
            }, 0);
          },
          addEventListener(type, fn) { if (type === 'message') listeners.add(fn); },
          removeEventListener(type, fn) { if (type === 'message') listeners.delete(fn); },
          terminate() { ai.stop(); listeners.clear(); }
        };
        return adapter;
      }
      return {
        unavailable: true, onmessage: null, onerror: null,
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
  const browserKataGo = gtp.browserModels.b6;
  const browserKataGoB10 = gtp.browserModels.b10;

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
  let coachController = null, coachEntry = null, coachRun = 0;
  function cancelCoach() {
    coachRun++;
    if (coachController) coachController.abort();
    coachController = null;
    coachEntry = null;
  }
  function openCoachLesson(topic) {
    const items = window.GoTCurriculum?.items || [];
    const ids = items.filter(item => item.topic === topic).map(item => item.id);
    setWorkspace('learn');
    if (ids.length && window.GoTTraining) window.GoTTraining.begin(ids);
    else window.GoTLearning?.setSection('growth');
  }
  function renderCoach() {
    const en = !isZh(), panel = $('moveCoach');
    panel.hidden = !state.coachEnabled || !coachEntry || coachEntry.game !== game() || state.workspace !== 'play' || !!state.practice || !!state.problem;
    if (panel.hidden) return;
    const entry = coachEntry, copy = window.GoTCoach.describe(entry.facts, entry.evaluation, en);
    $('coachSummary').textContent = (en ? 'Move notes · #' : '逐手学习 · 第 ') + moveNumberOf(entry.node) + (en ? '' : ' 手') + (entry.loading ? (en ? ' · Checking' : ' · 分析中') : '');
    $('coachText').replaceChildren();
    for (const text of [...copy.observations, copy.prediction, copy.encouragement]) {
      const p = document.createElement('p'); p.textContent = text; $('coachText').append(p);
    }
    $('coachRetry').textContent = en ? 'Revisit this move' : '重看这一手';
    $('coachLesson').textContent = en ? 'Practise this idea' : '练习相关方法';
  }
  async function teachMove(node) {
    if (!window.GoTCoach || !node.parent) return;
    cancelCoach();
    if (assessment && !assessment.finished) { assessment = null; renderAssessment(); }
    const run = coachRun, g = game(), info = gtp.info;
    coachEntry = { game:g, node, facts:window.GoTCoach.facts(g.positionAt(node.parent),g.positionAt(node),node.move), evaluation:null, loading:!!info };
    renderCoach();
    if (!info || state.mode !== 'play') { coachEntry.loading = false; renderCoach(); return; }
    coachController = new AbortController();
    const signal = coachController.signal;
    const query = async n => {
      if (signal.aborted || gtp.info !== info) throw new Error('Engine changed');
      const raw = await gtp.analyze(Object.assign(specFor(n), { seconds:1, maxVisits:96, ownership:false, topN:3 }), { priority:0, signal, timeoutMs:15000 });
      if (!raw?.ok) throw new Error('No analysis');
      return GtpClient.normalizeAnalysis('gtp',raw,g.positionAt(n).turn);
    };
    try {
      const before = await query(node.parent);
      const after = await query(node);
      if (run !== coachRun || game() !== g || !state.coachEnabled || gtp.info !== info) return;
      coachEntry.evaluation = window.GoTCoach.evaluate(before,after,node.move);
    } catch (error) { /* Board facts remain usable when analysis fails or is cancelled. */ }
    finally {
      if (run === coachRun && coachEntry) { coachEntry.loading = false; coachController = null; renderCoach(); }
    }
  }
  $('coachRetry').addEventListener('click', () => { const node=coachEntry?.node; if(node){setWorkspace('review');goToNode(node);} });
  $('coachLesson').addEventListener('click', () => { if(coachEntry)openCoachLesson(coachEntry.facts.topic); });
  function game() { return state.game; }
  /* 分析用引擎：只要 GTP 引擎（KataGo 等）在线且支持 analyze 就优先用（最强），否则内置 */
  function analysisEngineKind() {
    return (gtp.info && gtp.info.supportsAnalyze !== false) ? 'gtp' : 'builtin';
  }
  function analysisEngineKey() {
    if (analysisEngineKind() !== 'gtp') return 'builtin';
    if (gtp.info?.browser) return gtp.info.browserModel || gtp.browserModel || 'b6';
    const model = String(gtp.info?.model || gtp.nativeInfo?.model || '');
    if (/b10c128|b10/i.test(model)) return 'b10';
    if (/b6/i.test(model)) return 'b6';
    return 'b18';
  }
  function analysisEngineLabel() {
    if (analysisEngineKind() !== 'gtp') return 'MCTS';
    const key = analysisEngineKey();
    return key === 'b10' ? 'KataGo b10' : key === 'b6' ? 'KataGo b6' : 'KataGo b18';
  }
  /* 按用户选择把 gtp.info/source 调整到目标引擎；
   * 目标不可用时置空，让上层自动回退到内置 MCTS。auto 保留 health() 的默认选择。 */
  function applyEngineChoice() {
    if (state.engine === 'mcts') { gtp.info = null; gtp.source = ''; return; }
    if (state.engine === 'b6') {
      gtp.useBrowserModel('b6');
      if (gtp.browserInfo) { gtp.info = gtp.browserInfo; gtp.source = 'browser'; }
      else { gtp.info = null; gtp.source = ''; }
      return;
    }
    if (state.engine === 'b10') {
      gtp.useBrowserModel('b10');
      if (gtp.browserB10Info) { gtp.info = gtp.browserB10Info; gtp.source = 'browser'; }
      else { gtp.info = null; gtp.source = ''; }
      return;
    }
    if (state.engine === 'b18') {
      if (gtp.nativeInfo) { gtp.info = gtp.nativeInfo; gtp.source = 'native'; }
      else { gtp.info = null; gtp.source = ''; }
      return;
    }
    // auto：native 优先，其次 browser（health() 已写好）；这里不做覆盖
    gtp.useBrowserModel('b6');
  }
  /* 实际在跑的引擎（含回退）：浏览器 b6/b10、桥接 b18 或 MCTS */
  function effectiveEngineKind() {
    if (gtp.info) return gtp.info.browser ? (gtp.info.browserModel || gtp.browserModel || 'b6') : 'b18';
    return 'mcts';
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
    if (state.recoveryPaused && state.workspace !== 'review') return false;
    if (state.tutorMode) return state.mode === 'play' && !!window.GoTTutor?.canPlay;
    if (state.mode !== 'play' || ['learn', 'home'].includes(state.workspace)) return false;
    /* 复盘工作区本来就是给"已结束的棋谱"试下变化用的，不能被 RE[] 一票否决 */
    if (state.workspace === 'review' || state.opponent === 'human') return true;
    if (isAIMatch()) return false;
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
    if (node.move.pass) return isZh() ? '停着' : 'pass';
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
    const label = kind === 'builtin' ? 'MCTS' : analysisEngineLabel();
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
    if (isAIMatch() && (!aiMatch.paused || aiMatch.inFlight)) return;
    if (window.GoTStudio?.isOpen()) return;
    if (!state.analysisOn || state.mode === 'score' || state.problem || state.reviewRunning || ['learn', 'home'].includes(state.workspace)) return;
    if(assessment && assessment.game===game() && !assessment.finished){assessment=null;showToast(isZh()?'开启分析，本盘转为普通对局。':'Analysis enabled; this game is now unrated.');}
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
      if (worker.unavailable) { requestedAnalysisNode = null; $('analysisState').textContent = t('analysisFailed'); showToast(t('engineWorkerUnavailable')); return; }
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
      analysisController = new AbortController();
      // settled 防负漂移：then/catch 双路径只能减一次（ingest 等同步异常不吞计数）
      let settled = false;
      const release = () => { if (!settled) { settled = true; pendingGtp--; } };
      gtp.analyze(Object.assign({
        seconds: Math.max(1, state.analysisSeconds),
        topN: 5, ownership: true
      }, spec), { priority: 1, signal:analysisController.signal })
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
    if (isAIMatch()) return null;
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
    if (!clk || window.GoTStudio?.isOpen()) return;
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
    if (state.recoveryPaused) return;
    if (state.tutorMode) return;
    if (window.GoTStudio?.isOpen()) return;
    invalidatePreview();
    if (state.workspace === 'review' || ['learn', 'home'].includes(state.workspace) || state.problem || state.browsing) return;
    if (state.mode !== 'play' || game().result) return;
    const match = isAIMatch() ? aiMatch : null;
    if (match && (match.inFlight || (match.paused && !match.single))) return;
    const wanted = match ? matchSide(toMove()).engine : state.opponent;
    const opp = wanted === 'gtp' && !gtp.info ? 'builtin' : wanted;
    if(assessment && assessment.game===game() && (gtp.info ? effectiveEngineKind() : 'builtin')!==assessment.engine){assessment=null;showToast(isZh()?'引擎已切换，本盘不计入测评。':'Engine changed; this game will not count.');}
    if (opp !== wanted) noteGtpFallback();
    if (opp === 'human') return;
    if (opp === 'builtin' && worker.unavailable) { showToast(t('engineWorkerUnavailable')); return; }
    const color = toMove();
    if (!match && color === state.humanColor) return;
    if (match) { match.inFlight=true; match.single=false; }
    const moveStrength = match ? matchSide(color).strength : assessmentStrength();
    const node = game().current;
    const mySeq = ++moveSeq;
    setThinking(color, true);
    if (match) renderAIMatch();
    const playBest = (best) => {
      if (mySeq !== moveSeq) return;
      if (match) match.inFlight=false;
      setThinking(color, false);
      if (!best) { if(match){match.paused=true;renderAIMatch();} return; }
      if (best.pass) { game().pass(color); afterMove(); return; }
      const r = game().play(color, best.x, best.y);
      if (!r.ok) { if(match){match.paused=true;renderAIMatch();} showToast(t('illegalOccupied')); return; }
      afterMove();
    };
    if (opp === 'gtp') {
      if (!gtp.info) { setThinking(color, false); showToast(t('needConnect')); return; }
      /* 棋力：KataGo 走子按档位限制搜索量、加 PDA，低档随机选点（见 js/strength.js）。
       * 分析 / 点目 / 复盘不经过这里，始终满强度。 */
      const sb = gtp.info?.browser ? Strength.browser(moveStrength) : Strength.kataGo(moveStrength);
      const fallbackMove = () => {
        if(mySeq !== moveSeq)return;
        if(match){match.inFlight=false;match.single=match.paused;}
        gtp.info=null;gtp.source='';updateEnginePill();noteGtpFallback();requestEngineMove();
      };
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
      engineMoveController = new AbortController();
      gtp.analyze({
        size: game().size, komi: game().komi, rules: game().rules, toMove: color,
        moves: movesListTo(node), setup: rootSetup(),
        seconds: assessment && assessment.game===game() ? 2 : Math.max(0.5, state.timeMs / 1000), topN: 5,
        maxVisits: sb.maxVisits, pda: sb.pda,
        wideRootNoise: 0     // 对弈不加根噪声：同一 KataGo 进程默认 0.04 会让对手偏弱/随机
      }, { timeoutMs: guardMs + 5000, priority: 1, signal:engineMoveController.signal })
        .then(res => {
          clearTimeout(watchdog);
          if (mySeq !== moveSeq) return;      // 局面已变：放弃本次落子
          setThinking(color, false);
          if (!res.ok) {
            if (!warned) showToast(t('connectFail') + friendlyFetchError(res.error || ''));
            fallbackMove();
            return;
          }
          /* 低档随机选点：从候选中按温度采样；无候选时退回引擎最佳手 */
          const pick = (res.candidates && res.candidates.length)
            ? Strength.pickMove(res.candidates, sb.temperature)
            : res.bestMove;
          if (!pick) {
            if (!warned) showToast(t('connectFail') + friendlyFetchError(res.error || ''));
            fallbackMove();
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
          fallbackMove();
        });
      return;
    }
    // built-in worker: single final result with matching marker
    // 动态 marker（含 mySeq）：worker 串行单任务、排队 stop 无效且必跑完并广播——
    // 常量 marker 会让两个在途监听器互相吃结果（旧局面着法落到新局面）。按 seq 精确配对
    const marker = 'move:' + mySeq;
    let moveTimer;
    const cleanup = () => { clearTimeout(moveTimer); worker.removeEventListener('message',onResult); if(engineWorkerCleanup===cleanup)engineWorkerCleanup=null; };
    const onResult = (e) => {
      const msg = e.data || {};
      if (msg.type !== 'result' || msg.marker !== marker) return;
      cleanup();
      if (mySeq !== moveSeq) return;
      setThinking(color, false);
      if (msg.error || !msg.done || !msg.best) { if(match){match.inFlight=false;match.paused=true;renderAIMatch();showToast(isZh()?'引擎未返回着手，已暂停；可重试单步。':'No move returned. Paused; retry with One move.');} return; }
      playBest(msg.best);
    };
    worker.addEventListener('message', onResult);
    engineWorkerCleanup=cleanup;
    moveTimer=setTimeout(()=>{cleanup();if(mySeq!==moveSeq)return;moveSeq++;setThinking(color,false);if(match){match.inFlight=false;match.paused=true;renderAIMatch();}showToast(t('engineTimeout'));},Math.max(15000,state.timeMs*4));
    worker.postMessage({
      type:'analyze',
      position:{size:game().size,komi:game().komi,rules:game().rules,toMove:color,moves:movesListTo(node),setup:rootSetup()},
      opts:{strength:moveStrength,topN:3,timeMs:assessment&&assessment.game===game()?1000:state.timeMs},marker
    });
  }

  /* ================= board ================= */
  let renderer = new window.BoardRenderer($('boardCanvas'));
  const classicRenderer = renderer;
  classicRenderer.setAnimationSpeed(state.boardAnimationSpeed);
  let board3dRenderer = null, boardViewTransition = false;
  let moveAnimationForNextBoardRender = null;
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
      renderer.set({ theme: next, material: state.material });
      renderer.requestRender();
    }
    if (persist) saveSettings();
  }
  function applyMaterial(name, persist) {
    const next = ['kaya', 'kaya-photo', 'tea', 'ebony', 'alphago', 'maple-light', 'walnut-dark', 'paper-antique', 'slate-dark', 'ivory-modern', 'cinnabar-lacquer', 'indigo-lacquer', 'celadon-lacquer'].includes(name) ? name : 'kaya';
    state.material = next;
    const select = $('materialSelect');
    if (select) select.value = next;
    if (renderer) {
      renderer.set({ material: next });
      renderer.requestRender();
    }
    if (persist) saveSettings();
  }
  function applyStone(name, persist) {
    const next = ['yunzi', 'classic', 'matte', 'alphago', 'soft-gloss', 'photorealistic', 'shell-slate', 'jade', 'antique', 'porcelain', 'golden-satin', 'shell-brushed', 'ink-flat'].includes(name) ? name : 'classic';
    state.stone = next;
    const select = $('stoneSelect');
    if (select) select.value = next;
    if (renderer) {
      renderer.set({ stone: next });
      renderer.requestRender();
    }
    if (persist) saveSettings();
  }
  function current25dAppearance(){return {background:state.board25dBackground,finish:state.board25dFinish,tone:state.board25dTone,gloss:state.board25dGloss,stoneMaterial:state.board25dStoneMaterial,stoneShape:state.board25dStoneShape,lighting:state.board25dLighting,sharedLighting:state.board25dSharedLighting,enhancedShadows:state.board25dEnhancedShadows,quality:state.board25dQuality,animations:state.board25dAnimations,animationSpeed:state.boardAnimationSpeed,naturalPlacement:state.naturalPlacement,cameraAngle:state.board25dCameraAngle,gridScale:state.board25dGridScale/100};}
  function apply25dAppearance(key,value,persist=true){
    const choices={board25dBackground:['dark','wood','tatami','stone'],board25dFinish:['kaya','maple','walnut','rosewood','bamboo','slate','walnut-pbr','oak-pbr','stone-pbr'],board25dTone:['natural','light','deep'],board25dGloss:['matte','satin','polished'],board25dStoneMaterial:['yunzi','premium-yunzi'],board25dStoneShape:['single','double'],board25dLighting:['daylight','sidelight','warm'],board25dQuality:['auto','low','balanced','high'],board25dAnimations:['on','off']};
    if(choices[key]&&!choices[key].includes(value))return;
    if(key==='board25dCameraAngle'||key==='board25dGridScale'){
      const n=Number(value);if(!Number.isFinite(n))return;
      state[key]=Math.round(Math.max(key==='board25dCameraAngle'?0:80,Math.min(key==='board25dCameraAngle'?60:100,n)));
    }else if(key==='board25dSharedLighting'||key==='board25dEnhancedShadows')state[key]=value!==false;
    else if(!choices[key])return;
    else state[key]=key==='board25dAnimations'?value==='on':value;
    const select=$(key);if(select)select.value=value;
    const quickSelect={board25dBackground:'boardQuickBackground',board25dFinish:'boardQuickFinish',board25dTone:'boardQuickTone',board25dGloss:'boardQuickGloss',board25dStoneMaterial:'boardQuickStoneMaterial',board25dStoneShape:'boardQuickStoneShape'}[key];
    if(quickSelect&&$(quickSelect))$(quickSelect).value=value;
    if(key==='board25dCameraAngle')$('board25dCameraAngleValue').textContent=`${state[key]}°`;
    if(key==='board25dGridScale')$('board25dGridScaleValue').textContent=`${state[key]}%`;
    if(key==='board25dSharedLighting')$('board25dSharedLighting').setAttribute('aria-pressed',String(state[key]));
    if(key==='board25dEnhancedShadows')$('board25dEnhancedShadows').setAttribute('aria-pressed',String(state[key]));
    if(key==='board25dCameraAngle')syncBoardAngleControl();
    if(key==='board25dCameraAngle')board3dRenderer?.setCameraAngle(state.board25dCameraAngle);
    else board3dRenderer?.setAppearance(current25dAppearance());
    if(persist)saveSettings();
  }
  const stage = $('boardStage');
  stage.addEventListener('boardtextureerror',()=>showToast(isZh()?'高清木纹未能加载，已保留基础材质。可切换画质重试。':'HD wood could not load. Basic material is retained; change quality to retry.'));
  function updateBoardViewToggle() {
    const button=$('boardViewToggle');if(!button)return;
    const label=state.boardView25d?'boardView2d':'boardView25d';
    button.setAttribute('aria-pressed',String(state.boardView25d));button.title=t(label);
    const text=button.querySelector('span');text.textContent=t(label);text.dataset.i18n=label;
    $('board25dMode').value=state.boardView25d?'25d':'2d';
    syncBoardAngleControl();
    $('boardZoomBtn').disabled=state.boardView25d;
    if(state.boardView25d){
      $('boardZoomBtn').setAttribute('aria-pressed','false');$('boardCanvas').classList.remove('zoomed');
      $('boardZoomLabel').textContent=t('zoomBoard');$('boardZoomHint').hidden=true;
    }
  }
  function onBoard3dFailure(error) {
    console.warn('[board-3d] WebGL failed; restored the classic renderer.',error);
    board3dRenderer=null;renderer=classicRenderer;state.boardView25d=false;boardViewTransition=false;
    updateBoardViewToggle();saveSettings();renderBoard();showToast(t('board3dFallback'));
  }
  async function setBoardView25d(enabled,persist=true) {
    if(boardViewTransition||(state.boardView25d===enabled&&(!enabled||board3dRenderer?.active)))return;
    const button=$('boardViewToggle');button.disabled=true;boardViewTransition=true;
    $('board25dMode').disabled=true;button.querySelector('span').textContent=isZh()?'正在铺开棋盘…':'Preparing board…';
    try {
      if(enabled){
        if(!board3dRenderer){
          const {Board3DAdapter}=await import('../threed/adapter.js');
          board3dRenderer=new Board3DAdapter(classicRenderer,stage,onBoard3dFailure,current25dAppearance());
        }
        const adapter=board3dRenderer;renderer=adapter;
        await adapter.setMode(true);
        if(adapter.failed)return;
        state.boardView25d=true;
      }else{
        await board3dRenderer?.setMode(false);
        renderer=classicRenderer;state.boardView25d=false;
      }
      updateBoardViewToggle();if(persist)saveSettings();renderBoard();
    }catch(error){
      console.warn('[board-3d] Initialization failed; kept the classic renderer.',error);
      renderer=classicRenderer;state.boardView25d=false;boardViewTransition=false;
      if(board3dRenderer){board3dRenderer.dispose();board3dRenderer=null;}
      classicRenderer.set({overlayOnly:false});updateBoardViewToggle();renderBoard();showToast(t('board3dFallback'));
    }finally{
      boardViewTransition=false;if(button.isConnected)button.disabled=false;$('board25dMode').disabled=false;updateBoardViewToggle();
    }
  }
  $('boardViewToggle').addEventListener('click',()=>setBoardView25d(!state.boardView25d));
  updateBoardViewToggle();
  function resizeMainBoard() {
    if (document.body.classList.contains('tutor-layout-moving')) return;
    renderer.set({ compact: !!window.matchMedia?.('(max-width: 780px), (any-pointer: coarse)').matches });
    renderer.resizeTo(stage);
  }
  const ro = new ResizeObserver(resizeMainBoard);
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
    if (boardViewTransition || boardTouch || Date.now() < ignoreBoardClickUntil || state.pendingMove || e.sourceCapabilities?.firesTouchEvents) return;
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
    if (state.recoveryPaused && state.workspace !== 'review') { showToast(isZh() ? '棋局已恢复并暂停，请先选择“从此处续弈”。' : 'Recovered game is paused. Choose Play from here first.'); return false; }
    if (state.tutorMode && !window.GoTTutor?.canPlay) return false;
    if (state.workspace === 'review') state.recoveryPaused = false;
    renderer.set({ hover: null });
    lastHoverIdx = -1;
    const cur = game().current;
    const isNewBranch = cur.children.length > 0 &&
      !game().findChild(cur, { color: toMove(), x, y, pass: false });
    const r = game().play(toMove(), x, y);
    if (!r.ok) {
      showToast(r.reason === 'occupied' ? t('illegalOccupied') : r.reason === 'ko' ? t('illegalKo') : t('illegalSuicide'));
      return false;
    }
    if (state.tutorMode) window.GoTTutor?.rememberMove(window.GoTBoardTools.bookmark(cur));
    if(state.workspace==='play' && !state.problem && !state.tutorMode)window.GoTGrowth?.activity('play','daily');
    cancelCoach();
    const taughtNode = game().current;
    afterMove();
    if (state.tutorMode) {
      const move = taughtNode.move;
      lastTutorMove = move;
      if (tutorMoveWaiter) { const resolve = tutorMoveWaiter; tutorMoveWaiter = null; resolve({ color: move.color === BLACK ? 'black' : 'white', x: move.x, y: move.y }); }
      if (state.problem) window.GoTTutor?.onPuzzleMove(move);
      else window.GoTTutor?.onBoardMove(move);
    }
    if (state.coachEnabled && !state.problem && !state.practice && state.workspace === 'play') teachMove(taughtNode);
    if (isNewBranch && !state.tutorMode) focusCreatedBranch(cur, taughtNode);
    return true;
  }
  function humanPass() {
    if (state.problem || !isHumanTurn()) return;
    state.browsing = false;
    const cur = game().current;
    const isNewBranch = cur.children.length > 0 &&
      !game().findChild(cur, { color: toMove(), pass: true });
    game().pass(toMove());
    if (state.tutorMode) window.GoTTutor?.rememberMove(window.GoTBoardTools.bookmark(cur));
    cancelCoach();
    const taughtNode = game().current;
    afterMove();
    if (state.tutorMode) window.GoTTutor?.onBoardMove({ ...taughtNode.move, pass: true });
    if (state.coachEnabled && !state.problem && !state.practice) teachMove(taughtNode);
    if (isNewBranch && !state.tutorMode) focusCreatedBranch(cur, taughtNode);
  }

  // Touch gestures select on release; scrolling and multi-touch never place stones.
  let boardTouch = null, ignoreBoardClickUntil = 0;
  $('boardCanvas').addEventListener('pointerdown', e => {
    if(boardViewTransition)return;
    if (e.pointerType !== 'touch' && renderer.zoom === 1) return;
    if (e.pointerType === 'touch') ignoreBoardClickUntil = Date.now() + 800;
    renderer.set({ hover: null });
    cancelAutoPreview(); clearPreview();
    renderer.requestRender();
    if (!e.isPrimary) { boardTouch = null; return; }
    if (renderer.zoom > 1) $('boardCanvas').setPointerCapture?.(e.pointerId);
    boardTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
  });
  $('boardCanvas').addEventListener('pointermove', e => {
    if (boardTouch?.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - boardTouch.x, e.clientY - boardTouch.y) > 10) boardTouch.moved = true;
    if (boardTouch.moved && renderer.zoom > 1) renderer.panBy(e.clientX - boardTouch.lastX, e.clientY - boardTouch.lastY);
    boardTouch.lastX = e.clientX; boardTouch.lastY = e.clientY;
  });
  $('boardCanvas').addEventListener('pointercancel', () => { boardTouch = null; });
  $('boardCanvas').addEventListener('pointerup', e => {
    const touch = boardTouch;
    boardTouch = null;
    if (e.pointerType === 'touch' || touch?.moved) ignoreBoardClickUntil = Date.now() + 800;
    if (e.pointerType === 'touch' && touch?.id === e.pointerId && !touch.moved) handleBoardClick(e);
  });
  $('boardCanvas').addEventListener('click', e => {
    if (Date.now() < ignoreBoardClickUntil) return;
    handleBoardClick(e);
  });
  function cancelPendingMove() {
    renderer.set({ hover: null });
    lastHoverIdx = -1;
    state.pendingMove = null;
    renderBoard(); renderSide();
  }
  function commitPendingMove() {
    const p = state.pendingMove;
    if (!p) return;
    state.pendingMove = null;
    if (state.mode === 'play' && isHumanTurn()) playHumanMove(p.x, p.y);
    renderBoard(); renderSide();
  }
  $('commitMoveBtn').addEventListener('click', commitPendingMove);
  $('moveAdjust').addEventListener('click', e => {
    const button=e.target.closest('[data-adjust]'),p=state.pendingMove;
    if(!button||!p||!isHumanTurn())return;
    const [dx,dy]=button.dataset.adjust.split(',').map(Number),sign=state.flip?-1:1;
    const x=p.x+dx*sign,y=p.y+dy*sign;
    if(x<0||y<0||x>=game().size||y>=game().size)return;
    const result=position().checkPlay(toMove(),y*game().size+x,undefined,!!GE.RULES[game().rules].superko);
    if(!result.ok){showToast(result.reason==='occupied'?t('illegalOccupied'):result.reason==='ko'?t('illegalKo'):t('illegalSuicide'));return;}
    state.pendingMove={x,y};renderer.set({hover:null});renderBoard();renderSide();
  });
  $('cancelMoveBtn').addEventListener('click', cancelPendingMove);
  $('boardZoomBtn').addEventListener('click', () => {
    const zoomed = renderer.zoom === 1;
    renderer.setZoom(zoomed ? 2 : 1, zoomed ? state.pendingMove : null);
    $('boardCanvas').classList.toggle('zoomed', zoomed);
    $('boardZoomBtn').setAttribute('aria-pressed', String(zoomed));
    $('boardZoomLabel').dataset.i18n = zoomed ? 'fitBoard' : 'zoomBoard';
    $('boardZoomLabel').textContent = t(zoomed ? 'fitBoard' : 'zoomBoard');
    $('boardZoomHint').hidden = !zoomed;
    renderer.set({ hover: null });
    cancelAutoPreview(); clearPreview();
  });
  function handleBoardClick(e) {
    if(boardViewTransition)return;
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
    // 落子确认模式（腾讯围棋风格）：第一次点击放待确认子，再点/双击同一位置确认，点别处改选
    if (state.confirmMove) {
      const test = position().checkPlay(toMove(), p.y * game().size + p.x, undefined, !!GE.RULES[game().rules].superko);
      if (!test.ok) {
        showToast(test.reason === 'occupied' ? t('illegalOccupied') : test.reason === 'ko' ? t('illegalKo') : t('illegalSuicide'));
        return;
      }
      const pd = state.pendingMove;
      if (pd && pd.x === p.x && pd.y === p.y) {
        if (state.confirmMode === 'double') commitPendingMove();   // 双击同一位置确认
        return;                                                     // 按钮模式：改点确认按钮
      }
      state.pendingMove = { x: p.x, y: p.y };
      renderer.set({ hover: null, preview: [] });
      cancelAutoPreview(); invalidatePreview();
      renderBoard();
      renderSide();
      return;
    }
    playHumanMove(p.x, p.y);
  }

  function afterMove() {
    // Queue the placement before tutor hooks or status updates can repaint the
    // board. In particular, clearTeacherMarks() may synchronously call
    // renderBoard(); if that first repaint publishes the new stone, the 3D
    // adapter can no longer detect it as an added stone and the effect is lost.
    const mv = game().current.move;
    const animationEnabled=board3dRenderer?.active?state.board25dAnimations:state.board2dAnimations;
    const animated=!!(mv&&!mv.pass&&animationEnabled&&state.workspace!=='review');
    if (mv && !mv.pass) {
      if(animated)moveAnimationForNextBoardRender=mv;
      else moveAnimationForNextBoardRender=null;
    }
    window.GoTTutor?.clearTeacherMarks();
    window.GoTTutor?.onPositionChanged();
    renderer.set({ hover: null });
    lastHoverIdx = -1;
    state.browsing = false;
    moveSeq++;
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    state.pendingMove = null;
    exitPreview();
    clearAnalysisOverlay();
    if (mv && !mv.pass) {
      playStoneSound(mv.color,animated?.11:0);
    }
    if (mv && state.clock) Clock.onMove(state.clock, mv.color);   // 落子：读秒阶段重置本阶段
    renderAll();
    const pos = position();
    const prev = game().current.parent;
    const bothPassed = pos.lastWasPass && prev && prev.move && prev.move.pass;
    if (bothPassed && !game().result) {
      if(isAIMatch()){aiMatch.paused=true;clearTimeout(aiMatch.timer);}
      showToast(t('bothPassed'));
      enterScoreMode();
      renderAIMatch();
      return;
    }
    if (!game().result) {
      /* 引擎即将行棋时不再抢占分析通道（避免 stop/analyze 互相打架），其落子后随 afterMove 再析 */
      const engineNext = state.mode === 'play' && state.workspace !== 'review' &&
        state.opponent !== 'human' && toMove() !== state.humanColor;
      if (!engineNext && !state.tutorMode) requestAnalysis(game().current);
      if (isAIMatch()) { const match=aiMatch; clearTimeout(match.timer); if(!match.paused)match.timer=setTimeout(()=>{if(isAIMatch()&&aiMatch===match)requestEngineMove();},500); }
      else requestEngineMove();
    }
    if (state.problem && !state.problem.done && !state.tutorMode) checkProblemMove();   // 死活题：逐手对照正解
    if (state.practice) judgePractice();                            // 复盘练习：对照 AI 首选
    updateQuality();
  }

  /* ================= scoring ================= */
  function enterScoreMode() {
    if (state.mode === 'score') return;
    state.mode = 'score';
    $('boardColumn').classList.add('score-mode');
    state.scorePending = true;
    state.deadStones.clear();
    state.scoreOwnership = null;
    state.aiScoreLead = null;
    state.aiScoreSource = null;
    const runId = ++state.scoreRunId;
    let resolveRun;
    scoreReadyPromise = new Promise(resolve => { resolveRun = resolve; });
    resolveScoreReady = resolveRun;
    $('scoreBtn').setAttribute('aria-pressed', 'true');
    $('scoreStrip').classList.remove('hidden');
    let settled = false;
    let watchdog = 0;
    const finish = timedOut => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (state.mode !== 'score' || state.scoreRunId !== runId) {
        resolveRun();
        if (resolveScoreReady === resolveRun) resolveScoreReady = null;
        return;
      }
      state.scorePending = false;
      if (timedOut) showToast(t('scoreEstimateFallback'));
      try { updateScoreUI(); renderBoard(); }
      catch (error) { console.warn('[score] final render failed', error); }
      resolveRun();
      if (resolveScoreReady === resolveRun) resolveScoreReady = null;
    };
    /* Include cold browser-KataGo initialization, but never leave confirmation
     * disabled indefinitely if the worker or bridge stops responding. */
    watchdog = setTimeout(() => finish(true), 12000);
    /* Start the deadline before rendering. A renderer/UI exception must not
     * strand this score run in the calculating state. */
    try { updateScoreUI(); renderAll(); }
    catch (error) { console.warn('[score] opening render failed', error); }
    Promise.resolve().then(() => autoMarkDead(runId)).catch(error => {
      console.warn('[score] estimate failed; rules scoring remains available', error);
    }).finally(() => finish(false));
  }
  function exitScoreMode() {
    state.mode = 'play';
    $('boardColumn').classList.remove('score-mode');
    state.scorePending = false;
    state.scoreRunId++;
    resolveScoreReady?.();
    resolveScoreReady = null;
    state.deadStones.clear();
    state.scoreOwnership = null;
    state.aiScoreLead = null;
    state.aiScoreSource = null;
    $('scoreBtn').setAttribute('aria-pressed', 'false');
    $('scoreStrip').classList.add('hidden');
    renderAll();
  }
  function syncOwnershipScoreStrip() {
    const strip = $('scoreStrip');
    const active = state.showOwnership && state.mode !== 'score' && !state.problem;
    $('boardColumn').classList.toggle('ownership-mode', active);
    if (state.mode === 'score') {
      strip.classList.remove('ownership-strip');
      strip.setAttribute('aria-label', t('scoreMode'));
      return;
    }
    strip.classList.toggle('ownership-strip', active);
    strip.classList.toggle('hidden', !active);
    if (!active) { strip.setAttribute('aria-label', t('scoreMode')); return; }
    strip.setAttribute('aria-label', t('ownership'));
    const node = game().current;
    const estimate = cachedOwnershipEstimate(node, analysisCache.get(node.id));
    const score = estimate ? currentScore() : null;
    $('stripBlack').textContent = score ? score.black : '—';
    $('stripWhite').textContent = score ? score.white : '—';
    $('stripHint').textContent = '';
  }
  /* 形势与点目只使用同一份 KataGo 归属结果；不先画本地推测再覆盖。 */
  function ownershipCacheKey(engineKey = analysisEngineKey()) {
    const g = game();
    return [engineKey, g.size, g.rules, g.komi].join(':');
  }
  function cachedOwnershipEstimate(node, entry = analysisCache.get(node.id)) {
    const key = ownershipCacheKey();
    const saved = ownershipResultCache.get(node)?.get(key);
    if (saved?.ownership?.length === game().size * game().size) return saved;
    if (!entry || entry.ownership?.length !== game().size * game().size) return null;
    const matches = entry.ownershipEngine === analysisEngineKey() ||
      (!entry.ownershipEngine && analysisEngineKind() === 'gtp' && entry.kind === 'gtp');
    if (!matches) return null;
    const estimate = {
      ownership: entry.ownership,
      scoreLead: Number.isFinite(entry.scoreLeadBlack) ? entry.scoreLeadBlack : null,
      source: entry.ownershipSource || 'gtp', engineKey: analysisEngineKey()
    };
    storeOwnershipEstimate(node, estimate);
    return estimate;
  }
  function storeOwnershipEstimate(node, estimate) {
    if (!node || !estimate?.ownership || estimate.ownership.length !== game().size * game().size) return;
    const key = ownershipCacheKey(estimate.engineKey || analysisEngineKey());
    let entries = ownershipResultCache.get(node);
    if (!entries) { entries = new Map(); ownershipResultCache.set(node, entries); }
    entries.set(key, { ...estimate, ownership: Array.from(estimate.ownership) });
  }
  function fetchAiEstimate(force) {
    const node = game().current;
    const engineKey = analysisEngineKey();
    const gtpReady = analysisEngineKind() === 'gtp';
    if (!force) {
      const cached = cachedOwnershipEstimate(node);
      if (cached) return Promise.resolve(cached);
    }
    if (!gtpReady) return Promise.resolve(null);
    return gtp.analyze({
      size: game().size, komi: game().komi, rules: game().rules, toMove: toMove(),
      moves: movesListTo(node), setup: rootSetup(),
      seconds: 1.5, topN: 1, ownership: true
    }, { priority: 1, timeoutMs: 8000 }).then(res => res?.ok && res.ownership?.length === game().size * game().size
      ? { ownership: res.ownership, scoreLead: typeof res.scoreLead === 'number' ? res.scoreLead : null, source: 'gtp', engineKey }
      : null).catch(() => null);
  }
  function fetchSharedAiEstimate(force) {
    const node=game().current;
    const engineKey = analysisEngineKey();
    if (force === false) {
      const cached = cachedOwnershipEstimate(node);
      if (cached) return Promise.resolve(cached);
    }
    let requests = aiEstimateInFlight.get(node);
    if (!requests) { requests = new Map(); aiEstimateInFlight.set(node, requests); }
    const existing = requests.get(engineKey);
    if (existing) return existing;
    const request=fetchAiEstimate(force !== false).then(estimate => {
      if (estimate?.ownership?.length === game().size * game().size) storeOwnershipEstimate(node, estimate);
      return estimate;
    });
    requests.set(engineKey, request);
    const clear = () => { if (requests.get(engineKey) === request) requests.delete(engineKey); };
    request.then(clear, clear);
    return request;
  }
  const fetchOwnership = fetchAiEstimate;   // 兼容旧调用名
  function ensureOwnershipForNode(node) {
    if (!node || state.problem) return;
    const cached = analysisCache.get(node.id);
    const requestedKind = analysisEngineKey();
    const hasCurrentEstimate = requestedKind !== 'builtin' && !!cachedOwnershipEstimate(node, cached);
    if (hasCurrentEstimate) return;
    if (ownershipRequestNode === node) {
      if (ownershipRequestKind !== requestedKind) ownershipRetryRequested = true;
      return;
    }
    if (ownershipAttemptedNode === node && ownershipAttemptedKind === requestedKind) return;
    ownershipRequestNode = node;
    ownershipAttemptedNode = node;
    ownershipRequestKind = requestedKind;
    ownershipAttemptedKind = requestedKind;
    ownershipRetryRequested = false;
    const gameRef = state.game;
    $('ownershipBtn').setAttribute('aria-busy', 'true');
    fetchSharedAiEstimate(false).then(estimate => {
      if (state.game !== gameRef || !estimate?.ownership || estimate.ownership.length !== gameRef.size * gameRef.size) {
        if (state.showOwnership && state.game === gameRef && game().current === node) showToast(t('ownershipUnavailable'));
        return;
      }
      const existing = analysisCache.get(node.id) || {};
      analysisCache.set(node.id, { ...existing, ownership: estimate.ownership, ownershipSource: estimate.source || 'gtp', ownershipEngine: estimate.engineKey || requestedKind });
      storeOwnershipEstimate(node, estimate);
      if (state.showOwnership && game().current === node) renderBoard();
    }).catch(() => {
      if (state.showOwnership && state.game === gameRef && game().current === node) showToast(t('ownershipUnavailable'));
    }).finally(() => {
      $('ownershipBtn').removeAttribute('aria-busy');
      if (ownershipRequestNode === node) { ownershipRequestNode = null; ownershipRequestKind = null; }
      const stored = analysisCache.get(node.id);
      const desiredNow = analysisEngineKey();
      const retryForEngineChange = ownershipRetryRequested || desiredNow !== requestedKind;
      if (retryForEngineChange && state.showOwnership && state.game === gameRef && game().current === node) {
        ownershipAttemptedNode = null; ownershipAttemptedKind = null; ownershipRetryRequested = false;
        renderBoard();
      } else if ((!stored?.ownership || stored.ownership.length !== gameRef.size * gameRef.size) && ownershipAttemptedNode === node) {
        ownershipAttemptedNode = null; ownershipAttemptedKind = null;
      }
    });
  }
  function syncBoardAngleControl() {
    const control=$('boardQuickControls');
    if(!control)return;
    control.hidden=!(state.boardView25d&&state.showBoardAngleSlider);
    $('boardQuickFinish').value=state.board25dFinish;
    $('boardQuickTone').value=state.board25dTone;
    $('boardQuickBackground').value=state.board25dBackground;
    $('boardQuickGloss').value=state.board25dGloss;
    $('boardQuickStoneMaterial').value=state.board25dStoneMaterial;
    $('boardQuickStoneShape').value=state.board25dStoneShape;
    $('boardAngleOverlay').value=String(state.board25dCameraAngle);
    $('boardAngleOverlayValue').textContent=`${state.board25dCameraAngle}°`;
    $('boardAngleSliderToggle').setAttribute('aria-pressed',String(state.showBoardAngleSlider));
  }
  async function autoMarkDead(runId) {
    const g = state.game;
    const node = game().current;
    let ai = null;
    try {
      /* 与形势按钮共享在途计算，避免同一局面排入第二个长耗时 KataGo 请求。 */
      ai = await fetchSharedAiEstimate(false);
    }
    catch (error) { console.warn('[score] AI estimate failed; rules scoring remains available', error); }
    /* 异步返回时可能已换局/退出数子，拒绝过期结果 */
    if (state.scoreRunId !== runId || !state.scorePending) return;
    if (state.game !== g || game().current !== node || state.mode !== 'score') return;
    const pos = position();
    state.scoreOwnership = (ai && ai.ownership) ? ai.ownership : null;
    state.aiScoreLead = ai ? ai.scoreLead : null;
    state.aiScoreSource = ai ? (ai.source || null) : null;
    if (ai && ai.ownership) {
      const existing = analysisCache.get(g.current.id) || {};
      analysisCache.set(g.current.id, { ...existing, ownership: ai.ownership, ownershipSource: ai.source || 'gtp', ownershipEngine: ai.engineKey || analysisEngineKey(), scoreLeadBlack: ai.scoreLead });
      storeOwnershipEstimate(node, ai);
      const alive = GE.bensonAlive(pos);       // 无条件活块：任何路径都绝不判死
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
      /* AI 不可用时不猜死活，保留空标记，用户仍可手动标注。 */
      showToast(t('ownershipUnavailable'));
    }
  }
  function toggleDead(x, y) {
    if (state.scorePending) return;
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
    const node = game().current;
    const cached = cachedOwnershipEstimate(node);
    /* In scoring mode use only the estimate explicitly accepted by this score
     * run. A late shape response after the timeout must not replace the settled
     * rule fallback and make the visible total disagree with the board. */
    const estimatedOwnership = state.mode === 'score'
      ? (state.scoreOwnership || null)
      : (cached?.ownership || null);
    return GE.scorePosition(position(), {
      dead: state.deadStones,
      komi: game().komi,
      scoring: (GE.RULES[game().rules] && GE.RULES[game().rules].scoring) || 'area',
      ownership: estimatedOwnership,
      /* 有 AI 形势就用它逐点判全盘归属：黑/白点数直接来自引擎（KataGo 优先），
       * 而非纯 JS 洪泛。无 AI 时 ownership 为 null，自动回退规则算法。 */
      ownershipFull: !!estimatedOwnership
    });
  }
  function updateScoreUI() {
    const g = game();
    const pos = position();
    const pending = state.scorePending;
    const rules = GE.RULES[g.rules] || GE.RULES.chinese;
    const isTerritory = rules.scoring === 'territory';
    if (pending) {
      /* Never flash a local-rule subtotal before the shared KataGo estimate is
       * ready; the first visible count must be the same result used on-board. */
      for (const id of ['scoreBlackPts', 'scoreWhitePts', 'stripBlack', 'stripWhite', 'sdStonesB', 'sdStonesW', 'sdTerrB', 'sdTerrW', 'sdDame', 'sdPrisB', 'sdPrisW']) {
        const el = $(id); if (el) el.textContent = '—';
      }
      $('scoreResultText').textContent = t('scoreCalculating');
      $('stripHint').textContent = t('scoreCalculating');
      $('scoreDoneBtn').disabled = false;
      $('sdKomi').textContent = '—';
      $('sdAiVal').textContent = '—';
      if ($('sdAiNote')) $('sdAiNote').hidden = true;
      if ($('sdDameNote')) $('sdDameNote').hidden = true;
      return;
    }
    const sc = currentScore();
    $('scoreBlackPts').textContent = sc.black;
    $('scoreWhitePts').textContent = sc.white;
    $('scoreResultText').textContent = pending ? t('scoreCalculating') : sc.result;
    $('stripBlack').textContent = sc.black;
    $('stripWhite').textContent = sc.white;
    $('stripHint').textContent = pending ? t('scoreCalculating') : t('scoreStripHint');
    $('scoreDoneBtn').disabled = false;
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
        aiEl.textContent = (v >= 0 ? 'B+' : 'W+') + Math.abs(v).toFixed(1) + (isZh() ? ' 目' : '');
        const gap = Math.abs((sc.black - sc.white) - v);
        if (note) {
          note.hidden = dameHigh || gap <= 5;
          if (!note.hidden) note.textContent = t('aiMismatch') + ' (' + (isZh() ? '差 ' : 'diff ') + gap.toFixed(1) + ')';
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
      const coordText = c.pass ? (isZh() ? '停着' : 'pass') : GE.coordName(game().size, c.x, c.y);
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
        chip.textContent = m.pass ? (isZh() ? '停着' : 'pass')
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
  function setWorkspace(name, returnTo) {
    if (window.GoTTutor?.active && !state.tutorMode && (name === 'home' || name === 'learn')) window.GoTTutor.exit(true);
    if (state.tutorMode && name !== 'play') window.GoTTutor?.exit(true);
    if (name === 'review' && (returnTo || state.workspace !== 'review')) {
      reviewReturnWorkspace = returnTo || (state.workspace === 'learn' ? 'learn' : 'play');
    }
    if (name === 'home' || name === 'learn') exitBoardFullscreen();
    if(name==='review' && assessment && !assessment.finished){assessment=null;showToast(isZh()?'进入复盘，本盘不计入测评':'Review opened; this game will not count toward assessment');}
    setMobilePanel(false);
    closeDialog('settingsDialog');
    closeDialog('problemDialog');
    if (window.GoTRecords) window.GoTRecords.close();
    const restored = !!state.problem;
    if (restored) problemExit(false);
    if (name !== 'play') exitPractice();   // 离开对局工作区即结束练习（还原对手/执子偏好）
    if (state.workspace === name) {
      if (name === 'review') switchTab('review');
      syncWorkspaceUI();
      if (name === 'learn' && window.GoTLearning) window.GoTLearning.mount();
      if (restored) { requestAnalysis(game().current); requestEngineMove(); }
      document.dispatchEvent(new CustomEvent('got:workspace-changed', { detail: { workspace: name } }));
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
    document.querySelector('.workbench').hidden = name === 'home';
    const learning = $('learningWorkspace');
    if (learning) learning.hidden = name !== 'learn';
    switchTab(name === 'review' ? 'review' : 'tree'); // 对局默认保持棋谱视图，复盘默认进入复盘训练
    if (name === 'review') scrollReviewIntoView();
    if (name === 'learn' && window.GoTLearning) window.GoTLearning.mount();
    if (!['learn', 'home'].includes(name)) requestAnalysis(game().current);
    if (name === 'play') requestEngineMove();
    syncWorkspaceUI();
    document.dispatchEvent(new CustomEvent('got:workspace-changed', { detail: { workspace: name } }));
  }
  document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); setWorkspace('home'); });
  $('homeWorkspaceBtn').addEventListener('click', () => setWorkspace('home'));
  $('reviewWorkspaceBtn').addEventListener('click', () => setWorkspace('review', 'play'));
  /* ================= 设置页 =================
   * 原来的「设置」只是转发到显示设置弹窗，点开毫无设置感；现在是真正的分区设置页，
   * 专项弹窗（引擎 / 显示 / 新对局）作为二级入口——同一控件只在原处存一份状态。 */
  function syncSettingsDialog() {
    const sel = $('setStrength');
    if (sel) {
      const kind = strengthKind(state.opponent);
      if (sel.options.length !== 9 || sel.dataset.kind !== kind + lang) {
        sel.textContent = '';
        for (let s = 1; s <= 9; s++) {
          const o = document.createElement('option');
          o.value = String(s);
          o.textContent = difficultyText(s, kind);
          sel.appendChild(o);
        }
        sel.dataset.kind = kind + lang;
      }
      sel.value = String(state.strength || 3);
      const hint = $('setStrengthHint');
      if (hint) hint.textContent = difficultyRangeText(kind);
    }
    const time = $('setTime'); if (time) time.value = String(state.timeMs || 1000);
    const st = $('setEngineState');
    if (st) st.textContent = t('settingsCurrent') + ($('enginePillText') ? $('enginePillText').textContent : '—');
    syncVersionDisplay();
    const lb = $('setLang'); if (lb) lb.value = lang;
  }
  const settingsNav=document.createElement('nav'); settingsNav.className='settings-categories';
  const settingsPage=document.querySelector('#settingsDialog .settings-page');
  const personalizationSection=settingsPage.querySelector('.workspace-preferences-section');
  const languageSection=Array.from(settingsPage.querySelectorAll('.settings-section')).find(section=>section.querySelector('h3')?.dataset.i18n==='settingsSectionMore');
  if(personalizationSection&&languageSection)settingsPage.insertBefore(personalizationSection,languageSection);
  const settingsSections=Array.from(settingsPage.querySelectorAll('.settings-section'));
  // Reuse live controls: one set of values and handlers, no duplicated settings.
  const settingsPanels = [['engineDialog',1],['displayDialog',2]].map(([id,index]) => {
    const form = $(id).querySelector('form');
    const panel = document.createElement('div'); panel.className = 'settings-inline-panel'; panel.dataset.panel = id;
    settingsSections[index].append(panel);
    return { form, panel, nodes: Array.from(form.children).filter(el => el.tagName !== 'H2') };
  });
  function placeSettingsPanels(inline) {
    for (const {form,panel,nodes} of settingsPanels) for (const node of nodes) (inline ? panel : form).append(node);
    $('settingsDialog').classList.toggle('settings-inline', inline);
  }
  const settingsButtons=settingsSections.map((section,index)=>{
    const button=document.createElement('button');button.type='button';button.className='tool-button';
    const heading=section.querySelector('h3');
    const iconIds=['i-coords','i-engine','i-display','i-more','i-settings'];
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('aria-hidden','true');
    const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#'+iconIds[index]);icon.append(use);
    const label=document.createElement('span');label.setAttribute('data-i18n',heading.dataset.i18n);label.textContent=heading.textContent;
    button.append(icon,label);
    button.setAttribute('aria-pressed',String(index===0));section.hidden=index!==0;
    button.onclick=()=>{settingsSections.forEach((el,i)=>el.hidden=i!==index);settingsButtons.forEach((el,i)=>el.setAttribute('aria-pressed',String(i===index)));settingsPage.scrollTop=0;};
    settingsNav.append(button);return button;
  });
  settingsPage.before(settingsNav);
  const appearanceMount=$('personalizationAppearanceEditor');
  const classicAppearancePreview=$('classicAppearancePreview');
  const classicPreviewBoard=new window.BoardRenderer(document.createElement('canvas'));
  const previewStones=new Int8Array(19*19);previewStones[1*19+1]=1;previewStones[2*19+2]=2;
  function drawClassicAppearancePreview(){
    const target=classicAppearancePreview;if(!target)return;
    const source=classicPreviewBoard.canvas;source.width=source.height=4096;
    classicPreviewBoard.size=19;classicPreviewBoard.stones=Int8Array.from(previewStones);classicPreviewBoard.px=4096;classicPreviewBoard.cssSize=2048;classicPreviewBoard.dpr=2;classicPreviewBoard.zoom=1;classicPreviewBoard.panX=classicPreviewBoard.panY=0;
    classicPreviewBoard.set({size:19,stones:Int8Array.from(previewStones),theme:$('themeSelect').value,material:$('materialSelect').value,stone:$('stoneSelect').value,showCoords:true,compact:false,naturalPlacement:false,lastMove:-1,showNumbers:false,candidates:[],ownership:null,showOwnership:false,territory:null,dame:null,dead:null,preview:null,hover:null,pending:null,tutorMarks:[]});
    classicPreviewBoard.render();
    const ctx=target.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,target.width,target.height);
    const crop=Math.round((classicPreviewBoard.margin*2+classicPreviewBoard.cell*2.5)*classicPreviewBoard.dpr);
    ctx.drawImage(source,0,0,crop,crop,0,0,target.width,target.height);
  }
  function drawAppearancePreviews(){drawClassicAppearancePreview();}
  document.addEventListener('got:appearance-asset-loaded', drawAppearancePreviews);
  function placeAppearanceSettings(){
    const displayPanel=settingsPanels.find(item=>item.panel.dataset.panel==='displayDialog')?.panel;
    if(!displayPanel||!appearanceMount)return;
    const fieldsets=Array.from(displayPanel.querySelectorAll('fieldset.settings-group'));
    const theme=displayPanel.querySelector('.interface-theme-settings');
    const classic=fieldsets.find(fieldset=>fieldset.querySelector('legend')?.dataset.i18n==='classicAppearance');
    const threeD=displayPanel.querySelector('.board-25d-settings');
    const reset=displayPanel.querySelector('.appearance-reset');
    for(const node of [theme,classic,threeD,reset])if(node&&node.parentElement!==appearanceMount)appearanceMount.append(node);
  }
  $('settingsDialog').addEventListener('wheel',event=>{
    if(event.target instanceof Element&&event.target.closest('.settings-page'))return;
    const content=settingsPage;
    if(!content||content.scrollHeight<=content.clientHeight)return;
    event.preventDefault();
    content.scrollTop+=event.deltaY;
  },{capture:true,passive:false});
  for(const id of ['themeSelect','materialSelect','stoneSelect'])$(id).addEventListener('change',drawAppearancePreviews);
  window.GoTPersonalization?.mount();
  $('shellSettingsBtn').addEventListener('click', () => {
    if ($('settingsDialog').open) { closeDialog('settingsDialog'); return; }
    closeDialog('problemDialog'); window.GoTRecords?.close(); syncSettingsDialog();
    $('bridgeUrl').value = gtp.baseUrl;
    $('engSeconds').value = String(state.analysisSeconds);
    $('dsCandColor').value = state.candColor; $('dsCandSort').value = state.candSort; $('themeSelect').value = state.theme; $('materialSelect').value = state.material; $('stoneSelect').value = state.stone;
    syncDisplaySettings();
    placeSettingsPanels(true);
    placeAppearanceSettings();
    drawAppearancePreviews();
    updateEngineChoices();
    openDialog('settingsDialog'); $('shellSettingsBtn').setAttribute('aria-pressed', 'true');
  });
  document.addEventListener('got:tutor-settings', () => {
    if (!$('settingsDialog').open) $('shellSettingsBtn').click();
    settingsButtons[1]?.click();
    window.GoTTutor?.refreshConfig(true);
  });
  $('settingsDialog').addEventListener('close', () => { if (!$('settingsDialog').open) { placeSettingsPanels(false); $('shellSettingsBtn').setAttribute('aria-pressed', 'false'); } });
  $('setStrength').addEventListener('change', () => {
    state.strength = Number($('setStrength').value) || 3;
    saveSettings(); refreshQuickStrength(); renderSide();
  });
  $('setTime').addEventListener('change', () => { state.timeMs = Number($('setTime').value) || 1000; saveSettings(); });
  $('setNewGame').addEventListener('click', () => { closeDialog('settingsDialog'); $('newGameBtn').click(); });
  $('setLang').addEventListener('change', () => setLanguage($('setLang').value));
  $('setAbout').addEventListener('click', () => openDialog('aboutDialog'));
  $('setApplyUpdate').addEventListener('click', () => reloadFresh(t('newVersion'), 'manual-update'));
  $('setClearCache').addEventListener('click', () => openDialog('cacheConfirmDialog'));
  let pendingTutorRecordDelete = '';
  function renderTutorStorage() {
    const list = $('tutorStorageList'), empty = $('tutorStorageEmpty');
    if (!list || !empty) return;
    const records = window.GoTTutor?.getSavedConversations?.() || [];
    list.replaceChildren();
    empty.hidden = records.length > 0;
    for (const record of records) {
      const row = document.createElement('div'); row.className = 'tutor-storage-row';
      const copy = document.createElement('div'); copy.className = 'tutor-storage-copy';
      const title = document.createElement('strong'); title.textContent = record.title || t('tutorStorageUntitled');
      const meta = document.createElement('small');
      const date = Number(record.savedAt || record.at);
      meta.textContent = `${Number.isFinite(date) ? new Date(date).toLocaleString() : ''}${record.moveNumber ? ` · ${t('moveCount')} ${record.moveNumber}` : ''}`;
      copy.append(title, meta);
      const actions = document.createElement('div'); actions.className = 'tutor-storage-actions';
      const load = document.createElement('button'); load.type = 'button'; load.className = 'tool-button'; load.textContent = t('tutorStorageLoad');
      load.addEventListener('click', () => {
        if (window.GoTTutor?.loadSavedConversation?.(record.id)) closeDialog('settingsDialog');
        else showToast(t('tutorStorageLoadFailed'));
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'tool-button tutor-storage-delete'; remove.textContent = t('tutorStorageDelete');
      remove.addEventListener('click', () => {
        pendingTutorRecordDelete = record.id;
        openDialog('tutorRecordDeleteDialog');
      });
      actions.append(load, remove); row.append(copy, actions); list.append(row);
    }
  }
  $('tutorRecordDeleteCancel').addEventListener('click', () => { pendingTutorRecordDelete = ''; closeDialog('tutorRecordDeleteDialog'); });
  $('tutorRecordDeleteConfirm').addEventListener('click', () => {
    const removed = pendingTutorRecordDelete && window.GoTTutor?.deleteSavedConversation?.(pendingTutorRecordDelete);
    pendingTutorRecordDelete = ''; closeDialog('tutorRecordDeleteDialog'); renderTutorStorage();
    showToast(removed ? t('tutorStorageDeleted') : t('tutorStorageDeleteFailed'));
  });
  document.addEventListener('got:tutor-history-updated', renderTutorStorage);
  $('cacheConfirmCancel').addEventListener('click', () => closeDialog('cacheConfirmDialog'));
  $('cacheConfirm').addEventListener('click', async () => {
    closeDialog('cacheConfirmDialog');
    $('cacheConfirm').disabled = true;
    await purgeCaches();
    reloadFresh(t('cacheCleared'), 'manual-clear');
  });
  $('setClose').addEventListener('click', () => closeDialog('settingsDialog'));
  document.addEventListener('got:home-action', (e) => {
    const action = e.detail;
    if (action === 'play') setWorkspace('play');
    else if(action === 'review') setWorkspace('review', 'play');
    else if (action === 'import') $('openBtn').click();
    else { setWorkspace('learn'); if (window.GoTLearning) window.GoTLearning.setSection(action); }
  });
  $('playWorkspaceBtn').addEventListener('click', () => setWorkspace('play'));
  $('learnWorkspaceBtn').addEventListener('click', () => setWorkspace('learn'));
  /* 对弈分区子入口：新建对局包含对手选择；本地双人保留为直达入口。 */
  function openNewGameWith(opp) {
    setWorkspace('play');
    $('newGameBtn').click();
    if (!opp) return;
    for (const b of $('ngOpponent').querySelectorAll('button')) b.classList.toggle('selected', b.dataset.opp === opp);
    userPickedOpponent = true;                 // 明确选过 → 不被"默认 KataGo"覆盖
    $('ngStrengthLabel').style.display = opp === 'human' ? 'none' : '';
    refreshStrengthLabels();
    updateNgEngineHint();
  }
  $('playNewGameBtn').addEventListener('click', () => openNewGameWith(null));
  $('playLocalBtn').addEventListener('click', () => openNewGameWith('human'));
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
  const tutorLayoutQuery = window.matchMedia('(min-width: 1024px)');
  let tutorLayoutTransitionTimer = 0, tutorLayoutTransitionToken = 0, tutorLayoutTransitionEnd = null;
  function syncTutorLayout() {
    const tutorPanel = $('gotTutorPanel');
    const focusLayout = !!state.tutorMode || !!window.GoTTutor?.active || !!(tutorPanel && !tutorPanel.hidden);
    const explainActive = !!window.GoTTutor?.active && window.GoTTutor?.mode === 'explain';
    const collapseButton = $('inspectorCollapseBtn');
    if (collapseButton) {
      const label = t(explainActive ? 'tutorExit' : 'inspectorCollapse');
      collapseButton.querySelector('span').textContent = label;
      collapseButton.classList.toggle('tutor-end-action', explainActive);
      collapseButton.title = label;
      collapseButton.setAttribute('aria-label', label);
      if (explainActive) collapseButton.removeAttribute('aria-expanded');
      else collapseButton.setAttribute('aria-expanded', String(!state.inspectorCollapsed));
    }
    const desktopFocus = focusLayout && tutorLayoutQuery.matches;
    const body = document.body;
    const layoutChanged = body.classList.contains('tutor-mode') !== focusLayout;
    const animateLayout = layoutChanged && tutorLayoutQuery.matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (layoutChanged) {
      clearTimeout(tutorLayoutTransitionTimer);
      if (tutorLayoutTransitionEnd) document.querySelector('.workbench')?.removeEventListener('transitionend', tutorLayoutTransitionEnd);
      tutorLayoutTransitionEnd = null;
      const token = ++tutorLayoutTransitionToken;
      if (animateLayout) {
        body.classList.add('tutor-layout-moving');
        const workbench = document.querySelector('.workbench');
        const finish = event => {
          if (event && (event.target !== workbench || event.propertyName !== 'grid-template-columns')) return;
          if (token !== tutorLayoutTransitionToken) return;
          clearTimeout(tutorLayoutTransitionTimer);
          workbench?.removeEventListener('transitionend', finish);
          tutorLayoutTransitionEnd = null;
          body.classList.remove('tutor-layout-moving');
          resizeMainBoard();
        };
        tutorLayoutTransitionEnd = finish;
        workbench?.addEventListener('transitionend', finish);
        tutorLayoutTransitionTimer = setTimeout(() => finish(), 460);
      } else {
        body.classList.remove('tutor-layout-moving');
        requestAnimationFrame(resizeMainBoard);
      }
    }
    document.body.classList.toggle('tutor-mode', focusLayout);
    const sidebar = document.querySelector('.app-header');
    if (sidebar) {
      sidebar.inert = desktopFocus;
      sidebar.setAttribute('aria-hidden', String(desktopFocus));
    }
  }
  tutorLayoutQuery.addEventListener('change', () => {
    syncTutorLayout();
    requestAnimationFrame(resizeMainBoard);
  });
  function syncWorkspaceUI() {
    window.GoTPersonalization?.applyWorkspace(state.workspace);
    syncTutorLayout();
    $('mobilePanelLabel').textContent = state.problem ? (isZh() ? '题目与选题' : 'Problem and directory') : (isZh() ? '分析、复盘与棋谱' : 'Analysis, review and tree');
    $('tabReviewTraining').hidden = state.workspace !== 'review';
    const taskContext = $('taskContext');
    const taskMode = state.workspace === 'review' ? 'review' : state.browsing ? 'browsing' : game().result ? 'complete' : 'play';
    taskContext.dataset.flow = taskMode;
    $('taskContextKicker').textContent = t(taskMode === 'review' ? 'reviewPosition' : taskMode === 'complete' ? 'gameOver' : 'livePosition');
    $('taskContextTitle').textContent = game().gotTitle || t(taskMode === 'review' ? 'reviewWorkspace' : 'newGame');
    $('taskContextState').hidden = taskMode === 'review';
    $('taskContextState').textContent = taskMode === 'review' ? '' : taskMode === 'complete' ? t('gameOver') : state.browsing ? t('browsingPosition') : (isHumanTurn() ? t('playGuideYourTurn') : t('playGuideOpponent'));
    const taskHint = $('taskContextHint');
    taskHint.hidden = taskMode === 'review';
    taskHint.textContent = taskMode === 'complete' ? t('gameOverHint') : isHumanTurn() ? t('playGuideHint') : t('playGuideOpponentHint');
    const reviewReturn = $('reviewReturnBtn');
    reviewReturn.hidden = state.workspace !== 'review';
    reviewReturn.textContent = t(reviewReturnWorkspace === 'records' ? 'browseRecords' : reviewReturnWorkspace === 'learn' ? 'learnWorkspace' : 'backToBoard');
    const mobileReviewReturn = $('mobileReviewReturnBtn');
    mobileReviewReturn.hidden = state.workspace !== 'review';
    mobileReviewReturn.querySelector('span').textContent = reviewReturn.textContent;
    document.body.dataset.workspace = state.workspace;
    const currentNav = {
      homeWorkspaceBtn: state.workspace === 'home',
      playWorkspaceBtn: !state.problem && state.workspace === 'play',
      learnWorkspaceBtn: !state.problem && state.workspace === 'learn',
      problemBtn: !!state.problem,
      reviewWorkspaceBtn: !state.problem && state.workspace === 'review',
      openBtn: !state.problem && state.workspace === 'review' && reviewReturnWorkspace === 'records' && !!document.getElementById('recordsDialog')?.open
    };
    for (const [id, active] of Object.entries(currentNav)) {
      if (active) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
    }
    $('homeWorkspaceBtn').setAttribute('aria-pressed', String(state.workspace === 'home'));
    $('homeWorkspace').hidden = state.workspace !== 'home';
    document.querySelector('.workbench').hidden = state.workspace === 'home';
    if (state.workspace === 'home' && window.GoTHome) window.GoTHome.render({ size: game().size, stones: position().board, moves: moveNumberOf(game().current), recoveryPaused: state.recoveryPaused, lang: isZh() ? 'zh' : 'en', theme: state.theme, material: state.material, stone: state.stone });
    document.body.classList.toggle('analysis-active', state.analysisOn || analysisCache.has(game().current.id));
    $('playWorkspaceBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'play'));
    $('learnWorkspaceBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'learn'));
    $('reviewWorkspaceBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'review'));
    $('openBtn').setAttribute('aria-pressed', String(!state.problem && state.workspace === 'review' && reviewReturnWorkspace === 'records' && !!document.getElementById('recordsDialog')?.open));
    const learning = $('learningWorkspace');
    if (learning) learning.hidden = state.workspace !== 'learn';
    $('problemBtn').setAttribute('aria-pressed', String(!!state.problem));
    $('analysisBtn').setAttribute('aria-pressed', String(state.analysisOn));
    $('railAnalysisBtn').setAttribute('aria-pressed', String(state.analysisOn));
    $('railAnalysisBtn').disabled = !!state.problem;
    $('analysisAction').textContent = t(state.analysisOn ? 'analysisPause' : 'analysisStart');
    $('analysisBtn').setAttribute('aria-label', $('analysisAction').textContent);
    $('analysisIntro').hidden = state.workspace === 'review';
    $('analysisIntro').textContent = t('analysisIntro');
    const hasCurrentAnalysis = analysisCache.has(game().current.id);
    $('pageAnalysis').classList.toggle('analysis-empty', !state.analysisOn && !hasCurrentAnalysis);
    $('analysisEmptyState').hidden = state.analysisOn || hasCurrentAnalysis;
    $('resumePlayBtn').hidden = state.tutorMode || !state.browsing || state.workspace !== 'play' || !!state.problem || !!game().result;
    $('analysisState').textContent = state.analysisOn ? analysisEngineLabel() : t('analysisPaused');
    $('advancedAnalysisToggle').checked = state.showAdvancedAnalysis;
    $('analysisTools').classList.toggle('hidden', !state.showAdvancedAnalysis);
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
    /* 可折叠侧面板：body 类控制布局，恢复芯片的 hidden 与之一致 */
    document.body.classList.toggle('inspector-collapsed', !!state.inspectorCollapsed);
    const showInspector = $('inspectorShowBtn');
    if (showInspector) showInspector.hidden = !state.inspectorCollapsed;
  }
  $('resumePlayBtn').addEventListener('click', () => {
    state.recoveryPaused = false;
    state.browsing = false;
    renderAll();
    requestEngineMove();
  });
  $('firstMoveBtn').addEventListener('click', () => navigateTimeline('first'));
  $('previousMoveBtn').addEventListener('click', () => navigateTimeline(-1));
  $('nextMoveBtn').addEventListener('click', () => navigateTimeline(1));
  $('lastMoveBtn').addEventListener('click', () => navigateTimeline('last'));
  let boardFullscreenNative = false;
  function syncBoardFullscreen(active) {
    document.body.classList.toggle('board-fullscreen', active);
    $('fullscreenBtn').setAttribute('aria-pressed', String(active));
    $('fullscreenLabel').dataset.i18n = active ? 'exitFullscreen' : 'fullscreenBoard';
    $('fullscreenLabel').textContent = t(active ? 'exitFullscreen' : 'fullscreenBoard');
    requestAnimationFrame(resizeMainBoard);
  }
  function exitBoardFullscreen() {
    syncBoardFullscreen(false);
    if (boardFullscreenNative && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    boardFullscreenNative = false;
  }
  $('fullscreenBtn').addEventListener('click', async () => {
    if (document.body.classList.contains('board-fullscreen')) { exitBoardFullscreen(); return; }
    setMobilePanel(false);
    syncBoardFullscreen(true);
    // Keep dialogs in the fullscreen tree; unsupported mobile browsers use the same viewport layout.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        boardFullscreenNative = true;
        if (!document.body.classList.contains('board-fullscreen')) exitBoardFullscreen();
      } catch (_) { /* Viewport fullscreen remains usable when native fullscreen is denied. */ }
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && boardFullscreenNative) {
      boardFullscreenNative = false;
      syncBoardFullscreen(false);
    }
  });

  /* ============ 可折叠侧面板 ============
   * 宽屏把分析 / 棋谱树面板收起，棋盘回到视觉中心；状态进 got.settings。 */
  function setInspectorCollapsed(collapsed) {
    state.inspectorCollapsed = !!collapsed;
    saveSettings();
    syncWorkspaceUI();
    requestAnimationFrame(resizeMainBoard);
  }
  $('inspectorCollapseBtn').addEventListener('click', () => {
    if (window.GoTTutor?.active && window.GoTTutor?.mode === 'explain') window.GoTTutor.exit();
    else setInspectorCollapsed(true);
  });
  $('inspectorShowBtn').addEventListener('click', () => setInspectorCollapsed(false));

  /* ============ 工具栏「更多」菜单 ============
   * 低频操作（停着 / 认输 / 棋盘工具 / 全屏 / 缩放）在各尺寸统一收进弹出菜单，
   * 点击菜单项后自动收起；桌面为锚定下拉，手机为棋盘上方的弹层。 */
  function setRailMore(open) {
    const menu = $('railMoreMenu'), btn = $('boardMoreBtn');
    if (!menu || !btn) return;
    menu.classList.toggle('open', !!open);
    btn.setAttribute('aria-expanded', String(!!open));
  }
  $('boardMoreBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    setRailMore(!$('railMoreMenu').classList.contains('open'));
  });
  $('railMoreMenu').addEventListener('click', () => setRailMore(false));
  document.addEventListener('click', (e) => {
    if (!$('railMoreMenu').classList.contains('open')) return;
    if (!($('railMore').contains(e.target))) setRailMore(false);
  });

  window.visualViewport?.addEventListener('resize', resizeMainBoard);
  new ResizeObserver(() => drawEvalGraph()).observe($('evalGraph'));

  /* ================= game tree ================= */
  let treeNavGame = null;
  let treeContext = [];
  let treeSlideDirection = null;
  function treeVariationName(parent, child) {
    if (child === parent?.children?.[0]) return t('treeMainCrumb');
    const index = Math.max(0, (parent?.children?.indexOf(child) ?? 1) - 1);
    return t('treeVariationName').replace('{n}', String.fromCharCode(65 + (index % 26)));
  }
  function treePrincipalLength(node) {
    let count = 0, cursor = node;
    while (cursor) {
      if (cursor.move) count++;
      cursor = cursor.children?.[0] || null;
    }
    return count;
  }
  function focusCreatedBranch(parent, branchNode) {
    if (!parent || !branchNode || state.tutorMode) return;
    treeContext = [];
    const path = game().pathFromRoot(parent);
    for (let i = 1; i < path.length; i++) {
      const node = path[i];
      if (node.parent && node.parent.children[0] !== node) {
        treeContext.push({ parent: node.parent, node, returnNode: node.parent });
      }
    }
    treeContext.push({ parent, node: branchNode, returnNode: parent });
    treeSlideDirection = 'right';
    switchTab('tree');
    showToast(t('branchCreated'));
  }
  function renderTreeBreadcrumb(g) {
    const nav = $('treeBreadcrumb');
    nav.textContent = '';
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'tree-crumb' + (treeContext.length ? '' : ' current');
    main.textContent = t('treeMainCrumb');
    if (!treeContext.length) main.setAttribute('aria-current', 'page');
    main.addEventListener('click', () => {
      if (!treeContext.length || guardTutorNavigation()) return;
      const target = treeContext[0].returnNode || g.root.children[0] || g.root;
      treeContext = [];
      treeSlideDirection = 'left';
      goToNode(target, true);
    });
    nav.appendChild(main);
    treeContext.forEach((entry, index) => {
      const separator = document.createElement('span');
      separator.className = 'tree-crumb-separator';
      separator.textContent = '›';
      nav.appendChild(separator);
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'tree-crumb' + (index === treeContext.length - 1 ? ' current' : '');
      crumb.textContent = `${treeVariationName(entry.parent, entry.node)} · ${coordOf(entry.node)}`;
      if (index === treeContext.length - 1) crumb.setAttribute('aria-current', 'page');
      crumb.addEventListener('click', () => {
        if (index === treeContext.length - 1 || guardTutorNavigation()) return;
        treeContext = treeContext.slice(0, index + 1);
        treeSlideDirection = 'right';
        goToNode(entry.node, true);
      });
      nav.appendChild(crumb);
    });
  }
  function renderStructuralTree(container, g, pure = false) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const roots = g.root.children || [];
    const records = [];
    const mainline = new Set();
    let mainCursor = roots[0];
    while (mainCursor) { mainline.add(mainCursor); mainCursor = mainCursor.children?.[0] || null; }
    const currentPath = new Set(game().pathFromRoot(g.current));
    let maxLane = 0;
    function place(node, parent, depth, lane, variationLabel = '') {
      const record = { node, parent, depth, lane, variationLabel };
      records.push(record);
      maxLane = Math.max(maxLane, lane);
      const children = node.children || [];
      children.forEach((child, index) => {
        if (index === 0) place(child, node, depth + 1, lane);
        else {
          place(child, node, depth + 1, ++maxLane, treeVariationName(node, child));
        }
      });
    }
    roots.forEach((node, index) => {
      const lane = index === 0 ? 0 : ++maxLane;
      place(node, g.root, 1, lane, index ? treeVariationName(g.root, node) : '');
    });
    if (!records.length) return;
    const trackGap = Math.max(34, Math.min(68, Math.floor((container.clientWidth - 90) / Math.max(1, maxLane + 1))));
    const width = Math.max(container.clientWidth - 20, 64 + maxLane * trackGap + 100);
    const height = Math.max(76, records.reduce((deepest, record) => Math.max(deepest, record.depth), 1) * 34 + 26);
    const xFor = record => 24 + record.lane * trackGap;
    const yFor = record => 16 + (record.depth - 1) * 34;
    const positions = new Map(records.map(record => [record.node, { x: xFor(record), y: yFor(record), record }]));
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('structural-tree-svg');
    if (pure) svg.classList.add('is-pure');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('role', 'tree');
    svg.setAttribute('aria-label', isZh() ? '棋谱结构树' : 'Game record structure tree');
    for (const record of records) {
      const { node, parent } = record;
      if (!parent || parent === g.root) continue;
      const from = positions.get(parent), to = positions.get(node);
      if (!from || !to) continue;
      const edge = document.createElementNS(svgNS, 'path');
      const isVariation = to.x !== from.x;
      const elbowY = from.y + Math.min(14, (to.y - from.y) * 0.45);
      const radius = Math.min(8, Math.abs(to.x - from.x) / 3);
      const direction = Math.sign(to.x - from.x) || 1;
      const path = isVariation
        ? `M ${from.x} ${from.y} V ${elbowY - radius} Q ${from.x} ${elbowY} ${from.x + direction * radius} ${elbowY} H ${to.x - direction * radius} Q ${to.x} ${elbowY} ${to.x} ${elbowY + radius} V ${to.y}`
        : `M ${from.x} ${from.y} V ${to.y}`;
      edge.setAttribute('d', path);
      edge.setAttribute('class', `structural-tree-edge${mainline.has(node) ? ' is-mainline' : ''}${currentPath.has(node) ? ' is-current-path' : ''}`);
      svg.appendChild(edge);
    }
    for (const record of records) {
      const { node, variationLabel } = record;
      const { x, y } = positions.get(node);
      const group = document.createElementNS(svgNS, 'g');
      const move = node.move;
      const moveText = move ? (move.pass ? (isZh() ? '停着' : 'Pass') : GE.coordName(g.size, move.x, move.y)) : (isZh() ? '设置局面' : 'Setup');
      const moveNum = moveNumberOf(node);
      const stoneClass = move?.color === GE.BLACK ? ' is-black' : move?.color === GE.WHITE ? ' is-white' : '';
      group.setAttribute('class', `structural-tree-node${stoneClass}${mainline.has(node) ? ' is-mainline' : ''}${currentPath.has(node) ? ' is-current-path' : ''}${node === g.current ? ' is-current' : ''}`);
      group.setAttribute('role', 'treeitem');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-current', String(node === g.current));
      group.setAttribute('aria-label', `${moveNum} ${moveText}`);
      group.setAttribute('transform', `translate(${x} ${y})`);
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('r', node === g.current ? '6.5' : '5');
      group.appendChild(circle);
      if (!pure) {
        const labelText = document.createElementNS(svgNS, 'text');
        if (variationLabel) {
          labelText.setAttribute('class', 'structural-tree-variation-label');
          labelText.setAttribute('x', '13');
          labelText.setAttribute('y', '5');
          labelText.textContent = variationLabel;
          group.appendChild(labelText);
        } else if (mainline.has(node)) {
          labelText.setAttribute('class', 'structural-tree-move-number');
          labelText.setAttribute('x', '13');
          labelText.setAttribute('y', '5');
          labelText.textContent = String(moveNum);
          group.appendChild(labelText);
        }
      }
      if (!pure) {
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = `${moveNum}. ${moveText}`;
        group.appendChild(title);
      }
      group.addEventListener('click', () => goToNode(node));
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goToNode(node); }
      });
      svg.appendChild(group);
    }
    container.appendChild(svg);
    const current = svg.querySelector('.structural-tree-node.is-current');
    current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function renderTree() {
    if (state.activeTab !== 'tree') return;
    const container = $('gameTree');
    container.textContent = '';
    const g = game();
    if (treeNavGame !== g) {
      treeNavGame = g;
      treeContext = [];
    }
    $('treeBackBtn').hidden = treeContext.length === 0;
    renderTreeBreadcrumb(g);
    if (!g.root.children.length) {
      const empty = document.createElement('p');
      empty.className = 'tree-empty';
      empty.textContent = t('treeEmpty');
      container.appendChild(empty);
      return;
    }
    if (document.body.dataset.treeStyle === 'structural' || document.body.dataset.treeStyle === 'pure') {
      container.dataset.treeStyle = document.body.dataset.treeStyle;
      renderStructuralTree(container, g, document.body.dataset.treeStyle === 'pure');
      return;
    }
    delete container.dataset.treeStyle;
    function appendBranchDock(parent, activeChild) {
      const alternates = (parent?.children || []).filter((child) => child !== activeChild);
      if (!alternates.length) return;
      const dock = document.createElement('div');
      dock.className = 'tree-branch-dock';
      alternates.forEach((branchNode) => {
        const card = document.createElement('section');
        card.className = 'tree-branch';
        const summary = document.createElement('button');
        summary.type = 'button';
        summary.className = 'tree-branch-summary tree-branch-enter';
        const title = document.createElement('b');
        title.textContent = treeVariationName(parent, branchNode);
        const start = document.createElement('span');
        start.textContent = `${t('treeStartsAt').replace('{n}', String(moveNumberOf(branchNode)))} · ${coordOf(branchNode)}`;
        const count = document.createElement('span');
        count.className = 'tree-branch-count';
        count.textContent = t('treeVariationMoves').replace('{n}', String(treePrincipalLength(branchNode)));
        const arrow = document.createElement('span');
        arrow.className = 'tree-branch-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        summary.append(title, start, count, arrow);
        summary.setAttribute('aria-label', `${t('treeEnterVariation')}: ${title.textContent}, ${start.textContent}`);
        summary.addEventListener('click', () => {
          if (guardTutorNavigation()) return;
          treeContext.push({ parent, node: branchNode, returnNode: parent });
          treeSlideDirection = 'right';
          goToNode(branchNode, true);
        });
        card.appendChild(summary);
        dock.appendChild(card);
      });
      container.appendChild(dock);
    }
    let node = treeContext.length ? treeContext[treeContext.length - 1].node : g.root.children[0];
    const spine = [];
    while (node) {
      spine.push(node);
      node = node.children?.[0] || null;
    }
    // Opening alternatives diverge before move one, so attach them above the first node.
    if (!treeContext.length) appendBranchDock(g.root, g.root.children[0]);
    spine.forEach((moveNode) => {
      const row = document.createElement('div');
      row.className = 'tree-row';
      const nodeEl = document.createElement('button');
      nodeEl.type = 'button';
      const stoneClass = moveNode.move?.color === GE.BLACK ? ' stone-black' : moveNode.move?.color === GE.WHITE ? ' stone-white' : '';
      nodeEl.className = 'tree-node' + stoneClass + (moveNode === g.current ? ' current' : '');
      const num = moveNumberOf(moveNode);
      const label = moveNode.move
        ? (moveNode.move.pass ? (isZh() ? '停' : 'pass') : GE.coordName(g.size, moveNode.move.x, moveNode.move.y))
        : (moveNode.setup ? '⊕' : '·');
      const numberEl = document.createElement('b');
      numberEl.textContent = String(num);
      const coordEl = document.createElement('span');
      const markerEl = document.createElement('i');
      markerEl.className = 'tree-stone-marker';
      markerEl.setAttribute('aria-hidden', 'true');
      coordEl.textContent = label;
      nodeEl.append(numberEl, markerEl, coordEl);
      nodeEl.title = `${num}. ${label}`;
      if (moveNode === g.current) {
        const currentEl = document.createElement('span');
        currentEl.className = 'tree-current-label';
        currentEl.textContent = t('treeCurrentMove');
        nodeEl.appendChild(currentEl);
      }
      nodeEl.setAttribute('aria-current', String(moveNode === g.current));
      nodeEl.addEventListener('click', () => goToNode(moveNode));
      row.appendChild(nodeEl);
      container.appendChild(row);

      // Alternatives to the next move belong below this move, their fork parent.
      appendBranchDock(moveNode, moveNode.children?.[0]);
    });
    if (treeSlideDirection) {
      const direction = treeSlideDirection;
      treeSlideDirection = null;
      container.dataset.slide = '';
      requestAnimationFrame(() => { if (container.isConnected) container.dataset.slide = direction; });
    } else {
      delete container.dataset.slide;
    }
    const cur = container.querySelector('.tree-node.current');
    if (cur && typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('got:tree-style-changed', renderTree);
  function goToNode(node, tutorInternal = false) {
    if (!tutorInternal && guardTutorNavigation()) return;
    window.GoTTutor?.clearTeacherMarks();
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
    window.GoTTutor?.onPositionChanged();
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
    const qualityRow = $('lastMoveQuality').parentElement;
    if (!node.move || !parent) {
      $('lastMoveCoord').textContent = '—';
      $('lastMoveQuality').textContent = '';
      $('lastMoveQuality').className = 'quality-tag neutral';
      $('lastMoveDelta').textContent = '';
      qualityRow.classList.add('hidden');
      return;
    }
    $('lastMoveCoord').textContent = coordOf(node);
    const loss = GtpClient.moveLoss(analysisCache.get(parent.id) || parent.review, analysisCache.get(node.id) || node.review, node.move.color);
    if (loss === null) {
      /* 评估未就绪时保留固定空位，避免无意义占位符与卡片高度跳动。 */
      $('lastMoveQuality').textContent = '';
      $('lastMoveQuality').className = 'quality-tag neutral';
      $('lastMoveDelta').textContent = '';
      qualityRow.classList.add('hidden');
      return;
    }
    qualityRow.classList.remove('hidden');
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
      if (!useGtp && worker.unavailable) return resolve(null);
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
      humanColor: state.humanColor, opponent: state.opponent
    };
    if (state.mode === 'score') exitScoreMode();
    state.opponent = gtp.info ? 'gtp' : 'builtin';
    state.humanColor = mover;
    state.mode = 'play';
    /* 判定基准就是该局面的 AI 首选着法——复盘已经算过，落子后无需再跑引擎 */
    const pr = target.review || {};
    const best = pr.best || (pr.cands && pr.cands[0]) || null;
    state.practice = { prev, mover, moveNo: moveNumberOf(node), target, best, sourceNode:node, judged: false, result: null };
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
    renderPractice();
  }
  function endPractice() {
    if (!state.practice) return;
    exitPractice();
    setWorkspace('review');
    switchTab('review');
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
    if (p.sourceNode) p.sourceNode.practiceAttempts = (p.sourceNode.practiceAttempts || 0) + 1;
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
    $('practiceColor').textContent = (isZh() ? '你执' : 'You: ') + t(p.mover === BLACK ? 'black' : 'white');
    $('practiceTarget').textContent = t('practiceTargetPrefix') + p.moveNo + t('practiceTargetSuffix');
    const res = $('practiceResult');
    const best = p.best && !p.best.pass ? ' ' + GE.coordName(game().size, p.best.x, p.best.y) : '';
    res.textContent = p.result === 'ok' ? '✓ ' + t('practiceVerdictOk')
      : p.result === 'miss' ? '✗ ' + t('practiceVerdictMiss') + best
        : p.result === 'none' ? t('practiceNoBest') : '';
    res.className = p.result === 'ok' ? 'ps-ok' : p.result === 'miss' ? 'ps-miss' : '';
    $('practiceRetryBtn').hidden = !p.judged;
    $('practiceNextBtn').hidden = !p.judged || !nextPracticeNode(p.sourceNode);
    $('practiceNextBtn').textContent = isZh()?'下一个转折':'Next turning point';
  }
  function nextPracticeNode(current) {
    return reviewNodes().filter(n=>n.move&&!n.move.pass&&n.review?.loss>=2)
      .sort((a,b)=>b.review.loss-a.review.loss).find(n=>n!==current&&!n.practiceAttempts);
  }
  $('practiceNextBtn').addEventListener('click',()=>{const next=nextPracticeNode(state.practice?.sourceNode);if(next)startPractice(next);});
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
    switchTab('review');
    scrollReviewIntoView();
  }
  /* 落子音效：合成清脆的真实棋子声——高频敲击 + 木质共鸣 + 桌体低频 */
  let audioCtx = null;
  let lastStoneSoundAt = -Infinity;
  const stoneSoundProfiles = [
    { hit:1850, q:1.15, modes:[[430,.11,.2],[790,.075,.12],[1320,.045,.065]], body:142, tail:.085 },
    { hit:2350, q:1.45, modes:[[510,.085,.18],[980,.06,.14],[1680,.04,.07]], body:178, tail:.075 },
    { hit:1550, q:.95, modes:[[360,.13,.19],[690,.095,.11],[1160,.055,.055]], body:126, tail:.105 },
    { hit:2780, q:1.1, modes:[[570,.075,.16],[1080,.065,.13],[1940,.035,.06]], body:194, tail:.07 }
  ];
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
  function playStoneSound(color,delay=0) {
    if (!state.soundOn) return;
    const now=performance.now();
    if(now-lastStoneSoundAt<85)return;
    lastStoneSoundAt=now;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { });
      const t0 = audioCtx.currentTime+delay;
      const profile=stoneSoundProfiles[Math.floor(Math.random()*stoneSoundProfiles.length)];
      const master = audioCtx.createGain();
      master.gain.value = 0.66 + Math.random()*0.09;
      master.connect(audioCtx.destination);
      const pitch = (color === BLACK ? 0.99 : 1.015) * (0.985 + Math.random() * 0.03);
      // Short filtered impact plus a few irregularly decaying wood-like modes.
      const len = Math.floor(audioCtx.sampleRate * 0.042);
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = profile.hit * pitch * (0.98+Math.random()*.04);
      bp.Q.value = profile.q;
      const nGain = audioCtx.createGain();
      nGain.gain.setValueAtTime(.6+Math.random()*.12, t0);
      nGain.gain.exponentialRampToValueAtTime(0.001, t0 + .042);
      noise.connect(bp); bp.connect(nGain); nGain.connect(master);
      noise.start(t0);
      profile.modes.forEach(([frequency,duration,volume]) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency*pitch*(.99+Math.random()*.02), t0);
        g.gain.setValueAtTime(volume*(.9+Math.random()*.2), t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(g); g.connect(master);
        osc.start(t0); osc.stop(t0 + duration + 0.01);
      });
      const thump = audioCtx.createOscillator();
      const tGain = audioCtx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(profile.body * pitch, t0);
      thump.frequency.exponentialRampToValueAtTime(profile.body*.72 * pitch, t0 + profile.tail);
      tGain.gain.setValueAtTime(.18+Math.random()*.04, t0);
      tGain.gain.exponentialRampToValueAtTime(0.0001, t0 + profile.tail);
      thump.connect(tGain); tGain.connect(master);
      thump.start(t0); thump.stop(t0 + profile.tail + 0.01);
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
      .slice(0, 3);
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
      if (window.GoTCoach && node.parent) {
        const facts=window.GoTCoach.facts(game().positionAt(node.parent),game().positionAt(node),node.move);
        const detail=document.createElement('p');detail.className='review-focus-note';
        detail.textContent=window.GoTCoach.describe(facts,null,!isZh()).observations.join(' ') + (node.practiceAttempts ? (isZh()?' · 已重练':' · Practised') : '');
        const lesson=document.createElement('button');lesson.type='button';lesson.className='btn ghost';
        lesson.textContent=isZh()?'相关方法':'Related lesson';lesson.onclick=()=>openCoachLesson(facts.topic);
        item.append(detail,lesson);
      }
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
    if (state.activeTab !== 'review') return;
    const nodes = reviewNodes();
    const moves = nodes.filter(n => n.move);
    const hasData = moves.some(n => n.review && Number.isFinite(n.review.wrBlack));
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
          escapeHtml(game().playerNames[color] || (color === BLACK ? t('black') : t('white'))) + '</h4>' +
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

  async function exportBoardPhoto() {
    const button=$('boardPhotoBtn');if(button.disabled)return;
    button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      const targetSize=window.matchMedia?.('(max-width: 780px), (any-pointer: coarse)').matches?1800:2400;
      const photo=board3dRenderer?.active?await board3dRenderer.renderPhotoCanvas(targetSize):classicRenderer.renderPhotoCanvas(targetSize);
      const blob=await new Promise(resolve=>photo.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('PNG encode failed');
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');
      anchor.href=url;anchor.download=`got-board-${new Date().toISOString().slice(0,10)}.png`;
      document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
      showToast(t('boardPhotoSaved'));
    }catch(error){
      console.warn('[board-photo] PNG export failed',String(error?.name||'Error').slice(0,40));
      showToast(t('boardPhotoFailed'));
    }finally{button.disabled=false;button.removeAttribute('aria-busy');}
  }

  /* ================= master render ================= */
  function renderBoard() {
    const pending = state.pendingMove;
    $('moveConfirmation').hidden = !pending;
    $('commitMoveBtn').hidden = state.confirmMode !== 'button';
    $('pendingCoordinate').textContent = pending ? GE.coordName(game().size, pending.x, pending.y) : '';
    const pos = position();
    const g = game();
    const cached = analysisCache.get(g.current.id);
    if (state.showOwnership && !state.problem) ensureOwnershipForNode(g.current);
    const ownershipEstimate = cachedOwnershipEstimate(g.current, cached);
    syncOwnershipScoreStrip();
    const ownership = ownershipEstimate?.ownership || null;
    let candidateData = (state.mode !== 'score' && state.analysisOn && cached && cached.candidates || []).map(c => ({
      x: c.x, y: c.y, visits: c.visits, pass: c.pass, wrToMove: c.wrToMove
    }));
    if (state.candSort === 'winrate') {
      candidateData = candidateData.slice().sort((p, q) => (q.wrToMove || 0) - (p.wrToMove || 0));
    }
    // Keep board updates ordered: apply the move, then sync the 3D view.
    // sequence: enqueue immediately before publishing the changed board.
    const animateMove = moveAnimationForNextBoardRender;
    if (animateMove) {
      if (board3dRenderer?.active) board3dRenderer.queueMoveAnimation(animateMove);
      else classicRenderer.queueMoveAnimation(animateMove);
    }
    const hasAiOwnership = !!ownership;
    const scoreOverlay = state.mode === 'score' ? (state.scorePending ? null : currentScore())
      : state.showOwnership && hasAiOwnership ? currentScore() : null;
    renderer.set({
      size: g.size,
      stones: pos.board,
      naturalPlacement: state.naturalPlacement,
      lastMove: pos.lastMove,
      moveNumbers: state.showNumbers ? buildNumbersFromPath() : null,
      candidates: candidateData,
      tutorMarks: state.mode === 'score' && state.scorePending ? [] : state.tutorMarks,
      candColorMode: state.candColor,
      ownership,
      /* 形势与点目共用同一套归属方块，形势开关不再绘制旧热力层。 */
      showOwnership: false,
      territory: scoreOverlay?.territory || null,
      dame: scoreOverlay?.dameMask || null,
      dead: scoreOverlay ? state.deadStones : null,
      preview: renderer.opts.preview,
      hover: pending || !isHumanTurn() ? null : renderer.opts.hover,
      pending: state.pendingMove ? { x: state.pendingMove.x, y: state.pendingMove.y, color: toMove() } : null,
      flip: state.flip,
      showCoords: state.showCoords,
      showNumbers: state.showNumbers,
      theme: state.theme,
      material: state.material,
      stone: state.stone,
      toMove: pos.turn
    });
    if (animateMove) moveAnimationForNextBoardRender = null;
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
  function engineLabel(color) {
    if (isAIMatch()) {
      const side=matchSide(color), actual=side.engine==='gtp'&&gtp.info?'gtp':'builtin';
      return strengthKindName(strengthKind(actual),!isZh())+' · '+difficultyText(side.strength,strengthKind(actual))+(side.engine!==actual?(isZh()?'（回退）':' (fallback)'):'');
    }
    if (state.opponent === 'gtp') {
      const name = gtp.info ? analysisEngineLabel() : 'KataGo';
      return name + ' · ' + difficultyText(assessmentStrength());
    }
    return (isZh() ? '内置 MCTS · ' : 'MCTS · ') + difficultyText(assessmentStrength());
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
    const resultPanel = $('gameResultPanel');
    if (resultPanel) {
      resultPanel.hidden = !g.result || state.workspace === 'review';
      if (g.result) {
        $('gameResultText').textContent = g.result;
        $('gameResultHint').textContent = t('gameOverHint');
      }
    }
    $('blackName').textContent = g.playerNames[BLACK] || t('black');
    $('whiteName').textContent = g.playerNames[WHITE] || t('white');
    /* 段位/引擎说明与名字语义重复时（如"MCTS 5"配"内置 MCTS · 5"）不再显示第二行 */
    const core = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
    const rankOf = (color) => {
      const name = g.playerNames[color] || '';
      const rank = g.playerRanks[color] || (sideIsEngine(color) ? engineLabel(color) : '');
      if (!rank || !name) return rank;
      const cn = core(name), cr = core(rank);
      return (cn && cr && (cn.indexOf(cr) >= 0 || cr.indexOf(cn) >= 0)) ? '' : rank;
    };
    $('blackRank').textContent = rankOf(BLACK);
    $('whiteRank').textContent = rankOf(WHITE);
    $('blackCard').classList.toggle('active', pos.turn === BLACK && !g.result && state.mode === 'play');
    $('whiteCard').classList.toggle('active', pos.turn === WHITE && !g.result && state.mode === 'play');
    $('statusNav').textContent = state.previewNode ? t('previewing')
      : state.pendingMove ? t(state.confirmMode === 'double' ? 'pendingConfirmDouble' : 'pendingConfirm')
        : state.browsing ? t('browsingPosition') : t('livePosition');
    updateClockUI();
    refreshQuickStrength();
  }
  function renderAll() {
    if (!state.game) return;
    window.GoTRecovery?.schedule();
    renderAIMatch();
    $('resignBtn').disabled = isAIMatch();
    renderCoach();
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
    $('statusEngine').textContent = state.practice ? t('practiceActive')
      : state.workspace === 'home' ? t('homeWorkspace')
      : state.workspace === 'learn' ? t('learningWorkspaceStatus')
      : state.workspace === 'review' ? t('reviewPosition')
      : game().result ? t('gameOver') : (isHumanTurn() ? t('youTurn') : t('ready'));
  }

  /* ================= actions ================= */
  function guardTutorNavigation() {
    if (!state.tutorMode) return false;
    window.GoTTutor?.pauseForReview();
    return false;
  }
  function doUndo(tutorInternal = false) {
    if (tutorInternal !== true && state.tutorMode) { window.GoTTutor?.undoClass(); return; }
    if (tutorInternal !== true && guardTutorNavigation()) return;
    window.GoTTutor?.clearTeacherMarks();
    if(assessment && assessment.game===game())assessment=null;
    state.browsing = !!state.recoveryPaused;
    const g = game();
    if (!g.current.parent) return;
    stopAutoplay();
    if (state.mode === 'score') exitScoreMode();
    g.navParent();
    if (!state.problem || !state.problem.undoing) syncProblemProgress();
    if (state.workspace === 'play' && state.opponent !== 'human' && state.mode === 'play' && !isAIMatch()) {
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
    window.GoTTutor?.onPositionChanged();
  }
  function doRedo() {
    if (guardTutorNavigation()) return;
    window.GoTTutor?.clearTeacherMarks();
    const g = game();
    if (!g.current.children.length) return;
    stopAutoplay();
    if (state.mode === 'score') exitScoreMode();
    g.navChild(0);
    state.browsing = state.recoveryPaused || !!g.current.children.length;
    syncProblemProgress();
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    state.pendingMove = null;
    exitPreview();
    clearAnalysisOverlay();
    renderAll();
    window.GoTTutor?.onPositionChanged();
    /* 仅当重放到线尾且轮到引擎时才请求引擎续弈，中途重放不再让引擎重新生成（避免分叉） */
    if (!g.current.children.length && state.workspace === 'play' && effOpponent() !== 'human' &&
        state.mode === 'play' && !game().result && position().turn !== state.humanColor) {
      requestEngineMove();
    } else {
      requestAnalysis(g.current);
    }
  }
  function newGame(opts) {
    window.GoTRecovery?.flush(); state.recoveryPaused = false;
    if (window.GoTTutor?.active) window.GoTTutor.exit(true);
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
    const learning = $('learningWorkspace'); if (learning) learning.hidden = true;
    state.game = new GE.Game(opts);
    window.GoTRecovery?.allowBlank(state.game);
    aiMatch = opts.aiSides ? {game:state.game,sides:opts.aiSides,paused:true,inFlight:false,single:false,timer:0} : null;
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
    analysisCache.clear(); ownershipAttemptedNode = null;
    setClock(state.clockPreset);   // 按当前计时档重建（off → null，不显示时钟）
    game().timeControl = state.clock
      ? { main: state.clock.main, byo: state.clock.byo, periods: state.clock.periods } : null;
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    renderAll();
    if(!isAIMatch())requestAnalysis(game().current);
    if (effOpponent() !== 'human' && position().turn !== state.humanColor) requestEngineMove();
  }
  // Recovery stores only SGF and a cursor, never async jobs, engine state or classroom controllers.
  window.GoTRecovery?.connect(() => {
    if (!state.game || state.problem || state.practice || state.tutorMode && !window.GoTTutor?.restorableGame) return null;
    if (!window.GoTRecovery.canSaveBlank(game()) && !game().root.children.length && !game().root.setup?.AB?.length && !game().root.setup?.AW?.length) return null;
    return { game: game(), opponent: state.opponent, humanColor: state.humanColor };
  });

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
    if (state.tutorMode && window.GoTTutor?.active) return;
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
    search.placeholder = isZh() ? '搜索题号、段位' : 'Search number or rank';
    search.setAttribute('aria-label', search.placeholder); search.value = problemQuery;
    const completion = document.createElement('select');
    completion.setAttribute('aria-label', isZh() ? '完成状态' : 'Completion');
    for (const [value, zh, en] of [['all','全部状态','All progress'],['new','未开始','Not started'],['started','尝试过','Attempted'],['done','已完成','Solved'],['viewed','看过正解','Solution viewed']]) {
      const opt = document.createElement('option'); opt.value=value; opt.textContent=isZh()?zh:en; completion.append(opt);
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
      add(String(rank), isZh() ? sample.rank : sample.rankEn);
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
    list.setAttribute('aria-label', (isZh() ? '匹配题目：' : 'Matching problems: ') + items.length);
    if (problemCountEl) problemCountEl.textContent = isZh() ? ('匹配 ' + items.length + ' 题') : (items.length + ' problems');
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
      summary.textContent=(isZh()?set.name:set.nameEn)+' · '+matched.length;
      const grid=document.createElement('div'); grid.className='catalog-tiles';
      group.append(summary,grid); groups.set(set.id,grid); frags.append(group);
    }
    items.forEach((p, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      const rec = problemView(p);
      c.className = 'problem-chip' + (rec.solved ? ' completed' : rec.viewed ? ' viewed' : '');
      const rank = isZh() ? p.rank : p.rankEn;
      const status = rec.solved ? t('problemCompleteMark') : rec.viewed ? t('problemViewedMark') : t('problemNotStarted');
      c.setAttribute('aria-label', t('problemNumber') + ' ' + p.no + ' · ' + rank + ' · ' + status);
      c.innerHTML = '<span class="problem-chip-no">' + String(p.no) + '</span><span class="problem-chip-mark" aria-hidden="true">' +
        (rec.solved ? '✓' : rec.viewed ? '◐' : '') + '</span>';
      const detail = document.createElement('span'); detail.className='problem-row-detail';
      detail.textContent=rank+' · '+(p.toMove==='B'?(isZh()?'黑先':'Black'):(isZh()?'白先':'White'))+' · '+p.moves+' '+t('movesShort');
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
    window.GoTRecovery?.flush();
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
    analysisCache.clear(); ownershipAttemptedNode = null;
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
    // Keep the user's confirmation preference while solving problems, too.
    state.problem = { p, items, idx, progress: 0, done: false, wrong: false, wrongCount: 0, undoing: false, assisted: false, viewed: false, started: false };
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
    /* 题目横幅住侧面板：进入死活题前若面板处于收起态，先展开，避免题目信息被整体隐藏 */
    if (state.inspectorCollapsed) { state.inspectorCollapsed = false; saveSettings(); }
    renderAll();
    if (state.analysisOn) requestAnalysis(g.current);
  }
  function renderProblemBanner() {
    const pr = state.problem;
    const banner = $('problemBanner');
    if (!pr || !banner) { if (banner) banner.classList.add('hidden'); return; }
    const p = pr.p;
    const s = (getProblemData().sets || []).find(s => s.id === p.set);
    $('problemSetName').textContent = s ? (isZh() ? s.name : s.nameEn) : p.set;
    $('problemNo').textContent = '#' + p.no;
    const lvEl = $('problemLevel');
    lvEl.textContent = isZh() ? p.rank : p.rankEn;
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
    return (isZh() ? zh : en)[row][col];
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
    if (state.tutorMode && window.GoTTutor?.active) return;
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
  function problemReset() { if (state.tutorMode && window.GoTTutor?.active) return; const pr = state.problem; if (pr) loadProblem(pr.p, pr.items, pr.idx); }
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
    if (state.tutorMode && window.GoTTutor?.active) return;
    const pr = state.problem;
    if (!pr) return;
    const items = pr.items;
    let i = pr.idx + dir;
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    loadProblem(items[i], items, i);
  }
  function problemExit(resume = true) {
    if (state.tutorMode && window.GoTTutor?.active) return;
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
    analysisCache.clear(); ownershipAttemptedNode = null;
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
    if (state.tutorMode && window.GoTTutor?.active) return;
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
    if (state.tutorMode && window.GoTTutor?.active) return;
    closeDialog('settingsDialog'); window.GoTRecords?.close();
    if (!state.problem) setWorkspace('play');
    openProblemDialog();
  });
  document.addEventListener('got:assessment-start',()=>{
    if(!window.GoTGrowth)return;
    const engine=gtp.info?effectiveEngineKind():'builtin',level=window.GoTGrowth.nextLevel(engine);
    newGame({size:19,rules:'chinese',komi:7.5});
    abandonEngine();state.opponent=engine==='builtin'?'builtin':'gtp';state.humanColor=BLACK;userPickedOpponent=true;
    state.coachEnabled=false;saveSettings();
    state.analysisOn=false;state.autoPreview=false;
    $('analysisBtn').setAttribute('aria-pressed','false');$('autoPreviewBtn').setAttribute('aria-pressed','false');
    assessment={game:game(),engine,level,human:BLACK,finished:false};
    setWorkspace('play');renderAll();
  });
  document.addEventListener('click',e=>{
    if(!assessment || assessment.finished || assessment.game!==game())return;
    const b=e.target.closest('button,select');
    if(b && ['undoBtn','redoBtn','analysisBtn','autoPreviewBtn','ownershipBtn','resumePlayBtn'].includes(b.id)){
      assessment=null;showToast(isZh()?'已使用辅助，本盘转为普通对局，不计入测评。':'Assistance used; continuing as an unrated game.');renderAll();
    }
  },true);
  $('problemHint').addEventListener('click', hintExpected);
  $('problemReset').addEventListener('click', problemReset);
  $('problemSolution').addEventListener('click', showSolution);
  $('problemNext').addEventListener('click', () => problemStep(1));
  $('problemPrev').addEventListener('click', () => problemStep(-1));
  $('problemExit').addEventListener('click', () => problemExit());
  $('problemChoose').addEventListener('click', () => { if (!(state.tutorMode && window.GoTTutor?.active)) openProblemDialog(); });
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

  /* 棋力档位 → 级位/段位标签 + 对弈预算（诚实分段）
   * 1.3 起「棋力」真正生效：KataGo 走子按档位限制 maxVisits、加 PDA、低档随机选点
   * （见 js/strength.js）；内置 MCTS 走 ai-worker 的 budgetFor。分析与复盘始终满强度。
   * 三种方式使用不同的参考区间：内置 MCTS 18级 → 1段，浏览器 b6 18级 → 3段，
   * 外置 b18 18级 → 9段。均为"约合"值，tooltip 明确说明，选择项只显示级位/段位。 */
  function strengthKind(opp) {
    const chosen = opp || state.opponent;
    if (chosen === 'builtin' || chosen === 'mcts') return 'mcts';
    if (chosen === 'gtp') {
      if (gtp.info?.browser) return gtp.info.browserModel || gtp.browserModel || 'b6';
      if (gtp.info) return 'b18';
      return 'mcts'; // 桥接尚未连接时，实际会回退到内置 MCTS
    }
    return effectiveEngineKind();
  }
  function strengthKindName(kind, en) {
    if (kind === 'b6') return en ? 'Browser KataGo b6' : '浏览器 KataGo b6';
    if (kind === 'b10') return en ? 'Browser KataGo b10' : '浏览器 KataGo b10';
    if (kind === 'b18') return en ? 'KataGo b18' : 'KataGo b18';
    return en ? 'Built-in MCTS' : '内置 MCTS';
  }
  function difficultyText(s, kind) {
    return Strength.rankTextFor(kind || strengthKind(), s, isZh() ? 'zh' : 'en');
  }
  function difficultyRangeText(kind) {
    const en = !isZh();
    return strengthKindName(kind, en) + ' · ' + Strength.rangeText(kind, en ? 'en' : 'zh');
  }
  function refreshStrengthLabels() {
    const box = $('ngStrength');
    if (!box) return;
    const selectedOpponent = $('ngOpponent')?.querySelector('.selected')?.dataset.opp || state.opponent;
    const kind = strengthKind(selectedOpponent);
    const note = isZh() ? '约合级位/段位，未经正式人类段位校准；不同引擎使用不同区间。' : 'Approximate rank only; not a formal human calibration. Each engine uses its own range.';
    for (const b of box.children) {
      b.textContent = difficultyText(Number(b.dataset.s), kind);
      b.title = note;
    }
    const ngHint = $('ngStrengthHint');
    if (ngHint) ngHint.textContent = difficultyRangeText(kind);
    const setHint = $('setStrengthHint');
    if (setHint) setHint.textContent = difficultyRangeText(strengthKind(state.opponent));
    refreshQuickStrength();
  }
  /* 对局中快速切换对手棋力（不重开对局）：右栏下拉，仅对 AI 对局显示。 */
  let quickStrengthKind = '';
  function refreshQuickStrength() {
    const wrap = $('strengthQuick'), sel = $('quickStrength');
    if (!wrap || !sel) return;
    const kind = strengthKind(state.opponent);
    if (quickStrengthKind !== kind + lang || sel.options.length !== 9) {
      quickStrengthKind = kind + lang;
      sel.textContent = '';
      for (let s = 1; s <= 9; s++) {
        const o = document.createElement('option');
        o.value = String(s);
        o.textContent = difficultyText(s, kind);
        sel.appendChild(o);
      }
    }
    sel.value = String(assessmentStrength());
    sel.disabled=!!(assessment && assessment.game===game() && !assessment.finished);
    sel.title = difficultyRangeText(kind) + ' · ' + t('strengthRankNote');
    wrap.hidden = state.workspace !== 'play' || state.opponent === 'human' || !!state.problem || isAIMatch();
  }
  $('quickStrength').addEventListener('change', () => {
    state.strength = Number($('quickStrength').value) || 3;
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
  function refreshMatchSetup() {
    const watch=$('ngMode').value==='watch';
    $('ngMatchSettings').hidden=!watch;
    for(const id of ['ngSide','ngOpponent','ngTimeControl'])$(id).closest('label').hidden=watch;
    $('ngStrengthLabel').hidden=watch;
    $('ngModeLabel').textContent=isZh()?'对局方式':'Game mode';
    $('ngMode').options[0].textContent=isZh()?'自己下棋':'Play a game';
    $('ngMode').options[1].textContent=isZh()?'AI 对 AI · 观战':'AI vs AI · Watch';
    for(const side of ['Black','White']) {
      const name=side==='Black'?(isZh()?'黑方':'Black'):(isZh()?'白方':'White');
      document.getElementById('ng'+side+'EngineLabel').textContent=name+(isZh()?'引擎':' engine');
      document.getElementById('ng'+side+'RankLabel').textContent=name+(isZh()?'棋力':' rank');
      const engine=document.getElementById('ng'+side+'Engine'),rank=document.getElementById('ng'+side+'Rank'),level=rank.value||'3';
      engine.options[1].textContent=gtp.info?analysisEngineLabel():(isZh()?'KataGo（未连接）':'KataGo (unavailable)');
      const kind=strengthKind(engine.value);rank.replaceChildren();for(let i=1;i<=9;i++){const option=document.createElement('option');option.value=i;option.textContent=difficultyText(i,kind);rank.append(option);}rank.value=level;
    }
    $('ngMatchHint').textContent=isZh()?'双方可分别选 MCTS 或当前连接的 KataGo，以及参考级段位。KataGo 不可用时明确回退 MCTS；本模式不做正式棋力评定。':'Choose MCTS or the currently connected KataGo for each side. Unavailable KataGo falls back to MCTS. Ranks are uncalibrated references.';
  }
  $('ngMode').addEventListener('change',refreshMatchSetup);
  $('ngBlackEngine').addEventListener('change',refreshMatchSetup);
  $('ngWhiteEngine').addEventListener('change',refreshMatchSetup);
  function startMatchTurn(single) {
    if(!isAIMatch()||state.mode!=='play'||game().result||aiMatch.inFlight)return;
    analysisSeq++;cancelNativeAnalysis();invalidatePreview();state.browsing=false;
    aiMatch.paused=!!single;aiMatch.single=!!single;
    renderAll();requestEngineMove();
  }
  $('aiMatchToggle').addEventListener('click',()=>{if(!isAIMatch())return;if(!aiMatch.paused){abandonEngine();renderAll();}else startMatchTurn(false);});
  $('aiMatchStep').addEventListener('click',()=>startMatchTurn(true));
  function refreshBoardAfterResume() {
    if (document.hidden) return;
    // Mobile browsers can restore the document before its visual viewport has
    // settled. Resize twice across frames, but keep the existing WebGL view.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.hidden) return;
      resizeMainBoard();
      renderer.requestRender();
      if (board3dRenderer?.active) {
        requestAnimationFrame(() => {
          if (!document.hidden) { board3dRenderer?.view?.resize(); board3dRenderer?.requestRender(); }
        });
      }
    }));
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(isAIMatch()){abandonEngine();renderAll();}return;}
    refreshBoardAfterResume();
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)refreshBoardAfterResume();});
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
    const webLabel = $('ngOpponent').querySelector('[data-opp="gtp"] span');
    if (webLabel) webLabel.textContent = gtp.info?.browser || state.engine === 'b6' ? 'KataGo Web' : 'KataGo';
    const sel = $('ngOpponent').querySelector('.selected');
    if (!sel || sel.dataset.opp !== 'gtp') { el.hidden = true; return; }
    el.hidden = false;
    if (gtp.info) {
      el.classList.add('online');
      const backend = gtp.info.browser && gtp.info.backend ? ' · ' + gtp.info.backend : '';
      el.textContent = t('connectOk') + gtp.info.name + ' ' + (gtp.info.version || '') + backend;
    } else {
      el.classList.remove('online');
      el.textContent = t('ngEngineOff');
    }
  }

  $('newGameBtn').addEventListener('click', () => {
    if(isAIMatch()){abandonEngine();renderAll();}
    openDialog('newGameDialog');
    syncNewGameDialog();
    updateNgEngineHint();
  });
  $('resultNewGameBtn').addEventListener('click', () => $('newGameBtn').click());
  $('resultReviewBtn').addEventListener('click', () => setWorkspace('review', 'play'));
  /* 新对局对话框固定默认：中国规则 · 19 路 · 自动执子 · 棋力 12级附近 · 让子 0；
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
    sel('ngStrength', 's', state.strength || 3);
    $('ngRule').value = 'chinese';
    $('ngHandicap').value = '0';
    $('ngTime').value = String(state.timeMs);
    if ($('ngTimeControl')) $('ngTimeControl').value = state.clockPreset;   // 记住上次计时档（默认不计时）
    $('ngStrengthLabel').style.display = '';
    refreshStrengthLabels();
    $('ngMode').value='play';refreshMatchSetup();
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
    const watch=$('ngMode').value==='watch';
    const aiSides=watch?{1:{engine:$('ngBlackEngine').value,strength:Number($('ngBlackRank').value)},2:{engine:$('ngWhiteEngine').value,strength:Number($('ngWhiteRank').value)}}:null;
    state.opponent = opp;
    state.strength = strength;
    state.timeMs = timeMs;
    state.clockPreset = Clock.PRESETS[clockPreset] ? clockPreset : 'off';
    state.humanColor = side === 'auto' ? (Math.random() < 0.5 ? BLACK : WHITE) : (side === 'white' ? WHITE : BLACK);
    if(watch){state.humanColor=0;state.opponent='builtin';state.clockPreset='off';}
    saveSettings();
    /* 让子局惯例贴 0.5（或 0）——分先规则贴目不该原样带进让子局 */
    const baseKomi = (GE.RULES[rules] && GE.RULES[rules].komi) || 7.5;
    const komi = handicap >= 2 ? 0.5 : baseKomi;
    const names = {};
    names[BLACK] = ''; names[WHITE] = '';
    names[state.humanColor] = t('you');
    const engineName = opp === 'gtp' ? (gtp.info ? analysisEngineLabel() : 'KataGo') : (isZh() ? '内置 AI ' : 'MCTS ') + strength;
    names[state.humanColor === BLACK ? WHITE : BLACK] = opp === 'human' ? (isZh() ? '棋手' : 'Player') : engineName;
    closeDialog('newGameDialog');
    if(watch){names[BLACK]=isZh()?'黑方 AI':'Black AI';names[WHITE]=isZh()?'白方 AI':'White AI';}
    newGame({ size, rules, komi, handicap, names, aiSides });
    if(watch){state.humanColor=0;state.opponent='builtin';startMatchTurn(false);}
    /* 选了 KataGo 但桥不可用：不再只弹提示干等（那会让 AI 一手都不下）——
     * 明确告知已改用内置 AI，requestEngineMove 会自动降级续弈。 */
    if (opp === 'gtp' && !gtp.info) { gtpDownNotified = false; noteGtpFallback(); }
    updateEnginePill();
  });

  /* 显示设置：候选圈颜色 / 列表排序，改动即时生效并持久化 */
  function syncDisplaySettings() {
    syncWorkspaceUI();
    for (const [id, key] of [['numbersBtn','showNumbers'], ['coordsBtn','showCoords'], ['flipBtn','flip'], ['naturalPlacementBtn','naturalPlacement']]) {
      $(id).setAttribute('aria-pressed', String(state[key]));
    }
    $('dsCandColor').value = state.candColor;
    $('dsCandSort').value = state.candSort;
    $('themeSelect').value = state.theme;
    $('materialSelect').value = state.material;
    $('stoneSelect').value = state.stone;
    $('board25dBackground').value=state.board25dBackground;
    $('board25dFinish').value=state.board25dFinish;$('board25dTone').value=state.board25dTone;$('board25dGloss').value=state.board25dGloss;$('board25dStoneMaterial').value=state.board25dStoneMaterial;
    $('board25dStoneShape').value=state.board25dStoneShape;$('board25dLighting').value=state.board25dLighting;$('board25dSharedLighting').setAttribute('aria-pressed',String(state.board25dSharedLighting));$('board25dEnhancedShadows').setAttribute('aria-pressed',String(state.board25dEnhancedShadows));
    $('board25dQuality').value=state.board25dQuality;$('board25dAnimations').value=state.board25dAnimations?'on':'off';
    $('board25dCameraAngle').value=String(state.board25dCameraAngle);$('board25dCameraAngleValue').textContent=`${state.board25dCameraAngle}°`;
    $('boardAngleSliderToggle').setAttribute('aria-pressed',String(state.showBoardAngleSlider));
    $('board25dGridScale').value=String(state.board25dGridScale);$('board25dGridScaleValue').textContent=`${state.board25dGridScale}%`;
    $('board2dAnimations').value=state.board2dAnimations?'on':'off';
    $('boardAnimationSpeed').value=String(state.boardAnimationSpeed);
    $('naturalPlacementBtn').setAttribute('aria-pressed',String(state.naturalPlacement));
    $('confirmMode').value = state.confirmMode;
    updateBoardViewToggle();
  }
  $('displaySettingsBtn').addEventListener('click', () => {
    if (!$('settingsDialog').open) $('shellSettingsBtn').click();
    syncDisplaySettings();
    settingsButtons[2].click();
  });
  $('resetAppearanceBtn').addEventListener('click', () => openDialog('appearanceResetDialog'));
  $('appearanceResetCancel').addEventListener('click', () => closeDialog('appearanceResetDialog'));
  $('appearanceResetConfirm').addEventListener('click', () => {
    closeDialog('appearanceResetDialog');
    Object.assign(state, appearanceDefaults);
    if (savedSettings && typeof savedSettings === 'object') {
      savedSettings.showCoordsDesktop = true;
      savedSettings.showCoordsMobile = false;
      savedSettings.showCoords = true;
    }
    applyTheme(state.theme, false);
    applyMaterial(state.material, false);
    applyStone(state.stone, false);
    classicRenderer.setAnimationSpeed(state.boardAnimationSpeed);
    classicRenderer.setZoom(1);
    board3dRenderer?.setAppearance(current25dAppearance());
    const saved = saveSettings();
    syncDisplaySettings();
    renderBoard();
    showToast(t(saved ? 'appearanceResetDone' : 'appearanceResetUnsaved'));
  });
  $('themeSelect').addEventListener('change', () => applyTheme($('themeSelect').value, true));
  $('materialSelect').addEventListener('change', () => applyMaterial($('materialSelect').value, true));
  $('stoneSelect').addEventListener('change', () => applyStone($('stoneSelect').value, true));
  for(const id of ['board25dBackground','board25dFinish','board25dTone','board25dGloss','board25dStoneMaterial','board25dStoneShape','board25dLighting','board25dQuality','board25dAnimations'])$(id).addEventListener('change',()=>apply25dAppearance(id,$(id).value,true));
  $('board25dSharedLighting').addEventListener('click',()=>apply25dAppearance('board25dSharedLighting',!state.board25dSharedLighting,true));
  $('board25dEnhancedShadows').addEventListener('click',()=>apply25dAppearance('board25dEnhancedShadows',!state.board25dEnhancedShadows,true));
  for(const id of ['board25dCameraAngle','board25dGridScale']){
    $(id).addEventListener('input',()=>apply25dAppearance(id,$(id).value,false));
    $(id).addEventListener('change',saveSettings);
  }
  $('board2dAnimations').addEventListener('change',()=>{state.board2dAnimations=$('board2dAnimations').value==='on';saveSettings();});
  $('boardPhotoBtn').addEventListener('click',exportBoardPhoto);
  $('naturalPlacementBtn').addEventListener('click',()=>{
    state.naturalPlacement=!state.naturalPlacement;
    classicRenderer.set({naturalPlacement:state.naturalPlacement});
    board3dRenderer?.setAppearance({naturalPlacement:state.naturalPlacement});
    $('naturalPlacementBtn').setAttribute('aria-pressed',String(state.naturalPlacement));
    saveSettings();renderBoard();
  });
  $('boardAnimationSpeed').addEventListener('change',()=>{
    state.boardAnimationSpeed=Number($('boardAnimationSpeed').value)||1.25;
    classicRenderer.setAnimationSpeed(state.boardAnimationSpeed);
    board3dRenderer?.setAppearance({animationSpeed:state.boardAnimationSpeed});
    saveSettings();
  });
  $('board25dMode').addEventListener('change',()=>setBoardView25d($('board25dMode').value==='25d'));
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
  $('engConnect').addEventListener('click', async () => {
    state.analysisSeconds = Number($('engSeconds').value) || 2;
    gtp.baseUrl = $('bridgeUrl').value.replace(/\/$/, '');
    saveSettings();
    $('engStatus').classList.remove('online');
    $('engStatus').textContent = '…';
    const res = await gtp.health(6000);
    applyEngineChoice();
    updateEnginePill();
    updateEngineChoices();
    syncWorkspaceUI();
    if (state.showOwnership && state.mode !== 'score' && !state.problem) renderBoard();
    if (gtp.info) {
      $('engStatus').classList.add('online');
      $('engStatus').textContent = t('connectOk') + gtp.info.name + ' ' + (gtp.info.version || '') +
        (gtp.info.supportsAnalyze ? '' : (isZh() ? '（仅 genmove）' : ' (genmove only)'));
      showToast(t('connectOk') + gtp.info.name);
    } else {
      $('engStatus').textContent = t('connectFail') + friendlyFetchError(res.error || '');
    }
  });
  for (const browserClient of [browserKataGo, browserKataGoB10]) if (browserClient) browserClient.onStatus = () => {
    if (browserClient.status === 'error') {
      if (browserClient === browserKataGo) gtp.browserInfo = null;
      else gtp.browserB10Info = null;
      if (gtp.info?.browser && gtp.info.browserModel === browserClient.info?.browserModel) { gtp.info = null; gtp.source = ''; }
    }
    updateEngineChoices(); updateEnginePill(); updateNgEngineHint();
  };
  /* 引擎页：内置 MCTS / 浏览器 KataGo b6 / 浏览器 KataGo b10 / 外置 KataGo b18。
   * 选中项立即持久化并重新探测；选中但不可用时回退内置 MCTS 并提示。 */
  function updateEngineChoices() {
    const wrap = $('engineChoice');
    if (!wrap) return;
    const effective = effectiveEngineKind();
    const selected = state.engine === 'auto' ? effective : state.engine;
    const unavailable = state.engine !== 'auto' && state.engine !== 'mcts' && state.engine !== effective;
    for (const btn of wrap.querySelectorAll('.engine-option')) {
      const id = btn.dataset.engine;
      btn.setAttribute('aria-pressed', String(id === selected));
      btn.classList.toggle('is-active', id === effective);
    }
    const mctsState = $('engineStateMcts');
    const b6State = $('engineStateB6');
    const b10State = $('engineStateB10');
    const b18State = $('engineStateB18');
    if (mctsState) mctsState.textContent = (effective === 'mcts' ? t('engineActive') + ' · ' : '') + t('engineAlwaysOn');
    if (b6State) {
      const httpPage = location.protocol === 'http:' || location.protocol === 'https:';
      if (gtp.browserInfo) b6State.textContent = (effective === 'b6' ? t('engineActive') + ' · ' : '') + (browserKataGo?.status === 'loading' ? t('browserEngineLoading') : browserKataGo?.status === 'ready' ? t('browserEngineLoaded') : t('browserEngineReady')) +
        (gtp.browserInfo.backend ? ' · ' + gtp.browserInfo.backend : '');
      else if (browserKataGo?.status === 'error') b6State.textContent = t('browserEngineFailed') + browserKataGo.error;
      else if (!httpPage) b6State.textContent = t('engineNeedsHttp');
      else b6State.textContent = t('engineStateUnavailable');
    }
    if (b10State) {
      const httpPage = location.protocol === 'http:' || location.protocol === 'https:';
      if (gtp.browserB10Info) b10State.textContent = (effective === 'b10' ? t('engineActive') + ' · ' : '') + (browserKataGoB10?.status === 'loading' ? t('browserEngineLoading') : browserKataGoB10?.status === 'ready' ? t('browserEngineLoaded') : t('browserEngineReady')) +
        (gtp.browserB10Info.backend ? ' · ' + gtp.browserB10Info.backend : '');
      else if (browserKataGoB10?.status === 'error') b10State.textContent = t('browserEngineFailed') + browserKataGoB10.error;
      else if (!httpPage) b10State.textContent = t('engineNeedsHttp');
      else b10State.textContent = t('engineStateUnavailable');
    }
    if (b18State) b18State.textContent = gtp.nativeInfo
      ? (effective === 'b18' ? t('engineActive') + ' · ' : '') + t('engineStateReady')
      : t('engineNeedBridge');
    const hint = $('engineChoiceHint');
    if (hint) {
      hint.hidden = !unavailable;
      hint.textContent = unavailable ? t('engineFallbackHint') : '';
    }
  }
  {
    const wrap = $('engineChoice');
    if (wrap) wrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('.engine-option[data-engine]');
      if (!btn) return;
      const pick = btn.dataset.engine;
      abandonEngine(); analysisSeq++; cancelNativeAnalysis(); analysisCache.clear(); ownershipAttemptedNode = null;
      if (assessment) assessment = null;
      state.engine = ['mcts', 'b6', 'b10', 'b18'].includes(pick) ? pick : 'auto';
      if (state.opponent !== 'human') state.opponent = pick === 'mcts' ? 'builtin' : 'gtp';
      userPickedOpponent = true;
      saveSettings();
      updateEngineChoices();
      if (pick === 'b6' && browserKataGo) {
        const loaded = await browserKataGo.load();
        if (state.engine !== pick) return;
        gtp.browserInfo = loaded.ok ? loaded.engine : null;
        if (!loaded.ok) showToast(t('browserEngineFailed') + (loaded.error || ''));
      } else if (pick === 'b10' && browserKataGoB10) {
        gtp.useBrowserModel('b10');
        const loaded = await browserKataGoB10.load();
        if (state.engine !== pick) return;
        gtp.browserB10Info = loaded.ok ? loaded.engine : null;
        if (!loaded.ok) showToast(t('browserEngineFailed') + (loaded.error || ''));
      } else if (pick !== 'mcts') {
        await gtp.health(4000);
        if (state.engine !== pick) return;
      }
      applyEngineChoice();
      refreshStrengthLabels();
      syncSettingsDialog();
      updateEnginePill();
      updateEngineChoices();
      updateNgEngineHint();
      // 切到分析相关引擎后，重跑当前局面的分析
      if (state.analysisOn) requestAnalysis(game().current);
      // 切到内置 MCTS 时提示确已生效
      if (state.engine === 'mcts') showToast(t('engineSwitchedMcts'));
      renderAll(); maybeResumeEngineTurn();
    });
  }
  function updateEnginePill() {
    const pill = $('enginePill');
    if (gtp.info) {
      pill.classList.add('online');
      const backend = gtp.info.browser && gtp.info.backend ? ' · ' + gtp.info.backend : '';
      $('enginePillText').textContent = gtp.info.name + (gtp.info.version ? ' ' + gtp.info.version : '') + backend;
    } else {
      pill.classList.remove('online');
      $('enginePillText').textContent = effectiveEngineKind() === 'mcts' ? t('engineMcts') : t('engineOff');
    }
    updateEngineChoices();
  }

  $('resignBtn').addEventListener('click', () => {
    if (game().result || isAIMatch()) return;
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
  $('scoreCancelBtn').addEventListener('click', () => {
    if (state.mode === 'score') exitScoreMode();
  });
  $('scoreDoneBtn').addEventListener('click', () => {
    const owner = state.game, runId = state.scoreRunId;
    if (!state.scorePending) { openDialog('scoreDialog'); return; }
    /* Let the user request confirmation at any time. Queue the dialog for this
     * specific run; cancel/restart makes the stale click a no-op. */
    const ready = scoreReadyPromise;
    ready.then(() => {
      if (state.game === owner && state.mode === 'score' && state.scoreRunId === runId && !state.scorePending) openDialog('scoreDialog');
    });
  });
  $('scKeep').addEventListener('click', () => { closeDialog('scoreDialog'); exitScoreMode(); });
  $('scConfirm').addEventListener('click', () => {
    const sc = currentScore();
    game().result = sc.result;
    game().infoProps();
    closeDialog('scoreDialog');
    exitScoreMode();
    renderAll();
  });

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
  $('advancedAnalysisToggle').addEventListener('change', () => {
    state.showAdvancedAnalysis = $('advancedAnalysisToggle').checked;
    saveSettings();
    syncWorkspaceUI();
  });
  /* 工具栏核心操作里的「分析」：与面板内开关同源；面板被收起时先展开，保证分析工作区完整可见 */
  $('railAnalysisBtn').addEventListener('click', () => {
    if (state.inspectorCollapsed) setInspectorCollapsed(false);
    $('analysisBtn').click();
  });
  $('ownershipBtn').addEventListener('click', () => {
    state.showOwnership = !state.showOwnership;
    $('ownershipBtn').setAttribute('aria-pressed', String(state.showOwnership));
    $('boardColumn').classList.toggle('ownership-mode', state.showOwnership && state.mode !== 'score' && !state.problem);
    if (!state.showOwnership) ownershipAttemptedNode = null;
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
  $('confirmMode').addEventListener('change', () => {
    state.confirmMode = $('confirmMode').value === 'button' ? 'button' : 'double';
    saveSettings();
    renderBoard();
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
  $('tabReviewTraining').addEventListener('click', () => switchTab('review'));
  $('tabTutor').addEventListener('click', () => switchTab('tutor', true));
  const tabIds = { analysis: 'tabAnalysis', review: 'tabReviewTraining', tutor: 'tabTutor', tree: 'tabTree' };
  for (const id of Object.values(tabIds)) {
    $(id).addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const names = Object.keys(tabIds).filter((name) => !$(tabIds[name]).hidden);
      const current = names.indexOf(state.activeTab);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? names.length - 1 :
        (current + (e.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
      const name = names[next];
      switchTab(name, true);
      $(tabIds[name]).focus();
    });
  }
  $('boardAngleOverlay').addEventListener('input',()=>apply25dAppearance('board25dCameraAngle',$('boardAngleOverlay').value,false));
  $('boardAngleOverlay').addEventListener('change',saveSettings);
  $('boardQuickFinish').addEventListener('change',()=>apply25dAppearance('board25dFinish',$('boardQuickFinish').value,true));
  $('boardQuickTone').addEventListener('change',()=>apply25dAppearance('board25dTone',$('boardQuickTone').value,true));
  $('boardQuickBackground').addEventListener('change',()=>apply25dAppearance('board25dBackground',$('boardQuickBackground').value,true));
  $('boardQuickGloss').addEventListener('change',()=>apply25dAppearance('board25dGloss',$('boardQuickGloss').value,true));
  $('boardQuickStoneMaterial').addEventListener('change',()=>apply25dAppearance('board25dStoneMaterial',$('boardQuickStoneMaterial').value,true));
  $('boardQuickStoneShape').addEventListener('change',()=>apply25dAppearance('board25dStoneShape',$('boardQuickStoneShape').value,true));
  $('boardAngleSliderToggle').addEventListener('click',()=>{
    state.showBoardAngleSlider=!state.showBoardAngleSlider;
    syncBoardAngleControl();saveSettings();
  });
  function switchTab(name, launchTutor = false) {
    if (name === 'tutor' && !window.GoTTutor?.active && !launchTutor) name = state.workspace === 'review' ? 'review' : 'tree';
    const shouldLaunchTutor = name === 'tutor' && launchTutor && !window.GoTTutor?.active;
    state.activeTab = name;
    $('tabReviewTraining').hidden = state.workspace !== 'review';
    const pages = { analysis: 'pageAnalysis', review: 'pageReview', tutor: 'gotTutorPanel', tree: 'pageTree' };
    const tabs = tabIds;
    for (const k of Object.keys(pages)) {
      if (k === 'tutor') $(pages[k]).hidden = k !== name || !window.GoTTutor?.active;
      else $(pages[k]).classList.toggle('hidden', k !== name);
      $(tabs[k]).classList.toggle('selected', k === name);
      $(tabs[k]).setAttribute('aria-selected', String(k === name));
      $(tabs[k]).tabIndex = k === name ? 0 : -1;
    }
    const tutorActive = !!window.GoTTutor?.active;
    $('gotTutorPanel').closest('.analysis-column')?.classList.toggle('tutor-focused', tutorActive);
    const mobileClose = $('mobilePanelClose');
    mobileClose.textContent = t('backToBoard');
    mobileClose.classList.remove('tutor-end-action');
    syncTutorLayout();
    /* Changing the panel must still refresh the board-side status.  The quiet
     * play tab is a real workspace state, not just a visibility toggle. */
    if (name !== 'tutor') renderAll();
    if (shouldLaunchTutor) document.dispatchEvent(new CustomEvent('got:tutor-explain', { detail: { source: state.workspace === 'review' ? 'review' : 'analysis' } }));
  }
  /* 复盘训练拥有独立页签；切入时从顶部展示状态与控制项。 */
  function scrollReviewIntoView() {
    const panel = $('pageReview');
    if (panel) panel.scrollTop = 0;
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
  $('treeBackBtn').addEventListener('click', () => {
    if (!treeContext.length || guardTutorNavigation()) return;
    const entry = treeContext.pop();
    treeSlideDirection = 'left';
    goToNode(entry.returnNode || entry.parent, true);
  });
  $('treeMainBtn').addEventListener('click', () => {
    if (guardTutorNavigation()) return;
    let n = game().root;
    while (n.children.length) n = n.children[0];
    treeContext = [];
    treeSlideDirection = 'left';
    goToNode(n, true);
  });

  /* 学习工作区打开棋谱的统一入口。它与文件导入共用同一套复盘初始化，
   * 但不会把学习内容或当前棋局写入 localStorage。 */
  function loadSgfForLearning(text, title, guess, returnTo) {
    window.GoTRecovery?.flush(); state.recoveryPaused = false;
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
    analysisCache.clear(); ownershipAttemptedNode = null;
    if (returnTo) reviewReturnWorkspace = returnTo;
    else if (state.workspace !== 'review') reviewReturnWorkspace = state.workspace === 'learn' ? 'learn' : 'play';
    state.workspace = 'review';
    state.activeTab = 'review';
    while (g.current.children.length) g.navChild(0);
    abandonEngine();
    analysisSeq++; cancelNativeAnalysis();
    requestedAnalysisNode = null;
    clearAnalysisOverlay();
    const learning = $('learningWorkspace'); if (learning) learning.hidden = true;
    updateEnginePill();
    switchTab('review');
    renderAll();
    requestAnalysis(g.current);
    showToast(title ? t('loadedSgf') + ' · ' + title : t('loadedSgf'));
    if (guess) showToast(t('learningGuessStarted'));
  }
  document.addEventListener('got:learning-open-sgf', (e) => {
    const d = e && e.detail || {};
    try { if (d.sgf) loadSgfForLearning(d.sgf, d.title, d.guess, d.returnTo); }
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
  function returnFromReview() {
    setMobilePanel(false);
    if (reviewReturnWorkspace === 'records') {
      setWorkspace('review', 'records');
      window.GoTRecords.open(lang);
    } else setWorkspace(reviewReturnWorkspace === 'learn' ? 'learn' : 'play');
  }
  $('reviewReturnBtn').addEventListener('click', returnFromReview);
  $('mobileReviewReturnBtn').addEventListener('click', returnFromReview);
  document.addEventListener('got:records-closed', () => syncWorkspaceUI());
  $('openBtn').addEventListener('click', () => { setWorkspace('review', 'records'); window.GoTRecords.open(lang); });
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
        showToast(failed ? `${message} · ${failed} ${isZh() ? '份失败' : 'failed'}` : message);
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
      let line = (isZh() ? '胜率 ' : 'WR ') + Math.round(wrMover * 100) + '%';
      if (rv.loss !== undefined && !node.move.pass) {
        line += (isZh() ? ' · 损失 -' : ' · Loss -') + rv.loss.toFixed(1) + t('pointsUnit');
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
  $('studioBtn').addEventListener('click', () => {
    if (!window.GoTStudio) return;
    cancelWorkspaceWork();
    state.pendingMove = null;
    window.GoTStudio.open({ lang, snapshot: () => {
      const g = game(), p = g.positionAt(g.current);
      return {size:g.size,board:p.board,turn:p.turn,rules:g.rules,body:g.current.comment || '',title:isZh()?'棋局片段':'Game position'};
    }, onClose: () => { state.clockLast = Date.now(); renderAll(); maybeResumeEngineTurn(); if(state.analysisOn)requestAnalysis(game().current); } });
  });
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
    window.GoTRecovery?.schedule();
  });
  function syncCommentBox() {
    const cb = $('commentBox');
    if (document.activeElement !== cb) cb.value = game().current.comment || '';
  }

  function applyI18n() {
    refreshMatchSetup();
    $('studioBtn').querySelector('span').textContent = isZh() ? '编创讲义' : 'Create lesson';
    document.documentElement.lang = HTML_LANG[lang] || 'en';
    const nextLang = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    $('languageToggleText').textContent = LANG_NAMES[nextLang] || nextLang;
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.getAttribute('data-i18n'));
    }
    for (const el of document.querySelectorAll('[data-i18n-title]')) {
      el.title = t(el.getAttribute('data-i18n-title'));
    }
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    }
    for (const el of document.querySelectorAll('[data-i18n-aria]')) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    }
    $('languageToggle').setAttribute('aria-label', t('languageToggle'));
    syncVersionDisplay();
    applyTheme(state.theme);
    applyMaterial(state.material);
    applyStone(state.stone);
    updateAutoplayBtn(); // 播放/暂停是动态文案，data-i18n 覆盖后需按状态重设
    updateEnginePill();  // 引擎徽章文案同样可能被 data-i18n 覆盖
    refreshStrengthLabels();  // 段位标签随语言切换（级 / kyu、段 / dan）
    syncWorkspaceUI();
    renderTutorStorage();
    // 学习/棋谱等内容模块只有中英；韩、日回退英文，繁中回退简体中文。
    const contentLang = (lang === 'ja' || lang === 'ko') ? 'en' : (lang === 'zhHant' ? 'zh' : lang);
    if (window.GoTLearning) window.GoTLearning.setLanguage(contentLang);
    if (window.GoTRecords) window.GoTRecords.setLanguage(contentLang);
    if (state.problem) renderProblemBanner();
    if ($('problemDialog').open) refreshProblemDialog();
    window.GoTPersonalization?.refresh();
  }
  function setLanguage(next) {
    const value = LANGS.includes(next) ? next : 'zh';
    if (value === lang) return;
    lang = value;
    localStorage.setItem('got.lang', value);
    applyI18n();
    renderAll();
  }

  /* Public, deliberately small board-tool surface for GoT Tutor. The model is
   * never given DOM access; legality and position reads stay inside GoEngine. */
  function tutorEvaluation(value, node) {
    if (!value) return null;
    const vertex = m => m.pass ? 'pass' : GE.coordName(game().size, m.x, m.y);
    return {
      engine: value.engine || value.kind, model: value.model || '', rules: value.rules || game().rules,
      moveNumber: movesListTo(node).length, sideToMove: game().positionAt(node).turn === BLACK ? 'black' : 'white',
      perspective: 'black', winrateBlack: Number.isFinite(value.wrBlack) ? value.wrBlack : null,
      scoreLeadBlack: Number.isFinite(value.scoreLeadBlack) ? value.scoreLeadBlack : null,
      visits: value.visits || 0,
      candidates: (value.candidates || []).slice(0, 5).map(c => ({ x: c.x, y: c.y, coordinate: vertex(c), pass: !!c.pass,
        scoreLeadBlack: c.scoreLeadBlack, winrateBlack: c.wrBlack, visits: c.visits,
        pv: (c.pv || []).slice(0, 8).map(m => typeof m === 'string' ? m : vertex(m)) }))
    };
  }
  let tutorPrevious = null;
  let tutorAnalysisAbort = new AbortController();
  let tutorMoveWaiter = null, lastTutorMove = null;
  window.GoTBoardTools = {
    captureHistorySnapshot() {
      const owner = game(), node = owner.current, nodePath = [];
      let cursor = node;
      while (cursor?.parent) {
        nodePath.unshift({
          branch: cursor.parent.children.indexOf(cursor),
          move: cursor.move ? { color: cursor.move.color === BLACK ? 'B' : 'W', x: cursor.move.x, y: cursor.move.y, pass: !!cursor.move.pass } : null
        });
        cursor = cursor.parent;
      }
      const sgf = GE.gameToSgf(owner, node);
      if (sgf.length > 256 * 1024) return null;
      return {
        version: 1, rootId: owner.root.id, nodeId: node.id, size: owner.size, rules: owner.rules,
        komi: owner.komi, nodePath, moveNumber: movesListTo(node).length, sgf,
        marks: state.tutorMarks.slice(0, 32).filter(mark => Number.isInteger(mark.x) && Number.isInteger(mark.y))
          .map(mark => ({ x: mark.x, y: mark.y, label: String(mark.label || '').slice(0, 20), source: 'teacher', coordinate: String(mark.coordinate || '').slice(0, 12) }))
      };
    },
    restoreHistorySnapshot(snapshot) {
      if (!snapshot || snapshot.version !== 1 || typeof snapshot.sgf !== 'string' || snapshot.sgf.length > 256 * 1024) return false;
      let restored;
      try { restored = GE.sgfToGame(snapshot.sgf); } catch (_) { return false; }
      if (![9, 13, 19].includes(restored.size)) return false;
      let node = restored.root;
      while (node.children.length) node = node.children[0];
      restored.current = node;
      if (state.mode === 'score') exitScoreMode();
      window.GoTRecovery?.flush();
      abandonEngine(); analysisSeq++; cancelNativeAnalysis(); requestedAnalysisNode = null;
      invalidatePreview(); stopAutoplay();
      state.game = restored;
      state.mode = 'play'; state.browsing = true; state.pendingMove = null;
      state.opponent = 'human'; state.humanColor = restored.positionAt(node).turn;
      state.recoveryPaused = false; state.tutorMode = false; tutorPrevious = null;
      state.problem = null; state.problemPrev = null;
      const banner = $('problemBanner'); if (banner) banner.classList.add('hidden');
      syncProblemMode();
      state.tutorMarks = (Array.isArray(snapshot.marks) ? snapshot.marks : []).slice(0, 32)
        .filter(mark => Number.isInteger(mark.x) && Number.isInteger(mark.y) && mark.x >= 0 && mark.y >= 0 && mark.x < restored.size && mark.y < restored.size)
        .map(mark => ({ x: mark.x, y: mark.y, label: String(mark.label || '').slice(0, 20), source: 'teacher', coordinate: String(mark.coordinate || '').slice(0, 12) }));
      state.deadStones.clear(); state.scorePending = false;
      analysisCache.clear(); ownershipAttemptedNode = null;
      previewCache.clear(); timelineAnchor = null; treeContext = [];
      renderer.set({ preview: [] }); clearAnalysisOverlay();
      $('tutorMarksLegend').textContent = state.tutorMarks.length
        ? (isZh() ? '老师标注：' : 'Teacher marks: ') + state.tutorMarks.map(mark => `${mark.label} · ${mark.coordinate}`).join(' / ')
        : '';
      $('tutorClearMarks').hidden = !state.tutorMarks.length;
      renderAll();
      return true;
    },
    bookmark(node = game().current) {
      return { owner: game(), node, marks: state.tutorMarks.slice(), problem: state.problem ? { progress: state.problem.progress, done: state.problem.done } : null };
    },
    restoreBookmark(saved) {
      if (!saved || saved.owner !== game()) return false;
      goToNode(saved.node, true);
      state.browsing = false; state.pendingMove = null;
      state.tutorMarks = saved.marks.slice();
      if (saved.problem && state.problem) Object.assign(state.problem, saved.problem);
      renderAll(); return true;
    },
    cancelTeachingAnalysis() { tutorAnalysisAbort.abort(); tutorAnalysisAbort = new AbortController(); analysisSeq++; cancelNativeAnalysis(); abandonEngine(); },
    clearTeacherMarks() { state.tutorMarks = state.tutorMarks.filter(m => m.source !== 'teacher'); renderBoard(); },
    refreshBoardUI() { renderSide(); },
    coordinate(move) { return move.pass ? 'pass' : GE.coordName(game().size, move.x, move.y); },
    setTutorPanelOpen(open, speech) {
      if (mobileLayout) setMobilePanel(!!open);
      syncTutorLayout();
      if (!mobileLayout) { if (open) requestAnimationFrame(resizeMainBoard); return; }
      if (!open && speech) showToast(isZh() ? '请在棋盘上落子；讲解保留在老师面板。' : 'Play on the board; the explanation remains in the teacher panel.');
    },
    stamp() { return `${game().root.id}:${game().current.id}:${movesListTo(game().current).length}`; },
    isFinished() { const n = game().current; return !!(n.move?.pass && n.parent?.move?.pass); },
    begin({ size = 9, toMove: side = BLACK, setup = {}, komi = 0 } = {}) {
      window.GoTRecovery?.flush();
      abandonEngine(); cancelNativeAnalysis();
      if (!tutorPrevious) tutorPrevious = { game: state.game, workspace: state.workspace, opponent: state.opponent, humanColor: state.humanColor, analysisOn: state.analysisOn, recoveryPaused: state.recoveryPaused };
      state.recoveryPaused = false;
      state.tutorMode = true; state.tutorMarks = []; state.problem = null;
      state.opponent = 'human'; state.humanColor = side;
      if (state.workspace !== 'play') setWorkspace('play');
      const g = new GE.Game({ size, rules: 'chinese', komi });
      const indices = values => (values || []).map(([x, y]) => y * size + x);
      g.root.setup = { AB: indices(setup.black), AW: indices(setup.white), AE: [] };
      g.root.props.PL = side === BLACK ? 'B' : 'W';
      state.game = g; state.mode = 'play'; state.browsing = false; state.pendingMove = null;
      renderAll();
    },
    setupPosition({ size = game().size, toMove: side = 'black', black = [], white = [] } = {}) {
      const color = side === 'white' || side === WHITE ? WHITE : BLACK;
      const g = new GE.Game({ size, rules: 'chinese', komi: 0 });
      const indices = values => (values || []).filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[1] >= 0 && p[0] < size && p[1] < size).map(([x, y]) => y * size + x);
      g.root.setup = { AB: indices(black), AW: indices(white), AE: [] }; g.root.props.PL = color === BLACK ? 'B' : 'W';
      state.game = g; state.tutorMarks = []; state.pendingMove = null; renderAll(); return { ok: true };
    },
    clearBoard() { return this.setupPosition({ size: game().size, toMove: 'black' }); },
    loadPuzzle(p) {
      abandonEngine(); cancelNativeAnalysis();
      state.recoveryPaused = false;
      state.tutorMode = true; state.tutorMarks = [];
      const items = window.GOT_PROBLEMS?.problems || [];
      loadProblem(p, items, items.indexOf(p));
      state.tutorMode = true;
      state.confirmMove = false;
      renderAll();
    },
    getPosition() {
      const pos = position(), groups = [], seen = new Set();
      for (let i = 0; i < pos.board.length; i++) if (pos.board[i] && !seen.has(i)) {
        const group = pos.group(i); group.stones.forEach(s => seen.add(s));
        groups.push({ color: pos.board[i] === BLACK ? 'black' : 'white', stones: group.stones.slice(), liberties: Array.from(group.libs), stoneCoordinates: group.stones.map(i => GE.coordName(game().size, i % game().size, Math.floor(i / game().size))), libertyCoordinates: Array.from(group.libs, i => GE.coordName(game().size, i % game().size, Math.floor(i / game().size))) });
      }
      return { size: game().size, board: Array.from(pos.board), toMove: pos.turn === BLACK ? 'black' : 'white', groups };
    },
    getStudyContext() {
      const node = game().current;
      return {
        boardSize: game().size, moveNumber: movesListTo(node).length,
        currentMove: node.move ? { color: node.move.color === BLACK ? 'black' : 'white', x: node.move.x, y: node.move.y, pass: !!node.move.pass } : null,
        beforeMoveAnalysis: node.parent ? tutorEvaluation(analysisCache.get(node.parent.id) || node.parent.review, node.parent) : null,
        currentAnalysis: tutorEvaluation(analysisCache.get(node.id) || node.review, node),
        review: node.review ? { loss: node.review.loss, winrateLoss: node.review.winrateLoss, grade: node.review.grade, matchRank: node.review.matchRank } : null,
        position: this.getPosition()
      };
    },
    highlight(points) { state.tutorMarks = (points || []).filter(p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < game().size && p.y < game().size); renderBoard(); return { ok: true }; },
    async showVariation(moves) {
      const preview = (moves || []).slice(0, 8).map((m, i) => ({ x: m.x, y: m.y, color: m.color === 'white' || m.color === WHITE ? WHITE : BLACK, n: i + 1 }));
      renderer.set({ preview }); renderer.requestRender();
      await new Promise(resolve => setTimeout(resolve, 1700));
      renderer.set({ preview: [] }); renderer.requestRender(); return { ok: true };
    },
    async play({ color, x, y, pass = false }) {
      const c = color === 'white' || color === WHITE ? WHITE : BLACK;
      if (c !== toMove()) return { ok: false, error: 'wrong turn' };
      if (pass) { game().pass(c); afterMove(); return { ok: true }; }
      const result = game().play(c, x, y);
      if (!result.ok) return { ok: false, error: result.reason };
      afterMove(); return { ok: true };
    },
    waitForUserMove() { return new Promise(resolve => { tutorMoveWaiter = resolve; setTimeout(() => { if (tutorMoveWaiter === resolve) { tutorMoveWaiter = null; resolve({ timeout: true }); } }, 180000); }); },
    judgeUserAnswer() {
      const move = lastTutorMove, pr = state.problem;
      if (!move) return { judged: false, reason: 'no learner move yet' };
      if (pr) { const expected = pr.p.solution[pr.progress]; return { judged: true, correct: !!expected && expected[0] === (move.color === BLACK ? 'B' : 'W') && expected[1] === move.x && expected[2] === move.y }; }
      return { judged: true, correct: !!(move.color === BLACK && move.x === 4 && move.y === 3 && !position().board[40]) };
    },
    loadTsumego(id) {
      const items = window.GOT_PROBLEMS?.problems || [], p = id ? items.find(item => item.id === id) : null;
      if (!p) return { ok: false, error: 'puzzle not found' };
      this.loadPuzzle(p); return { ok: true, id: p.id };
    },
    async analyzeKataGo({ previous = false } = {}) {
      const signal = tutorAnalysisAbort.signal;
      const owner = game(), selected = owner.current, node = previous ? selected.parent : selected;
      if (!node) return { ok: false, error: 'No previous position' };
      const spec = { ...specFor(node), seconds: 2, topN: 5 };
      const cached = analysisCache.get(node.id);
      if (cached?.kind === 'gtp' && Number.isFinite(cached.scoreLeadBlack) && cached.visits > 0) return { ok: true, ...tutorEvaluation(cached, node) };
      let result, engine = '';
      if (gtp.browser?.health().ok) {
        try { result = await gtp.browser.analyze(spec, { timeoutMs: 20000, signal }); engine = analysisEngineLabel(); } catch (_) { result = null; }
      }
      if (signal.aborted) return { ok: false, stale: true };
      if (!result?.ok) {
        await gtp.health(5000);
        if (signal.aborted) return { ok: false, stale: true };
        if (signal.aborted || game() !== owner || owner.current !== selected) return { ok: false, stale: true };
        if (!gtp.info) return { ok: false, error: 'KataGo is not available' };
        result = await gtp.analyze(spec, { timeoutMs: 20000, signal });
        engine = analysisEngineLabel();
      }
      if (signal.aborted || game() !== owner || owner.current !== selected) return { ok: false, stale: true };
      if (!result?.ok) return { ok: false, error: 'KataGo returned no evaluation' };
      const normalized = GtpClient.normalizeAnalysis('gtp', result, spec.toMove);
      normalized.engine = engine; normalized.rules = spec.rules;
      analysisCache.set(node.id, normalized);
      node.analysisWrBlack = normalized.wrBlack; node.analysisScoreLeadBlack = normalized.scoreLeadBlack;
      return { ok: true, ...tutorEvaluation(normalized, node) };
    },
    async evaluateTutorMove({ onProgress } = {}) {
      const stamp = this.stamp(), node = game().current;
      // Capture and analyze the parent without navigating or changing the visible board.
      onProgress?.('before');
      const before = node.parent ? await this.analyzeKataGo({ previous: true }) : null;
      if (this.stamp() !== stamp) return { ok: false, stale: true };
      onProgress?.('after');
      const after = await this.analyzeKataGo();
      if (this.stamp() !== stamp) return { ok: false, stale: true };
      const comparable = before?.ok && after?.ok && before.model === after.model && before.engine === after.engine && before.rules === after.rules;
      const sign = node.move?.color === WHITE ? -1 : 1;
      const scoreLoss = comparable && Number.isFinite(before.scoreLeadBlack) && Number.isFinite(after.scoreLeadBlack)
        ? Math.max(0, (before.scoreLeadBlack - after.scoreLeadBlack) * sign) : null;
      const winrateLoss = comparable && Number.isFinite(before.winrateBlack) && Number.isFinite(after.winrateBlack)
        ? (before.winrateBlack - after.winrateBlack) * sign * 100 : null;
      return { ok: !!after?.ok && Number.isFinite(after.scoreLeadBlack) && (!node.parent || scoreLoss !== null),
        before, after, scoreLoss, winrateLossPercentagePoints: winrateLoss,
        note: 'Approximate short-search evaluation; positive scoreLeadBlack means Black leads. Winrate is a fraction 0–1. Before candidates belong to the mover; after candidates belong to the opponent.' };
    },
    undo() { doUndo(true); },
    finishPuzzle(p) {
      const pr = state.problem; if (!pr) return;
      pr.progress = p.solution.length; pr.done = true;
      const rec = problemRecord(p); rec.solved = true; rec.bestProgress = Math.max(rec.bestProgress, pr.progress); rec.completedAt = new Date().toISOString();
      saveProblemProgress(); renderProblemBanner();
    },
    end(keepBoard = false) {
      if (tutorMoveWaiter) { tutorMoveWaiter({ cancelled: true }); tutorMoveWaiter = null; }
      state.tutorMode = false; state.tutorMarks = [];
      renderer.set({ preview: [] });
      if (keepBoard && !state.problem) { tutorPrevious = null; state.opponent = 'human'; renderAll(); return; }
      if (state.problem) { problemExit(false); tutorPrevious = null; return; }
      if (tutorPrevious) {
        state.game = tutorPrevious.game; state.opponent = tutorPrevious.opponent; state.humanColor = tutorPrevious.humanColor; state.analysisOn = tutorPrevious.analysisOn; state.recoveryPaused = tutorPrevious.recoveryPaused; state.browsing = !!state.recoveryPaused;
        const workspace = tutorPrevious.workspace; tutorPrevious = null;
        if (state.workspace !== workspace) setWorkspace(workspace);
      }
      renderAll();
    }
  };
  window.GoTTutor?.mount(window.GoTBoardTools);
  renderTutorStorage();
  document.addEventListener('got:tutor-start', e => {
    const task = e.detail?.kind === 'puzzle' ? window.GoTTutor?.startPuzzle() : e.detail?.kind === 'game' ? window.GoTTutor?.startGuidedGame() : window.GoTTutor?.startLesson();
    Promise.resolve(task).catch(error => { console.error('[GoT Tutor]', error); showToast(isZh() ? '课堂启动失败，请重试。' : 'Could not start the lesson. Please try again.'); });
  });
  document.addEventListener('got:tutor-explain', e => {
    Promise.resolve(window.GoTTutor?.explainCurrentPosition(e.detail?.source || 'analysis')).catch(error => { console.error('[GoT Tutor]', error); showToast(isZh() ? '老师暂时无法分析这个局面。' : 'The teacher could not explain this position.'); });
  });
  document.addEventListener('got:tutor-show-tab', () => {
    if (window.GoTTutor?.active) switchTab('tutor');
  });
  document.addEventListener('got:tutor-ended', () => {
    if (state.activeTab === 'tutor') switchTab(state.workspace === 'review' ? 'review' : 'analysis');
    else syncTutorLayout();
  });
  $('languageToggle').addEventListener('click', () => setLanguage(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog:modal')) {
      setMobilePanel(false);
      setRailMore(false);
      closeDialog('settingsDialog');
      closeDialog('problemDialog');
      window.GoTRecords?.close();
      return;
    }
    /* Ctrl/Cmd + 1…4：四主分区快捷键（首页 / 对弈 / 学习 / 复盘） */
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ['1', '2', '3', '4'].includes(e.key)) {
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      const navIds = ['homeWorkspaceBtn', 'playWorkspaceBtn', 'learnWorkspaceBtn', 'reviewWorkspaceBtn'];
      const navBtn = $(navIds[Number(e.key) - 1]);
      if (navBtn) navBtn.click();
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
        else if (document.body.classList.contains('board-fullscreen')) exitBoardFullscreen();
        break;
    }
  });

  /* PWA 安装：原生安装提示必须由用户点击触发；不自动弹窗打断对局。 */
  let deferredInstallPrompt = null;
  const installAppButton = $('setInstallApp');
  function isPwaInstalled() {
    return Boolean(navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);
  }
  function syncInstallAppButton() {
    if (installAppButton) installAppButton.hidden = isPwaInstalled();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallAppButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncInstallAppButton();
    showToast(t('installComplete'));
  });
  installAppButton?.addEventListener('click', async () => {
    if (isPwaInstalled()) { showToast(t('installComplete')); return; }
    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) { showToast(t('installFromBrowser')); return; }
    deferredInstallPrompt = null;
    try {
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      showToast(result?.outcome === 'accepted' ? t('installStarted') : t('installCancelled'));
    } catch (_) {
      showToast(t('installFromBrowser'));
    }
  });
  syncInstallAppButton();

  /* ================= 更新与重载 ================= */
  const UPDATE_LOG_KEY = 'got.update.diagnostics.v1';
  const noServiceWorkerThisPage = new URLSearchParams(location.search).has('nosw');
  let updateNoticeShown = false;
  function updateDiagnostics() {
    try {
      const rows = JSON.parse(sessionStorage.getItem(UPDATE_LOG_KEY) || '[]');
      return Array.isArray(rows) ? rows.filter(row => row && typeof row.event === 'string').slice(-24) : [];
    } catch (e) { return []; }
  }
  function recordUpdate(event, details = {}) {
    // Fixed lifecycle labels and navigation metadata only; never URLs, requests or settings.
    const row = { at: Date.now(), version: APP_VER || '', event };
    if (details.reason) row.reason = details.reason;
    if (details.navigation) row.navigation = details.navigation;
    if (details.discarded === true) row.discarded = true;
    try { sessionStorage.setItem(UPDATE_LOG_KEY, JSON.stringify([...updateDiagnostics(), row].slice(-24))); } catch (e) { }
  }
  window.GoTUpdateDiagnostics = () => updateDiagnostics();
  const navigation = performance.getEntriesByType?.('navigation')?.[0]?.type;
  recordUpdate('page-open', { navigation: navigation || 'unknown', discarded: document.wasDiscarded === true });
  window.addEventListener('pageshow', event => { if (event.persisted) recordUpdate('back-forward-restore'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recordUpdate('foreground');
  });
  /* Only the explicit user action below clears CacheStorage. */
  function purgeCaches() {
    if (typeof caches === 'undefined' || !caches || !caches.keys) return Promise.resolve();
    return caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => { });
  }
  function reloadFresh(msg, reason) {
    // Only user-operated controls call this function; update checks never navigate.
    // Flush the active SGF checkpoint synchronously before an explicit reload.
    window.GoTRecovery?.flush();
    saveSettings();
    recordUpdate('manual-reload', { reason });
    showToast(msg || t('newVersion'));
    const u = new URL(location.href);
    u.searchParams.set('_t', String(Date.now()));
    location.replace(u.toString());
  }
  function announceUpdate(reason) {
    recordUpdate('update-detected', { reason });
    $('setApplyUpdate').dataset.ready = 'true';
    syncVersionDisplay();
    if (updateNoticeShown) return;
    updateNoticeShown = true;
    showToast(t('updateReady'));
  }
  function checkVersionCache() {
    let seen = null;
    try { seen = localStorage.getItem('got.ver'); } catch (e) { }
    if (!APP_VER) return false;                     // 取不到版本：不做任何判断
    try { localStorage.setItem('got.ver', APP_VER); } catch (e) { }
    if (seen && seen !== APP_VER && !noServiceWorkerThisPage) announceUpdate('version-change');
  }
  /* 每次打开都是新一局：把上一会话残留的对局态与所有派生缓存清空 */
  function hardResetSession() {
    state.opponent = gtp.info ? 'gtp' : 'builtin';
    state.humanColor = BLACK;
    state.mode = 'play';
    state.workspace = 'home';
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
    analysisCache.clear(); ownershipAttemptedNode = null;
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
      const beforeKey = gtp.info ? (gtp.info.browser ? (gtp.info.browserModel || 'b6') : 'b18') : '';
      await gtp.health(4000);
      applyEngineChoice();
      updateEngineChoices();
      const afterKey = gtp.info ? (gtp.info.browser ? (gtp.info.browserModel || 'b6') : 'b18') : '';
      if (afterKey && afterKey !== beforeKey) {
        gtpDownNotified = false;
        updateEnginePill();
        showToast(t('gtpRestored'));
        applyDefaultOpponent();
        if ($('newGameDialog').open) updateNgEngineHint();
        maybeResumeEngineTurn();
      } else if (!afterKey && beforeKey) {
        updateEnginePill();
        if ($('newGameDialog').open) updateNgEngineHint();
        if (effOpponent() !== state.opponent) noteGtpFallback();
      }
      if (afterKey !== beforeKey) {
        syncWorkspaceUI();
        if (state.showOwnership && state.mode !== 'score' && !state.problem) renderBoard();
      }
    }, 20000);
  }

  /* ================= boot ================= */
  function boot() {
    // Restore only the new validated snapshot format; never load legacy got.sgf.
    /* 逃生舱：?nosw 注销全部 Service Worker 并清缓存（SW 行为异常时用一次即可） */
    try {
      if (noServiceWorkerThisPage && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          Promise.all(regs.map((r) => r.unregister())).then(() => purgeCaches());
        }).catch(() => { });
      }
    } catch (e) { /* ignore */ }
    hardResetSession();
    state.game = new GE.Game({ size: 19, rules: 'chinese' });
    const recovered = window.GoTRecovery?.restore();
    if (recovered) {
      state.game = recovered.game; state.opponent = recovered.opponent; state.humanColor = recovered.humanColor;
      // A validated recovered game opens ready to play. Browsing a branch later
      // still sets `browsing` and exposes “Play from here” as an explicit action.
      state.browsing = false; state.recoveryPaused = false; state.clock = null; state.analysisOn = false;
      state.autoplay = false; state.pendingMove = null;
    }
    checkVersionCache();
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
    syncVersionDisplay();
    resizeMainBoard();
    renderAll();
    updateEnginePill();
  /* 引擎桥接探测：立即尝试一次；若桥已启动但引擎未就绪（如 KataGo 首次调优）
   * 则每 4 秒重试，最多约 2 分钟。file:// 下桥不可达时不空转。 */
  async function tryConnectEngine() {
    const res = await gtp.health(4000);
    applyEngineChoice();
    updateEnginePill();
    updateEngineChoices();
    if (gtp.info) {
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
      syncWorkspaceUI();
      if (state.showOwnership && state.mode !== 'score' && !state.problem) renderBoard();
      return true;
    }
    return res.ok ? true : res;
  }
  (async function pollEngine() {
    const first = await tryConnectEngine();
    if (first === true) { startBridgeHeartbeat(); return; }
    const UNREACHABLE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;
    const reachable = !(first && first.error && UNREACHABLE.test(String(first.error)));
    if (!reachable && location.protocol.indexOf('http') !== 0) return;
    /* http 下连不上 = 本地服务没开（或页面只是 SW 缓存里的旧副本）。
     * 明确说一次，免得用户面对"AI 一动不动"而不知所措。
     * 用户明确选了内置 MCTS 时不打扰。 */
    if (!reachable && state.engine !== 'mcts' && location.protocol.indexOf('http') === 0) showToast(t('serverDown'));
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000));
      if ((await tryConnectEngine()) === true) { startBridgeHeartbeat(); return; }
      if (location.protocol.indexOf('http') !== 0) return; // http 下桥在线才持续重试
    }
    startBridgeHeartbeat();   // 两分钟内没起来也保持心跳，之后手动开服务可自动接管
  })();
  /* SW and version changes only announce; navigation requires a user click. */
  function registerServiceWorker() {
    if (noServiceWorkerThisPage || !('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;
    const hadController = !!navigator.serviceWorker.controller;   // 首次访问不该触发"更新重载"
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (!reg) return;
      if (hadController && reg.waiting) { announceUpdate('sw-waiting'); return; }
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && hadController && navigator.serviceWorker.controller) announceUpdate('sw-installed');
        });
      });
    }).catch(() => { });
    window.addEventListener('online', () => {
      recordUpdate('network-restored');
      navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => { });
    });
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
