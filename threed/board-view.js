import { tableSurface } from './table-surfaces.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD_SPAN, worldPoint, nearestPoint, boardSpacing, SPACING_Z } from './model.js';
import { woodTextures, loadWoodSources, loadFinishTexture, boardMarkings, contactTexture, stoneMaterials, windowEnvironment } from './materials.js';
import { resolveFinish } from './board-finishes.js';
import { createStoneGeometry, STONE_SHAPES, LIGHTING } from './stone-geometry.js';
import { resolveQuality } from './quality.js';

const TOP = .68;
// Keep the stone heel just above the printed grid and its contact shadow almost
// on the same plane. Larger offsets made the whole assembly read as a overlay.
const STONE_REST_Y = TOP + .0035;
const CONTACT_Y = TOP + .00315;
const BOARD_THICKNESS = 2;
const GROUND_CLEARANCE = .08;
const CAMERA_MIN_ANGLE = 0;
const CAMERA_MAX_ANGLE = 60;
const CAMERA_DISTANCE = Math.hypot(35,15.5);
const CAMERA_BASE_FOV = 30;
const DEFAULT_CAMERA_ANGLE = Math.atan2(15.5,35)*180/Math.PI;
function boardMarkingsMaterial(map,sharedLighting){
  const common={map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1};
  return sharedLighting
    ?new THREE.MeshStandardMaterial({...common,roughness:.96,metalness:0,alphaTest:.025})
    :new THREE.MeshBasicMaterial(common);
}
export class BoardView {
  constructor(canvas, stage, detailCanvas=null, mappingCanvas=null, options={}) {
    this.canvas = canvas; this.stage = stage; this.mappingCanvas=mappingCanvas; this.frame = 0; this.disposed = false; this.boardSize=19;
    this.qualityName=options.quality||'auto';this.quality=this.chooseQuality(this.qualityName);
    this.stoneOffset=options.stoneOffset||(()=>({x:0,y:0}));this.naturalPlacement=options.naturalPlacement!==false;
    this.animationsEnabled=options.animations!==false;this.animationSpeed=[0.75,1,1.25,1.5].includes(options.animationSpeed)?options.animationSpeed:1.25;this.effects=[];this.stoneSlots=new Map();this.contactSlots=new Map();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'default' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    // PCF honors shadow.radius; PCFSoft ignores it and made the detail shadows hard.
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .94;
    this.scene = new THREE.Scene(); this.renderer.setClearColor(0,0);
    // Perspective makes the far grid rows recede while the near rows spread,
    // matching the physical board view expected from the angle control.
    this.camera = new THREE.PerspectiveCamera(30,1,.1,100);
    // Keep screen-up aligned with the far edge; world-up becomes parallel to
    // the view ray at 0° and makes lookAt roll unpredictably.
    this.camera.up.set(0,0,-1);
    this.cameraDistance=CAMERA_DISTANCE;this.cameraAngle=DEFAULT_CAMERA_ANGLE;
    this.setCameraAngle(options.cameraAngle??DEFAULT_CAMERA_ANGLE,false);this.camera.lookAt(0,0,0);
    this.sharedLighting=options.sharedLighting!==false;
    this.enhancedShadows=options.enhancedShadows!==false;
    this.ambient=new THREE.HemisphereLight('#fff7e5','#aa8a60',.5);this.scene.add(this.ambient);
    const light = new THREE.DirectionalLight('#fff3d8',1.55); light.position.set(-10,22,-9); light.castShadow = true;
    const shadowBound=this.sharedLighting?12:16;light.shadow.mapSize.set(2048,2048); Object.assign(light.shadow.camera, { left:-shadowBound,right:shadowBound,top:shadowBound,bottom:-shadowBound,near:1,far:60 });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.normalBias=this.enhancedShadows ? .004 : (this.sharedLighting ? .009 : .012); light.shadow.bias=-.00008; light.shadow.radius=this.enhancedShadows?(this.sharedLighting?1.8:2.4):(this.sharedLighting?4.5:5.5);
    this.keyLight=light;
    this.scene.add(light);
    const fill = new THREE.DirectionalLight('#e8efff',.52); fill.position.set(12,12,8); this.scene.add(fill);
    this.fillLight=fill;
    const localFill=new THREE.PointLight('#fff0dc',0,38,2);localFill.position.set(-9,11,-8);this.localFill=localFill;this.scene.add(localFill);
    const env = windowEnvironment(); const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(env,.025); this.scene.environment=this.environment.texture;
    env.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();

    const groundMaterial=new THREE.ShadowMaterial({opacity:this.enhancedShadows ? .11 : .055});this.groundMaterial=groundMaterial;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),groundMaterial);
    ground.rotation.x=-Math.PI/2; ground.position.y=TOP-BOARD_THICKNESS-GROUND_CLEARANCE; ground.receiveShadow=true; this.scene.add(ground);this.ground=ground;this.background='dark';
    this.setBackground(options.background||'dark',false);
    this.finish=resolveFinish('kaya','deep');this.finishBitmap=null;this.finishBitmapId='';this.gloss=options.gloss||'satin';this.stoneMaterial=options.stoneMaterial||'yunzi';this.showCoordinates=true;this.gridSpan=BOARD_SPAN;
    const wood = woodTextures(this.finish);
    const side = new THREE.MeshStandardMaterial({ map:wood.side,roughness:.8 });
    const top = new THREE.MeshStandardMaterial({ map:wood.top,roughness:.72,bumpMap:wood.top,bumpScale:.011 });top.normalScale.set(this.sharedLighting ? .42 : .16,this.sharedLighting ? .42 : .16);
    this.boardTop=top;this.boardSide=side;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(20,BOARD_THICKNESS,20.8,5,.16),[side,side,top,side,side,side]);
    slab.position.y=TOP-BOARD_THICKNESS/2; slab.castShadow=true; slab.receiveShadow=true; this.scene.add(slab);
    this.markings = new THREE.Mesh(new THREE.PlaneGeometry(20,20.8),boardMarkingsMaterial(boardMarkings(true,this.finish,this.boardSize,false,this.gridSpan),this.sharedLighting));
    this.markings.rotation.x=-Math.PI/2; this.markings.position.y=TOP+.003;this.markings.receiveShadow=this.sharedLighting;this.scene.add(this.markings);
    this.stoneShape='single';this.stoneGeometry=createStoneGeometry(this.stoneShape,this.quality.segments);
    this.materials = stoneMaterials(this.stoneMaterial);
    this.contactGeometry = new THREE.PlaneGeometry(1.22,1.22);
    this.contactMaterial = new THREE.MeshBasicMaterial({ map:contactTexture('single',this.sharedLighting,this.enhancedShadows),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2 });
    this.stones = [null, ...this.materials.slice(1).map(material=>{
      const mesh=new THREE.InstancedMesh(this.stoneGeometry,material,361);
      mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(mesh);return mesh;
    })];
    this.contacts=new THREE.InstancedMesh(this.contactGeometry,this.contactMaterial,361);
    this.contacts.count=0;this.contacts.frustumCulled=false;this.contacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.contacts);
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(.34,.38,48),new THREE.MeshBasicMaterial({ color:'#355039',depthTest:false }));
    this.cursor.rotation.x=-Math.PI/2; this.cursor.visible=false; this.cursor.renderOrder=5; this.scene.add(this.cursor);
    this.previewMaterials=this.materials.slice(1).map(m=>{const copy=m.clone();copy.transparent=true;copy.opacity=.46;copy.depthWrite=false;return copy;});
    this.previewStone=new THREE.Mesh(this.stoneGeometry,this.previewMaterials[0]);this.previewStone.visible=false;this.previewStone.renderOrder=4;this.scene.add(this.previewStone);
    this.last = new THREE.Mesh(new THREE.RingGeometry(.095,.127,32),new THREE.MeshBasicMaterial({ color:'#c9b58b',depthTest:false }));
    this.last.rotation.x=-Math.PI/2; this.last.visible=false; this.last.renderOrder=6; this.scene.add(this.last);
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0,1,0),-TOP);
    this.detailCanvas=detailCanvas;if(detailCanvas)this.createDetailScene();
    this.setLighting('daylight');
    this.observer = new ResizeObserver(()=>{if(!document.body.classList.contains('tutor-layout-moving'))this.resize();}); this.observer.observe(stage);if(detailCanvas)this.observer.observe(detailCanvas);this.resize();
    this.applyQuality();this.ready=this.loadMaterials();
  }
  chooseQuality(name){return resolveQuality(name,{mobile:matchMedia('(pointer:coarse), (max-width:780px)').matches,memory:navigator.deviceMemory||8});}
  applyQuality(){
    const q=this.quality;this.renderer.shadowMap.enabled=q.shadowSize>0;
    for(const key of [this.keyLight,this.detailKey].filter(Boolean)){
      key.shadow.map?.dispose();key.shadow.map=null;key.shadow.mapSize.set(q.shadowSize||512,q.shadowSize||512);key.shadow.needsUpdate=true;
    }
    const anisotropy=Math.min(q.anisotropy,this.renderer.capabilities.getMaxAnisotropy());
    for(const m of [this.boardTop,this.boardSide,this.markings.material])for(const key of ['map','normalMap','roughnessMap'])if(m[key]){m[key].anisotropy=anisotropy;m[key].needsUpdate=true;}
    this.resize();
  }
  async loadMaterials(){
    this.assetController?.abort();const controller=new AbortController();this.assetController=controller;
    const timeout=setTimeout(()=>controller.abort(),12000);let sources;
    try{
      sources=await loadWoodSources(this.quality.textureSize,controller.signal);
      if(this.disposed||this.assetController!==controller){Object.values(sources).forEach(b=>b.close());return false;}
      const old=this.woodSources;this.woodSources=sources;
      this.setFinish(this.finish.id,this.finish.tone,true);Object.values(old||{}).forEach(b=>b.close());
      if(this.finish.textureAsset)this.loadFinishAsset(this.finish.id);
      return true;
    }catch(error){if(!this.disposed&&this.assetController===controller)this.onAssetError?.(error);return false;}
    finally{clearTimeout(timeout);}
  }
  async loadFinishAsset(id){
    const finish=resolveFinish(id,this.finish.tone);if(!finish.textureAsset)return false;
    if(this.finishBitmapId===id&&this.finishBitmap)return true;
    this.finishAssetController?.abort();const controller=new AbortController();this.finishAssetController=controller;
    try{
      const bitmap=await loadFinishTexture(finish.textureAsset,this.quality.textureSize,controller.signal);
      if(this.disposed||this.finishAssetController!==controller||this.finish.id!==id){bitmap.close();return false;}
      this.finishBitmap?.close();this.finishBitmap=bitmap;this.finishBitmapId=id;this.setFinish(this.finish.id,this.finish.tone,true);return true;
    }catch(error){if(!controller.signal.aborted&&!this.disposed)this.onAssetError?.(error);return false;}
  }
  setQuality(name){
    if(name===this.qualityName)return;
    this.qualityName=name;this.quality=this.chooseQuality(name);this.setStoneShape(this.stoneShape,true);this.applyQuality();this.ready=this.loadMaterials();
  }
  setAnimations(enabled){this.animationsEnabled=enabled!==false;if(!this.animationsEnabled){this.clearEffects();if(this.model)this.sync(this.model,this.markLast);}}
  setAnimationSpeed(speed){const value=Number(speed);if([0.75,1,1.25,1.5].includes(value))this.animationSpeed=value;}
  motionAllowed(){return this.animationsEnabled;}
  createDetailScene(){
    this.detailScene=new THREE.Scene();this.detailScene.background=new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()||'#23272d');this.detailScene.environment=this.environment.texture;
    this.detailCamera=new THREE.OrthographicCamera(-1.75,1.75,1.05,-1.05,.1,20);
    this.detailCamera.position.set(0,7,3);this.detailCamera.lookAt(0,.1,0);
    this.detailAmbient=this.ambient.clone();this.detailKey=this.keyLight.clone();this.detailFill=this.fillLight.clone();this.detailLocalFill=this.localFill.clone();
    this.detailKey.shadow.mapSize.set(1024,1024);Object.assign(this.detailKey.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:1,far:60});
    this.detailKey.shadow.camera.updateProjectionMatrix();this.detailKey.shadow.radius=this.enhancedShadows?1.8:4;
    this.detailKey.shadow.normalBias=.008;this.detailScene.add(this.detailAmbient,this.detailKey,this.detailFill,this.detailLocalFill);
    this.detailBoard=new THREE.Mesh(new THREE.BoxGeometry(8,.15,8),new THREE.MeshStandardMaterial({color:this.finish.top,roughness:.8}));
    this.detailBoard.position.y=-.075;this.detailBoard.receiveShadow=true;this.detailScene.add(this.detailBoard);
    this.detailStones=[];this.detailContacts=[];
    for(const color of [1,2]){
      const stone=new THREE.Mesh(this.stoneGeometry,this.materials[color]);stone.position.set(color===1?-.62:.62,.0035,0);stone.castShadow=true;stone.receiveShadow=true;this.detailScene.add(stone);this.detailStones.push(stone);
      const contact=new THREE.Mesh(this.contactGeometry,this.contactMaterial);contact.rotation.x=-Math.PI/2;contact.scale.setScalar(STONE_SHAPES[this.stoneShape].contactScale*(this.enhancedShadows?1.16:1));contact.position.set(stone.position.x,.00315,0);this.detailScene.add(contact);this.detailContacts.push(contact);
    }
  }
  resize() {
    const target=this.mappingCanvas||this.stage;
    const {width,height}=target.getBoundingClientRect(); if(!width || !height)return;
    const logicalWidth=Number(this.mappingCanvas?.dataset.boardLogicalWidth)||width;
    // Keep a little extra horizontal viewport in the stage's side margins.
    // The board pitch stays tied to the classic board, while the wider render
    // target gives the perspective slab and its edge shadows room to breathe.
    const sideRoom=Math.max(0,Math.floor((this.stage.clientWidth-logicalWidth)/2)-4);
    const sideBleed=Math.min(44,sideRoom),renderWidth=logicalWidth+sideBleed*2;
    if(this.mappingCanvas){const s=this.stage.getBoundingClientRect();Object.assign(this.canvas.style,{width:renderWidth+'px',height:height+'px',left:(this.stage.clientWidth-renderWidth)/2+'px',top:(target.getBoundingClientRect().top-s.top)+'px',transform:'none'});}
    // Supersample desktop 1x screens too: MSAA alone leaves small round stones jagged.
    const limit=Math.min(4096,this.renderer.capabilities.maxTextureSize);
    this.renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio || 1,this.quality.minDpr),this.quality.dpr,limit/Math.max(renderWidth,height))); this.renderer.setSize(renderWidth,height,false);
    // Match the native board's intersection spacing instead of fitting the
    // slab with excess margin; this keeps the playable grid from shrinking.
    this.camera.aspect=renderWidth/height;
    this.reframeCamera(); this.camera.updateMatrixWorld(); this.render();
  }
  pick(clientX,clientY,size=this.boardSize,flip=false) {
    const r=this.canvas.getBoundingClientRect(); if(!r.width || !r.height || clientX<r.left || clientX>r.right || clientY<r.top || clientY>r.bottom)return null;
    this.ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,1-(clientY-r.top)/r.height*2),this.camera);
    const hit=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());
    const point=hit&&nearestPoint(hit.x,hit.z,size,this.gridSpan);
    return point&&flip?{x:size-1-point.x,y:size-1-point.y}:point;
  }
  screenPoint(x,y,size=this.boardSize,flip=false) {
    const visualX=flip?size-1-x:x,visualY=flip?size-1-y:y,p=worldPoint(visualX,visualY,size,this.gridSpan);
    const v=new THREE.Vector3(p.x,TOP+.003,p.z).project(this.camera),r=this.canvas.getBoundingClientRect();
    return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  }
  setCameraAngle(degrees,draw=true) {
    const requested=Number(degrees),angle=THREE.MathUtils.clamp(Number.isFinite(requested)?requested:this.cameraAngle,CAMERA_MIN_ANGLE,CAMERA_MAX_ANGLE);
    this.cameraAngle=angle;
    const radians=THREE.MathUtils.degToRad(angle);
    this.reframeCamera(radians);
    if(draw)this.render();
    return angle;
  }
  setReferenceCell(cell) {
    const value=Number(cell);
    if(!Number.isFinite(value)||value<=0||Math.abs(value-(this.referenceCell||0))<.01)return;
    this.referenceCell=value;this.reframeCamera();this.render();
  }
  reframeCamera(radians=THREE.MathUtils.degToRad(this.cameraAngle)) {
    this.camera.fov=CAMERA_BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.updateCameraDistance();
    this.frameBoard(radians);
  }
  updateCameraDistance() {
    const height=this.mappingCanvas?.clientHeight||this.canvas.clientHeight||this.stage.clientHeight;
    if(!height||!this.referenceCell)return;
    const focal=height/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2));
    // Match the classic board's horizontal cell pitch exactly in top view.
    const physicalPitch=boardSpacing(this.boardSize,BOARD_SPAN);
    this.cameraDistance=focal*physicalPitch/this.referenceCell;
  }
  frameBoard(radians) {
    const corners=[];
    for(const x of [-10,10])for(const z of [-10.4,10.4])for(const y of [TOP-BOARD_THICKNESS,TOP])corners.push([x,y,z]);
    const height=this.mappingCanvas?.clientHeight||this.canvas.clientHeight||this.stage.clientHeight;
    if(!height||!this.referenceCell)return;
    // Match the horizontal intersection spacing exactly in top view; the
    // classic board uses the same pitch on both axes.
    const physicalPitch=boardSpacing(this.boardSize,BOARD_SPAN);
    const screenScale=this.referenceCell/physicalPitch;
    // Keep the center grid pitch constant while reducing perspective distortion
    // at low angles. Pulling the camera back without narrowing the lens made the
    // complete board fit by shrinking every intersection relative to 2D.
    let previousExtent=Infinity;
    for(let attempt=0;attempt<12;attempt++){
      const focal=screenScale*this.cameraDistance;
      this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(height/(2*focal)));
      this.camera.updateProjectionMatrix();
      this.camera.position.set(0,Math.cos(radians)*this.cameraDistance,Math.sin(radians)*this.cameraDistance);
      this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);
      let extent=0;
      for(const [x,y,z] of corners){const point=new THREE.Vector3(x,y,z).project(this.camera);extent=Math.max(extent,Math.abs(point.x),Math.abs(point.y));}
      if(!Number.isFinite(extent)||extent<=.96)break;
      // In a true top view, perspective cannot change the board's bounds.
      // Stop there so exact 2D-sized intersections are never zoomed away.
      if(extent>=previousExtent-1e-4)break;
      previousExtent=extent;
      this.cameraDistance*=Math.max(1.025,extent/.96*1.015);
    }
    const focal=screenScale*this.cameraDistance;
    this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(height/(2*focal)));
    this.camera.far=Math.max(100,this.cameraDistance+40);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0,Math.cos(radians)*this.cameraDistance,Math.sin(radians)*this.cameraDistance);
    this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);
  }
  setCameraProgress(progress) {
    // Kept for callers from older prototypes. The board camera is deliberately
    // fixed: moving it during a 2D/2.5D handoff changes the apparent board size.
    this.render();
  }
  animateCamera() {
    // Compatibility shim. View transitions now cross-fade canvases while the
    // orthographic camera and board framing remain unchanged.
    this.render();
    return Promise.resolve();
  }
  setCursor(point) {
    this.setPreview(point?{...point,color:this.model?.turn||1}:null);
  }
  setStoneOffsetEnabled(enabled){const next=enabled!==false;if(next===this.naturalPlacement)return;this.naturalPlacement=next;if(this.model)this.sync(this.model,this.markLast);else this.render();}
  visualPoint(x,y,size=this.boardSize,flip=!!this.model?.flip){
    const visualX=flip?size-1-x:x,visualY=flip?size-1-y:y,p=worldPoint(visualX,visualY,size,this.gridSpan);
    const offset=this.naturalPlacement?this.stoneOffset(x,y,size):{x:0,y:0},orientation=flip?-1:1,spacing=boardSpacing(size,this.gridSpan);
    p.x+=offset.x*spacing*orientation;p.z+=offset.y*spacing*SPACING_Z*orientation;return p;
  }
  setPreview(point,flip=false){
    this.lastPreview=point?{...point}:null;
    this.cursor.visible=false;
    const valid=point&&Number.isInteger(point.x)&&Number.isInteger(point.y)&&point.x>=0&&point.y>=0&&point.x<this.boardSize&&point.y<this.boardSize;
    this.previewStone.visible=!!valid&&!this.model?.board[point.y*this.boardSize+point.x];
    if(this.previewStone.visible){
      const p=this.visualPoint(point.x,point.y,this.boardSize,flip);
      this.previewStone.material=this.previewMaterials[point.color===2?1:0];this.previewStone.material.opacity=point.legal===false?.18:point.pending?.62:.46;
      this.previewStone.position.set(p.x,TOP+.018,p.z);this.previewStone.scale.setScalar(boardSpacing(this.boardSize,this.gridSpan));
    }
    this.render();
  }
  clearEffects(){
    for(const effect of this.effects||[])if(effect.mesh){this.scene.remove(effect.mesh);effect.mesh.material.dispose();}
    this.effects=[];
  }
  sync(model,markLast=true,animateMove=null) {
    const previous=this.boardSnapshot,changed=!previous||previous.length!==model.board.length||previous.some((v,i)=>v!==model.board[i]);
    const sameFrame=this.model?.size===(model.size||19)&&!!this.model?.flip===!!model.flip;
    if(changed||!sameFrame)this.clearEffects();
    model.size=model.size||19;this.boardSize=model.size;this.model=model;this.markLast=markLast;
    this.boardSnapshot=Int8Array.from(model.board);this.stoneSlots.clear();this.contactSlots.clear();
    const stoneScale=boardSpacing(model.size,this.gridSpan),visual=i=>this.visualPoint(i%model.size,Math.floor(i/model.size),model.size,model.flip);
    const counts=[0,0,0],matrix=new THREE.Object3D(),instanceTint=new THREE.Color();let contacts=0;
    for(let i=0;i<model.board.length;i++) {
      const color=model.board[i]; if(!color)continue;
      const p=visual(i);
      const lighting=LIGHTING[this.lighting];const scale=STONE_SHAPES[this.stoneShape].contactScale*(this.enhancedShadows?1.16:1)*stoneScale;
      this.contactSlots.set(i,contacts);
      matrix.scale.set(scale,scale,1);matrix.rotation.set(-Math.PI/2,0,0);matrix.position.set(p.x+lighting.shadowX,CONTACT_Y,p.z+lighting.shadowZ);matrix.updateMatrix();this.contacts.setMatrixAt(contacts++,matrix.matrix);
      matrix.scale.setScalar(stoneScale);matrix.rotation.set(0,(i*2.39996)%(Math.PI*2),0);matrix.position.set(p.x,STONE_REST_Y,p.z);matrix.updateMatrix();
      const slot=counts[color]++,seed=(Math.imul(i+1,0x9e3779b1)>>>0),warm=((seed&0xffff)/65535-.5)*.026,cool=((seed>>>16)/65535-.5)*.012;
      this.stones[color].setMatrixAt(slot,matrix.matrix);
      // Stable, barely perceptible warm/cool and satin variation per board point.
      instanceTint.setRGB(1+warm+cool,1+cool*.35,1-warm+cool);
      this.stones[color].setColorAt(slot,instanceTint);
      this.stoneSlots.set(i,{color,slot});
    }
    for(const color of [1,2]){this.stones[color].count=counts[color];this.stones[color].instanceMatrix.needsUpdate=true;if(this.stones[color].instanceColor)this.stones[color].instanceColor.needsUpdate=true;}
    this.contacts.count=contacts;this.contacts.instanceMatrix.needsUpdate=true;
    const move=model.moves.at(-1);this.last.visible=!!move&&markLast;
    if(move){const p=visual(move.y*model.size+move.x);this.last.scale.setScalar(stoneScale);this.last.position.set(p.x,TOP+STONE_SHAPES[this.stoneShape].height*stoneScale+.014,p.z);this.last.material.color.set(move.color===1?'#d9d4bd':'#5b6456');}
    if(changed&&sameFrame&&previous&&animateMove&&this.motionAllowed()){
      const index=animateMove.y*model.size+animateMove.x;
      const added=[];for(let i=0;i<model.board.length;i++)if(model.board[i]&&model.board[i]!==previous[i])added.push(i);
      if(added.length===1&&added[0]===index&&!previous[index]){
        const start=null,reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;this.effects.push({kind:'place',index,start,reducedMotion});
        for(let i=0;i<previous.length;i++)if(previous[i]&&!model.board[i]){
          const material=this.materials[previous[i]].clone();material.transparent=true;material.depthWrite=false;
          const mesh=new THREE.Mesh(this.stoneGeometry,material),p=visual(i);mesh.position.set(p.x,STONE_REST_Y,p.z);mesh.scale.setScalar(stoneScale);this.scene.add(mesh);this.effects.push({kind:'capture',mesh,start,reducedMotion});
        }
      }
    }
    this.render();
  }
  setFinish(id,tone,force=false) {
    const finish=resolveFinish(id,tone);
    if(!force&&this.finish.id===id&&this.finish.tone===tone)return;
    const wood=woodTextures(finish,this.finishBitmapId===id?{image:this.finishBitmap}:this.woodSources,this.quality.textureSize);
    if(this.finishBitmapId&&this.finishBitmapId!==id){this.finishBitmap?.close();this.finishBitmap=null;this.finishBitmapId='';}
    let marks;
    try{marks=boardMarkings(this.showCoordinates,finish,this.boardSize,this.coordinateFlip,this.gridSpan);}catch(error){Object.values(wood).forEach(t=>t.dispose());throw error;}
    const old=[this.boardTop.map,this.boardTop.normalMap,this.boardTop.roughnessMap,this.boardSide.map,this.markings.material.map];
    this.boardTop.map=wood.top;this.boardTop.bumpMap=wood.normal?null:wood.top;this.boardTop.normalMap=wood.normal||null;this.boardTop.normalScale.set(this.sharedLighting ? .42 : .16,this.sharedLighting ? .42 : .16);this.boardTop.roughnessMap=wood.roughness||null;this.boardTop.roughness=this.resolveGloss(finish.roughness);this.boardTop.bumpScale=finish.bump;this.boardTop.needsUpdate=true;
    this.boardSide.map=wood.side;this.boardSide.roughness=Math.min(1,this.boardTop.roughness+.08);
    this.markings.material.map=marks;this.cursor.material.color.set(finish.cursor);this.finish=finish;
    if(this.detailBoard){
      this.detailBoard.material.color.set('#ffffff');this.detailBoard.material.map=wood.top;
      this.detailBoard.material.roughness=this.resolveGloss(finish.roughness);this.detailBoard.material.needsUpdate=true;
    }
    old.filter(Boolean).forEach(t=>t.dispose());this.applyQuality();this.render();
  }
  resolveGloss(base){return this.gloss==='matte'?Math.max(.9,base):this.gloss==='polished'?Math.min(.32,base*.45):base;}
  setGloss(gloss){if(!['matte','satin','polished'].includes(gloss)||gloss===this.gloss)return;this.gloss=gloss;this.boardTop.roughness=this.resolveGloss(this.finish.roughness);this.boardSide.roughness=Math.min(1,this.boardTop.roughness+.08);if(this.detailBoard)this.detailBoard.material.roughness=this.boardTop.roughness;this.boardTop.needsUpdate=true;this.render();}
  setStoneMaterial(id){
    if(!['yunzi','premium-yunzi'].includes(id)||id===this.stoneMaterial)return;
    this.clearEffects();const old=this.materials.slice(1),oldPreviews=this.previewMaterials;
    this.stoneMaterial=id;this.materials=stoneMaterials(id);
    for(let color=1;color<=2;color++){
      this.stones[color].material=this.materials[color];
      if(this.detailStones?.[color-1])this.detailStones[color-1].material=this.materials[color];
    }
    this.previewMaterials=this.materials.slice(1).map(material=>{const copy=material.clone();copy.transparent=true;copy.opacity=.46;copy.depthWrite=false;return copy;});
    this.previewStone.material=this.previewMaterials[0];
    const textures=new Set();for(const material of [...old,...oldPreviews]){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}textures.forEach(texture=>texture.dispose());
    if(this.model)this.sync(this.model,this.markLast);else this.render();
  }
  setStoneShape(shape,force=false){
    if(!force&&shape===this.stoneShape)return;
    this.clearEffects();
    const geometry=createStoneGeometry(shape,this.quality.segments),old=this.stoneGeometry;
    this.stoneGeometry=geometry;this.stoneShape=shape;
    for(const stone of [...this.stones.slice(1),this.previewStone,...(this.detailStones||[])])stone.geometry=geometry;
    const oldContact=this.contactMaterial.map;this.contactMaterial.map=contactTexture(shape,this.sharedLighting,this.enhancedShadows);oldContact.dispose();old.dispose();
    const scale=STONE_SHAPES[shape].contactScale*(this.enhancedShadows?1.16:1);for(const contact of this.detailContacts||[])contact.scale.set(scale,scale,1);
    if(this.model)this.sync(this.model,this.markLast);else this.render();
  }
  setBackground(id,render=true){
    if(!['dark','wood','tatami','stone'].includes(id)||id===this.background)return;
    const old=this.ground.material;
    this.background=id;
    this.ground.material=id==='dark'?this.groundMaterial:tableSurface(id);
    if(old!==this.groundMaterial){old.map?.dispose();old.bumpMap?.dispose();old.dispose();}
    // A real receiving surface shares the board's perspective and key-light shadows.
    if(render)this.render();
  }
  setLighting(id){
    if(!Object.hasOwn(LIGHTING,id))throw new RangeError('Unknown lighting');
    const light=LIGHTING[id];this.lighting=id;
    const shared=this.sharedLighting;
    for(const key of [this.keyLight,this.detailKey].filter(Boolean)){key.color.set(light.key);key.intensity=shared?light.sharedKey:light.intensity;key.position.set(light.x,light.y,light.z);}
    for(const ambient of [this.ambient,this.detailAmbient].filter(Boolean))ambient.intensity=shared?light.sharedAmbient:light.ambient;
    for(const fill of [this.fillLight,this.detailFill].filter(Boolean))fill.intensity=shared?light.sharedFill:light.fill;
    for(const fill of [this.localFill,this.detailLocalFill].filter(Boolean)){fill.color.set(light.key);fill.intensity=shared?light.localFill:0;fill.position.set(light.x*.65,light.y*.65,light.z*.65);}
    // Rotate the baked softbox with the main light, without rebuilding its texture.
    const environmentAngle=Math.atan2(light.x,light.z)-Math.atan2(-14,-12);
    for(const scene of [this.scene,this.detailScene].filter(Boolean))scene.environmentRotation.set(0,environmentAngle,0);
    this.scene.environmentIntensity=shared?light.sharedEnvironment:light.environment;if(this.detailScene)this.detailScene.environmentIntensity=this.scene.environmentIntensity;
    for(let i=0;i<(this.detailContacts?.length||0);i++)this.detailContacts[i].position.set(this.detailStones[i].position.x+light.shadowX,.003,light.shadowZ);
    if(this.model)this.sync(this.model,this.markLast);else this.render();
  }
  setSharedLighting(enabled){
    const next=enabled!==false;if(next===this.sharedLighting)return;
    this.sharedLighting=next;
    const oldMap=this.markings.material.map,oldMaterial=this.markings.material;
    this.markings.material=boardMarkingsMaterial(oldMap,next);this.markings.receiveShadow=next;oldMaterial.dispose();
    this.boardTop.normalScale.set(next ? .42 : .16,next ? .42 : .16);
    const oldContact=this.contactMaterial.map;this.contactMaterial.map=contactTexture(this.stoneShape,next,this.enhancedShadows);oldContact.dispose();
    const bound=next?12:16;
    for(const key of [this.keyLight,this.detailKey].filter(Boolean)){
      Object.assign(key.shadow.camera,{left:-bound,right:bound,top:bound,bottom:-bound});key.shadow.camera.updateProjectionMatrix();
      key.shadow.normalBias=this.enhancedShadows ? .004 : (next ? .009 : .012);key.shadow.radius=this.enhancedShadows?(next?1.8:2.4):(next?4.5:5.5);key.shadow.needsUpdate=true;
    }
    this.setLighting(this.lighting);
  }
  setEnhancedShadows(enabled){
    const next=enabled!==false;if(next===this.enhancedShadows)return;
    this.enhancedShadows=next;this.groundMaterial.opacity=next ? .11 : .055;
    const old=this.contactMaterial.map;this.contactMaterial.map=contactTexture(this.stoneShape,this.sharedLighting,next);old.dispose();
    const scale=STONE_SHAPES[this.stoneShape].contactScale*(next?1.16:1);
    for(const contact of this.detailContacts||[])contact.scale.set(scale,scale,1);
    for(const key of [this.keyLight,this.detailKey].filter(Boolean)){key.shadow.normalBias=next ? .004 : (this.sharedLighting ? .009 : .012);key.shadow.radius=next?(this.sharedLighting?1.8:2.4):(this.sharedLighting?4.5:5.5);key.shadow.needsUpdate=true;}
    if(this.model)this.sync(this.model,this.markLast);else this.render();
  }
  setCoordinates(show,flip=false){this.showCoordinates=show;this.coordinateFlip=flip;const old=this.markings.material.map;this.markings.material.map=boardMarkings(show,this.finish,this.boardSize,flip,this.gridSpan);old.dispose();this.render();}
  setGridScale(scale){
    const value=THREE.MathUtils.clamp(Number(scale)||1,.8,1),span=BOARD_SPAN*value;
    if(Math.abs(span-this.gridSpan)<1e-6)return value;
    this.gridSpan=span;const old=this.markings.material.map;
    this.markings.material.map=boardMarkings(this.showCoordinates,this.finish,this.boardSize,this.coordinateFlip,span);old.dispose();
    if(this.model)this.sync(this.model,this.markLast);else this.render();
    if(this.lastPreview)this.setPreview(this.lastPreview,!!this.model?.flip);
    return value;
  }
  setSize(size){
    if(!Number.isInteger(size)||size<5||size>19)throw new RangeError('Unsupported board size');
    if(this.boardSize===size)return;
    this.boardSize=size;
    const old=this.markings.material.map;this.markings.material.map=boardMarkings(this.showCoordinates,this.finish,size,this.coordinateFlip,this.gridSpan);old.dispose();
    this.clearEffects();this.boardSnapshot=null;this.previewStone.visible=false;this.render();
  }
  advanceEffects(now){
    const matrix=new THREE.Matrix4();
    this.effects=this.effects.filter(effect=>{
      // The main app may still be completing its synchronous layout when
      // sync() schedules this RAF. Begin only when this first frame is painted.
      if(effect.start===null)effect.start=now;
      const t=Math.min(1,(now-effect.start)/((effect.kind==='place'?(effect.reducedMotion?170:220):(effect.reducedMotion?150:190))/this.animationSpeed));
      if(effect.kind==='place'){
        const ref=this.stoneSlots.get(effect.index),height=(effect.reducedMotion ? .22 : .65)*(1-t*t);
        if(ref){this.stones[ref.color].getMatrixAt(ref.slot,matrix);matrix.elements[13]=STONE_REST_Y+height;this.stones[ref.color].setMatrixAt(ref.slot,matrix);this.stones[ref.color].instanceMatrix.needsUpdate=true;}
        const slot=this.contactSlots.get(effect.index);
        if(slot!==undefined){const point=this.visualPoint(effect.index%this.model.size,Math.floor(effect.index/this.model.size),this.model.size,this.model.flip),light=LIGHTING[this.lighting],obj=new THREE.Object3D(),scale=boardSpacing(this.model.size,this.gridSpan)*STONE_SHAPES[this.stoneShape].contactScale*(this.enhancedShadows?1.16:1)*(1+height*.25);obj.scale.set(scale,scale,1);obj.rotation.x=-Math.PI/2;obj.position.set(point.x+light.shadowX,CONTACT_Y,point.z+light.shadowZ);obj.updateMatrix();this.contacts.setMatrixAt(slot,obj.matrix);this.contacts.instanceMatrix.needsUpdate=true;}
      }else{effect.mesh.material.opacity=1-t;effect.mesh.position.y=STONE_REST_Y+t*(effect.reducedMotion ? .12 : .18);if(t===1){this.scene.remove(effect.mesh);effect.mesh.material.dispose();}}
      return t<1;
    });
  }
  render(){if(this.frame || this.disposed)return;this.frame=requestAnimationFrame(now=>{
    this.frame=0;if(this.disposed)return;
    try {
    this.advanceEffects(now);
    const renderer=this.renderer,size=renderer.getSize(new THREE.Vector2()),dpr=renderer.getPixelRatio();
    const detail=this.detailCanvas;
    if(detail&&detail.clientWidth&&detail.clientHeight){
      // Reuse one WebGL context. Copy the detail view before rendering the full board.
      const w=Math.min(detail.clientWidth,size.x),h=Math.min(detail.clientHeight,size.y);
      detail.width=Math.round(w*dpr);detail.height=Math.round(h*dpr);
      this.detailCamera.left=-1.75;this.detailCamera.right=1.75;this.detailCamera.top=1.75*h/w;this.detailCamera.bottom=-1.75*h/w;this.detailCamera.updateProjectionMatrix();
      renderer.setViewport(0,0,w,h);renderer.setScissor(0,0,w,h);renderer.setScissorTest(true);renderer.render(this.detailScene,this.detailCamera);
      detail.getContext('2d').drawImage(this.canvas,0,this.canvas.height-detail.height,detail.width,detail.height,0,0,detail.width,detail.height);
    }
    renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);renderer.render(this.scene,this.camera);
    if(this.effects.length)this.render();
    } catch(error) { this.onRenderError?.(error); }
  });}
  dispose(){
    this.disposed=true;this.assetController?.abort();this.clearEffects();cancelAnimationFrame(this.frame);this.observer.disconnect();
    const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const scene of [this.scene,this.detailScene].filter(Boolean))scene.traverse(o=>{o.shadow?.dispose();if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    for(const m of [this.groundMaterial,this.contactMaterial,...this.materials.slice(1),...this.previewMaterials])materials.add(m);
    geometries.add(this.stoneGeometry);geometries.add(this.contactGeometry);
    for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());this.environment.dispose();this.renderer.dispose();
    Object.values(this.woodSources||{}).forEach(b=>b.close());this.finishAssetController?.abort();this.finishBitmap?.close();
  }
}
