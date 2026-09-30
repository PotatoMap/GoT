/* GoT 2.3 — explicit, portable lesson files. No storage or network access. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./goengine.js') : root.GoEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoTPublishing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GE) {
  'use strict';
  const FORMAT = 'got-lesson', VERSION = 1;
  function text(value, max = 12000) {
    if (typeof value !== 'string' || value.length > max) throw Error('文字格式或长度无效 / Invalid text');
    return value;
  }
  function chapter(size = 9) {
    return { title: '', body: '', size, rules: 'chinese', turn: 1, stones: Array(size * size).fill(0), marks: [], hints: [], lines: [] };
  }
  function documentDraft() { return { format: FORMAT, version: VERSION, title: '', chapters: [chapter()] }; }
  function normalize(raw) {
    if (!raw || raw.format !== FORMAT || raw.version !== VERSION) throw Error('不支持的讲义格式或版本 / Unsupported lesson version');
    if (!Array.isArray(raw.chapters) || !raw.chapters.length || raw.chapters.length > 50) throw Error('讲义需要 1–50 章 / Use 1–50 chapters');
    const doc = { format: FORMAT, version: VERSION, title: text(raw.title, 200), chapters: [] };
    let totalMoves = 0;
    for (const c of raw.chapters) {
      if (!c || ![9,13,19].includes(c.size) || ![1,2].includes(c.turn) || !Object.hasOwn(GE.RULES, c.rules)) throw Error('棋盘设置无效 / Invalid board settings');
      if (!Array.isArray(c.stones) || c.stones.length !== c.size * c.size || c.stones.some(x => ![0,1,2].includes(x))) throw Error('摆子数据无效 / Invalid stones');
      if (!Array.isArray(c.marks) || c.marks.length > c.stones.length || c.marks.some(x => !Number.isInteger(x) || x < 0 || x >= c.stones.length)) throw Error('标记无效 / Invalid marks');
      if (!Array.isArray(c.hints) || c.hints.length > 10 || !Array.isArray(c.lines) || c.lines.length > 50) throw Error('提示或变化过多 / Too many hints or lines');
      const out = { title: text(c.title,200), body: text(c.body), size:c.size, rules:c.rules, turn:c.turn, stones:c.stones.slice(), marks:[...new Set(c.marks)], hints:c.hints.map(x=>text(x,2000)), lines:[] };
      for (const line of c.lines) {
        if (!line || typeof line.correct !== 'boolean' || !Array.isArray(line.moves) || !line.moves.length || line.moves.length > 100 || line.moves.some(x=>!Number.isInteger(x)||x < -1||x >= c.stones.length)) throw Error('答案变化无效 / Invalid answer line');
        const clean = { moves:line.moves.slice(), correct:line.correct, feedback:text(line.feedback,2000) };
        totalMoves += clean.moves.length;
        if (totalMoves > 4000) throw Error('单份讲义最多 4000 手答案，请拆分讲义 / Split lessons above 4000 answer moves');
        replay(out, clean.moves);
        out.lines.push(clean);
      }
      // A terminal answer cannot also be a prefix of another answer.
      for (let i=0;i<out.lines.length;i++) for (let j=0;j<i;j++) {
        const a=out.lines[i].moves,b=out.lines[j].moves;
        if (a.slice(0,Math.min(a.length,b.length)).every((v,k)=>v===b[k])) throw Error('答案重复或终点冲突，请延长或删除其中一条 / Conflicting answer endpoints');
      }
      doc.chapters.push(out);
    }
    return doc;
  }
  function parse(source) {
    if (typeof source !== 'string' || source.length > 2 * 1024 * 1024 || new TextEncoder().encode(source).byteLength > 2 * 1024 * 1024) throw Error('讲义文件超过 2 MiB / Lesson file too large');
    return normalize(JSON.parse(source));
  }
  function serialize(raw) {
    const source = JSON.stringify(normalize(raw), null, 2);
    if (new TextEncoder().encode(source).byteLength > 2 * 1024 * 1024) throw Error('编辑文件超过 2 MiB，请拆分讲义 / Split this lesson into smaller files');
    return source;
  }
  function replay(c, moves = []) {
    const p = new GE.Position(c.size);
    c.stones.forEach((v,i)=>{ if(v) p.setStone(i,v); });
    p.turn = c.turn;
    p.history.clear(); p.history.add(p.h1 + ':' + p.h2);
    for (const i of moves) {
      if (i === -1) { p.pass(p.turn); continue; }
      const check = p.checkPlay(p.turn,i,undefined,!!GE.RULES[c.rules].superko);
      if (!check.ok) throw Error('非法着手 / Illegal move: ' + check.reason);
      p.play(p.turn,i);
    }
    return p;
  }
  function compile(raw) {
    const doc=normalize(raw);
    return { title:doc.title, chapters:doc.chapters.map(c=>{
      if(c.lines.length && !c.lines.some(l=>l.correct)) throw Error('棋题至少需要一条正解 / A question needs a correct answer');
      const root={ board:c.stones.slice(), turn:c.turn, next:{} };
      for(const line of c.lines) {
        let node=root;
        line.moves.forEach((move,k)=>{
          if(!node.next[move]) { const p=replay(c,line.moves.slice(0,k+1)); node.next[move]={board:Array.from(p.board),turn:p.turn,next:{},last:move}; }
          node=node.next[move];
        });
        node.correct=line.correct; node.feedback=line.feedback;
      }
      return {title:c.title,body:c.body,size:c.size,marks:c.marks,hints:c.hints,root};
    }) };
  }
  function boardHTML(size, stones, marks = [], last = -1) {
    const n=size+1;
    let svg='<svg viewBox="0 0 '+n+' '+n+'" style="stroke:none;stroke-width:0;fill:none" aria-hidden="true"><rect width="100%" height="100%" fill="#dbb77f"/>';
    for(let k=1;k<=size;k++) svg+='<path d="M1 '+k+'H'+size+'M'+k+' 1V'+size+'" stroke="#755630" stroke-width=".035"/>';
    stones.forEach((color,i)=>{const x=i%size+1,y=Math.floor(i/size)+1;
      if(color) svg+='<circle cx="'+x+'" cy="'+y+'" r=".44" fill="'+(color===1?'#222':'#fffaf0')+'" stroke="#493e30" stroke-width=".03"/>';
      if(marks.includes(i)) svg+='<path d="M'+x+' '+(y-.23)+'l.22 .4h-.44z" fill="none" stroke="'+(color===1?'#fff':'#743600')+'" stroke-width=".07"/>';
      if(i===last) svg+='<circle cx="'+x+'" cy="'+y+'" r=".10" fill="'+(color===1?'#fff':'#222')+'"/>';
    });
    return svg+'</svg>';
  }
  const readerCSS = `*{box-sizing:border-box}body{margin:0;background:#f5f3ef;color:#282720;font:16px/1.65 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:24px}h1,h2{line-height:1.3}button,select{font:inherit;min-height:44px;padding:8px 14px;border:1px solid #9e9687;background:#faf9f6;color:inherit;border-radius:6px;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,select:focus-visible{outline:3px solid #885515;outline-offset:3px}.tools{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:28px}.board{position:relative;width:100%;aspect-ratio:1;touch-action:manipulation}.board svg{display:block;width:100%;height:100%}.points{position:absolute;inset:0;display:grid;padding:var(--pad)}.points button{border:0;background:transparent;border-radius:50%;min-height:0;padding:0;min-width:0;aspect-ratio:1}.points button:focus-visible{outline:2px solid #ad4500;outline-offset:-2px}.copy{white-space:pre-wrap;overflow-wrap:anywhere}#status{min-height:3em}#printPages{display:none}@media(max-width:680px){main{padding:12px}.layout{grid-template-columns:1fr;gap:12px}h1{font-size:25px}.tools{gap:6px}}@media print{body{background:white}main{display:none}#printPages{display:block}.sheet{break-after:page;padding:16mm}.sheet .board{max-width:125mm}.sheet h2{margin-top:0}.sheet:last-child{break-after:auto}}`;
  function reader(data, draw, english, editable) {
    const $=id=>document.getElementById(id), tr=(zh,en)=>english?en:zh;
    let index=0,node,hint=0,pending=null,replayPath=null,replayIndex=0;
    $('title').textContent=data.title||tr('围棋讲义','Go lesson');
    data.chapters.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+(c.title||tr('未命名章节','Untitled'));$('chapters').append(o);});
    function render() {
      const c=data.chapters[index];
      $('board').innerHTML=draw(c.size,node.board,c.marks,node.last);
      const grid=document.createElement('div'); grid.className='points';grid.style.gridTemplateColumns='repeat('+c.size+',1fr)';grid.style.setProperty('--pad',50/(c.size+1)+'%');
      for(let i=0;i<c.size*c.size;i++) {const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','ABCDEFGHJKLMNOPQRST'[i%c.size]+(c.size-Math.floor(i/c.size)));b.disabled=!Object.keys(node.next).length||!!node.board[i];b.setAttribute('aria-pressed',String(pending===i));if(pending===i)b.style.boxShadow='inset 0 0 0 2px #ac4500';b.onclick=()=>{pending=i;$('confirm').disabled=false;$('status').textContent=tr('待确认：','Selected: ')+b.getAttribute('aria-label');grid.querySelectorAll('button').forEach(x=>{x.style.boxShadow='';x.setAttribute('aria-pressed','false');});b.style.boxShadow='inset 0 0 0 2px #ac4500';b.setAttribute('aria-pressed','true');};grid.append(b);}
      $('board').append(grid); $('confirm').disabled=pending===null; $('pass').disabled=!Object.keys(node.next).length;
      if(replayPath){grid.querySelectorAll('button').forEach(b=>b.disabled=true);$('confirm').disabled=true;$('pass').disabled=true;}
      $('turn').textContent=Object.keys(c.root.next).length?tr('请依次走出双方应对 · ','Play both sides in sequence · ')+(node.turn===1?tr('黑先','Black to play'):tr('白先','White to play')):tr('讲解章节','Reading chapter');
      $('hint').disabled=hint>=c.hints.length; $('reveal').disabled=!Object.keys(c.root.next).length;
    }
    function move(i) {
      const next=node.next[i];pending=null;
      if(!next) {$('status').textContent=tr('这一步未收录在作者答案中，不能据此判错。请换一个点或查看提示。','This move is not covered by the author. Try another point or use a hint.');render();return;}
      node=next;$('status').textContent=node.correct===true?tr('答对了！','Correct! ')+(node.feedback||''):node.correct===false?tr('这是作者标注的误区。','An authored wrong line. ')+(node.feedback||''):tr('继续走出下一手。','Continue with the next move.');render();
    }
    function reset() {const c=data.chapters[index];node=c.root;hint=0;pending=null;replayPath=null;replayIndex=0;$('heading').textContent=c.title;$('body').textContent=c.body;$('hints').textContent='';$('status').textContent='';$('answers').replaceChildren();render();}
    $('chapters').onchange=()=>{index=Number($('chapters').value);reset();};
    $('reset').onclick=reset;$('confirm').onclick=()=>{if(pending!==null)move(pending);};$('pass').onclick=()=>move(-1);
    $('hint').onclick=()=>{const c=data.chapters[index];if(hint<c.hints.length){$('hints').textContent+=(hint?'\n':'')+(hint+1)+'. '+c.hints[hint++];render();}};
    $('reveal').onclick=()=>{
      pending=null;replayPath=[];node=data.chapters[index].root;render();
      $('answers').replaceChildren();
      const choices=document.createElement('div');choices.className='tools';$('answers').append(choices);
      const prev=document.createElement('button'),next=document.createElement('button');prev.textContent=tr('上一手','Previous move');next.textContent=tr('下一手','Next move');
      function show(){node=replayIndex?replayPath[replayIndex-1]:data.chapters[index].root;pending=null;render();prev.disabled=replayIndex===0;next.disabled=replayIndex>=replayPath.length;$('status').textContent=tr('答案演示 ','Answer replay ')+replayIndex+'/'+replayPath.length+' '+(node.feedback||'')+tr(' · 点“重试”重新作答。',' · Reset to try again.');}
      prev.onclick=()=>{if(replayIndex>0){replayIndex--;show();}};next.onclick=()=>{if(replayIndex<replayPath.length){replayIndex++;show();}};prev.disabled=next.disabled=true;
      function walk(n,path) {if(n.correct===true){const b=document.createElement('button');b.textContent=tr('正解 ','Answer ')+(choices.children.length+1);b.onclick=()=>{replayPath=path;replayIndex=0;choices.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));show();};choices.append(b);}Object.values(n.next).forEach(x=>walk(x,path.concat(x)));}walk(data.chapters[index].root,[]);
      $('answers').append(prev,next);
      $('status').textContent=tr('选择一条正解，再逐手查看。','Choose an answer, then step through it.');
    };
    $('print').onclick=()=>window.print();
    $('saveEditable').onclick=()=>{const blob=new Blob([editable],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='got-lesson.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
    data.chapters.forEach((c,i)=>{const section=document.createElement('section');section.className='sheet';const h=document.createElement('h2');h.textContent=(i+1)+'. '+c.title;const p=document.createElement('p');p.className='copy';p.textContent=c.body;const board=document.createElement('div');board.className='board';board.innerHTML=draw(c.size,c.root.board,c.marks);section.append(h,p,board);const turn=document.createElement('p');turn.textContent=c.root.turn===1?tr('黑先','Black to play'):tr('白先','White to play');section.append(turn);$('printPages').append(section);});
    reset();
  }
  function html(raw, english=false) {
    const editable=JSON.stringify(serialize(raw)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const data=JSON.stringify(compile(raw)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const tr=(zh,en)=>english?en:zh;
    return '<!doctype html><html lang="'+(english?'en':'zh-CN')+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GoT · '+tr('围棋讲义','Go lesson')+'</title><style>'+readerCSS+'</style><main><h1 id="title"></h1><div class="tools"><select id="chapters" aria-label="'+tr('章节','Chapters')+'"></select><button id="print">'+tr('打印题页','Print questions')+'</button><button id="saveEditable">'+tr('保存编辑文件','Save editable file')+'</button></div><div class="layout"><div><div id="board" class="board"></div><p id="turn"></p></div><section><h2 id="heading"></h2><p id="body" class="copy"></p><div class="tools"><button id="confirm">'+tr('确认落子','Confirm move')+'</button><button id="pass">'+tr('停一手','Pass')+'</button><button id="reset">'+tr('重试','Reset')+'</button><button id="hint">'+tr('下一条提示','Next hint')+'</button><button id="reveal">'+tr('查看正解','Show answers')+'</button></div><p id="status" role="status"></p><p id="hints" class="copy"></p><div id="answers" class="tools"></div></section></div><p>'+tr('答案由讲义作者编写。未收录的着手不等于错误；本文件不调用 AI，也不保存作答记录。','Answers are authored, not engine judgments. Unlisted moves are not necessarily wrong. No answers are stored.')+'</p></main><div id="printPages"></div><script>('+reader.toString()+')('+data+','+boardHTML.toString()+','+!!english+','+editable+');<'+'/script></html>';
  }
  return {FORMAT,VERSION,chapter,documentDraft,normalize,parse,serialize,replay,compile,boardHTML,html,readerCSS};
});
