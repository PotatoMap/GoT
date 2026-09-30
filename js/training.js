/* Independent learning sessions; persistence contains progress, never positions. */
(function(root){
  'use strict';
  const KEY='got.training.v1', C=root.GoTCurriculum;
  let queue=[], index=0, session=null, renderer=null, observer=null, themeObserver=null, language=false;
  const t=(zh,en)=>language?en:zh;
  const field=(x,k)=>language?(x[k+'En']||x[k]):x[k];
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>root.GoTGrowth.day();
  function empty(){return {items:{},log:[],minutes:10};}
  function normalise(raw){
    const out=empty();if(!raw||typeof raw!=='object')return out;
    out.minutes=[5,10,20].includes(raw.minutes)?raw.minutes:10;
    for(const item of C.items){const r=raw.items?.[item.id];if(!r||typeof r!=='object')continue;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.last)||!/^\d{4}-\d{2}-\d{2}$/.test(r.due))continue;
      out.items[item.id]={last:r.last,due:r.due,streak:Math.max(0,Math.min(5,Number(r.streak)||0)),quality:['independent','corrected','assisted'].includes(r.quality)?r.quality:'assisted',attempts:Math.max(1,Math.min(10000,Number(r.attempts)||1))};
    }
    out.log=(Array.isArray(raw.log)?raw.log:[]).filter(r=>r&&C.items.some(i=>i.id===r.id)&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&['independent','corrected','assisted'].includes(r.quality)).slice(-200).map(({id,date,quality})=>({id,date,quality}));
    return out;
  }
  function read(){try{return normalise(JSON.parse(localStorage.getItem(KEY)));}catch(e){return empty();}}
  function save(x){try{localStorage.setItem(KEY,JSON.stringify(x));}catch(e){/* storage unavailable: session still works */}}
  function merge(raw){const incoming=normalise(raw),x=read();for(const [id,r] of Object.entries(incoming.items)){const old=x.items[id];if(!old||r.last>old.last||(r.last===old.last&&r.attempts>old.attempts))x.items[id]=r;}const keys=new Set(x.log.map(r=>JSON.stringify(r)));for(const r of incoming.log)if(!keys.has(JSON.stringify(r))){x.log.push(r);keys.add(JSON.stringify(r));}x.log.sort((a,b)=>a.date.localeCompare(b.date));x.log=x.log.slice(-200);save(x);}
  function record(id,quality,date=today()){
    if(!C.items.some(i=>i.id===id)||!['independent','corrected','assisted'].includes(quality))return;
    const x=read(),old=x.items[id];
    // Repeating the same answer today does not demonstrate long-term retention.
    if(old?.last===date&&old.quality!=='independent'&&quality==='independent')quality=old.quality;
    const streak=quality==='independent'?Math.min(5,(old?.streak||0)+(old?.last===date?0:1)):0;
    const due=new Date(date+'T12:00:00');due.setDate(due.getDate()+([1,1,3,7,14,30][streak]||1));
    x.items[id]={last:date,due:root.GoTGrowth.day(due),streak,quality,attempts:(old?.attempts||0)+1};
    if(!x.log.some(r=>r.id===id&&r.date===date&&r.quality===quality))x.log.push({id,date,quality});x.log=x.log.slice(-200);save(x);root.GoTGrowth.activity('training',id);
  }
  function plan(minutes=10,date=today()){
    const progress=read().items, due=C.items.filter(i=>progress[i.id]?.due<=date), fresh=C.items.filter(i=>!progress[i.id]);
    due.sort((a,b)=>progress[a.id].due.localeCompare(progress[b.id].due)||progress[a.id].streak-progress[b.id].streak);
    return [...due,...fresh].slice(0,minutes===5?3:minutes===20?9:6).map(i=>i.id);
  }
  function status(r){return !r?t('未学习','New'):r.streak>=3?t('隔日检验通过','Retention checked'):r.quality==='independent'?t('独立完成，待复习','Independent · review pending'):r.quality==='corrected'?t('纠正后完成','Corrected'):t('提示后完成','Assisted');}
  function overview(en){language=en;const x=read(),due=C.items.filter(i=>x.items[i.id]?.due<=today()).length,done=Object.keys(x.items).length;
    return `<section class="training-overview"><div class="training-heading"><div><h2>${t('今天，练会一个方法','Make one idea your own')}</h2><p>${t('先学方法，再做配套题；明天换一次检验。预计时长仅用于控制题量。','Learn, practise, then return for a retention check. Time options set an approximate workload.')}</p></div><div class="growth-actions"><label>${t('训练时长','Session length')} <select data-training-minutes>${[5,10,20].map(m=>`<option value="${m}" ${m===x.minutes?'selected':''}>${m} ${t('分钟','min')}</option>`).join('')}</select></label><button class="btn primary" data-training-start>${t('开始今日训练','Start today’s practice')}</button></div></div><p class="training-summary">${t(`已接触 ${done} / ${C.items.length} 项 · ${due} 项到期复习`,`Encountered ${done} / ${C.items.length} items · ${due} due for review`)}</p><div class="training-topics">${C.topics.map((topic,n)=>{const items=C.items.filter(i=>i.topic===topic.id),checked=items.filter(i=>x.items[i.id]?.streak>=3).length;return `<section class="training-topic"><div><h3>${n+1}. ${escape(field(topic,'title'))}</h3><p>${escape(field(topic,'body'))}</p><small>${t(`${checked} / ${items.length} 项通过隔日检验`,`${checked} / ${items.length} retention checks passed`)}</small></div><button class="btn ghost" data-training-topic="${topic.id}">${t('学习与练习','Learn & practise')}</button></section>`;}).join('')}</div><details class="training-report"><summary>${t('学习报告与复习安排','Learning report & review schedule')}</summary><p>${t('同一天重复答对不会提高掌握等级。至少三个不同日期独立完成，才标记隔日检验通过；这不等于实战段位。','Repeated answers on one day do not increase retention. Independent solves on three different dates earn a retention check, not a playing rank.')}</p><ul>${C.items.map(i=>{const r=x.items[i.id];return `<li><span>${escape(field(i,'title'))}</span><span>${status(r)}${r?' · '+t('复习 ','Review ')+r.due:''}</span></li>`;}).join('')}</ul></details><section class="training-guides"><h2>${t('带着问题读名局','Read a game with a question')}</h2><p>${t('三个观察专题，配合实战棋盘；导读为本项目编写，不冒充棋手原话或专业定论。','Three guided observations on real games. These are original study prompts, not player quotations or professional verdicts.')}</p>${C.guides.map(g=>`<button class="btn ghost" data-training-guide="${g.id}">${escape(field(g,'title'))}</button>`).join('')}</section></section>`;
  }
  function close(){observer?.disconnect();themeObserver?.disconnect();if(renderer?._raf)cancelAnimationFrame(renderer._raf);renderer=null;observer=null;themeObserver=null;}
  function begin(ids){queue=ids.filter(id=>C.items.some(i=>i.id===id));index=0;session=null;root.GoTLearning.setSection('growth');}
  function newSession(item){const s={item,wrong:0,assisted:false,finished:false,feedback:''};if(item.kind==='board'){s.game=root.GoEngine.sgfToGame(item.sgf);if(Array.isArray(s.game.root.props.PL)){s.game.root.props.PL=s.game.root.props.PL[0];s.game.invalidate();}s.game.current=s.game.root;}return s;}
  function render(en){language=en;if(!queue.length)return overview(en);
    if(index>=queue.length){return `<section class="training-finish"><h2>${t('这组练习完成了','Session complete')}</h2><p>${t('已记录本组练习。提示后完成的题会更早复习；独立完成的题将逐步延长间隔。','Your results are recorded. Assisted items return sooner; independent solves gradually extend the review interval.')}</p><p>${t('下一步：回到学习报告查看复习日期，或在下一盘对局中运用本次方法。','Next: check your review dates, or apply today’s idea in your next game.')}</p><button class="btn primary" data-training-back>${t('查看学习报告','Return to learning report')}</button></section>`;}
    const item=C.items.find(i=>i.id===queue[index]);if(!session||session.item.id!==item.id)session=newSession(item);
    const topic=C.topics.find(t=>t.id===item.topic),s=session;
    return `<section class="training-session"><div class="training-session-nav"><button class="btn ghost" data-training-back>${t('返回课程','Back to courses')}</button><span>${index+1} / ${queue.length} · ${escape(field(topic,'title'))}</span></div><h2>${escape(field(item,'title'))}</h2><div class="training-layout">${item.kind==='board'?`<div class="training-board-stage"><canvas id="trainingCanvas" tabindex="0" aria-label="${t('练习棋盘，方向键选择交叉点，回车落子','Practice board: arrow keys select, Enter plays')}"></canvas></div>`:''}<div class="training-copy"><p>${escape(field(topic,'body'))}</p><details><summary>${t('常见误区','Common mistake')}</summary><p>${escape(field(topic,'mistake'))}</p></details><h3>${t('动手检验','Check your understanding')}</h3><p>${escape(field(item,'prompt'))}</p>${item.kind==='quiz'?`<div class="training-options">${field(item,'options').map((o,k)=>`<button class="btn ghost" data-training-answer="${k}" ${s.finished?'disabled':''}>${escape(o)}</button>`).join('')}</div>`:''}<p class="training-feedback" role="status">${escape(s.feedback)}</p><div class="growth-actions"><button class="btn ghost" data-training-hint ${s.finished?'disabled':''}>${t('查看示范','Show example')}</button><button class="btn primary" data-training-next ${!s.finished?'disabled':''}>${index===queue.length-1?t('完成本组','Finish session'):t('下一项','Next item')}</button></div><p class="dialog-hint">${t('查看示范会记录为提示后完成，并安排隔日检验。题目按指定任务判定，不把其他合法着点一概评价为坏棋。','Viewing the example records assisted completion and schedules review. Judgements apply to this task, not every legal move in a real game.')}</p></div></div></section>`;
  }
  function paint(){if(!renderer||!session?.game)return;const g=session.game,p=g.positionAt();renderer.set({size:g.size,stones:p.board,toMove:p.turn,theme:document.documentElement.dataset.theme||'paper',showCoords:true});renderer.resizeTo(document.querySelector('.training-board-stage'));}
  function attach(){close();const canvas=document.getElementById('trainingCanvas');if(!canvas||!session?.game)return;renderer=new root.BoardRenderer(canvas);observer=new ResizeObserver(paint);observer.observe(canvas.parentElement);themeObserver=new MutationObserver(paint);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});canvas.onclick=e=>{const p=renderer.pointAt(e.clientX,e.clientY);if(p)answer([p.x,p.y]);};let x=0,y=0;canvas.onkeydown=e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='Enter'||e.key===' '){answer([x,y]);return;}x=Math.max(0,Math.min(8,x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)));y=Math.max(0,Math.min(8,y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)));renderer.set({hover:{x,y,color:session.game.positionAt().turn,legal:true}});renderer.requestRender();};paint();}
  function answer(value){const s=session;if(!s||s.finished)return;const correct=JSON.stringify(value)===JSON.stringify(s.item.answer);if(!correct){s.wrong++;s.feedback=t('还没有完成本题任务。重新数气、检查条件，或查看示范。','That does not complete this task. Recheck liberties and assumptions, or view the example.');}else{if(s.game){const r=s.game.play(s.game.positionAt().turn,...value);if(!r.ok)return;}s.finished=true;s.feedback=field(s.item,'explain');record(s.item.id,s.assisted?'assisted':s.wrong?'corrected':'independent');}root.GoTLearning.render();}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-training-guide]');if(b)root.GoTLearning.openGuide(b.dataset.trainingGuide);});
  document.addEventListener('change',e=>{if(e.target.matches('[data-training-minutes]')){const x=read();x.minutes=Number(e.target.value);save(x);}});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-training-start],[data-training-topic],[data-training-back],[data-training-next],[data-training-hint],[data-training-answer]');if(!b)return;
    if(b.hasAttribute('data-training-start')){const ids=plan(read().minutes);if(ids.length)begin(ids);else{queue=[];session=null;root.GoTLearning.setSection('growth');const note=document.querySelector('.training-summary');if(note)note.textContent=t('今天没有到期或未学项目。可以自由选择课程巩固，明天再来复习。','Nothing new or due today. Choose a course for extra practice, or return tomorrow.');}}
    else if(b.dataset.trainingTopic)begin(C.items.filter(i=>i.topic===b.dataset.trainingTopic).map(i=>i.id));
    else if(b.hasAttribute('data-training-back')){queue=[];session=null;root.GoTLearning.render();}
    else if(b.hasAttribute('data-training-next')&&session?.finished){index++;session=null;root.GoTLearning.render();}
    else if(b.hasAttribute('data-training-hint')&&session&&!session.finished){session.assisted=true;answer(session.item.answer);}
    else if(b.hasAttribute('data-training-answer'))answer(Number(b.dataset.trainingAnswer));
  });
  root.GoTTraining={read,merge,record,plan,render,overview,attach,close,begin,answer};
})(window);
