/* In-memory authoring workspace. Only explicit file exports persist content. */
(function () {
  'use strict';
  const P=window.GoTPublishing;
  let draft=P.documentDraft(), active=0, dirty=false, dialog=null, moves=[], selectedLine=-1;
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  function download(content,name,type) {
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function open(options) {
    if(dialog?.open)return;
    const en=!['zh','zhHant'].includes(options.lang),t=(zh,enText)=>en?enText:zh;
    const d=document.createElement('dialog');dialog=d;d.className='studio';d.setAttribute('aria-labelledby','studioTitle');
    d.innerHTML=`<header class="studio-header"><div><h2 id="studioTitle">${t('编创 & 发布','Editing & Publishing')}</h2><p>${t('草稿仅在本次打开期间保留，请主动导出编辑文件。','Drafts live in this session only. Export an editable file to keep your work.')}</p></div><button type="button" data-action="close">${t('返回棋局','Back to game')}</button></header>
      <div class="studio-tools"><button data-action="json">${t('保存编辑文件','Save editable file')}</button><button data-action="import">${t('导入编辑文件','Import editable file')}</button><button data-action="preview">${t('预览 / 打印','Preview / print')}</button><button data-action="html">${t('导出离线讲义','Export offline lesson')}</button><input type="file" data-field="file" accept=".json,application/json" hidden></div>
      <p data-field="status" role="status" class="studio-status"></p>
      <label class="studio-title">${t('讲义名称','Lesson title')}<input data-field="title" maxlength="200"></label>
      <div class="studio-layout"><aside class="studio-chapters"><label>${t('章节顺序','Chapter order')}<select data-field="chapters" size="6"></select></label><div class="studio-tools"><button data-action="up">${t('上移','Move up')}</button><button data-action="down">${t('下移','Move down')}</button><button data-action="remove">${t('删除章节','Delete chapter')}</button></div><label>${t('新棋盘','New board')}<select data-field="size"><option>9</option><option>13</option><option>19</option></select></label><div class="studio-tools"><button data-action="add">${t('添加空白章节','Add blank chapter')}</button><button data-action="capture">${t('添加当前棋局面','Add game position')}</button></div><p>${t('可返回棋局选中其他手数，再添加到讲义。','Return to the game and select another move to add its position.')}</p></aside>
      <section class="studio-board-column"><div data-field="board" class="studio-board"></div><p data-field="turn"></p><div class="studio-tools"><label>${t('棋盘操作','Board tool')}<select data-field="tool"><option value="black">${t('摆黑子','Set black')}</option><option value="white">${t('摆白子','Set white')}</option><option value="erase">${t('擦除棋子','Erase stone')}</option><option value="mark">${t('三角标记','Triangle mark')}</option><option value="line">${t('录制答案变化','Record answer line')}</option></select></label><button data-action="apply" disabled>${t('确认选点','Confirm point')}</button><button data-action="cancel">${t('取消选点','Cancel point')}</button></div><div class="studio-tools"><button data-action="undo">${t('撤回一手','Undo move')}</button><button data-action="pass">${t('停一手','Pass')}</button><button data-action="resetline">${t('新录一条','New line')}</button></div><p data-field="recording"></p></section>
      <section class="studio-fields"><label>${t('章节名称','Chapter title')}<input data-field="chapterTitle" maxlength="200"></label><label>${t('讲解 / 问题','Explanation / question')}<textarea data-field="body" rows="4" maxlength="12000"></textarea></label><label>${t('先手方','First to play')}<select data-field="turnChoice"><option value="1">${t('黑','Black')}</option><option value="2">${t('白','White')}</option></select></label><label>${t('分步提示（每行一条，最多十条）','Hints (one per line, up to ten)')}<textarea data-field="hints" rows="3" maxlength="20000"></textarea></label><hr><label>${t('已保存的答案（选择可修改）','Saved answers (select to edit)')}<select data-field="lines"><option value="-1">${t('新答案','New answer')}</option></select></label><div class="studio-tools"><label>${t('答案类型','Answer type')}<select data-field="correct"><option value="true">${t('正解','Correct')}</option><option value="false">${t('误区','Wrong line')}</option></select></label></div><label>${t('走完后的评语','Feedback at the end')}<textarea data-field="feedback" rows="2" maxlength="2000"></textarea></label><div class="studio-tools"><button data-action="saveline">${t('保存这条变化','Save this line')}</button><button data-action="deleteline">${t('删除选中变化','Delete selected line')}</button></div><p>${t('摆子或改变先手前需删除已有答案；未录制答案的章节作为讲解页发布。','Delete existing answers before changing stones or turn. Chapters without answers are published as reading pages.')}</p></section></div>
      <section data-field="previewPanel" hidden><div class="studio-tools"><button data-action="closepreview">${t('关闭预览','Close preview')}</button></div><iframe title="${t('讲义预览','Lesson preview')}" sandbox="allow-scripts allow-modals allow-downloads"></iframe></section>`;
    document.body.append(d);
    const $=key=>d.querySelector('[data-field="'+key+'"]'), action=key=>d.querySelector('[data-action="'+key+'"]');
    let pending=null, lineDirty=false, step=1, setupHistory=[], importSeq=0;
    const current=()=>draft.chapters[active];
    const message=s=>{$('status').textContent=s;$('status').scrollIntoView({block:'nearest'});};
    const changed=()=>{dirty=true;if(!$('previewPanel').hidden){$('previewPanel').hidden=true;d.querySelector('iframe').removeAttribute('srcdoc');message(t('内容已修改，请重新预览后分享。','Content changed. Refresh the preview before sharing.'));}};
    const filename=ext=>(draft.title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').slice(0,60)||'got-lesson')+'.'+ext;
    const guard=fn=>{try{fn();}catch(e){message(e.message);}};
    const assertSaved=()=>{if(lineDirty&&moves.length)handlers.saveline();else if(lineDirty){lineDirty=false;$('feedback').value='';}};
    // Progressive disclosure: each step exposes only the controls needed now.
    const steps=document.createElement('nav');steps.className='studio-steps';steps.setAttribute('aria-label',t('制作步骤','Authoring steps'));
    [t('1 · 摆题面','1 · Set position'),t('2 · 写答案','2 · Add answers'),t('3 · 预览分享','3 · Preview & share')].forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.step=i+1;b.onclick=()=>guard(()=>goStep(i+1));steps.append(b);});
    d.querySelector('.studio-header').after(steps);
    const help=document.createElement('p');help.className='studio-step-help';steps.after(help);
    const setupExtras=document.createElement('div');setupExtras.className='studio-tools';setupExtras.innerHTML=`<button type="button" data-action="example">${t('用示例试一遍','Try an example')}</button><button type="button" data-action="setupundo">${t('撤回摆子','Undo setup')}</button><button type="button" data-action="editsetup">${t('修改题面','Change position')}</button>`;
    d.querySelector('.studio-board-column').append(setupExtras);
    const chapters=d.querySelector('.studio-chapters'),more=document.createElement('details'),summary=document.createElement('summary');summary.textContent=t('管理章节 / 添加其他局面','Manage chapters / add positions');more.append(summary);while(chapters.firstChild)more.append(chapters.firstChild);chapters.append(more);
    const footer=document.createElement('div');footer.className='studio-tools studio-next';footer.innerHTML=`<button type="button" data-action="next">${t('下一步：写答案','Next: add answers')}</button><span>${t('切换步骤时会将答案保留在本次草稿中。','Answers stay in the session draft when you change steps.')}</span>`;d.querySelector('.studio-layout').after(footer);
    const publishNote=document.createElement('p');publishNote.className='studio-publish-note';footer.after(publishNote);
    const fieldGroup=key=>$(key).closest('label');
    const advanced=document.createElement('details');advanced.className='studio-answer-options';const advancedTitle=document.createElement('summary');advancedTitle.textContent=t('添加提示或误区（可选）','Hints and wrong answers (optional)');advanced.append(advancedTitle);for(const key of ['hints','correct'])advanced.append(fieldGroup(key));advanced.append(action('deleteline'));d.querySelector('.studio-fields').append(advanced);
    const discard=document.createElement('button');discard.type='button';discard.dataset.action='discardline';discard.textContent=t('放弃这次录制','Discard this recording');action('undo').parentElement.append(discard);
    function showStep(){
      steps.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false'));
      help.textContent=step===1?t('先摆出要讲解的局面，再写一句问题。也可以用示例熟悉操作。','Set the starting position and write a question. Try the example to learn the flow.'):step===2?t('直接在棋盘上依次走出双方应对。第一条默认是正确答案，完成后进入预览。','Play both sides on the board. The first line is a correct answer; then preview it.'):t('先像读者一样试做，再下载分享文件。编辑文件用于下次继续修改。','Try your lesson as a reader, then download it to share. Keep the editable file for future changes.');
      for(const key of ['chapterTitle','body','turnChoice'])fieldGroup(key).hidden=step!==1;
      for(const key of ['hints','lines','correct','feedback'])fieldGroup(key).hidden=step!==2;
      fieldGroup('tool').hidden=step!==1;
      for(const key of ['undo','pass','resetline','saveline','deleteline'])action(key).hidden=step!==2;
      advanced.hidden=step!==2;discard.hidden=step!==2||!lineDirty;
      action('resetline').hidden=step!==2||!current().lines.length;
      action('setupundo').hidden=step!==1;action('setupundo').disabled=!setupHistory.length;
      action('example').hidden=step!==1;action('editsetup').hidden=step!==1||!current().lines.length;
      $('recording').hidden=step!==2;fieldGroup('title').hidden=step!==3;
      action('preview').hidden=step!==3;action('html').hidden=step!==3;
      action('json').textContent=t('保存草稿文件','Save draft file');action('html').textContent=t('下载分享文件','Download to share');
      action('saveline').textContent=t('完成这条答案','Finish this answer');action('resetline').textContent=t('再加一种答案','Add another answer');
      d.querySelector('.studio-board-column').hidden=step===3;d.querySelector('.studio-fields').hidden=step===3;
      d.querySelector('.studio-fields hr').hidden=true;d.querySelector('.studio-fields>p').hidden=true;
      action('next').hidden=step===3;action('next').textContent=step===1?t('下一步：写答案','Next: add answers'):t('下一步：预览分享','Next: preview & share');
      footer.querySelector('span').hidden=step===3;
      publishNote.hidden=step!==3;publishNote.textContent=t('下载分享文件可直接离线打开；保存草稿文件可重新导入编辑。','The share file opens offline; the draft file can be imported for editing.')+' '+draft.chapters.length+t(' 个章节',' chapters');
      d.dataset.step=step;
    }
    function goStep(next){assertSaved();if(next===3)P.compile(draft);step=next;pending=null;setupHistory=[];if(step===1){moves=[];selectedLine=-1;$('tool').value='black';renderLines();}else if(step===2){$('tool').value='line';if(!moves.length&&current().lines.length){selectedLine=0;const l=current().lines[0];moves=l.moves.slice();$('correct').value=String(l.correct);$('feedback').value=l.feedback;renderLines();}}else handlers.preview();if(step!==3)handlers.closepreview();showStep();draw();}
    function draw() {
      const c=current(),p=P.replay(c,moves);$('board').innerHTML=P.boardHTML(c.size,Array.from(p.board),c.marks,p.lastMove);
      const grid=document.createElement('div');grid.className='studio-points';grid.style.gridTemplateColumns='repeat('+c.size+',1fr)';grid.style.padding=50/(c.size+1)+'%';
      for(let i=0;i<c.size*c.size;i++){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',window.GoEngine.coordName(c.size,i%c.size,Math.floor(i/c.size)));b.setAttribute('aria-pressed',String(pending===i));b.onclick=()=>{pending=i;draw();};grid.append(b);}
      $('board').append(grid);action('apply').disabled=pending===null;
      $('turn').textContent=(p.turn===1?t('黑先','Black to play'):t('白先','White to play'))+(pending===null?'':t(' · 待确认 ',' · Selected ')+window.GoEngine.coordName(c.size,pending%c.size,Math.floor(pending/c.size)));
      $('recording').textContent=moves.length?t('当前变化：','Current line: ')+moves.map(i=>i===-1?t('停一手','Pass'):window.GoEngine.coordName(c.size,i%c.size,Math.floor(i/c.size))).join(' → ')+(lineDirty?t('（尚未保存）',' (unsaved)'):''):t('选择“录制答案变化”后，依次走出双方应对。','Choose Record answer line, then play both sides in sequence.');
      action('undo').disabled=!moves.length;action('pass').disabled=$('tool').value!=='line';
      showStep();
    }
    function renderChapters(){const select=$('chapters');select.replaceChildren();draft.chapters.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+(c.title||t('未命名章节','Untitled'));select.append(o);});select.value=active;action('up').disabled=active===0;action('down').disabled=active===draft.chapters.length-1;action('remove').disabled=draft.chapters.length===1;}
    function renderLines(){const select=$('lines');select.replaceChildren();const blank=document.createElement('option');blank.value=-1;blank.textContent=t('新答案','New answer');select.append(blank);current().lines.forEach((l,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+(l.correct?t('正解','Correct'):t('误区','Wrong'))+' · '+l.moves.length+t(' 手',' moves');select.append(o);});select.value=selectedLine;}
    function fields(){const c=current();$('title').value=draft.title;$('chapterTitle').value=c.title;$('body').value=c.body;$('turnChoice').value=c.turn;$('hints').value=c.hints.join('\n');$('feedback').value='';$('correct').value='true';renderChapters();renderLines();draw();}
    function resetLine(){moves=[];selectedLine=-1;lineDirty=false;pending=null;$('feedback').value='';$('correct').value='true';renderLines();draw();}
    function add(c){assertSaved();const old=current(),empty=draft.chapters.length===1&&!old.title&&!old.body&&!old.lines.length&&!old.hints.length&&!old.marks.length&&!old.stones.some(Boolean);if(empty){draft.chapters[0]=c;active=0;}else{if(draft.chapters.length>=50)throw Error(t('最多 50 章','Maximum 50 chapters'));draft.chapters.push(c);active=draft.chapters.length-1;}step=1;setupHistory=[];$('tool').value='black';resetLine();changed();fields();}
    $('title').oninput=()=>{draft.title=$('title').value;changed();};
    $('chapterTitle').oninput=()=>{current().title=$('chapterTitle').value;changed();renderChapters();};
    $('body').oninput=()=>{current().body=$('body').value;changed();};
    $('hints').oninput=()=>{current().hints=$('hints').value.split('\n').filter(x=>x.trim());changed();};
    $('feedback').oninput=$('correct').onchange=()=>{lineDirty=true;changed();};
    $('turnChoice').onchange=()=>guard(()=>{if(current().lines.length||moves.length){$('turnChoice').value=current().turn;throw Error(t('请先删除答案变化。','Delete answer lines first.'));}current().turn=Number($('turnChoice').value);pending=null;changed();draw();});
    $('tool').onchange=()=>{pending=null;draw();};
    $('chapters').onchange=()=>guard(()=>{const next=Number($('chapters').value);try{assertSaved();}catch(e){$('chapters').value=active;throw e;}active=next;setupHistory=[];resetLine();fields();if(step===3)handlers.preview();});
    $('lines').onchange=()=>guard(()=>{const next=Number($('lines').value);try{assertSaved();}catch(e){$('lines').value=selectedLine;throw e;}selectedLine=next;const l=current().lines[selectedLine];moves=l?l.moves.slice():[];$('feedback').value=l?.feedback||'';$('correct').value=String(l?.correct??true);$('tool').value='line';$('lines').value=selectedLine;pending=null;draw();});
    function record(i){if(moves.length>=100)throw Error(t('每条答案最多 100 手，请拆成下一章。','Each answer supports 100 moves. Continue in a new chapter.'));P.replay(current(),moves.concat(i));moves.push(i);lineDirty=true;changed();}
    const handlers={
      discardline(){if(window.confirm(t('放弃这次录制？已完成的答案会保留。','Discard this recording? Saved answers will remain.')))resetLine();},
      next(){goStep(Math.min(3,step+1));},
      example(){assertSaved();const c=P.chapter();c.title=t('抓住只剩一口气的白子','Capture the white stone');c.body=t('黑先。角上的白子只剩一口气，试着提掉它。','Black to play. Capture the white stone in the corner.');c.stones[0]=2;c.stones[9]=1;c.hints=[t('找到白子相邻的空点。','Find the empty point next to White.')];c.lines=[{moves:[1],correct:true,feedback:t('做得好，填住最后一口气就能提子。','Well done. Filling the last liberty captures the stone.')}];add(c);message(t('示例已准备好。点“写答案”查看已有答案，或直接预览试做。','Example ready. Open Add answers to inspect it, or preview it.'));},
      setupundo(){if(setupHistory.length){current().stones=setupHistory.pop();pending=null;changed();draw();}},
      editsetup(){if(window.confirm(t('修改题面需要清除本章答案，是否继续？','Changing the position clears this chapter’s answers. Continue?'))){current().lines=[];resetLine();changed();draw();}},
      close(){assertSaved();d.close();},
      add(){add(P.chapter(Number($('size').value)));},
      capture(){const s=options.snapshot();const c=P.chapter(s.size);c.stones=Array.from(s.board);c.turn=s.turn;c.rules=s.rules;c.title=s.title||t('棋局片段','Game position');c.body=s.body||'';add(c);},
      up(){assertSaved();if(active>0){[draft.chapters[active-1],draft.chapters[active]]=[draft.chapters[active],draft.chapters[active-1]];active--;changed();renderChapters();}},
      down(){assertSaved();if(active<draft.chapters.length-1){[draft.chapters[active+1],draft.chapters[active]]=[draft.chapters[active],draft.chapters[active+1]];active++;changed();renderChapters();}},
      remove(){assertSaved();if(draft.chapters.length>1&&window.confirm(t('删除当前章节及其答案？','Delete this chapter and its answers?'))){draft.chapters.splice(active,1);active=Math.min(active,draft.chapters.length-1);resetLine();changed();fields();}},
      apply(){if(pending===null)return;const c=current(),i=pending,tool=$('tool').value;if(tool==='line')record(i);else if(tool==='mark'){c.marks=c.marks.includes(i)?c.marks.filter(x=>x!==i):c.marks.concat(i);changed();}else{if(c.lines.length||moves.length)throw Error(t('这道题已有答案。请先点“修改题面”，再重新摆子。','This question has answers. Choose Change position before editing stones.'));setupHistory.push(c.stones.slice());if(setupHistory.length>100)setupHistory.shift();c.stones[i]=tool==='black'?1:tool==='white'?2:0;changed();}pending=null;draw();},
      cancel(){pending=null;draw();},
      pass(){if($('tool').value==='line'){record(-1);pending=null;draw();}},
      undo(){if(moves.length){moves.pop();lineDirty=true;pending=null;changed();draw();}},
      resetline(){assertSaved();resetLine();},
      saveline(){if(!moves.length)throw Error(t('请先在棋盘录制着手。','Record moves on the board first.'));const copy=JSON.parse(JSON.stringify(draft)),line={moves:moves.slice(),correct:$('correct').value==='true',feedback:$('feedback').value};if(selectedLine<0)copy.chapters[active].lines.push(line);else copy.chapters[active].lines[selectedLine]=line;draft=P.normalize(copy);selectedLine=selectedLine<0?current().lines.length-1:selectedLine;lineDirty=false;changed();renderLines();draw();message(t('变化已保存到草稿。','Line saved in draft.'));},
      deleteline(){if(selectedLine<0)return;current().lines.splice(selectedLine,1);resetLine();changed();},
      json(){assertSaved();download(P.serialize(draft),filename('json'),'application/json');dirty=false;message(t('已发起下载，请在下载记录或“文件”中保留 JSON 文件，下次用“导入编辑文件”继续。','Download started. Keep the JSON file in Downloads or Files, then import it here to continue.'));},
      html(){assertSaved();download(P.html(draft,en),filename('html'),'text/html');message(t('已发起下载。把 HTML 文件发给对方，用浏览器打开即可作答；文件内也可保存编辑文件。','Download started. Share the HTML file and open it in a browser to practise. It also includes an editable-file download.'));},
      preview(){assertSaved();d.querySelector('iframe').srcdoc=P.html(draft,en);$('previewPanel').hidden=false;$('previewPanel').scrollIntoView({block:'start'});},
      closepreview(){$('previewPanel').hidden=true;d.querySelector('iframe').removeAttribute('srcdoc');},
      import(){assertSaved();$('file').click();}
    };
    Object.entries(handlers).forEach(([key,fn])=>{action(key).onclick=()=>guard(fn);});
    $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;const seq=++importSeq;try{if(file.size>2*1024*1024)throw Error(t('文件不得超过 2 MiB。','File must be at most 2 MiB.'));const imported=P.parse(await file.text());if(seq!==importSeq||dialog!==d||!d.open)return;assertSaved();if(dirty&&!window.confirm(t('用导入文件替换本次草稿？','Replace the current draft with this file?')))return;draft=imported;active=0;dirty=false;setupHistory=[];resetLine();fields();if(step===3)handlers.preview();message(t('讲义已导入。','Lesson imported.'));}catch(e){if(dialog===d)message(e.message);}finally{if(seq===importSeq)$('file').value='';}};
    d.addEventListener('cancel',e=>{try{assertSaved();}catch(error){e.preventDefault();message(error.message);}});
    d.addEventListener('close',()=>{d.remove();dialog=null;options.onClose?.();},{once:true});
    moves=[];selectedLine=-1;fields();d.showModal();
  }
  window.GoTStudio={open,isOpen:()=>!!dialog?.open};
})();
