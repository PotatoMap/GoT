/* Learning boards own their Game instances. No Worker, bridge, or game storage. */
(function(root){
 'use strict';
 const lessons = [
 ['basics','认识棋盘','Meet the board','交叉点与坐标','Intersections and coordinates',
 '围棋落在横竖线的交叉点上。黑先白后，一次落一子，落下的棋子不能移动。|先从小棋盘练习：角上有两个相邻点，边上三个，中央四个。相邻只计算上下左右，不计算斜线。|本页棋盘完全独立，可以放心尝试。坐标字母跳过 I，数字从下向上递增。',
 'Play on intersections. Black starts, then players alternate. A placed stone does not move.|A corner point has two neighbours, an edge has three, and a centre point has four. Diagonal points are not adjacent.|This practice board is independent. Coordinate letters skip I; numbers increase from bottom to top.',
 '(;SZ[9]KM[0])',[4,4],'黑先，请在中央 E5 落子。','Black: place a stone at the centre, E5.','中央棋子有四个相邻空点，也就是四口气。','The centre stone has four adjacent empty points: four liberties.'],
 ['liberties','气与提子','Liberties & capture','数气后再落子','Count before playing',
 '棋子上下左右相邻的空点叫气。同色棋子直接相连时成为一块，共享气；重复的空点只数一次。|一块棋的最后一口气被对方占据，就要整块提掉。下子后先提对方无气的棋，再判断自己的棋是否有气。|图中白子只剩右边一口气。试着提掉它，并观察棋盘上哪颗棋子消失。',
 'Liberties are adjacent empty points. Connected stones share liberties; count each empty point only once.|When the opponent fills the last liberty, the entire group is captured. Captures happen before checking your own liberties.|The white stone has one liberty on its right. Capture it and observe the disappearing stone.',
 '(;SZ[9]PL[B]AB[cd][dc][de]AW[dd])',[4,3],'黑先，提掉 D6 的白子。','Black: capture the white stone at D6.','E6 堵住最后一口气，白子被提走。','E6 fills the last liberty and captures White.'],
 ['atari','打吃与应对','Atari & replies','先处理一口气','Answer the urgent threat',
 '只有一口气的棋处于打吃状态。被打吃不等于已经被提，轮到你时还有机会应对。|先数整块棋的气，再比较逃跑、连接和反提。机械地向外长，有时会走进征子或更紧的包围。|图中黑子只剩右边一口气，向右长一手后重新数气。',
 'A group with one liberty is in atari. It has not been captured yet: you may still respond.|Count the whole group, then compare extending, connecting, and capturing. Blindly extending can run into a ladder.|The black stone has one liberty on its right. Extend and count again.',
 '(;SZ[9]PL[B]AW[cd][dc][de]AB[dd])',[4,3],'黑先，让 D6 黑子脱离打吃。','Black: rescue D6 from atari.','连接到 E6 后，这块棋有三口气。','Extending to E6 gives the group three liberties.'],
 ['connection','连接与分断','Connect & cut','保护连接点','Protect the connecting point',
 '直接相连的同色棋子共用气；斜着靠近的两子仍然是两块棋。|一间跳、尖和虎口都有形状上的联系，但不能代替直接连接。对方的断点和周围的气决定它们是否安全。|本图先练最基本的实接：填住两颗黑子之间的空点，让它们成为一块。',
 'Directly adjacent stones share liberties; diagonal stones are still separate groups.|Jumps and diagonal shapes may connect strategically, but they are not physically connected. Cuts and nearby liberties matter.|Practise a solid connection: fill the point between the two black stones.',
 '(;SZ[9]PL[B]AB[cd][ed]AW[dc])',[3,3],'黑先，连接 C6 与 E6。','Black: connect C6 and E6.','D6 把两颗黑子实接成一块。','D6 joins both black stones into one group.'],
 ['life','眼与活棋','Eyes & life','做出两个独立的眼','Make two separate eyes',
 '眼是被一方棋子围住的内部空点，但是否真眼还要看边界棋子能不能被提。不能只看“围了一个洞”。|在通常禁止自杀的规则下，一块完整连接的棋若有两个独立真眼，对手不能通过填眼提掉它。|图中黑棋内部是一条三点空间。下在中间，把它分成两只眼。',
 'An eye is an internal empty point, but its surrounding stones must be secure. A hole alone does not guarantee life.|Under rules that prohibit suicide, a connected group with two separate true eyes cannot be captured by filling those eyes.|Black surrounds a three-point space. Divide it in the middle to make two eyes.',
 '(;SZ[9]PL[B]AB[cc][dc][ec][fc][gc][cd][gd][ce][de][ee][fe][ge])',[4,3],'黑先，在内部做出两只眼。','Black: divide the space to make two eyes.','E6 分开 D6 与 F6，形成两个独立真眼。','E6 separates D6 and F6 into two true eyes.'],
 ['ko','劫与全局','Ko & the whole board','不能立即回提','No immediate recapture',
 '劫是提子后，对方马上回提会恢复刚才局面的特殊形状。简单劫规则禁止立即回提。|通常需要先在别处找劫材，等对方回应后再考虑回提。不同规则的全局同形限制可能更严格。|图中黑先提一子会形成劫。提完以后想象白立刻回提，比较它与初始局面。',
 'A ko is a capture where an immediate recapture would restore the previous position. Simple ko prohibits that immediate recapture.|Usually you first play a threat elsewhere, then consider recapturing after the reply. Superko rules can be stricter.|Black can capture one stone to create a ko. Imagine White immediately recapturing and compare with the starting board.',
 '(;SZ[9]PL[B]AB[cd][dc][de]AW[dd][ec][ee][fd])',[4,3],'黑先，提子形成劫。','Black: capture to create a ko.','E6 提掉 D6。白方此时不能立即在 D6 回提。','E6 captures D6. White cannot immediately recapture at D6.'],
 ['territory','地与终局','Territory & finishing','先封住边界','Close the boundary',
 '终局前先确认双方的棋是否活、边界是否封闭，以及是否还有可争的地方。空点未必都是某一方的地。|中国规则以子空计分，日本规则以地和提子计分；贴目、死子和双活的处理也要按选定规则判断。|图中黑棋包围一块小区域，右侧边界有一个缺口。先把它封住。',
 'Before finishing, check life, boundaries, and remaining contested points. Empty points are not automatically territory.|Chinese rules count stones and surrounded area; Japanese rules count territory and prisoners. Apply the selected rules for komi, dead stones, and seki.|Black surrounds a small area with a gap on the right. Close it.',
 '(;SZ[9]PL[B]AB[bb][cb][db][eb][bc][bd][be][ce][de][ee][ec])',[4,3],'黑先，封住右侧缺口 E6。','Black: close the right-side gap at E6.','边界闭合后仍需确认活棋，不能把围住的空点直接当作最终胜负。','After closing the boundary, still check life before treating the area as a final score.'],
 ['review','第一次复盘','Your first review','先说出自己的想法','Explain your intention',
 '复盘先选一个具体问题：这块棋为什么被提？哪一手让对方切断？不要只看最终胜率。|先在本页尝试补救，再进入深度分析比较候选、目差和变化。AI 的结论取决于规则、局面与搜索预算。|本图黑棋被打吃：先找到最直接的应手，再解释自己为什么要下这里。',
 'Start with a concrete question: why was this group captured, or where did a cut become possible? Do not look only at the final win rate.|Try a repair here first, then compare candidates, score loss and variations in deep analysis. AI results depend on rules and search budget.|Black is in atari. Find a direct response and explain its purpose.',
 '(;SZ[9]PL[B]AB[dd]AW[cd][dc][de])',[4,3],'黑先，先救棋再谈其他地方。','Black: save the threatened stone first.','你选择了应对打吃；下一步复盘应比较逃出后的全局收益。','You answered the atari. Next compare the whole-board consequences.'],
 ['cut','识别断点','Recognise a cut','别把斜连当实接','Diagonal is not connected',
 '斜相邻的棋子不是同一块，常常需要保护连接点。|切断的目的是使对方两块棋难以互相支援；落子前还要检查自己的气。|图中白子斜着相邻。黑子已经占据一个连接点，请占另一个断点。',
 'Diagonal stones are separate groups and may need protection.|Cutting separates support, but always check the cutting stone’s liberties.|White is diagonally connected. Black occupies one connecting point; occupy the other.',
 '(;SZ[9]PL[B]AW[dd][ee]AB[de])',[4,3],'黑先，在 E6 切断。','Black: cut at E6.','白棋被分成两块；能否吃住还要继续计算。','White is separated; capture still requires further reading.'],
 ['edge','边角的气','Liberties at the edge','边缘空间更紧','Less room at the edge',
 '空棋盘中央单子有四口气，边上三个，角上两个。边线会减少逃生方向。|靠边战斗时，先数气再决定打吃的方向。相同棋形移到边角，结果可能完全不同。|角上白子仅剩 A8 一口气，黑先把它提掉。',
 'A lone centre stone has four liberties, an edge stone three, and a corner stone two.|Count before choosing an atari direction near the edge. Moving a shape into a corner can change its result.|White in the corner has only A8 left. Capture it.',
 '(;SZ[9]PL[B]AW[aa]AB[ba])',[0,1],'黑先，提掉角上的白子。','Black: capture the corner stone.','A8 封住最后一口气；角上的提子也遵循同样的规则。','A8 fills the last liberty. Captures follow the same rule in the corner.'],
 ['capture-first','反提解围','Capture to escape','不只有逃跑','Look beyond extension',
 '被打吃时，除了逃跑，还可以提掉邻近的对方棋子。提子腾出的空点会变成自己的气。|先看双方谁只有一口气；有时一手反提同时完成进攻和防守。|黑 D6 和白 E6 都有一口气，黑先提掉白子。',
 'When in atari, capturing an adjacent opponent can create new liberties.|Count both sides. A capture may defend and attack at the same time.|Black D6 and White E6 both have one liberty. Capture White first.',
 '(;SZ[9]PL[B]AB[dd][ec][fd]AW[cd][dc][ed])',[4,4],'黑先，下 E5 反提白子。','Black: capture with E5.','白 E6 被提走，黑 D6 得到一口新气。','White E6 is captured, giving Black D6 a new liberty.'],
 ['opening','布局方向','Opening direction','角、边与中央','Corners, sides and centre',
 '同样围一块地，角上通常用子较少，边上其次，中央最多。因此入门布局先关注空角。|这是一条便于理解的原则，不是每一步必须遵守的定式。对方的急所和弱棋可能更紧迫。|图中三个角已有人落子。找出最后一个空角，在星位占角。',
 'Enclosing an area usually takes fewer stones in a corner than on a side or in the centre. Beginners can start by looking at open corners.|This is a guideline, not a forced opening sequence. Urgent threats and weak groups may matter more.|Three corners are occupied. Take the remaining corner at its star point.',
 '(;SZ[9]PL[B]AB[cc][gc]AW[cg])',[6,6],'黑先，在 G3 占最后一个空角。','Black: take the open corner at G3.','先占空角后，再结合双方棋子的方向考虑边上发展。','After taking the corner, consider side development in relation to all stones.']
 ].map((a,i)=>({id:a[0],title:a[1],titleEn:a[2],summary:a[3],summaryEn:a[4],body:a[5].split('|'),bodyEn:a[6].split('|'),sgf:a[7],answer:a[8],prompt:a[9],promptEn:a[10],success:a[11],successEn:a[12],minutes:4+(i%3)}));
 const coaching={
  basics:{hint:'先找棋盘正中央的交叉点，再数它上下左右的四个方向。',hintEn:'Find the centre intersection, then count its four orthogonal neighbours.',mistake:'这里不是任务要求的中央交叉点。交叉点在两条线相交的位置，先看坐标再落子。',mistakeEn:'This is not the requested centre intersection. Stones sit where lines cross; check the coordinates before playing.'},
  edge:{hint:'角上的棋子只有两个方向的气。先看白子的右侧和上侧，找到唯一的空点。',hintEn:'A corner stone has only two liberties. Check the right and upper sides to find the only empty point.',mistake:'角上的白子还没有失去最后一口气。沿着边线数相邻空点，再找唯一的提子点。',mistakeEn:'The corner stone still has a liberty. Count adjacent empty points along the edges and find the capture point.'},
  liberties:{hint:'先把白子和它周围的黑子当作一个局部形状，数白子最后一口气的位置。',hintEn:'Read the local shape around the white stone and locate its final liberty.',mistake:'这一步没有堵住白子最后一口气。先数气，再选择能提子的交叉点。',mistakeEn:'This move does not fill the white stone’s last liberty. Count liberties, then choose the capturing point.'},
  atari:{hint:'黑棋只有一口气，沿着这口气向外延伸，就能暂时增加逃生空间。',hintEn:'Black has one liberty. Extend through that liberty to create room to escape.',mistake:'黑棋仍然处于打吃。找到它唯一的气，把棋下在那一口气上。',mistakeEn:'Black is still in atari. Find its only liberty and play there.'},
  'capture-first':{hint:'不要只找逃跑点；先检查相邻的白子是否也只剩一口气。',hintEn:'Do not look only for an escape. Check whether the adjacent white stone is also in atari.',mistake:'这一步没有利用反提。先数相邻白子的气，看看能否一手提子并解围。',mistakeEn:'This move misses the counter-capture. Count the adjacent white stone’s liberties and look for a capture that also escapes.'},
  connection:{hint:'观察两颗黑子之间的空点。实接点必须同时与两颗黑子相邻。',hintEn:'Look at the empty point between the black stones. A solid connection touches both stones.',mistake:'这里没有把两颗黑子直接连起来。斜线相邻不等于实接，找同时相邻的连接点。',mistakeEn:'This does not connect the black stones directly. Diagonal adjacency is not a solid connection; find the point touching both.'},
  cut:{hint:'白棋斜着相邻，黑棋要占据另一个连接点，把两块棋分开。',hintEn:'The white stones are diagonal. Take the other connecting point to separate them.',mistake:'这个点没有形成有效的分断。先找两颗白子之间的连接点，再确认自己的气。',mistakeEn:'This point does not create the intended cut. Find the connecting point between the white stones and check your own liberties.'},
  life:{hint:'内部只有三个连续空点。下在中间，才能把一个空间分成两个独立的眼。',hintEn:'There are three connected internal points. Play in the middle to divide them into two separate eyes.',mistake:'这个点没有把内部空间分成两只眼。比较落子后两侧是否各自留下完整空间。',mistakeEn:'This point does not divide the space into two eyes. Check whether both sides remain separate after the move.'},
  ko:{hint:'先看黑子周围的白子，找到能提掉一颗白子的紧邻点。',hintEn:'Read the white stones around Black and find the adjacent point that captures one stone.',mistake:'这里没有形成劫。先找唯一的提子点，再观察白方为什么不能立即回提。',mistakeEn:'This does not create a ko. Find the capturing point first, then observe why White cannot recapture immediately.'},
  opening:{hint:'最后一个空角的星位是两条线的交点。先确认角的位置，再落子。',hintEn:'The last open corner’s star point is an intersection on two lines. Locate the corner before playing.',mistake:'这一步没有占据最后的空角星位。先从四个角确认哪一个还没有棋子。',mistakeEn:'This does not take the open corner star point. Check all four corners and find the one without stones.'},
  territory:{hint:'右侧边界只有一个缺口。找出能同时接住上下边界的交叉点。',hintEn:'There is one gap on the right boundary. Find the intersection that joins the upper and lower borders.',mistake:'边界仍然有缺口。沿着右侧边线检查，找到同时接住两端的点。',mistakeEn:'The boundary is still open. Trace the right edge and find the point that joins both ends.'},
  review:{hint:'黑棋正在被打吃。先找它唯一的气，再考虑全局方向。',hintEn:'Black is in atari. Find its only liberty before considering the whole-board direction.',mistake:'黑棋仍然没有脱离打吃。先处理唯一的紧急气口，再谈全局。',mistakeEn:'Black is still in atari. Handle the single urgent liberty before considering the whole board.'}
 };
 lessons.forEach(l=>Object.assign(l,coaching[l.id]||{}));
 const courseOrder=['basics','edge','liberties','atari','capture-first','connection','cut','life','ko','opening','territory','review'];
 lessons.sort((a,b)=>courseOrder.indexOf(a.id)-courseOrder.indexOf(b.id));
 let session=null, observer=null, themeObserver=null, painter=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const en=()=>document.documentElement.lang==='en' || localStorage.getItem('got.lang')==='en';
 const tr=(zh,english)=>en()?english:zh;
 const field=(o,k)=>o[k+(en()?'En':'')]||o[k];
 const btn=(action,label,extra='')=>'<button type="button" class="btn ghost" data-study="'+action+'"'+(extra?' '+extra:'')+'>'+esc(label)+'</button>';
 function event(name,detail){if(typeof document==='undefined'||!document.dispatchEvent)return;try{document.dispatchEvent(new CustomEvent(name,{detail}));}catch(e){}}
 function close(){if(observer)observer.disconnect();observer=null;if(themeObserver)themeObserver.disconnect();themeObserver=null;if(painter&&painter._raf)cancelAnimationFrame(painter._raf);painter=null;}
 function start(item,kind,guess=false,startIndex=0){
   if(!root.GoEngine)return;
   session={item,kind,game:root.GoEngine.sgfToGame(item.sgf),index:0,guess,solved:false,assisted:false,hintLevel:0,attempts:0,message:'',language:en()};
   // The SGF parser keeps PL as an array; positionAt expects the scalar value.
   if(Array.isArray(session.game.root.props.PL)) {session.game.root.props.PL=session.game.root.props.PL[0];session.game.invalidate();}
   session.game.current=session.game.root;session.nodes=[session.game.root];let n=session.game.root;
   while(n.children.length){n=n.children[0];session.nodes.push(n);}
   session.index=Math.max(0,Math.min(session.nodes.length-1,Number(startIndex)||0));
   session.game.current=session.nodes[session.index];
 }
 function boardHtml(){const controls=session.kind==='lesson'?btn('reset',tr('重试','Retry'))+btn('hint',tr('提示','Hint')):btn('reset',tr('回到开局','Reset'))+btn('prev',tr('上一手','Previous'))+btn('next',tr('下一手','Next'));return '<div class="study-board-column"><div class="study-board-stage"><canvas id="studyCanvas" tabindex="0" aria-label="'+tr('学习棋盘：方向键选择交叉点，回车落子','Study board: arrow keys select, Enter plays')+'"></canvas></div><div class="study-controls">'+controls+'</div><label class="study-scrubber" '+(session.kind==='lesson'?'hidden':'')+'>'+tr('进度','Position')+' <input type="range" data-study-range min="0" max="'+(session.nodes.length-1)+'" value="'+session.index+'"></label><p class="study-feedback" role="status"></p></div>';}
 function lessonHtml(id){
   const item=lessons.find(l=>l.id===id)||lessons[0];
   if(!session||session.kind!=='lesson'||session.item.id!==item.id)start(item,'lesson');
   if(!session)return '';
   if(session.language!==en()){session.language=en();session.message='';}
   return '<div class="study-layout">'+boardHtml()+'<div class="study-reading"><div class="study-lesson-goal"><span>'+tr('本课目标','Lesson goal')+'</span><h3>'+esc(field(item,'summary'))+'</h3></div>'+field(item,'body').map(p=>'<p>'+esc(p)+'</p>').join('')+'<div class="study-task"><div class="study-task-head"><strong>'+tr('动手试一试','Try it yourself')+'</strong><span data-study-status>'+tr('未开始','Not started')+'</span></div><p>'+esc(field(item,'prompt'))+'</p><small>'+tr('先自己观察；第一次提示只给方向，第二次才演示答案。','Observe first. The first hint gives direction; the second reveals the answer.')+'</small></div><p class="study-note">'+tr('独立完成后才能标记本课；使用提示后请重置，再做一次检验。','Only an independent solve completes the lesson. After a hint, reset and try again.')+'</p>'+btn('next-lesson',tr('完成后下一课','Next lesson'),'disabled')+'</div></div>';
 }
 function libraryHtml(item,guess){
   if(!session||session.kind!=='game'||session.item.id!==item.id)start(item,'game',guess);
   if(session.language!==en()){session.language=en();session.message='';}
   return '<article class="study-game"><h2>'+esc(field(item,'title'))+'</h2><p>'+esc(field(item,'meta'))+'</p><div class="study-layout">'+boardHtml()+'<div class="study-reading"><h3>'+tr('边看边想','Study the decisions')+'</h3><p>'+tr('先猜这一手想解决什么，再点击下一手。猜着模式会比较实战落点，不代表其他落点一定不好。','Predict the purpose of the next move before revealing it. Guess mode compares with the played move; alternatives are not necessarily bad.')+'</p>'+btn('guess',tr('切换猜下一手','Toggle guess mode'))+btn('analyze',tr('送到复盘深入分析','Open in Review'))+'<p class="study-note">'+tr('所有手数均为实战完整主线；终局认输不要求填满棋盘。','This is the complete played main line. A resignation does not require filling the board.')+'</p><a target="_blank" rel="noopener noreferrer" href="'+esc(item.sourceUrl||'#')+'">'+tr('棋谱来源','Record source')+'</a></div></div></article>';
 }
 function paint(){
   if(!session||!painter)return;
   const s=session,p=s.game.positionAt(s.game.current),m=s.game.current.move;
   painter.set({size:s.game.size,stones:p.board,toMove:p.turn,lastMove:m&&!m.pass?m.y*s.game.size+m.x:-1,theme:document.documentElement.dataset.theme||'obsidian'});
   painter.resizeTo(document.querySelector('.study-board-stage'));
   const feedback=document.querySelector('.study-feedback');
   if(feedback)feedback.textContent=s.message||(s.kind==='lesson'?field(s.item,'prompt'):tr('第 ','Move ')+s.index+' / '+(s.nodes.length-1)+(s.guess?tr(' · 猜着模式',' · Guess mode'):''));
   const range=document.querySelector('[data-study-range]');if(range)range.value=s.index;
   const done=document.querySelector('[data-learning-action="complete-lesson"]');if(done)done.disabled=s.kind==='lesson'&&!s.solved;
   const next=document.querySelector('[data-study="next-lesson"]');if(next)next.disabled=!s.solved;
   const status=document.querySelector('[data-study-status]');if(status)status.textContent=s.solved?tr('已完成练习','Solved independently'):s.assisted?tr('已使用提示','Hint used'):s.attempts?tr('再试一次','Try again'):tr('未开始','Not started');
   const hint=document.querySelector('[data-study="hint"]');if(hint&&s.kind==='lesson')hint.textContent=s.hintLevel===0?tr('提示','Hint'):s.hintLevel===1?tr('查看答案','Show answer'):tr('请重置再试','Reset to retry');
 }
 function play(x,y){
   const s=session;if(!s)return;
   if(s.kind==='lesson'){
     if(s.solved||s.assisted)return;
     if(x!==s.item.answer[0]||y!==s.item.answer[1]){s.attempts++;s.message=field(s.item,'mistake')||tr('再看看右侧任务后再试。','Read the task again and try once more.');event('got:learning-lesson-event',{type:'attempt',lessonId:s.item.id,attempts:s.attempts});paint();return;}
     const r=s.game.play(s.game.positionAt().turn,x,y);
     if(r.ok){s.solved=true;s.message=field(s.item,'success');event('got:learning-lesson-event',{type:'solve',lessonId:s.item.id,attempts:s.attempts,assisted:s.assisted});}
   } else {
     if(!s.guess){s.message=tr('请开启猜着模式，或用下一手打谱。','Enable guess mode, or use Next to replay.');paint();return;}
     const next=s.nodes[s.index+1],m=next&&next.move;
     if(m&&!m.pass&&m.x===x&&m.y===y){s.game.current=next;s.index++;s.message=tr('与实战一致。继续猜下一手。','Matches the game. Try the next move.');}
     else s.message=tr('与实战不同；这不等于坏棋。可以继续尝试或查看答案。','Different from the played move, not necessarily bad. Try again or reveal.');
   }
   paint();
 }
 function attach(){
   close();const canvas=document.getElementById('studyCanvas');if(!canvas||!session||!root.BoardRenderer)return;
   painter=new root.BoardRenderer(canvas);observer=new ResizeObserver(paint);observer.observe(canvas.parentElement);
   themeObserver=new MutationObserver(paint);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
   let cursor={x:0,y:0};
   canvas.onclick=e=>{const p=painter.pointAt(e.clientX,e.clientY);if(p)play(p.x,p.y);};
   canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='Enter'||e.key===' '){play(cursor.x,cursor.y);return;}cursor.x=Math.max(0,Math.min(session.game.size-1,cursor.x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)));cursor.y=Math.max(0,Math.min(session.game.size-1,cursor.y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)));painter.set({hover:{...cursor,color:session.game.positionAt().turn,legal:true}});painter.requestRender();};
   document.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>action(b.dataset.study));
   const range=document.querySelector('[data-study-range]');if(range)range.oninput=()=>{session.index=Number(range.value);session.game.current=session.nodes[session.index];session.message='';event('got:learning-library-event',{type:'position',libraryId:session.item.id,index:session.index});if(session.index===session.nodes.length-1)event('got:learning-library-event',{type:'finished',libraryId:session.item.id,index:session.index});paint();};
   paint();
 }
 function action(a){
   const s=session;if(!s)return;
   if(a==='reset'){start(s.item,s.kind,s.guess);paint();return;}
   if(a==='next-lesson'){const next=lessons[(lessons.findIndex(l=>l.id===s.item.id)+1)%lessons.length];document.querySelector('[data-learning-action="open-lesson"][data-id="'+next.id+'"]').click();return;}
   if(a==='analyze'){document.dispatchEvent(new CustomEvent('got:learning-open-sgf',{detail:{sgf:s.item.sgf,title:field(s.item,'title')}}));return;}
   if(a==='guess'){s.guess=!s.guess;s.message='';}
   if(s.kind==='lesson'){
     if(a==='hint'){
       s.assisted=true;s.hintLevel=Math.min(2,s.hintLevel+1);event('got:learning-lesson-event',{type:'hint',lessonId:s.item.id,hintLevel:s.hintLevel});
       if(s.hintLevel===1){s.message=field(s.item,'hint')||tr('先观察棋形和气。','Read the shape and liberties first.');}
       else if(s.hintLevel===2){s.game.current=s.game.root;s.game.play(s.game.positionAt().turn,...s.item.answer);s.solved=false;s.message=field(s.item,'success')+' '+tr('这是演示答案；请重置后自己完成。','This is the demonstrated answer; reset and solve it yourself.');}
     }
   } else if(['next','prev'].includes(a)) {s.index=Math.max(0,Math.min(s.nodes.length-1,s.index+(a==='prev'?-1:1)));s.game.current=s.nodes[s.index];s.message='';event('got:learning-library-event',{type:'position',libraryId:s.item.id,index:s.index});if(s.index===s.nodes.length-1)event('got:learning-library-event',{type:'finished',libraryId:s.item.id,index:s.index});}
   paint();
 }
 root.GoTStudy={lessons,lessonHtml,libraryHtml,attach,close,start,play,action,getSession:()=>session};
})(window);
