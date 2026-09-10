/* GoT 2.0 home: read-only session snapshot and existing learning data. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let snapshot, board, selected = null, offset = 0;
  const action = name => document.dispatchEvent(new CustomEvent('got:home-action', { detail: name }));
  function miniBoard(problem) {
    const host = $('homeProblemBoard');
    host.replaceChildren();
    if (!problem) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 180 180'); svg.setAttribute('aria-hidden', 'true');
    const n = problem.size || 19, cell = 152 / (n - 1);
    function node(tag, attrs) { const el = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); svg.append(el); }
    node('rect', { width:180, height:180, rx:12, fill:'#ebc58a', stroke:'none' });
    for (let i=0;i<n;i++) { const p=14+i*cell; node('path',{d:`M14 ${p}H166M${p} 14V166`,stroke:'#977145','stroke-width':.6}); }
    for (const [list,color] of [[problem.black,'#252724'],[problem.white,'#fcfaf5']]) {
      for (const pair of list || []) { const x=Array.isArray(pair)?pair[0]:pair%n, y=Array.isArray(pair)?pair[1]:Math.floor(pair/n); node('circle',{cx:14+x*cell,cy:14+y*cell,r:cell*.45,fill:color,stroke:'#8d785b','stroke-width':.5}); }
    }
    host.append(svg);
  }
  function render(data) {
    snapshot = data;
    const en = data.lang === 'en', tr = (zh,eng) => en?eng:zh;
    const learning = window.GoTLearning;
    if (!learning) return;
    const lessons=learning.lessonProgress(), stats=learning.problemStats(), progress=learning.getProgress();
    const put = (id,zh,eng) => { $(id).textContent=tr(zh,eng); };
    $('homeWorkspace').setAttribute('aria-label',tr('首页','Home'));
    $('homeBoard').setAttribute('aria-label',tr('当前棋局只读预览','Read-only current game preview'));
    $('homeDate').textContent = new Date().toLocaleDateString(en?'en-GB':'zh-CN',{month:'long',day:'numeric',weekday:'long'});
    put('homeGreeting','每一手，都向前。','A little Go. A little growth.');
    put('homeGameTitle',data.moves?'回到当前棋局':'开启一盘新棋',data.moves?'Your current game':'A fresh board awaits');
    put('homeGameMeta',`${data.size} 路棋盘 · ${data.moves} 手`,`${data.size} × ${data.size} board · ${data.moves} moves`);
    put('homeSession','本次会话','This session');
    put('homePlay',data.moves?'回到棋盘 →':'开始对局 →',data.moves?'Return to board →':'Start playing →');
    put('homeImport','或导入 SGF 棋谱','Or import an SGF record');
    put('homeProblemTitle','今日一题','A problem for today');
    put('homeShuffle','换一题','Another');
    const candidates=learning.recommendedProblems(100);
    const pool=candidates.length?candidates:(window.GOT_PROBLEMS?.problems||[]);
    if (!selected || !pool.some(p=>p.id===selected.id)) selected=pool[(Math.floor(Date.now()/86400000)+offset)%pool.length] || null;
    put('homeProblemName',selected?'读清局部，找到应手':'题库暂不可用',selected?'Read the position':'No problems available');
    $('homeProblemMeta').textContent=selected?`${en?selected.rankEn:selected.rank} · ${tr(selected.toMove==='B'?'黑先':'白先', selected.toMove==='B'?'Black to play':'White to play')}`:tr('请检查题库文件','Check the problem files');
    put('homeProblemStart','开始练习','Practice'); $('homeProblemStart').disabled=!selected; $('homeShuffle').disabled=pool.length<2;
    miniBoard(selected);
    put('homeCourseTitle','每日练习足迹','Daily practice');
    put('homeCourseDesc','每一点积累，都算数。','Every little practice counts.');
    $('homeCourse').textContent=tr('今日打卡','Check in today');
    let heat=document.getElementById('homeHeatmap');if(!heat){heat=document.createElement('div');heat.id='homeHeatmap';$('homeCourse').before(heat);document.querySelector('.home-course-track')?.remove();}window.GoTGrowth?.heatmap(heat,en);
    const checked=(window.GoTGrowth?.read().days[window.GoTGrowth.day()]||[]).includes('checkin:daily');$('homeCourse').disabled=checked;if(checked)$('homeCourse').textContent=tr('今日已打卡','Checked in today');
    document.querySelectorAll('.home-course-track span').forEach((el,i)=>el.classList.toggle('complete',lessons.completed>i*3));
    put('homeLibraryTitle','在名局中，遇见好棋','Great games, lasting ideas');
    put('homeLibraryDesc',`${learning.LIBRARY.length} 局完整棋谱 · 逐手阅读与猜着练习`,`${learning.LIBRARY.length} complete records · study and guess the next move`);
    put('homeLibrary','打开名局棋谱 →','Explore the collection →');
    put('homeProgressTitle','你的学习足迹','Your learning journey');
    put('homeProgressNote','累计进度，点滴向前','All-time progress, one step at a time');
    put('homePractice','针对练习 →','Personal practice →');
    $('homeStats').replaceChildren();
    for (const [count,label] of [[lessons.completed,tr('完成课程','Lessons completed')],[stats.done,tr('完成题目','Problems solved')],[Object.values(progress.library).filter(r=>r.started||r.finished).length,tr('学习棋谱','Records studied')]]) {
      const item=document.createElement('div'), strong=document.createElement('strong'), text=document.createElement('span'); strong.textContent=count; text.textContent=label; item.append(strong,text); $('homeStats').append(item);
    }
    if (!board) board=new window.BoardRenderer($('homeBoard'));
    board.set({size:data.size,stones:data.stones,theme:data.theme,showCoords:false});
    requestAnimationFrame(()=> { if (!$('homeWorkspace').hidden) board.resizeTo($('homeBoardStage')); });
  }
  $('homePlay').onclick=()=>action('play'); $('homeImport').onclick=()=>action('import');
  $('homeCourse').onclick=()=>{window.GoTGrowth?.activity('checkin','daily');if(snapshot)render(snapshot);}; $('homeLibrary').onclick=()=>action('library'); $('homePractice').onclick=()=>action('practice');
  $('homeShuffle').onclick=()=> { offset++; const pool=window.GoTLearning.recommendedProblems(100); const all=pool.length?pool:window.GOT_PROBLEMS?.problems||[]; const i=all.findIndex(p=>p.id===selected?.id); selected=all[(i+1)%all.length]||null; if(snapshot)render(snapshot); };
  $('homeProblemStart').onclick=()=> { if(selected)document.dispatchEvent(new CustomEvent('got:learning-open-problem',{detail:{id:selected.id}})); };
  new ResizeObserver(()=> { if(board && !$('homeWorkspace').hidden)board.resizeTo($('homeBoardStage')); }).observe($('homeBoardStage'));
  window.GoTHome={render};
})();
