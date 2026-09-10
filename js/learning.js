/* GoT 1.5 — Learn & Personalize
 *
 * 学习数据与当前棋局刻意分离：本模块只保存个人资料、偏好、课程/题目进度和
 * 用户主动收藏，不保存正在进行的棋局或引擎分析缓存。它不依赖 app.js 的闭包，
 * 通过自定义事件请求打开 SGF 或题目，便于单文件构建和离线运行。
 */
(function (root) {
  'use strict';

  const STORAGE = {
    profile: 'got.profile',
    progress: 'got.learningProgress',
    problem: 'got.problemProgress'
  };
  const SCHEMA = 1;
  const langState = { value: 'zh' };
  let mounted = false;
  let activeSection = 'home';
  let selectedLesson = null;
  let selectedLibrary = null;

  const TEXT = {
    zh: {
      eyebrow: '1.5 · 学习与个性化',
      title: '围棋学习室',
      tagline: '从教程、死活题到名局复盘，建立属于自己的围棋学习路径。',
      profile: '个人档案', edit: '编辑资料', save: '保存资料', cancel: '取消', boardSize: '练习棋盘', openSgf: '打开棋谱',
      name: '称呼', namePlaceholder: '例如：小林',
      rank: '自评段位', rankUnknown: '暂不设置',
      goal: '当前目标', goalBalanced: '全面提升', goalReading: '提高计算', goalOpening: '改善布局',
      goalEndgame: '加强官子', goalLifeDeath: '专攻死活',
      daily: '每日学习', minutes: '分钟',
      estimate: '训练估计段位', estimateUnknown: '完成更多题目后显示',
      estimateNote: '仅根据已完成死活题的难度粗略估计，不是正式等级。',
      lessonsStat: '课程', problemsStat: '死活题', gamesStat: '名局',
      completed: '已完成', continue: '继续学习', start: '开始学习',
      home: '学习首页', tutorials: '新手教程', practice: '针对训练', library: '名局库',
      export: '导出学习资料', import: '导入学习资料',
      resumeTitle: '接着上次学习', resumeEmpty: '从第一课开始认识围棋。',
      resumeLesson: '继续第 {n} 课', openLesson: '打开课程',
      pathTitle: '选择你的起点', pathIntro: '学习路径会随你的记录逐步调整，不需要一次完成全部内容。',
      pathRules: '从规则开始', pathRulesDesc: '还不熟悉气、提子和棋盘坐标。',
      pathBattle: '练习基础战斗', pathBattleDesc: '知道规则，想先练打吃、连接和分断。',
      pathReview: '直接进入复盘', pathReviewDesc: '已经下过棋，想从复盘和棋谱开始。',
      chapterFoundations: '棋盘与规则', chapterFoundationsDesc: '先建立坐标、气和提子的共同语言。',
      chapterBattle: '基础战斗', chapterBattleDesc: '把数气变成打吃、连接和分断的选择。',
      chapterLife: '活棋与终局', chapterLifeDesc: '理解眼、劫、边界和一盘棋怎样收束。',
      chapterApplication: '开始应用', chapterApplicationDesc: '把局部规则放回布局和复盘的全局里。',
      lessonNotStarted: '未开始', lessonInProgress: '学习中', lessonReady: '待检验',
      lessonReview: '重新检验', lessonAttempts: '{n} 次尝试', lessonHints: '{n} 次提示',
      courseComplete: '基础课程已完成', courseCompleteDesc: '基础规则只是起点。接下来选择一个进阶主题，带着任务对局、读题和复盘。',
      nextStep: '下一步', resumeStatus: '上次停在第 {n} 课',
      focusTitle: '今日训练建议', focusEmpty: '完成几道题后，这里会出现更有针对性的建议。',
      focusReason: '根据你的题目记录推荐', openProblem: '开始练习',
      tutorialIntro: '12 个短课，从规则到读棋。左侧选择课程，边读边在小棋盘上完成任务。',
      lessonComplete: '标记为已学', lessonCompleted: '已学完', lessonPractice: '在棋盘练习', lessonReviewBoard: '送到复盘继续',
      lessonSteps: '学习要点', lessonBack: '返回课程列表',
      practiceIntro: '先自己读棋，再看提示。系统会记录尝试、提示和完成情况。',
      practiceStats: '{done} / {total} 已完成 · {viewed} 看过正解 · {attempts} 次尝试',
      practiceEstimate: '当前训练画像', practiceEstimateEmpty: '还没有足够数据估计段位。',
      practiceWeak: '优先复习', practiceAll: '打开全部死活题',
      libraryIntro: '{n} 局完整实战：包含 AI 对局与历史名局。直接在学习页打谱或猜下一手。',
      librarySource: '资料说明', libraryOpen: '在此打谱', libraryGuess: '猜下一手',
      libraryFilter: '筛选', libraryAll: '全部棋手', libraryReadAt: '看到第 {n} 手',
      libraryImported: '可导入自己的 SGF，在学习页继续打谱。导入的棋谱只保留到关闭页面，不写入学习资料。',
      noData: '暂无内容',
      profileSaved: '个人资料已保存', bundleExported: '学习资料已导出', bundleImported: '学习资料已导入',
      importFailed: '导入失败：文件格式不正确',
      problemNo: '第 {n} 题', libraryType: '完整棋谱',
      rankConfidenceLow: '低置信度', rankConfidenceMedium: '参考范围', rankConfidenceHigh: '较稳定',
      viewed: '看过', attempts: '尝试',
      tutorialBasics: '认识棋盘', tutorialBasicsSummary: '坐标、交叉点和落子的基本规则。',
      tutorialLiberties: '气与提子', tutorialLibertiesSummary: '看懂棋子的气，学会第一种捕获。',
      tutorialAtari: '打吃与应对', tutorialAtariSummary: '识别危险，先处理最紧迫的气。',
      tutorialConnection: '连接与分断', tutorialConnectionSummary: '理解棋形，减少被切断的棋。',
      tutorialLife: '眼与活棋', tutorialLifeSummary: '从局部判断一块棋能否活下来。',
      tutorialKo: '劫与全局', tutorialKoSummary: '知道什么时候不能立即回提，以及如何找劫材。',
      tutorialTerritory: '地与终局', tutorialTerritorySummary: '分辨实地、外势和收官价值。',
      tutorialReview: '第一次复盘', tutorialReviewSummary: '用棋谱树和 AI 分析找到下一步练习。',
      stepBasics1: '棋子落在交叉点上，不是格子里面。',
      stepBasics2: '坐标从左到右、从上到下标记，边角的气更少。',
      stepLiberties1: '同色相邻棋子连成一块，共享彼此的气。',
      stepLiberties2: '把对方最后一口气堵住，就能提掉整块棋。',
      stepAtari1: '只有一口气的棋叫打吃，下一手可能被提。',
      stepAtari2: '被打吃时先找出所有合法的逃生和反击方式。',
      stepConnection1: '连接让两块棋共享气，也能保护薄弱点。',
      stepConnection2: '分断前先数气和外援，不要只看眼前一手。',
      stepLife1: '真正的眼是对方无法合法落子的内部空间。',
      stepLife2: '两只真眼通常足以让一块棋活棋。',
      stepKo1: '劫争中回提可能重复局面，规则会要求先在别处落子。',
      stepKo2: '好的劫材要让对方必须回应，不能只是随手一打。',
      stepTerritory1: '地是最终能稳定保留下来的空点与棋子。',
      stepTerritory2: '收官时比较双方能得到的目数，而不是只追求局部漂亮。',
      stepReview1: '先用自己的话说明这一手想做什么，再看 AI 的候选。',
      stepReview2: '把损失较大的局面加入训练，而不是只记住 AI 的答案。'
    },
    en: {
      eyebrow: '1.5 · Learn & Personalize',
      title: 'Go study room',
      tagline: 'Build a personal Go path from tutorials and tsumego to classic studies.',
      profile: 'Profile', edit: 'Edit profile', save: 'Save profile', cancel: 'Cancel', boardSize: 'Practice board', openSgf: 'Open SGF',
      name: 'Name', namePlaceholder: 'For example: Lin',
      rank: 'Self-assessed rank', rankUnknown: 'Not set',
      goal: 'Current goal', goalBalanced: 'Balanced growth', goalReading: 'Reading', goalOpening: 'Opening',
      goalEndgame: 'Endgame', goalLifeDeath: 'Life & death',
      daily: 'Daily study', minutes: 'min',
      estimate: 'Training estimate', estimateUnknown: 'Complete more problems to estimate',
      estimateNote: 'A rough estimate from solved tsumego, not an official rank.',
      lessonsStat: 'Lessons', problemsStat: 'Problems', gamesStat: 'Studies',
      completed: 'completed', continue: 'Continue learning', start: 'Start learning',
      home: 'Home', tutorials: 'Beginner course', practice: 'Targeted practice', library: 'Study library',
      export: 'Export learning data', import: 'Import learning data',
      resumeTitle: 'Pick up where you left off', resumeEmpty: 'Start with the first lesson.',
      resumeLesson: 'Continue lesson {n}', openLesson: 'Open lesson',
      pathTitle: 'Choose your starting point', pathIntro: 'Your path adapts to your record. You do not need to finish everything at once.',
      pathRules: 'Start with the rules', pathRulesDesc: 'New to liberties, captures, or board coordinates.',
      pathBattle: 'Practise basic fights', pathBattleDesc: 'You know the rules and want atari, connection, and cutting.',
      pathReview: 'Go straight to review', pathReviewDesc: 'You already play and want to start from games and review.',
      chapterFoundations: 'Board & rules', chapterFoundationsDesc: 'Build a shared vocabulary for coordinates, liberties, and captures.',
      chapterBattle: 'Basic fights', chapterBattleDesc: 'Turn counting liberties into choices about atari, connection, and cuts.',
      chapterLife: 'Life & finishing', chapterLifeDesc: 'Understand eyes, ko, boundaries, and how a game comes to a close.',
      chapterApplication: 'Apply the ideas', chapterApplicationDesc: 'Put local rules back into opening direction and whole-game review.',
      lessonNotStarted: 'Not started', lessonInProgress: 'In progress', lessonReady: 'Ready to check',
      lessonReview: 'Review again', lessonAttempts: '{n} attempts', lessonHints: '{n} hints',
      courseComplete: 'Beginner course complete', courseCompleteDesc: 'The rules are a starting point. Choose a training theme and apply it in games, problems and reviews.',
      nextStep: 'Next step', resumeStatus: 'Last stopped at lesson {n}',
      focusTitle: 'Today’s practice', focusEmpty: 'Complete a few problems to unlock focused suggestions.',
      focusReason: 'Recommended from your problem history', openProblem: 'Practice',
      tutorialIntro: '12 short lessons, from rules to reading. Choose a lesson and solve its board task here.',
      lessonComplete: 'Mark learned', lessonCompleted: 'Completed', lessonPractice: 'Practice on board', lessonReviewBoard: 'Continue in Review',
      lessonSteps: 'Key ideas', lessonBack: 'Back to lessons',
      practiceIntro: 'Read first, then ask for a hint. Attempts, hints, and solves are recorded.',
      practiceStats: '{done} / {total} solved · {viewed} solutions viewed · {attempts} attempts',
      practiceEstimate: 'Training profile', practiceEstimateEmpty: 'Not enough data for an estimate yet.',
      practiceWeak: 'Review next', practiceAll: 'Open all problems',
      libraryIntro: '{n} complete games: AI matches and historic classics. Replay and guess moves here.',
      librarySource: 'About the data', libraryOpen: 'Study here', libraryGuess: 'Guess next move',
      libraryFilter: 'Filter', libraryAll: 'All players', libraryReadAt: 'Viewed through move {n}',
      libraryImported: 'Import your own SGF to study here. Imported games last for this session only and are excluded from learning data.',
      noData: 'No content',
      profileSaved: 'Profile saved', bundleExported: 'Learning data exported', bundleImported: 'Learning data imported',
      importFailed: 'Import failed: invalid learning file',
      problemNo: 'Problem {n}', libraryType: 'Complete records',
      rankConfidenceLow: 'Low confidence', rankConfidenceMedium: 'Reference range', rankConfidenceHigh: 'Stable enough',
      viewed: 'viewed', attempts: 'attempts',
      tutorialBasics: 'Meet the board', tutorialBasicsSummary: 'Coordinates, intersections, and legal placement.',
      tutorialLiberties: 'Liberties & capture', tutorialLibertiesSummary: 'Read liberties and make your first capture.',
      tutorialAtari: 'Atari & replies', tutorialAtariSummary: 'Spot danger and answer the urgent threat.',
      tutorialConnection: 'Connect & cut', tutorialConnectionSummary: 'Read shape and keep stones from being cut apart.',
      tutorialLife: 'Eyes & life', tutorialLifeSummary: 'Judge whether a local group can live.',
      tutorialKo: 'Ko & the whole board', tutorialKoSummary: 'Understand ko fights and the value of ko threats.',
      tutorialTerritory: 'Territory & endgame', tutorialTerritorySummary: 'Separate secure points, influence, and endgame value.',
      tutorialReview: 'Your first review', tutorialReviewSummary: 'Use the tree and AI to choose what to practice next.',
      stepBasics1: 'Stones sit on intersections, not inside squares.',
      stepBasics2: 'Coordinates run across and down the board; corners have fewer liberties.',
      stepLiberties1: 'Adjacent stones of one color form a group and share liberties.',
      stepLiberties2: 'Fill the last liberty to capture the whole opposing group.',
      stepAtari1: 'A group with one liberty is in atari and may be captured next.',
      stepAtari2: 'When in atari, look for every legal escape and counterattack.',
      stepConnection1: 'Connection shares liberties and protects weak points.',
      stepConnection2: 'Before cutting, count liberties and outside support instead of playing by sight.',
      stepLife1: 'A true eye is an internal point the opponent cannot legally occupy.',
      stepLife2: 'Two true eyes usually make a group alive.',
      stepKo1: 'A ko fight can repeat a position, so the rules require a move elsewhere first.',
      stepKo2: 'A good ko threat forces a reply instead of being a meaningless move.',
      stepTerritory1: 'Territory is the space and stones that can remain safely at the end.',
      stepTerritory2: 'In the endgame, compare points gained globally instead of chasing local beauty.',
      stepReview1: 'Explain what you wanted before looking at the AI candidates.',
      stepReview2: 'Turn large losses into practice positions instead of memorizing one answer.'
    }
  };

  const TUTORIALS = [
    { id: 'basics', title: 'tutorialBasics', summary: 'tutorialBasicsSummary', level: '入门', levelEn: 'Start',
      steps: ['stepBasics1', 'stepBasics2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[0]PB[GoT]PW[GoT]C[认识棋盘];B[dd];W[cf];B[fd])' },
    { id: 'liberties', title: 'tutorialLiberties', summary: 'tutorialLibertiesSummary', level: '入门', levelEn: 'Start',
      steps: ['stepLiberties1', 'stepLiberties2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[0]PB[GoT]PW[GoT]C[气与提子];B[dd];W[cd];B[ed];W[dc];B[ce])' },
    { id: 'atari', title: 'tutorialAtari', summary: 'tutorialAtariSummary', level: '基础', levelEn: 'Basics',
      steps: ['stepAtari1', 'stepAtari2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[0]PB[GoT]PW[GoT]C[打吃];B[dd];W[cd];B[ed];W[de];B[ce])' },
    { id: 'connection', title: 'tutorialConnection', summary: 'tutorialConnectionSummary', level: '基础', levelEn: 'Basics',
      steps: ['stepConnection1', 'stepConnection2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[0]PB[GoT]PW[GoT]C[连接与分断];B[dd];W[fd];B[ed];W[de];B[ee])' },
    { id: 'life', title: 'tutorialLife', summary: 'tutorialLifeSummary', level: '基础', levelEn: 'Basics',
      steps: ['stepLife1', 'stepLife2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[0]PB[GoT]PW[GoT]C[眼与活棋];B[dd];W[dc];B[fd];W[cf];B[ee])' },
    { id: 'ko', title: 'tutorialKo', summary: 'tutorialKoSummary', level: '进阶', levelEn: 'Next',
      steps: ['stepKo1', 'stepKo2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[0]PB[GoT]PW[GoT]C[劫];B[dd];W[cd];B[dc];W[de];B[ce];W[cf])' },
    { id: 'territory', title: 'tutorialTerritory', summary: 'tutorialTerritorySummary', level: '基础', levelEn: 'Basics',
      steps: ['stepTerritory1', 'stepTerritory2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[6.5]PB[GoT]PW[GoT]C[地与终局];B[dd];W[cf];B[fd];W[ce];B[ee];W[de])' },
    { id: 'review', title: 'tutorialReview', summary: 'tutorialReviewSummary', level: '进阶', levelEn: 'Next',
      steps: ['stepReview1', 'stepReview2'], practiceSgf: '(;FF[4]GM[1]SZ[9]KM[6.5]PB[GoT]PW[GoT]C[第一次复盘];B[dd];W[cf];B[fd];W[ce];B[ee];W[de];B[cc];W[fg])' }
  ];

  // Verified complete records replace the old illustrative fragments.
  // The played-record collection remains external to the HTML shell.  Keep the
  // two sources as one learning catalogue so imports and progress use the same API.
  const LIBRARY = [
    ...(Array.isArray(root.GOT_STUDY_GAMES) ? root.GOT_STUDY_GAMES : []),
    ...(Array.isArray(root.GOT_FAMOUS_GAMES) ? root.GOT_FAMOUS_GAMES : [])
  ];
  if(root.GoTStudy) {
    TUTORIALS.length=0;
    root.GoTStudy.lessons.forEach(l=>{
      TEXT.zh[l.id+'Title']=l.title;TEXT.en[l.id+'Title']=l.titleEn;
      TEXT.zh[l.id+'Summary']=l.summary;TEXT.en[l.id+'Summary']=l.summaryEn;
      TUTORIALS.push({id:l.id,title:l.id+'Title',summary:l.id+'Summary',level:l.minutes+' 分钟',levelEn:l.minutes+' min',steps:[],practiceSgf:l.sgf});
    });
  }
  const COURSE_CHAPTERS = [
    { id: 'foundations', title: 'chapterFoundations', desc: 'chapterFoundationsDesc', lessons: ['basics', 'edge', 'liberties'] },
    { id: 'battle', title: 'chapterBattle', desc: 'chapterBattleDesc', lessons: ['atari', 'capture-first', 'connection', 'cut'] },
    { id: 'life', title: 'chapterLife', desc: 'chapterLifeDesc', lessons: ['life', 'ko', 'territory'] },
    { id: 'application', title: 'chapterApplication', desc: 'chapterApplicationDesc', lessons: ['opening', 'review'] }
  ];
  function chapterFor(id) { return COURSE_CHAPTERS.find((chapter) => chapter.lessons.includes(id)) || COURSE_CHAPTERS[0]; }

  function text(key, vars) {
    const table = TEXT[langState.value] || TEXT.zh;
    let value = table[key] !== undefined ? table[key] : TEXT.zh[key];
    if (value === undefined) return key;
    value = String(value);
    if (vars) Object.keys(vars).forEach((k) => { value = value.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k])); });
    return value;
  }
  function otherLanguage(item, key) {
    if (!item) return '';
    if (langState.value === 'zh') return item[key] || '';
    return item[key + 'En'] || item[key] || '';
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function storage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function readJson(key, fallback) {
    const s = storage();
    if (!s) return fallback;
    try {
      const raw = s.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(key, value) {
    const s = storage();
    if (!s) return false;
    try { s.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function emit(name, detail) {
    if (typeof document === 'undefined' || !document.dispatchEvent) return;
    try {
      const C = root.CustomEvent || (typeof CustomEvent !== 'undefined' && CustomEvent);
      document.dispatchEvent(C ? new C(name, { detail }) : { type: name, detail });
    } catch (e) { /* private mode / test stub */ }
  }
  function normalizeProfile(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const goals = ['balanced', 'reading', 'opening', 'endgame', 'lifeDeath'];
    const sizes = [9, 13, 19];
    return {
      schema: SCHEMA,
      name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '',
      rank: typeof raw.rank === 'string' ? raw.rank.slice(0, 16) : '',
      goal: goals.includes(raw.goal) ? raw.goal : 'balanced',
      dailyMinutes: [10, 15, 20, 30, 45, 60].includes(Number(raw.dailyMinutes)) ? Number(raw.dailyMinutes) : 15,
      preferredSize: sizes.includes(Number(raw.preferredSize)) ? Number(raw.preferredSize) : 19,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
    };
  }
  function normalizeProgress(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const lessons = {};
    const library = {};
    if (raw.lessons && typeof raw.lessons === 'object') Object.keys(raw.lessons).slice(0, 200).forEach((id) => {
      const v = raw.lessons[id];
      if (!v || typeof v !== 'object') return;
      lessons[id] = {
        completed: v.completed === true,
        started: v.started === true,
        solved: v.solved === true,
        assisted: v.assisted === true,
        attempts: Number.isFinite(Number(v.attempts)) ? Math.max(0, Math.floor(Number(v.attempts))) : 0,
        hints: Number.isFinite(Number(v.hints)) ? Math.max(0, Math.floor(Number(v.hints))) : 0,
        completedAt: typeof v.completedAt === 'string' ? v.completedAt : '',
        lastTouchedAt: typeof v.lastTouchedAt === 'string' ? v.lastTouchedAt : '',
        lastStep: Number.isFinite(v.lastStep) ? Math.max(0, Math.floor(v.lastStep)) : 0
      };
    });
    if (raw.library && typeof raw.library === 'object') Object.keys(raw.library).slice(0, 200).forEach((id) => {
      const v = raw.library[id];
      if (!v || typeof v !== 'object') return;
      library[id] = {
        started: v.started === true,
        bookmarked: v.bookmarked === true,
        finished: v.finished === true,
        lastMove: Number.isFinite(Number(v.lastMove)) ? Math.max(0, Math.floor(Number(v.lastMove))) : 0,
        startedAt: typeof v.startedAt === 'string' ? v.startedAt : '',
        lastViewedAt: typeof v.lastViewedAt === 'string' ? v.lastViewedAt : ''
      };
    });
    return {
      schema: SCHEMA, lessons, library,
      lastView: ['home', 'tutorials', 'practice', 'library', 'growth'].includes(raw.lastView) ? raw.lastView : 'home',
      lastLesson: typeof raw.lastLesson === 'string' ? raw.lastLesson : '',
      lastProblem: typeof raw.lastProblem === 'string' ? raw.lastProblem : '',
      lastLibrary: typeof raw.lastLibrary === 'string' ? raw.lastLibrary : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
    };
  }
  function getProfile() { return normalizeProfile(readJson(STORAGE.profile, null)); }
  function saveProfile(raw) {
    const next = normalizeProfile(Object.assign({}, getProfile(), raw || {}, { updatedAt: new Date().toISOString() }));
    writeJson(STORAGE.profile, next);
    emit('got:learning-change', { kind: 'profile' });
    return next;
  }
  function getProgress() { return normalizeProgress(readJson(STORAGE.progress, null)); }
  function saveProgress(raw, emitChange = true) {
    const next = normalizeProgress(Object.assign({}, getProgress(), raw || {}, { updatedAt: new Date().toISOString() }));
    writeJson(STORAGE.progress, next);
    if (emitChange) emit('got:learning-change', { kind: 'progress' });
    return next;
  }
  function getProblemProgress() {
    const raw = readJson(STORAGE.problem, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw;
  }
  function problemData() {
    return root.GOT_PROBLEMS && Array.isArray(root.GOT_PROBLEMS.problems) ? root.GOT_PROBLEMS : { problems: [], sets: [] };
  }
  function rankLabel(rankNum) {
    const sample = problemData().problems.find((p) => Number(p.rankNum) === Number(rankNum));
    if (sample) return langState.value === 'zh' ? (sample.rank || '') : (sample.rankEn || sample.rank || '');
    const fallback = { 9: ['9级', '9 kyu'], 10: ['8级', '8 kyu'], 11: ['7级', '7 kyu'], 12: ['6级', '6 kyu'], 13: ['5级', '5 kyu'], 14: ['4级', '4 kyu'], 15: ['3级', '3 kyu'], 16: ['2级', '2 kyu'], 17: ['1级', '1 kyu'], 18: ['1段', '1 dan'], 19: ['2段', '2 dan'], 20: ['3段', '3 dan'], 21: ['4段', '4 dan'] }[rankNum];
    return fallback ? fallback[langState.value === 'zh' ? 0 : 1] : '—';
  }
  function rankEstimate() {
    const data = problemData();
    const records = getProblemProgress();
    const solved = data.problems.filter((p) => records[p.id] && records[p.id].solved && Number.isFinite(Number(p.rankNum)));
    if (solved.length < 3) return { rankNum: null, label: text('estimateUnknown'), confidence: 'low', solved: solved.length };
    const avg = solved.reduce((sum, p) => sum + Number(p.rankNum), 0) / solved.length;
    const rankNum = Math.max(9, Math.min(21, Math.round(avg)));
    const confidence = solved.length >= 12 ? 'high' : solved.length >= 6 ? 'medium' : 'low';
    return { rankNum, label: rankLabel(rankNum), confidence, solved: solved.length };
  }
  function problemStats() {
    const data = problemData();
    const records = getProblemProgress();
    let done = 0, viewed = 0, attempts = 0;
    data.problems.forEach((p) => {
      const r = records[p.id];
      if (!r) return;
      if (r.solved) done++;
      else if (r.viewed) viewed++;
      attempts += Number.isFinite(Number(r.attempts)) ? Number(r.attempts) : 0;
    });
    return { total: data.problems.length, done, viewed, attempts };
  }
  function recommendedProblems(limit) {
    const data = problemData();
    const records = getProblemProgress();
    const estimate = rankEstimate();
    const target = estimate.rankNum || 12;
    return data.problems.filter((p) => !(records[p.id] && records[p.id].solved)).sort((a, b) => {
      const ra = records[a.id] || {}, rb = records[b.id] || {};
      const aWeak = ra.attempts > 0 ? 0 : ra.viewed ? 2 : 1;
      const bWeak = rb.attempts > 0 ? 0 : rb.viewed ? 2 : 1;
      if (aWeak !== bWeak) return aWeak - bWeak;
      const da = Math.abs(Number(a.rankNum || 12) - target), db = Math.abs(Number(b.rankNum || 12) - target);
      if (da !== db) return da - db;
      return Number(a.no || 0) - Number(b.no || 0);
    }).slice(0, limit || 4);
  }
  function lessonProgress() {
    const p = getProgress();
    const completed = TUTORIALS.filter((l) => p.lessons[l.id] && p.lessons[l.id].completed).length;
    return { total: TUTORIALS.length, completed };
  }
  function lessonRecord(id) { return getProgress().lessons[id] || {}; }
  function libraryRecord(id) { return getProgress().library[id] || {}; }
  function markLesson(id, complete, lastStep) {
    const p = getProgress();
    const old = p.lessons[id] || {};
    p.lessons[id] = {
      completed: complete === true || old.completed === true,
      started: true,
      solved: old.solved === true || complete === true,
      assisted: old.assisted === true,
      attempts: Math.max(0, Number(old.attempts) || 0),
      hints: Math.max(0, Number(old.hints) || 0),
      completedAt: complete === true ? (old.completedAt || new Date().toISOString()) : (old.completedAt || ''),
      lastTouchedAt: new Date().toISOString(),
      lastStep: Number.isFinite(Number(lastStep)) ? Math.max(0, Math.floor(Number(lastStep))) : (old.lastStep || 0)
    };
    p.lastLesson = id;
    saveProgress(p);
    return p.lessons[id];
  }
  function markLibrary(id) {
    const p = getProgress();
    p.library[id] = Object.assign({}, p.library[id] || {}, { started: true, startedAt: (p.library[id] && p.library[id].startedAt) || new Date().toISOString() });
    p.lastLibrary = id;
    saveProgress(p);
  }
  function recordLessonEvent(detail) {
    if (!detail || !detail.lessonId || !TUTORIALS.some((lesson) => lesson.id === detail.lessonId)) return;
    const p = getProgress();
    const old = p.lessons[detail.lessonId] || {};
    const now = new Date().toISOString();
    const next = Object.assign({}, old, { started: true, lastTouchedAt: now });
    if (detail.type === 'attempt') next.attempts = Math.max(Number(old.attempts) || 0, Number(detail.attempts) || 0);
    if (detail.type === 'hint') next.hints = Math.max(Number(old.hints) || 0, Number(old.hints || 0) + 1);
    if (detail.type === 'solve') { next.solved = true; next.assisted = detail.assisted === true; }
    p.lessons[detail.lessonId] = next;
    p.lastLesson = detail.lessonId;
    saveProgress(p, false);
  }
  function recordLibraryEvent(detail) {
    if (!detail || !detail.libraryId || !LIBRARY.some((item) => item.id === detail.libraryId)) return;
    const p = getProgress();
    const old = p.library[detail.libraryId] || {};
    const index = Number.isFinite(Number(detail.index)) ? Math.max(0, Math.floor(Number(detail.index))) : (Number(old.lastMove) || 0);
    p.library[detail.libraryId] = Object.assign({}, old, { started: true, lastMove: index, finished: detail.type === 'finished' || old.finished === true, lastViewedAt: new Date().toISOString() });
    p.lastLibrary = detail.libraryId;
    saveProgress(p, false);
  }
  function markProblem(id) {
    const p = getProgress();
    p.lastProblem = String(id || '');
    p.lastView = 'practice';
    saveProgress(p);
  }
  function bundle() {
    return {
      format: 'GoT learning bundle', version: SCHEMA, exportedAt: new Date().toISOString(),
      profile: getProfile(), progress: getProgress(), problemProgress: getProblemProgress(), growth:root.GoTGrowth?.read()
    };
  }
  function exportBundle() { return JSON.stringify(bundle(), null, 2); }
  function mergeProblemRecord(a, b) {
    a = a && typeof a === 'object' ? a : {};
    b = b && typeof b === 'object' ? b : {};
    return {
      solved: a.solved === true || b.solved === true,
      viewed: a.viewed === true || b.viewed === true,
      assisted: a.assisted === true || b.assisted === true,
      attempts: Math.max(Number(a.attempts) || 0, Number(b.attempts) || 0),
      hints: Math.max(Number(a.hints) || 0, Number(b.hints) || 0),
      bestProgress: Math.max(Number(a.bestProgress) || 0, Number(b.bestProgress) || 0),
      mode: b.mode || a.mode || '',
      completedAt: (a.completedAt && b.completedAt) ? (a.completedAt > b.completedAt ? a.completedAt : b.completedAt) : (b.completedAt || a.completedAt || '')
    };
  }
  function mergeLessonRecord(a, b) {
    a = a && typeof a === 'object' ? a : {};
    b = b && typeof b === 'object' ? b : {};
    return {
      completed: a.completed === true || b.completed === true,
      started: a.started === true || b.started === true,
      solved: a.solved === true || b.solved === true,
      assisted: a.assisted === true || b.assisted === true,
      attempts: Math.max(Number(a.attempts) || 0, Number(b.attempts) || 0),
      hints: Math.max(Number(a.hints) || 0, Number(b.hints) || 0),
      completedAt: (a.completedAt && b.completedAt) ? (a.completedAt > b.completedAt ? a.completedAt : b.completedAt) : (b.completedAt || a.completedAt || ''),
      lastTouchedAt: (a.lastTouchedAt && b.lastTouchedAt) ? (a.lastTouchedAt > b.lastTouchedAt ? a.lastTouchedAt : b.lastTouchedAt) : (b.lastTouchedAt || a.lastTouchedAt || ''),
      lastStep: Math.max(Number(a.lastStep) || 0, Number(b.lastStep) || 0)
    };
  }
  function mergeLibraryRecord(a, b) {
    a = a && typeof a === 'object' ? a : {};
    b = b && typeof b === 'object' ? b : {};
    return {
      started: a.started === true || b.started === true,
      bookmarked: a.bookmarked === true || b.bookmarked === true,
      finished: a.finished === true || b.finished === true,
      lastMove: Math.max(Number(a.lastMove) || 0, Number(b.lastMove) || 0),
      startedAt: a.startedAt || b.startedAt || '',
      lastViewedAt: (a.lastViewedAt && b.lastViewedAt) ? (a.lastViewedAt > b.lastViewedAt ? a.lastViewedAt : b.lastViewedAt) : (b.lastViewedAt || a.lastViewedAt || '')
    };
  }
  function importBundle(input) {
    let data;
    try { data = typeof input === 'string' ? JSON.parse(input) : input; } catch (e) { return { ok: false, error: 'format' }; }
    if (!data || typeof data !== 'object' || (data.format && data.format !== 'GoT learning bundle') || !data.profile || !data.progress) return { ok: false, error: 'format' };
    saveProfile(data.profile);
    const current = getProgress();
    const incoming = normalizeProgress(data.progress);
    const lessons = Object.assign({}, current.lessons);
    Object.keys(incoming.lessons).forEach((id) => { lessons[id] = mergeLessonRecord(lessons[id], incoming.lessons[id]); });
    const library = Object.assign({}, current.library);
    Object.keys(incoming.library).forEach((id) => { library[id] = mergeLibraryRecord(library[id], incoming.library[id]); });
    saveProgress(Object.assign({}, current, incoming, { lessons, library }));
    if (data.problemProgress && typeof data.problemProgress === 'object' && !Array.isArray(data.problemProgress)) {
      const existing = getProblemProgress();
      const merged = Object.assign({}, existing);
      Object.keys(data.problemProgress).slice(0, 5000).forEach((id) => { merged[id] = mergeProblemRecord(existing[id], data.problemProgress[id]); });
      writeJson(STORAGE.problem, merged);
    }
    root.GoTGrowth?.merge(data.growth);
    emit('got:learning-change', { kind: 'import' });
    return { ok: true };
  }
  function downloadBundle() {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || !root.URL || !root.URL.createObjectURL) return false;
    const a = document.createElement('a');
    const url = root.URL.createObjectURL(new Blob([exportBundle()], { type: 'application/json' }));
    a.href = url; a.download = 'got-learning-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => { try { root.URL.revokeObjectURL(url); } catch (e) { } }, 2000);
    emit('got:learning-change', { kind: 'export' });
    return true;
  }
  function triggerImport() {
    if (typeof document === 'undefined') return;
    let input = document.getElementById('learningImportInput');
    if (!input) {
      input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.id = 'learningImportInput'; input.hidden = true; document.body.appendChild(input);
      input.addEventListener('change', () => {
        const file = input.files && input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { const result = importBundle(String(reader.result || '')); emit('got:learning-import-result', result); if (result.ok) notify(text('bundleImported')); else notify(text('importFailed')); input.value = ''; };
        reader.readAsText(file);
      });
    }
    input.click();
  }
  function notify(message) {
    const toast = typeof document !== 'undefined' && document.getElementById ? document.getElementById('toast') : null;
    if (toast) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
  }
  function goalOptions(profile) {
    return [['balanced', 'goalBalanced'], ['reading', 'goalReading'], ['opening', 'goalOpening'], ['endgame', 'goalEndgame'], ['lifeDeath', 'goalLifeDeath']]
      .map(([value, key]) => '<option value="' + value + '"' + (profile.goal === value ? ' selected' : '') + '>' + esc(text(key)) + '</option>').join('');
  }
  function rankOptions(profile) {
    const ranks = [];
    problemData().problems.forEach((p) => { if (!ranks.some((r) => r.value === String(p.rankNum))) ranks.push({ value: String(p.rankNum), label: rankLabel(Number(p.rankNum)) }); });
    ranks.sort((a, b) => Number(a.value) - Number(b.value));
    return '<option value="">' + esc(text('rankUnknown')) + '</option>' + ranks.map((r) => '<option value="' + esc(r.value) + '"' + (profile.rank === r.value ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('');
  }
  function confidenceLabel(confidence) {
    return confidence === 'high' ? text('rankConfidenceHigh') : confidence === 'medium' ? text('rankConfidenceMedium') : text('rankConfidenceLow');
  }
  function profileCard(profile, estimate) {
    const display = profile.name || (langState.value === 'zh' ? '围棋学习者' : 'Go learner');
    const rank = profile.rank ? rankLabel(Number(profile.rank)) : text('rankUnknown');
    return '<section class="learning-profile learning-card" aria-labelledby="learningProfileTitle">' +
      '<div class="learning-profile-head"><span class="learning-avatar" aria-hidden="true">' + esc(display.slice(0, 1).toUpperCase()) + '</span><div><h2 id="learningProfileTitle">' + esc(display) + '</h2><p>' + esc(rank) + ' · ' + esc(text('daily')) + ' ' + esc(profile.dailyMinutes) + ' ' + esc(text('minutes')) + '</p></div><button class="tool-button" type="button" data-learning-action="toggle-profile">' + esc(text('edit')) + '</button></div>' +
      '<div class="learning-profile-stats"><div><b>' + lessonProgress().completed + '</b><span>' + esc(text('lessonsStat')) + '</span></div><div><b>' + problemStats().done + '</b><span>' + esc(text('problemsStat')) + '</span></div><div><b>' + Object.keys(getProgress().library).length + '</b><span>' + esc(text('gamesStat')) + '</span></div><div><b>' + esc(estimate.label) + '</b><span>' + esc(text('estimate')) + '</span></div></div>' +
      '<form class="learning-profile-form" data-learning-profile-form hidden><label><span>' + esc(text('name')) + '</span><input name="name" maxlength="40" placeholder="' + esc(text('namePlaceholder')) + '" value="' + esc(profile.name) + '"></label><label><span>' + esc(text('rank')) + '</span><select name="rank">' + rankOptions(profile) + '</select></label><label><span>' + esc(text('goal')) + '</span><select name="goal">' + goalOptions(profile) + '</select></label><label><span>' + esc(text('daily')) + '</span><select name="dailyMinutes">' + [10, 15, 20, 30, 45, 60].map((n) => '<option value="' + n + '"' + (profile.dailyMinutes === n ? ' selected' : '') + '>' + n + ' ' + esc(text('minutes')) + '</option>').join('') + '</select></label><label><span>' + esc(text('boardSize')) + '</span><select name="preferredSize"><option value="9"' + (profile.preferredSize === 9 ? ' selected' : '') + '>9×9</option><option value="13"' + (profile.preferredSize === 13 ? ' selected' : '') + '>13×13</option><option value="19"' + (profile.preferredSize === 19 ? ' selected' : '') + '>19×19</option></select></label><div class="learning-form-actions"><button class="btn ghost" type="button" data-learning-action="toggle-profile">' + esc(text('cancel')) + '</button><button class="btn primary" type="button" data-learning-action="save-profile">' + esc(text('save')) + '</button></div></form>' +
      '<p class="learning-profile-note">' + esc(text('estimateNote')) + '</p></section>';
  }
  function lessonState(lesson, progress) {
    const rec = progress.lessons[lesson.id] || {};
    if (rec.completed) return { key: 'lessonCompleted', label: text('lessonCompleted'), cls: 'is-complete', mark: '✓' };
    if (rec.solved) return { key: 'lessonReady', label: text('lessonReady'), cls: 'is-ready', mark: '○' };
    if (rec.started) return { key: 'lessonInProgress', label: text('lessonInProgress'), cls: 'is-started', mark: '·' };
    return { key: 'lessonNotStarted', label: text('lessonNotStarted'), cls: '', mark: '·' };
  }
  function lessonCard(lesson, progress) {
    const state = lessonState(lesson, progress);
    const current = selectedLesson === lesson.id;
    const index = TUTORIALS.indexOf(lesson) + 1;
    return '<button class="learning-lesson-card ' + state.cls + (current ? ' is-current' : '') + '" type="button" data-learning-action="open-lesson" data-id="' + esc(lesson.id) + '" aria-label="' + esc(text(lesson.title) + ' · ' + state.label) + '"><span class="learning-lesson-index">' + index + '</span><span class="learning-lesson-copy"><strong>' + esc(text(lesson.title)) + '</strong><small>' + esc(text(lesson.summary)) + '</small></span><span class="learning-lesson-state"><b>' + state.mark + '</b><small>' + esc(state.label) + '</small></span></button>';
  }
  function renderChapter(chapter, progress) {
    const lessons = chapter.lessons.map((id) => TUTORIALS.find((lesson) => lesson.id === id)).filter(Boolean);
    const done = lessons.filter((lesson) => progress.lessons[lesson.id] && progress.lessons[lesson.id].completed).length;
    return '<section class="learning-chapter" aria-labelledby="chapter-' + esc(chapter.id) + '"><div class="learning-chapter-head"><div><h3 id="chapter-' + esc(chapter.id) + '">' + esc(text(chapter.title)) + '</h3><p>' + esc(text(chapter.desc)) + '</p></div><span>' + done + ' / ' + lessons.length + '</span></div><div class="learning-lesson-list">' + lessons.map((lesson) => lessonCard(lesson, progress)).join('') + '</div></section>';
  }
  function renderLessonDetail(lesson, progress) {
    const rec = progress.lessons[lesson.id] || {};
    const state = lessonState(lesson, progress);
    const record = (rec.attempts || rec.hints) ? '<span>' + esc(text('lessonAttempts', { n: rec.attempts || 0 })) + '</span><span>' + esc(text('lessonHints', { n: rec.hints || 0 })) + '</span>' : '<span>' + esc(text('lessonNotStarted')) + '</span>';
    if(root.GoTStudy) return '<article class="learning-detail learning-card"><div class="learning-detail-top"><button type="button" class="text-button" data-learning-action="back-lessons">'+esc(text('lessonBack'))+'</button><span class="learning-detail-state ' + state.cls + '">' + esc(state.label) + ' · ' + esc(langState.value==='zh'?lesson.level:lesson.levelEn) + '</span></div><h2>'+esc(text(lesson.title))+'</h2><div class="learning-detail-meta">' + record + '</div>'+root.GoTStudy.lessonHtml(lesson.id)+'<div class="learning-detail-actions"><button class="btn ghost" type="button" data-learning-action="practice-lesson" data-id="'+esc(lesson.id)+'">'+esc(text('lessonReviewBoard'))+'</button><button type="button" class="btn primary" data-learning-action="complete-lesson" data-id="'+esc(lesson.id)+'">'+esc(text(rec.completed?'lessonCompleted':'lessonComplete'))+'</button></div></article>';
    return '<article class="learning-detail learning-card"><div class="learning-detail-top"><button class="text-button" type="button" data-learning-action="back-lessons">← ' + esc(text('lessonBack')) + '</button><span class="learning-kicker">' + esc(langState.value === 'zh' ? lesson.level : lesson.levelEn) + '</span></div><h2>' + esc(text(lesson.title)) + '</h2><p class="learning-lead">' + esc(text(lesson.summary)) + '</p><h3>' + esc(text('lessonSteps')) + '</h3><ol class="learning-steps">' + lesson.steps.map((key, i) => '<li><span>' + (i + 1) + '</span><p>' + esc(text(key)) + '</p></li>').join('') + '</ol><div class="learning-detail-actions"><button class="btn ghost" type="button" data-learning-action="practice-lesson" data-id="' + esc(lesson.id) + '">' + esc(text('lessonPractice')) + '</button><button class="btn primary" type="button" data-learning-action="complete-lesson" data-id="' + esc(lesson.id) + '">' + (rec.completed ? '✓ ' + esc(text('lessonCompleted')) : esc(text('lessonComplete'))) + '</button></div></article>';
  }
  function renderHome(progress, stats, estimate) {
    const next = TUTORIALS.find(l=>l.id===progress.lastLesson && !(progress.lessons[l.id]&&progress.lessons[l.id].completed)) || TUTORIALS.find((l) => !(progress.lessons[l.id] && progress.lessons[l.id].completed));
    const recs = recommendedProblems(3);
    const firstVisit = !progress.lastLesson && Object.keys(progress.lessons).length === 0;
    const resume = next ? '<p>' + esc(text(next.summary)) + '</p><p class="learning-resume-status">' + esc(text('resumeStatus', { n: TUTORIALS.indexOf(next) + 1 })) + '</p><button class="btn primary" type="button" data-learning-action="open-lesson" data-id="' + esc(next.id) + '">' + esc(text('resumeLesson', { n: TUTORIALS.indexOf(next) + 1 })) + '</button>' : '<p>' + esc(text('courseCompleteDesc')) + '</p><button class="btn primary" type="button" data-learning-action="switch-tab" data-tab="growth">' + esc(text('nextStep')) + '</button>';
    const onboarding = firstVisit ? '<section class="learning-onboarding learning-card"><div><h2>' + esc(text('pathTitle')) + '</h2><p>' + esc(text('pathIntro')) + '</p></div><div class="learning-path-options"><button type="button" data-learning-action="start-path" data-id="basics"><strong>' + esc(text('pathRules')) + '</strong><small>' + esc(text('pathRulesDesc')) + '</small></button><button type="button" data-learning-action="start-path" data-id="atari"><strong>' + esc(text('pathBattle')) + '</strong><small>' + esc(text('pathBattleDesc')) + '</small></button><button type="button" data-learning-action="start-path" data-id="review"><strong>' + esc(text('pathReview')) + '</strong><small>' + esc(text('pathReviewDesc')) + '</small></button></div></section>' : '';
    return onboarding + '<div class="learning-home-grid"><section class="learning-card learning-resume"><div class="learning-card-heading"><div><span class="learning-kicker">' + esc(text('continue')) + '</span><h2>' + esc(text('resumeTitle')) + '</h2></div><span class="learning-ring">' + lessonProgress().completed + '/' + lessonProgress().total + '</span></div>' + resume + '</section><section class="learning-card learning-focus"><div class="learning-card-heading"><div><span class="learning-kicker">' + esc(text('practice')) + '</span><h2>' + esc(text('focusTitle')) + '</h2></div><span class="learning-stat-badge">' + stats.done + '/' + stats.total + '</span></div>' + (recs.length ? '<p>' + esc(text('focusReason')) + '</p><div class="learning-mini-list">' + recs.map((p) => '<button type="button" data-learning-action="open-problem" data-id="' + esc(p.id) + '"><span>' + esc(text('problemNo', { n: p.no })) + '</span><b>' + esc(langState.value === 'zh' ? p.rank : p.rankEn) + '</b><i>→</i></button>').join('') + '</div>' : '<p>' + esc(text('focusEmpty')) + '</p>') + '</section><section class="learning-card learning-quick"><div class="learning-card-heading"><div><span class="learning-kicker">' + esc(text('library')) + '</span><h2>' + esc(text('libraryType')) + '</h2></div><span class="learning-stat-badge">' + LIBRARY.length + '</span></div><p>' + esc(text('libraryIntro', { n: LIBRARY.length })) + '</p><button class="btn ghost" type="button" data-learning-action="switch-tab" data-tab="library">' + esc(text('openLesson')) + '</button></section></div>';
  }
  function renderTutorials(progress) {
    if(!selectedLesson || !TUTORIALS.some((lesson) => lesson.id === selectedLesson)) selectedLesson = (progress.lastLesson && TUTORIALS.some((lesson) => lesson.id === progress.lastLesson)) ? progress.lastLesson : TUTORIALS[0].id;
    const detail = selectedLesson ? renderLessonDetail(TUTORIALS.find((l) => l.id === selectedLesson) || TUTORIALS[0], progress) : '<section class="learning-card learning-detail-placeholder"><span class="learning-placeholder-icon">◎</span><h2>' + esc(text('tutorials')) + '</h2><p>' + esc(text('tutorialIntro')) + '</p></section>';
    const chapterList = '<div class="learning-chapter-list">' + COURSE_CHAPTERS.map((chapter) => renderChapter(chapter, progress)).join('') + '</div>';
    return '<div class="learning-section-heading"><div><span class="learning-kicker">' + esc(text('tutorials')) + '</span><h2>' + esc(text('tutorialIntro')) + '</h2></div><span class="learning-progress-label">' + lessonProgress().completed + ' / ' + lessonProgress().total + ' ' + esc(text('completed')) + '</span></div><div class="learning-tutorial-layout"><div>' + chapterList + '</div>' + detail + '</div>';
  }
  function renderPractice() {
    const stats = problemStats();
    const estimate = rankEstimate();
    const recs = recommendedProblems(8);
    return '<div class="learning-section-heading"><div><span class="learning-kicker">' + esc(text('practice')) + '</span><h2>' + esc(text('practiceIntro')) + '</h2></div><button class="btn ghost" type="button" data-learning-action="open-problem-dialog">' + esc(text('practiceAll')) + '</button></div><section class="learning-card learning-practice-summary"><div><strong>' + stats.done + '/' + stats.total + '</strong><span>' + esc(text('problemsStat')) + ' ' + esc(text('completed')) + '</span></div><div><strong>' + stats.attempts + '</strong><span>' + esc(text('attempts')) + '</span></div><div><strong>' + esc(estimate.label) + '</strong><span>' + esc(text('practiceEstimate')) + '</span></div></section><div class="learning-section-heading compact"><div><span class="learning-kicker">' + esc(text('practiceWeak')) + '</span><h2>' + esc(text('focusTitle')) + '</h2></div></div><div class="learning-practice-grid">' + (recs.length ? recs.map((p) => { const r = getProblemProgress()[p.id] || {}; return '<article class="learning-practice-card learning-card"><div class="learning-practice-card-head"><span>' + esc(text('problemNo', { n: p.no })) + '</span><b>' + esc(langState.value === 'zh' ? p.rank : p.rankEn) + '</b></div><p>' + esc((r.attempts ? text('attempts') + ' ' + r.attempts : text('start')) + ' · ' + p.moves + ' ' + (langState.value === 'zh' ? '手' : 'moves')) + '</p><button class="btn primary" type="button" data-learning-action="open-problem" data-id="' + esc(p.id) + '">' + esc(text('openProblem')) + '</button></article>'; }).join('') : '<section class="learning-card learning-empty-card"><p>' + esc(text('focusEmpty')) + '</p></section>') + '</div>';
  }
  function libraryFilterTags() {
    const tags = [];
    LIBRARY.forEach((item) => (langState.value === 'zh' ? item.tags : item.tagsEn || item.tags || []).forEach((tag) => { if (tag && !/完整|complete|导入|imported/i.test(tag) && !tags.includes(tag)) tags.push(tag); }));
    return tags.sort((a, b) => a.localeCompare(b));
  }
  function renderLibrary(progress) {
    const selected=LIBRARY.find(x=>x.id===selectedLibrary);
    if(selected&&root.GoTStudy) return '<button class="btn ghost" type="button" data-learning-action="library-back">'+(langState.value==='zh'?'返回棋谱目录':'Back to library')+'</button>'+root.GoTStudy.libraryHtml(selected);
    const filters = '<div class="study-library-filters"><label class="study-search"><span>' + esc(text('libraryFilter')) + '</span><input type="search" data-library-search placeholder="' + esc(langState.value==='zh'?'棋手、日期或局数':'Player, date or game') + '"></label><label class="study-filter-select"><span>' + esc(text('libraryFilter')) + '</span><select data-library-filter><option value="">' + esc(text('libraryAll')) + '</option>' + libraryFilterTags().map((tag) => '<option value="' + esc(tag.toLowerCase()) + '">' + esc(tag) + '</option>').join('') + '</select></label></div>';
    return '<div class="learning-section-heading"><div><span class="learning-kicker">' + esc(text('library')) + '</span><h2>' + esc(text('libraryIntro', { n: LIBRARY.length })) + '</h2></div><button class="btn ghost" type="button" data-learning-action="open-sgf-file">' + esc(text('openSgf')) + '</button></div>' + filters + '<div class="learning-library-grid">' + LIBRARY.map((item) => { const rec = progress.library[item.id] || {}; const tags = langState.value === 'zh' ? (item.tags || []) : (item.tagsEn || item.tags || []); const read = rec.lastMove ? '<span class="learning-library-progress">' + esc(text('libraryReadAt', { n: rec.lastMove })) + '</span>' : ''; const collection = langState.value === 'zh' ? (item.collection || text('libraryType')) : (item.collectionEn || item.collection || text('libraryType')); return '<article class="learning-library-card learning-card' + (rec.started ? ' is-started' : '') + '" data-library-text="' + esc((otherLanguage(item, 'title') + ' ' + otherLanguage(item, 'meta') + ' ' + tags.join(' ')).toLowerCase()) + '"><div class="learning-library-top"><span class="learning-library-mark">' + (rec.finished ? '✓' : rec.started ? '·' : '◇') + '</span><span class="learning-kicker">' + esc(collection) + '</span></div><h2>' + esc(otherLanguage(item, 'title')) + '</h2><p class="learning-library-meta">' + esc(otherLanguage(item, 'meta')) + '</p>' + read + '<div class="learning-tag-row">' + tags.map((tag) => '<span>' + esc(tag) + '</span>').join('') + '</div><p>' + esc(otherLanguage(item, 'source')) + '</p><div class="learning-card-actions"><button class="btn ghost" type="button" data-learning-action="open-library" data-id="' + esc(item.id) + '">' + esc(text('libraryOpen')) + '</button><button class="btn primary" type="button" data-learning-action="guess-library" data-id="' + esc(item.id) + '">' + esc(text('libraryGuess')) + '</button></div></article>'; }).join('') + '</div><p class="learning-library-note">' + esc(text('libraryImported')) + '</p>';
  }
  function render() {
    const container = typeof document !== 'undefined' ? document.getElementById('learningWorkspace') : null;
    if (!container) return;
    const profile = getProfile();
    const progress = getProgress();
    const stats = problemStats();
    const estimate = rankEstimate();
    if (!['home', 'tutorials', 'practice', 'library', 'growth'].includes(activeSection)) activeSection = progress.lastView || 'home';
    const body = activeSection === 'tutorials' ? renderTutorials(progress) : activeSection === 'practice' ? renderPractice() : activeSection === 'library' ? renderLibrary(progress) : renderHome(progress, stats, estimate);
    if(root.GoTStudy) root.GoTStudy.close();
    container.innerHTML = '<div class="learning-shell"><div class="learning-hero"><div><span class="learning-eyebrow">' + esc(text('eyebrow')) + '</span><h1>' + esc(text('title')) + '</h1><p>' + esc(text('tagline')) + '</p></div><div class="learning-hero-actions"><button class="btn ghost" type="button" data-learning-action="export">' + esc(text('export')) + '</button><button class="btn ghost" type="button" data-learning-action="import">' + esc(text('import')) + '</button></div></div>' + profileCard(profile, estimate) + '<nav class="learning-tabs" role="tablist" aria-label="' + esc(text('home')) + '">' + [['home', 'home'], ['tutorials', 'tutorials'], ['practice', 'practice'], ['library', 'library']].map(([id, key]) => '<button type="button" role="tab" aria-selected="' + (activeSection === id ? 'true' : 'false') + '" class="' + (activeSection === id ? 'selected' : '') + '" data-learning-action="switch-tab" data-tab="' + id + '">' + esc(text(key)) + '</button>').join('') + '</nav><main class="learning-content">' + body + '</main></div>';
    if(root.GoTStudy) root.GoTStudy.attach();
    container.dataset.section=activeSection;
    const growthTab=document.createElement('button'); growthTab.type='button';growthTab.setAttribute('role','tab');growthTab.setAttribute('aria-selected',String(activeSection==='growth'));growthTab.dataset.learningAction='switch-tab';growthTab.dataset.tab='growth';growthTab.textContent=langState.value==='zh'?'进阶与测评':'Progress & assessment';growthTab.classList.toggle('selected',activeSection==='growth');container.querySelector('.learning-tabs').append(growthTab);
    if(activeSection==='growth' && root.GoTGrowth) container.querySelector('.learning-content').innerHTML=root.GoTGrowth.render(langState.value==='en');
    container.querySelector('.learning-tabs').insertBefore(growthTab,container.querySelector('[data-tab="practice"]'));
    if(activeSection!=='home')container.querySelector('.learning-profile')?.remove();
    if(activeSection==='home') { const next=document.createElement('section');next.className='growth-next';next.innerHTML='<h2>'+(langState.value==='zh'?'会下棋之后，学会进步':'Beyond the rules')+'</h2><p>'+(langState.value==='zh'?'读棋、棋形、全盘方向、复盘与收官：选择一个主题，带着任务去练习。':'Reading, shape, direction, review and endgame: practise one theme at a time.')+'</p><button type="button" class="btn primary" data-learning-action="switch-tab" data-tab="growth">'+(langState.value==='zh'?'查看进阶路径与棋力测评':'Open training path & assessment')+'</button>';container.querySelector('.learning-content').prepend(next); }
    for(const b of container.querySelectorAll('[data-learning-action="open-lesson"]')) {
      if(b.dataset.id===selectedLesson)b.setAttribute('aria-current','step');
    }
    if(activeSection==='library'&&!selectedLibrary){
      const grid=container.querySelector('.learning-library-grid');
      const input=container.querySelector('[data-library-search]');
      const filter=container.querySelector('[data-library-filter]');
      const empty=document.createElement('p');empty.className='dialog-hint';empty.hidden=true;empty.setAttribute('role','status');
      empty.textContent=langState.value==='zh'?'没有找到匹配棋谱，请调整关键词或分类。':'No matching records. Try another search or category.';
      if(grid)grid.after(empty);
      const applyLibraryFilter=()=>{const q=(input&&input.value||'').trim().toLowerCase();const tag=(filter&&filter.value||'').toLowerCase();let count=0;for(const card of grid?grid.children:[]){const hay=card.getAttribute('data-library-text')||'';card.hidden=!!((q&&!hay.includes(q))||(tag&&!hay.includes(tag)));if(!card.hidden)count++;}empty.hidden=count>0;};
      if(input)input.addEventListener('input',applyLibraryFilter);
      if(filter)filter.addEventListener('change',applyLibraryFilter);
    }
  }
  function importStudyFile(){
    const input=document.createElement('input');input.type='file';input.accept='.sgf';
    input.onchange=async()=>{
      const file=input.files&&input.files[0];if(!file)return;
      try {
        if(file.size>2*1024*1024)throw Error('size');
        const sgf=await file.text();if(!/^\s*\(\s*;/.test(sgf))throw Error('sgf');
        const g=root.GoEngine.sgfToGame(sgf);if(![9,13,19].includes(g.size))throw Error('size');
        let n=g.root,moves=0;while(n.children.length){n=n.children[0];if(n.move)moves++;}
        if(!moves)throw Error('empty');
        const id='import-'+Date.now(),title=file.name.replace(/\.sgf$/i,'');
        LIBRARY.push({id,title,titleEn:title,sgf,moves,meta:moves+' 手 · 本次会话',metaEn:moves+' moves · This session',tags:['个人导入'],tagsEn:['Imported'],source:'用户选择的本地 SGF',sourceEn:'User-selected local SGF'});
        openLibrary(id,false);
      }catch(e){notify(langState.value==='zh'?'无法导入：请选择 2 MB 以内、9/13/19 路且含落子记录的 SGF。':'Choose an SGF under 2 MB with moves on a 9/13/19 board.');}
    };input.click();
  }
  function openLesson(id) {
    selectedLesson = id;
    activeSection = 'tutorials';
    markLesson(id, false);
    render();
  }
  function openLibrary(id, guess) {
    const item = LIBRARY.find((x) => x.id === id);
    if (!item) return;
    selectedLibrary = id;
    markLibrary(id);
    const startAt = Number((getProgress().library[id] || {}).lastMove) || 0;
    if(root.GoTStudy){root.GoTStudy.start(item,'game',!!guess,startAt);render();} else emit('got:learning-open-sgf', { sgf: item.sgf, title: otherLanguage(item, 'title'), guess: !!guess });
  }
  function openProblem(id) {
    if (!id) return;
    markProblem(id);
    emit('got:learning-open-problem', { id: String(id) });
  }
  function handleClick(e) {
    const target = e.target && e.target.closest ? e.target.closest('[data-learning-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-learning-action');
    if(action === 'library-back'){selectedLibrary=null;render();return;}
    if (action === 'switch-tab') { activeSection = target.getAttribute('data-tab') || 'home'; selectedLesson = null; const p = getProgress(); p.lastView = activeSection; saveProgress(p); render(); return; }
    if (action === 'toggle-profile') { const form = document.querySelector('[data-learning-profile-form]'); if (form) form.hidden = !form.hidden; return; }
    if (action === 'save-profile') {
      const form = document.querySelector('[data-learning-profile-form]'); if (!form) return;
      saveProfile({ name: form.elements.name.value, rank: form.elements.rank.value, goal: form.elements.goal.value, dailyMinutes: Number(form.elements.dailyMinutes.value), preferredSize: Number(form.elements.preferredSize.value) });
      notify(text('profileSaved')); render(); return;
    }
    if (action === 'export') { downloadBundle(); notify(text('bundleExported')); return; }
    if (action === 'import') { triggerImport(); return; }
    if (action === 'start-path') { openLesson(target.getAttribute('data-id') || 'basics'); return; }
    if (action === 'open-lesson') { openLesson(target.getAttribute('data-id')); return; }
    if (action === 'back-lessons') { const list=document.querySelector('.learning-lesson-list');if(list&&list.scrollIntoView)list.scrollIntoView({block:'start'});return; }
    if (action === 'complete-lesson') { if(root.GoTStudy && !root.GoTStudy.getSession()?.solved)return; markLesson(target.getAttribute('data-id'), true); render(); return; }
    if (action === 'practice-lesson') { const lesson = TUTORIALS.find((x) => x.id === target.getAttribute('data-id')); if (lesson) emit('got:learning-open-sgf', { sgf: lesson.practiceSgf, title: text(lesson.title), tutorialId: lesson.id }); return; }
    if (action === 'open-problem') { openProblem(target.getAttribute('data-id')); return; }
    if (action === 'open-problem-dialog') { emit('got:learning-open-problem-dialog', {}); return; }
    if (action === 'open-library' || action === 'guess-library') { openLibrary(target.getAttribute('data-id'), action === 'guess-library'); return; }
    if (action === 'open-sgf-file') { importStudyFile(); return; }
  }
  function mount() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('learningWorkspace');
    if (!container) return;
    if (!mounted) {
      mounted = true;
      const saved = getProgress();
      activeSection = saved.lastView || 'home';
      container.addEventListener('click', handleClick);
      if (document.addEventListener) {
        document.addEventListener('got:learning-change', () => { if (mounted) render(); });
        document.addEventListener('got:problem-progress', () => { if (mounted) render(); });
        document.addEventListener('got:learning-lesson-event', (e) => { if (mounted) recordLessonEvent(e && e.detail); });
        document.addEventListener('got:learning-library-event', (e) => { if (mounted) recordLibraryEvent(e && e.detail); });
      }
      if (root.addEventListener) root.addEventListener('storage', (e) => { if ([STORAGE.profile, STORAGE.progress, STORAGE.problem].includes(e.key)) render(); });
    }
    if(!container.querySelector('.learning-shell')) render();
  }
  function setLanguage(next) { langState.value = next === 'en' ? 'en' : 'zh'; if (mounted) render(); }
  function setSection(section) { if (['home', 'tutorials', 'practice', 'library', 'growth'].includes(section)) { activeSection = section; if (mounted) render(); } }
  const api = {
    STORAGE, SCHEMA, TUTORIALS, LIBRARY, COURSE_CHAPTERS,
    mount, render, refresh: render, setLanguage, setSection,
    getProfile, saveProfile, getProgress, saveProgress, getProblemProgress,
    rankEstimate, problemStats, recommendedProblems, lessonProgress,
    markLesson, markLibrary, markProblem, exportBundle, importBundle
  };
  root.GoTLearning = api;
  root.GOT_TUTORIALS = TUTORIALS;
  root.GOT_LIBRARY = LIBRARY;
  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
})(typeof window !== 'undefined' ? window : this);
