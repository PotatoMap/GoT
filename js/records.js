/* Explicit record collection: imported SGF stays in memory for this session. */
(function () {
  'use strict';
  let lang='zh', query='', source='all';
  const expanded={builtin:true,imported:true,'历史名局':true,'AI 时代':true};
  const imported=[];
  let scrollTop=0;
  const dialog=document.createElement('dialog'); dialog.className='dialog catalog-dialog records-dialog';
  dialog.setAttribute('aria-label','棋谱浏览'); document.body.append(dialog);
  dialog.id='recordsDialog';
  dialog.addEventListener('scroll',e=>{if(e.target.matches('.catalog-list'))scrollTop=e.target.scrollTop;},true);
  const nav=document.getElementById('openBtn');
  nav.setAttribute('aria-controls',dialog.id);nav.setAttribute('aria-expanded','false');
  dialog.addEventListener('close',()=>{if(!dialog.open)nav.setAttribute('aria-expanded','false');});
  const tr=(zh,en)=>lang==='zh'?zh:en;
  const element=(tag,text,cls)=>{const el=document.createElement(tag); if(text)el.textContent=text; if(cls)el.className=cls; return el;};
  const collectionLabel=(row)=>lang==='zh'?(row.collection|| (row.builtin?'精选名局':'本次导入')):(row.collectionEn || row.collection || (row.builtin?'Selected games':'Imported this session'));
  const sourceMatches=(row)=>source==='all'||(source==='builtin'&&row.builtin)||(source==='modern'&&row.collection==='AI 时代')||(source==='famous'&&row.collection==='历史名局')||(source==='imported'&&!row.builtin);
  function rows() {
    return [
      ...imported.map(item=>Object.assign({builtin:false,collection:'本次导入',collectionEn:'Imported this session'},item)),
      ...(window.GoTLearning?.LIBRARY||[]).map(item=>Object.assign({},item,{name:tr(item.title,item.titleEn||item.title),meta:tr(item.meta,item.metaEn||item.meta),collection:item.collection||(/AlphaGo|Master/i.test(item.title||'')?'AI 时代':'精选名局'),collectionEn:item.collectionEn||(/AlphaGo|Master/i.test(item.titleEn||item.title||'')?'AI era':'Selected games'),builtin:true}))
    ];
  }
  function renderList() {
    const list=dialog.querySelector('.catalog-list'); if(!list)return;
    list.replaceChildren();
    const matches=rows().filter(r=>sourceMatches(r) && (r.name+' '+r.meta+' '+collectionLabel(r)+' '+(r.tags||[]).join(' ')).toLowerCase().includes(query.toLowerCase()));
    dialog.querySelector('.catalog-count').textContent=tr(`${matches.length} 份棋谱`,`${matches.length} records`);
    if(!matches.length) { list.append(element('p',tr('暂无匹配棋谱。可以修改搜索条件，或添加本地棋谱。','No matching records. Change the filters or add local files.'),'dialog-hint')); return; }
    const groups={};
    const grouped=new Map();
    matches.forEach((row)=>{const key=row.builtin?(row.collection||'精选名局'):'imported';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);});
    for(const [key,items] of grouped) {
      const group=element('details',null,'catalog-group');group.open=!!query || expanded[key]!==false;
      group.dataset.catalogGroup=key;
      group.ontoggle=()=>{expanded[key]=group.open;};
      const summary=element('summary',collectionLabel(items[0])+' · '+items.length);
      summary.setAttribute('aria-label',collectionLabel(items[0])+' · '+items.length);
      group.append(summary);list.append(group);groups[key]=group;
    }
    matches.forEach(r=>{
      const row=element('button',null,'record-row catalog-row'); row.type='button';
      const copy=element('span',null,'record-copy'); copy.append(element('strong',r.name),element('small',r.meta));
      row.append(copy,element('span',collectionLabel(r),'record-source'),element('span',tr('查看','Details'),'record-open'));
      row.setAttribute('aria-expanded','false');
      row.onclick=()=>{
        const wasOpen=row.getAttribute('aria-expanded')==='true';
        const old=list.querySelector('.record-preview');if(old)old.remove();
        for(const b of list.querySelectorAll('.record-row'))b.setAttribute('aria-expanded','false');
        if(wasOpen)return;
        row.setAttribute('aria-expanded','true');
        const preview=element('section',null,'record-preview');
        preview.append(element('strong',r.name),element('p',r.meta,'dialog-hint'));
        if(r.source||r.sourceEn) preview.append(element('p',lang==='zh'?(r.source||''):(r.sourceEn||r.source||''),'record-preview-source'));
        const actions=element('div',null,'record-preview-actions');
        if(r.sourceUrl) { const link=element('a',tr('查看公开来源','Open public source'),'btn ghost record-preview-action record-source-link'); link.href=r.sourceUrl; link.target='_blank'; link.rel='noreferrer'; actions.append(link); }
        const open=element('button',tr('进入复盘','Review this game'),'btn primary record-preview-action');open.type='button';
        open.onclick=()=>{dialog.close();document.dispatchEvent(new CustomEvent('got:learning-open-sgf',{detail:{sgf:r.sgf,title:r.name}}));};
        actions.append(open); preview.append(actions);row.after(preview);open.focus({preventScroll:true});
      };
      groups[r.builtin?(r.collection||'精选名局'):'imported'].append(row);
    });
  }
  function render() {
    dialog.replaceChildren(); dialog.setAttribute('aria-label',tr('棋谱浏览','Record browser'));
    const heading=element('div',null,'browse-heading catalog-heading'),title=element('h2',tr('棋谱浏览','Browse records'));
    const close=element('button',tr('返回棋盘','Back to board'),'btn ghost'); close.type='button'; close.onclick=()=>dialog.close(); heading.append(title,close);
    const note=element('p',tr('按资料集查找名局，先查看信息，再进入复盘。可选择包含标准 .sgf 的文件夹批量读取；导入记录只保留到关闭或刷新页面。','Browse by collection, preview the record, then enter review. Choose a folder with standard .sgf files to import them in one pass; imports are kept until this page is closed or refreshed.'),'dialog-hint catalog-note');
    const filters=element('div',null,'browse-filters catalog-filters'),search=element('input'); search.type='search'; search.value=query;
    search.placeholder=tr('搜索棋手、标题、文件名','Search players, titles or filenames'); search.setAttribute('aria-label',search.placeholder);
    search.oninput=()=>{query=search.value;renderList();};
    const select=element('select'); select.setAttribute('aria-label',tr('棋谱来源','Record source'));
    [['all','全部棋谱','All records'],['builtin','全部内置','All built-in'],['modern','AI 时代','AI era'],['famous','历史名局','Historic classics'],['imported','本次导入','Imported']].forEach(([v,zh,en])=>{const o=element('option',tr(zh,en));o.value=v;select.append(o);});select.value=source; select.onchange=()=>{source=select.value;renderList();};
    const actions=element('div',null,'catalog-filter-actions');
    const folder=element('button',tr('读取文件夹','Read folder'),'btn ghost');folder.type='button';folder.onclick=()=>document.getElementById('folderInput')?.click();
    const add=element('button',tr('添加棋谱','Add records'),'btn primary');add.type='button';add.onclick=()=>document.getElementById('fileInput')?.click();
    actions.append(folder,add); filters.append(search,select,actions);
    const count=element('p',null,'browse-count catalog-count');count.setAttribute('role','status');
    dialog.append(heading,note,filters,count,element('div',null,'record-list catalog-list'));renderList();
  }
  window.GoTRecords={
    open(next){const saved=scrollTop;lang=next||lang;render();document.getElementById('problemDialog')?.close();if(!dialog.open)dialog.show();dialog.querySelector('.catalog-list').scrollTop=saved;nav.setAttribute('aria-expanded','true');},
    close(){if(dialog.open)dialog.close();},
    setLanguage(next){lang=next; if(dialog.open)render();},
    add(name,sgf,game,next){lang=next||lang;const existing=imported.find(r=>r.name===name&&r.sgf===sgf);if(!existing)imported.unshift({name,sgf,meta:`${game.size} × ${game.size} · ${game.playerNames?.[1]||'Black'} / ${game.playerNames?.[2]||'White'}`,collection:'本次导入',collectionEn:'Imported this session'});if(dialog.open)renderList();}
  };
})();
