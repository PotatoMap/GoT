import { BoardView } from './board-view.js';

function waitForCanvasFade(canvas){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
  return new Promise(resolve=>{
    let timer;
    const done=()=>{clearTimeout(timer);canvas.removeEventListener('transitionend',onEnd);resolve();};
    const onEnd=event=>{if(event.target===canvas&&event.propertyName==='opacity')done();};
    canvas.addEventListener('transitionend',onEnd);
    timer=setTimeout(done,320);
    requestAnimationFrame(()=>{
      if(getComputedStyle(canvas).transitionDuration==='0s')done();
    });
  });
}

/* Bridges the production BoardRenderer's live position/overlays to the 2.5D
 * Three.js board. The rule engine and input state remain owned by app.js. */
export class Board3DAdapter {
  constructor(classic, stage, onFailure, appearance={}) {
    this.classic=classic;this.canvas=classic.canvas;this.stage=stage;this.onFailure=onFailure;
    this.opts=classic.opts;this.active=false;this.switching=false;this.failed=false;
    this.finishKey='';this.coordinateState=null;this.lastSize=0;
    this.appearance={background:appearance.background||'dark',finish:appearance.finish||'kaya',tone:appearance.tone||'deep',gloss:appearance.gloss||'satin',stoneMaterial:appearance.stoneMaterial||'yunzi',stoneShape:appearance.stoneShape||'single',lighting:appearance.lighting||'daylight',sharedLighting:appearance.sharedLighting!==false,enhancedShadows:appearance.enhancedShadows!==false,quality:appearance.quality||'auto',animations:appearance.animations!==false,animationSpeed:[0.75,1,1.25,1.5].includes(appearance.animationSpeed)?appearance.animationSpeed:1.25,cameraAngle:Number.isFinite(appearance.cameraAngle)?Math.max(0,Math.min(60,appearance.cameraAngle)):54,gridScale:Number.isFinite(appearance.gridScale)?Math.max(.8,Math.min(1,appearance.gridScale)):1};
    this.webglCanvas=document.createElement('canvas');this.webglCanvas.className='board-three-canvas';
    this.webglCanvas.setAttribute('aria-hidden','true');stage.insertBefore(this.webglCanvas,this.canvas);
    try{this.view=new BoardView(this.webglCanvas,stage,null,this.canvas,{...this.appearance,stoneOffset:(x,y,size)=>this.classic.naturalStoneOffset(x,y,size)});}
    catch(error){this.webglCanvas.remove();throw error;}
    this.view.onRenderError=error=>this.fail(error);
    this.view.onAssetError=()=>stage.dispatchEvent(new CustomEvent('boardtextureerror'));
    this.contextLost=event=>{event.preventDefault();this.fail(new Error('WebGL context lost'));};
    this.webglCanvas.addEventListener('webglcontextlost',this.contextLost);
    this.viewCanvasResize=()=>{if(this.active)this.view.resize();};
    this.canvas.addEventListener('resize',this.viewCanvasResize);
    this.projectionInstalled=false;
  }
  get zoom(){return this.classic.zoom;}
  classicCell(){
    const size=Math.max(2,this.classic.size||19),cssSize=this.classic.cssSize||0,margin=this.classic.margin||0;
    return Math.max(0,(cssSize-2*margin)/(size-1));
  }
  project(x,y){return this.view.screenPoint(x,y,this.classic.size,!!this.opts.flip);}
  projectedCell(){
    const size=this.classic.size,mid=Math.floor((size-1)/2),a=this.project(mid,mid),b=this.project(Math.min(size-1,mid+1),mid),c=this.project(mid,Math.min(size-1,mid+1));
    const dx=size===1?0:Math.hypot(b.x-a.x,b.y-a.y),dy=size===1?0:Math.hypot(c.x-a.x,c.y-a.y);
    return (dx+dy)/2;
  }
  installProjection(){
    if(this.projectionInstalled)return;
    this.classic.projectedPoint=(x,y)=>{
      const p=this.project(x,y),rect=this.canvas.getBoundingClientRect();
      return {x:(p.x-rect.left)*this.classic.dpr,y:(p.y-rect.top)*this.classic.dpr};
    };
    this.classic.visualStonePoint=(x,y)=>{
      const offset=this.classic.naturalStoneOffset(x,y,this.classic.size),p=this.project(x+offset.x,y+offset.y);
      const rect=this.canvas.getBoundingClientRect();return {x:(p.x-rect.left)*this.classic.dpr,y:(p.y-rect.top)*this.classic.dpr};
    };
    Object.defineProperty(this.classic,'cell',{configurable:true,get:()=>this.projectedCell()});this.projectionInstalled=true;
  }
  restoreProjection(){
    if(!this.projectionInstalled)return;
    delete this.classic.projectedPoint;delete this.classic.cell;delete this.classic.visualStonePoint;this.projectionInstalled=false;
  }
  pointAt(x,y){return this.active?this.view.pick(x,y,this.classic.size,!!this.opts.flip):this.classic.pointAt(x,y);}
  set(options){
    this.classic.set(options);this.opts=this.classic.opts;
    if(this.active)this.syncView();
  }
  requestRender(){this.classic.requestRender();if(this.active)this.view.render();}
  syncOverlayCanvas(){
    if(!this.active)return;
    const rect=this.webglCanvas.getBoundingClientRect(),dpr=this.classic.dpr||devicePixelRatio||1;
    this.canvas.dataset.boardLogicalWidth=String(this.classic.cssSize||rect.width);
    this.canvas.style.width=rect.width+'px';
    const width=Math.round(rect.width*dpr);
    if(this.canvas.width!==width)this.canvas.width=width;
  }
  restoreOverlayCanvas(){
    delete this.canvas.dataset.boardLogicalWidth;
    this.classic.resizeTo(this.stage);
  }
  resizeTo(stage){
    this.classic.resizeTo(stage);
    if(this.active)this.canvas.dataset.boardLogicalWidth=String(this.classic.cssSize||this.canvas.clientWidth);
    requestAnimationFrame(()=>{if(this.active){this.view.resize();this.syncOverlayCanvas();this.view.setReferenceCell(this.classicCell());}});
  }
  panBy(dx,dy){if(!this.active)this.classic.panBy(dx,dy);}
  setZoom(value,point){if(!this.active)this.classic.setZoom(value,point);}
  syncView(){
    const o=this.opts,size=o.size||19,material=[this.appearance.finish,this.appearance.tone];
    this.view.setSize(size);
    if(this.view.background!==this.appearance.background)this.view.setBackground(this.appearance.background);
    this.view.setReferenceCell(this.classicCell());
    const finishKey=material.join(':');
    if(this.finishKey!==finishKey){this.view.setFinish(...material);this.finishKey=finishKey;if(this.view.finish.textureAsset)this.view.loadFinishAsset(this.view.finish.id);}
    if(this.view.gloss!==this.appearance.gloss)this.view.setGloss(this.appearance.gloss);
    if(this.view.stoneMaterial!==this.appearance.stoneMaterial)this.view.setStoneMaterial(this.appearance.stoneMaterial);
    if(this.view.stoneShape!==this.appearance.stoneShape)this.view.setStoneShape(this.appearance.stoneShape);
    if(this.view.cameraAngle!==this.appearance.cameraAngle)this.view.setCameraAngle(this.appearance.cameraAngle);
    if(Math.abs(this.view.gridSpan/18.9-this.appearance.gridScale)>1e-5)this.view.setGridScale(this.appearance.gridScale);
    this.view.setStoneOffsetEnabled(this.appearance.naturalPlacement!==false);
    if(this.view.lighting!==this.appearance.lighting)this.view.setLighting(this.appearance.lighting);
    if(this.view.sharedLighting!==this.appearance.sharedLighting)this.view.setSharedLighting(this.appearance.sharedLighting);
    if(this.view.enhancedShadows!==this.appearance.enhancedShadows)this.view.setEnhancedShadows(this.appearance.enhancedShadows);
    this.view.setQuality(this.appearance.quality);
    if(this.view.animationsEnabled!==this.appearance.animations)this.view.setAnimations(this.appearance.animations);
    if(this.view.animationSpeed!==this.appearance.animationSpeed)this.view.setAnimationSpeed(this.appearance.animationSpeed);
    if(this.lastSize!==size){this.lastSize=size;this.coordinateState=null;}
    const coordinates=`${!!o.showCoords}:${!!o.flip}`;
    if(this.coordinateState!==coordinates){this.view.setCoordinates(!!o.showCoords,!!o.flip);this.coordinateState=coordinates;}
    this.classic.stones=o.stones||this.classic.stones;
    const board=o.stones||this.classic.stones,i=o.lastMove,move=i>=0&&i<board.length?{x:i%size,y:Math.floor(i/size),color:board[i]}:null;
    const pending=this.nextMoveAnimation,now=performance.now();
    const pendingIndex=pending?pending.y*size+pending.x:-1;
    const pendingReached=!!pending&&i===pendingIndex&&board[pendingIndex]===pending.color;
    const animateMove=pendingReached&&now-pending.queuedAt<1200?pending:null;
    this.view.sync({size,board,flip:!!o.flip,moves:move?[move]:[]},false,animateMove);
    // Other view refreshes can run before renderBoard publishes the new game
    // position. Keep the request until its exact stone appears on the board.
    if(pendingReached||pending&&now-pending.queuedAt>=1200)this.nextMoveAnimation=null;
    this.view.setPreview(o.preview?.length?null:o.pending?{...o.pending,pending:true}:o.hover,!!o.flip);
  }
  queueMoveAnimation(move){if(this.active&&move&&!move.pass)this.nextMoveAnimation={...move,queuedAt:performance.now()};}
  snapshot(){
    const snapshot=document.createElement('canvas'),rect=this.canvas.getBoundingClientRect(),stageRect=this.stage.getBoundingClientRect();
    snapshot.width=this.canvas.width;snapshot.height=this.canvas.height;snapshot.className='board-view-snapshot';snapshot.setAttribute('aria-hidden','true');
    Object.assign(snapshot.style,{width:rect.width+'px',height:rect.height+'px',left:(rect.left-stageRect.left)+'px',top:(rect.top-stageRect.top)+'px'});
    const ctx=snapshot.getContext('2d');
    if(this.active){
      this.view.renderer.render(this.view.scene,this.view.camera);
      const canvasRect=this.webglCanvas.getBoundingClientRect(),pixelRatio=this.view.renderer.getPixelRatio();
      const cropX=Math.max(0,(r.left-canvasRect.left)*pixelRatio),cropWidth=r.width*pixelRatio;
      ctx.drawImage(this.webglCanvas,cropX,0,cropWidth,this.webglCanvas.height,0,0,snapshot.width,snapshot.height);
    }
    this.classic.render();ctx.drawImage(this.canvas,0,0);this.stage.append(snapshot);return snapshot;
  }
  async renderPhotoCanvas(targetSize=2400){
    if(!this.active||this.failed||this.view.disposed)throw new Error('2.5D 棋盘当前不可用');
    const started=performance.now();
    while(this.view.effects?.length&&performance.now()-started<900)await new Promise(resolve=>requestAnimationFrame(resolve));
    const renderer=this.view.renderer,canvas=this.webglCanvas,oldPixelRatio=renderer.getPixelRatio();
    const oldSize={set(x,y){this.x=x;this.y=y;return this;}};renderer.getSize(oldSize);
    const flags=[this.view.last.visible,this.view.previewStone.visible,this.view.cursor.visible];
    const photo=document.createElement('canvas'),maxSize=renderer.capabilities.maxTextureSize||3072;photo.width=photo.height=Math.max(1200,Math.min(3072,maxSize,Math.round(targetSize)));
    try{
      this.view.last.visible=false;this.view.previewStone.visible=false;this.view.cursor.visible=false;
      renderer.setPixelRatio(1);renderer.setSize(photo.width,photo.height,false);
      renderer.render(this.view.scene,this.view.camera);
      photo.getContext('2d').drawImage(canvas,0,0,photo.width,photo.height);
      return photo;
    }finally{
      this.view.last.visible=flags[0];this.view.previewStone.visible=flags[1];this.view.cursor.visible=flags[2];
      renderer.setPixelRatio(oldPixelRatio);renderer.setSize(oldSize.x,oldSize.y,false);this.view.render();
    }
  }
  setAppearance(appearance={}){
    this.appearance={...this.appearance,...appearance};
    if(this.active)this.syncView();
  }
  setCameraAngle(degrees){
    const value=Number(degrees);
    if(!Number.isFinite(value))return;
    this.appearance.cameraAngle=Math.max(0,Math.min(60,value));
    if(!this.active)return;
    this.view.setCameraAngle(this.appearance.cameraAngle);
    // The classic canvas owns projected labels and analysis marks. Redraw it
    // against the updated camera without rebuilding every stone instance.
    this.classic.requestRender();
  }
  async setMode(enabled){
    if(this.failed)throw new Error('Three.js board has failed');
    if(this.switching)throw new Error('Board view transition is already running');
    this.switching=true;
    let snapshot;
    try{
      if(enabled)await this.view.ready;
      if(this.failed||this.view.disposed)return;
      snapshot=this.snapshot();
      if(enabled){
        this.webglCanvas.style.removeProperty('opacity');
        this.syncView();this.active=true;
        if(this.classic.zoom!==1)this.classic.setZoom(1);
        this.installProjection();
        this.classic.set({overlayOnly:true});this.view.resize();
        this.syncOverlayCanvas();
        this.stage.classList.add('board-stage-25d');
        this.requestRender();
      }else{
        // Reveal the native board under the 2.5D layer, then let CSS dissolve
        // the latter. The camera never moves, so board scale stays constant.
        this.view.clearEffects();this.classic.set({overlayOnly:false});
        this.active=false;this.stage.classList.remove('board-stage-25d');
        this.restoreProjection();
        this.restoreOverlayCanvas();
        this.requestRender();
      }
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&snapshot.animate){
        await snapshot.animate([{opacity:1},{opacity:0}],{duration:220,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{});
      }
    }finally{
      snapshot?.remove();
      this.switching=false;
    }
  }
  fail(error){
    if(this.failed)return;this.failed=true;this.switching=false;this.active=false;
    try{this.classic.set({overlayOnly:false});this.stage.classList.remove('board-stage-25d');this.restoreOverlayCanvas();this.dispose();}catch(_){}
    this.onFailure?.(error);
  }
  dispose(){
    this.webglCanvas.removeEventListener('webglcontextlost',this.contextLost);
    this.canvas.removeEventListener('resize',this.viewCanvasResize);
    this.restoreOverlayCanvas();
    this.view.dispose();this.webglCanvas.remove();
    this.restoreProjection();
    this.classic.set({overlayOnly:false});
  }
}
