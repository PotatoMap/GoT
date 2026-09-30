import * as THREE from 'three';
import { letters, BOARD_SPAN } from './model.js';
import { resolveFinish } from './board-finishes.js';

function random(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
function texture(c, color = true) { const t = new THREE.CanvasTexture(c); if (color) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export async function loadWoodSources(size,signal) {
  const names=['color','roughness','normal'];
  const results=await Promise.allSettled(names.map(async name=>{
    const response=await fetch(new URL(`./assets/wood/${name}.jpg`,import.meta.url),{signal});
    if(!response.ok)throw new Error('Wood texture unavailable');
    const dimension=Math.min(size,name==='color'?4096:2048);
    return createImageBitmap(await response.blob(),{resizeWidth:dimension,resizeHeight:dimension,resizeQuality:'high'});
  }));
  if(signal?.aborted||results.some(r=>r.status==='rejected')){
    results.forEach(r=>{if(r.status==='fulfilled')r.value.close();});
    throw new Error('Wood texture unavailable');
  }
  return Object.fromEntries(names.map((name,i)=>[name,results[i].value]));
}

export async function loadFinishTexture(asset,size,signal) {
  const response=await fetch(new URL(`./assets/materials/${asset}`,import.meta.url),{signal});
  if(!response.ok)throw new Error('Board material unavailable');
  const bitmap=await createImageBitmap(await response.blob(),{resizeWidth:Math.min(size,1254),resizeHeight:Math.min(size,1254),resizeQuality:'high'});
  if(signal?.aborted){bitmap.close();throw new Error('Board material load cancelled');}
  return bitmap;
}

export function woodTextures(finish=resolveFinish(),sources=null,size=2048) {
  if(sources?.image&&finish.textureAsset){
    const width=sources.image.width,height=sources.image.height,c=canvas(width),ctx=c.getContext('2d');
    ctx.drawImage(sources.image,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height),base=new THREE.Color(finish.top),rgb=[base.r,base.g,base.b].map(v=>THREE.MathUtils.clamp(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055,0,1)*255);
    let mean=0;for(let i=0;i<pixels.data.length;i+=4)mean+=pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722;mean=Math.max(1,mean/(pixels.data.length/4));
    const luma=new Float32Array(width*height);
    for(let i=0,p=0;i<pixels.data.length;i+=4,p++){
      const value=pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722,variation=THREE.MathUtils.clamp(1+(value/mean-1)*.38,.76,1.24);luma[p]=value;
      for(let k=0;k<3;k++)pixels.data[i+k]=Math.min(255,rgb[k]*variation);
    }
    ctx.putImageData(pixels,0,0);
    const normalCanvas=canvas(width),normalCtx=normalCanvas.getContext('2d'),normalData=normalCtx.createImageData(width,height),roughCanvas=canvas(width),roughCtx=roughCanvas.getContext('2d'),roughData=roughCtx.createImageData(width,height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,at=(xx,yy)=>luma[Math.max(0,Math.min(height-1,yy))*width+Math.max(0,Math.min(width-1,xx))],gx=(at(x+1,y)-at(x-1,y))*.8,gy=(at(x,y+1)-at(x,y-1))*.8,n=i*4;
      normalData.data[n]=THREE.MathUtils.clamp(128-gx,0,255);normalData.data[n+1]=THREE.MathUtils.clamp(128-gy,0,255);normalData.data[n+2]=255;normalData.data[n+3]=255;
      const contrast=Math.min(1,(Math.abs(gx)+Math.abs(gy))/36),rough=THREE.MathUtils.clamp(230+(contrast-.18)*24,0,255);
      roughData.data[n]=roughData.data[n+1]=roughData.data[n+2]=rough;roughData.data[n+3]=255;
    }
    normalCtx.putImageData(normalData,0,0);roughCtx.putImageData(roughData,0,0);
    const side=canvas(512),sideCtx=side.getContext('2d');sideCtx.drawImage(c,0,0,width,height,0,0,512,512);
    return {top:texture(c),side:texture(side),normal:texture(normalCanvas,false),roughness:texture(roughCanvas,false)};
  }
  if(sources&&finish.kind==='wood'){
    const c=canvas(size),ctx=c.getContext('2d');
    ctx.drawImage(sources.color,0,0,size,size);
    const pixels=ctx.getImageData(0,0,size,size),base=new THREE.Color(finish.top);
    // Keep the original photographed grain; only its palette follows the selected finish.
    const rgb=[base.r,base.g,base.b].map(v=>THREE.MathUtils.clamp(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055,0,1)*255);
    for(let i=0;i<pixels.data.length;i+=4){
      const l=(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)/255;
      const variation=1+Math.max(-.09,Math.min(.10,(l-.24)*.42));
      for(let k=0;k<3;k++)pixels.data[i+k]=Math.min(255,rgb[k]*variation);
    }
    ctx.putImageData(pixels,0,0);
    const rough=canvas(Math.min(size,2048)),r=rough.getContext('2d');
    r.fillStyle='#dddddd';r.fillRect(0,0,rough.width,rough.height);r.globalAlpha=.24;r.drawImage(sources.roughness,0,0,rough.width,rough.height);
    const normalCanvas=canvas(sources.normal.width);normalCanvas.getContext('2d').drawImage(sources.normal,0,0);
    // Keep the exposed edge in the same wood palette as the top. Its face
    // lighting provides enough separation without tinting it nearly brown.
    const side=canvas(512),s=side.getContext('2d');s.drawImage(c,0,0,size,size,0,0,512,512);
    return {top:texture(c),side:texture(side),normal:texture(normalCanvas,false),roughness:texture(rough,false)};
  }
  const c = canvas(2048), ctx = c.getContext('2d'), rnd = random(finish.seed);
  ctx.fillStyle = finish.top; ctx.fillRect(0, 0, 2048, 2048);
  // Sparse, low-contrast grain keeps the board from reading as repeated vertical stripes.
  for (let i = 0; i < (finish.kind==='stone'?0:1250); i++) {
    const x = rnd() * 2200 - 80, phase = x / 1050 + rnd() * .45, width = .35 + rnd() * 1.1;
    ctx.beginPath();
    for (let y = 0; y <= 2048; y += 32) {
      const bend = Math.sin(y / 680 + phase) * finish.grain * .28 + Math.sin(y / 1300 + x / 900) * finish.grain * .52;
      if (!y) ctx.moveTo(x + bend, y); else ctx.lineTo(x + bend, y);
    }
    ctx.lineWidth = width; ctx.strokeStyle = i % 3 ? `rgba(58,42,24,${.006 + rnd() * .026})` : `rgba(255,239,199,${.008 + rnd() * (finish.dark ? .028 : .042)})`; ctx.stroke();
  }
  if(finish.kind==='bamboo') {
    for(let x=0;x<2048;x+=125){
      ctx.fillStyle='rgba(65,47,20,.07)';ctx.fillRect(x,0,2,2048);
      const joint=350+((x*7)%1250);ctx.fillRect(x,joint,125,3);ctx.fillStyle='rgba(255,237,181,.12)';ctx.fillRect(x,joint+4,125,5);
    }
  }
  if(finish.kind==='stone') {
    // Mottled mineral patches and fine pores, without glossy marble veins.
    for(let i=0;i<1700;i++){
      const x=rnd()*2048,y=rnd()*2048,r=10+rnd()*100;
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,i%2?'rgba(20,35,30,.035)':'rgba(220,229,211,.035)');g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
  }
  const pixels = ctx.getImageData(0, 0, 2048, 2048);
  for (let i = 0; i < pixels.data.length; i += 4) { const n = (rnd() - .5) * (finish.kind==='stone'?18:4); pixels.data[i] += n; pixels.data[i + 1] += n; pixels.data[i + 2] += n; }
  ctx.putImageData(pixels, 0, 0);
  const side = canvas(512), s = side.getContext('2d');
  s.fillStyle = finish.top; s.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 220; i++) { s.strokeStyle = `rgba(80,50,25,${rnd() * .1})`; s.lineWidth = .4 + rnd(); s.beginPath(); const y = rnd() * 512; s.moveTo(0, y); s.bezierCurveTo(180,y+4,320,y-5,512,y+2); s.stroke(); }
  return { top: texture(c), side: texture(side) };
}

export function boardMarkings(showCoords,finish=resolveFinish(),size=19,flip=false,gridSpan=BOARD_SPAN) {
  const c = canvas(2048), ctx = c.getContext('2d');
  const px = x => (x + 10) / 20 * 2048;
  const py = y => (y * 1.04 + 10.4) / 20.8 * 2048;
  const step = gridSpan / Math.max(1,size-1), half = (size-1)/2;
  const point = i => (i-half)*step;
  const coordinateEdge = gridSpan/2 + .29;
  ctx.strokeStyle = finish.grid; ctx.fillStyle = finish.grid; ctx.lineWidth = 3;
  for (let i = 0; i < size; i++) {
    const p=point(i);
    ctx.beginPath(); ctx.moveTo(px(p),py(-gridSpan/2)); ctx.lineTo(px(p),py(gridSpan/2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(-gridSpan/2),py(p)); ctx.lineTo(px(gridSpan/2),py(p)); ctx.stroke();
  }
  const stars=size===19?[[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]]:
    size===13?[[3,3],[9,3],[3,9],[9,9],[6,6]]:
    size===9?[[2,2],[6,2],[2,6],[6,6],[4,4]]:size===7?[[3,3]]:(()=>{
      const edge=size>=13?3:2,mid=(size-1)/2,points=[[edge,edge],[size-1-edge,edge],[edge,size-1-edge],[size-1-edge,size-1-edge]];
      if(Number.isInteger(mid))points.push([mid,mid]);return points;
    })();
  for (const [sx,sy] of stars) { ctx.beginPath(); ctx.arc(px(point(sx)),py(point(sy)),7,0,Math.PI*2); ctx.fill(); }
  if (showCoords) {
    ctx.font = '26px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = finish.coordinates;
    for (let i = 0; i < size; i++) {
      const label=flip?size-1-i:i;
      ctx.fillText(letters[label],px(point(i)),py(-coordinateEdge)); ctx.fillText(letters[label],px(point(i)),py(coordinateEdge));
      ctx.fillText(String(size-label),px(-coordinateEdge),py(point(i))); ctx.fillText(String(size-label),px(coordinateEdge),py(point(i)));
    }
  }
  return texture(c);
}

export function contactTexture(shape='single',sharedLighting=true,enhancedShadows=false) {
  const c = canvas(128), ctx = c.getContext('2d');
  // Tight occlusion grounds the heel; the scene light supplies the directional shadow.
  const g = ctx.createRadialGradient(64,64,20,64,64,64);
  const center=enhancedShadows
    ?(sharedLighting?(shape==='double'?.72:.68):(shape==='double'?.78:.74))
    :(sharedLighting?(shape==='double'?.25:.22):(shape==='double'?.36:.34));
  const middle=enhancedShadows?(sharedLighting?.42:.48):(sharedLighting?.15:.24);
  const edge=enhancedShadows?(sharedLighting?.12:.18):(sharedLighting?.05:.085);
  g.addColorStop(0,`rgba(25,21,16,${center})`);g.addColorStop(.24,`rgba(29,23,15,${middle})`);g.addColorStop(.52,`rgba(29,23,15,${edge})`);g.addColorStop(.82,`rgba(29,23,15,${.025})`);g.addColorStop(1,'rgba(29,23,15,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,128,128); return texture(c);
}

export function stoneMaterials(kind='yunzi') {
  const surface=(seed,roughen,pigmentStrength,pigmentColor,pigmentCount=16)=>{
    const size=512,rnd=random(seed),colorCanvas=canvas(size),colorCtx=colorCanvas.getContext('2d'),colorPixels=colorCtx.createImageData(size,size);
    const bumpCanvas=canvas(size),bumpCtx=bumpCanvas.getContext('2d'),bumpPixels=bumpCtx.createImageData(size,size);
    const roughCanvas=canvas(size),roughCtx=roughCanvas.getContext('2d'),roughPixels=roughCtx.createImageData(size,size);
    for(let i=0;i<colorPixels.data.length;i+=4){
    // Fine mineral grain sits below the broad, softly varied body tone.
    const v=249+rnd()*7,grain=rnd();
      colorPixels.data[i]=Math.min(255,v+(grain>.5?1:0));colorPixels.data[i+1]=v;colorPixels.data[i+2]=Math.max(0,v-(grain>.82?1:0));colorPixels.data[i+3]=255;
      const bumpValue=116+rnd()*25; bumpPixels.data[i]=bumpPixels.data[i+1]=bumpPixels.data[i+2]=bumpValue;bumpPixels.data[i+3]=255;
      const roughValue=236+rnd()*19;roughPixels.data[i]=roughPixels.data[i+1]=roughPixels.data[i+2]=roughValue;roughPixels.data[i+3]=255;
    }
    colorCtx.putImageData(colorPixels,0,0);bumpCtx.putImageData(bumpPixels,0,0);roughCtx.putImageData(roughPixels,0,0);
    // Low contrast, cloud-shaped pigment shifts; no veins or repeated bands.
    for(let i=0;i<pigmentCount;i++){
      const x=rnd()*size,y=rnd()*size,r=42+rnd()*128;
      const g=colorCtx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`rgba(${pigmentColor},${pigmentStrength*(.72+rnd()*.55)})`);g.addColorStop(1,`rgba(${pigmentColor},0)`);
      colorCtx.fillStyle=g;colorCtx.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<14;i++){
      const x=rnd()*size,y=rnd()*size,r=58+rnd()*132;
      const g=roughCtx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`rgba(0,0,0,${roughen*(.35+rnd()*.35)})`);g.addColorStop(1,'rgba(0,0,0,0)');
      roughCtx.fillStyle=g;roughCtx.fillRect(x-r,y-r,r*2,r*2);
    }
    return {map:texture(colorCanvas),bump:texture(bumpCanvas,false),roughness:texture(roughCanvas,false)};
  };
  const premium=kind==='premium-yunzi';
  const blackSurface=surface(premium?18026:9026,premium ? .055 : .11,premium ? .075 : .1,'93,76,52',premium?20:14),whiteSurface=surface(premium?29073:19073,premium ? .018 : .025,premium ? .012 : .018,'184,174,151',premium?9:5);
  // Opaque Yunzi: deep warm black and shaded ivory, both with broad satin reflections.
  const black=new THREE.MeshPhysicalMaterial({color:premium?'#30312e':'#292b27',map:blackSurface.map,roughness:premium ? .3 : .38,roughnessMap:blackSurface.roughness,metalness:0,ior:premium?1.45:1.46,specularIntensity:premium ? .72 : .72,specularColor:'#f3eee3',envMapIntensity:premium ? .94 : .92,bumpMap:blackSurface.bump,bumpScale:.0025});
  const white=new THREE.MeshPhysicalMaterial({color:premium?'#eee7d9':'#ded6c4',map:whiteSurface.map,roughness:premium ? .34 : .41,roughnessMap:whiteSurface.roughness,metalness:0,ior:premium?1.45:1.46,specularIntensity:premium ? .76 : .78,specularColor:'#fff9ee',envMapIntensity:premium ? .98 : 1.02,bumpMap:whiteSurface.bump,bumpScale:.0014});
  // Instance tint also carries a tiny deterministic roughness offset. The diffuse
  // color shifts stay below a visible pattern; the board position seeds each stone.
  for(const [material,key,isWhite] of [[black,'got-black-satin-4',false],[white,'got-white-porcelain-4',true]]){
    material.onBeforeCompile=shader=>{
      const noise=`
        varying vec3 vGotStoneLocal;
        float gotStoneHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float gotStoneNoise(vec3 p){
          vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          float a=gotStoneHash(i),b=gotStoneHash(i+vec3(1,0,0)),c=gotStoneHash(i+vec3(0,1,0)),d=gotStoneHash(i+vec3(1,1,0));
          float e=gotStoneHash(i+vec3(0,0,1)),f1=gotStoneHash(i+vec3(1,0,1)),g=gotStoneHash(i+vec3(0,1,1)),h=gotStoneHash(i+vec3(1,1,1));
          return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,f1,f.x),mix(g,h,f.x),f.y),f.z);
        }`;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGotStoneLocal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGotStoneLocal=position;');
      const variation=isWhite
        ?'float gotGrain=(gotFine-.5)*.025+(gotCloud-.5)*.085+(gotBody-.5)*.04;\nfloat gotWarm=(gotCloud-.5)*.018+(gotBody-.5)*.01;\nroughnessFactor=clamp(roughnessFactor+(gotFine-.5)*.025+(gotCloud-.5)*.035+(gotBody-.5)*.02,0.0,1.0);'
        :'float gotGrain=(gotFine-.5)*.10+(gotCloud-.5)*.16+(gotBody-.5)*.10;\nfloat gotWarm=(gotCloud-.5)*.045+(gotBody-.5)*.025;\nroughnessFactor=clamp(roughnessFactor+(gotFine-.5)*.08+(gotCloud-.5)*.10+(gotBody-.5)*.06,0.0,1.0);';
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+noise)
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nfloat gotFine=gotStoneNoise(vGotStoneLocal*30.0);\nfloat gotCloud=gotStoneNoise(vGotStoneLocal*5.2+vec3(3.7));\nfloat gotBody=gotStoneNoise(vGotStoneLocal*2.8+vec3(8.1));\n${variation}\ndiffuseColor.rgb*=vec3(1.0+gotGrain+gotWarm,1.0+gotGrain+gotWarm*.78,1.0+gotGrain+gotWarm*.48);\n#ifdef USE_INSTANCING_COLOR\nroughnessFactor=clamp(roughnessFactor+(vColor.r-vColor.b)*.32,0.0,1.0);\n#endif`);
    };
    material.customProgramCacheKey=()=>key+'-grain-4';
  }
  return [null,black,white];
}

export function windowEnvironment() {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#302d28');
  const windowLight=new THREE.Mesh(new THREE.PlaneGeometry(20,14),new THREE.MeshBasicMaterial({color:new THREE.Color('#fff5df').multiplyScalar(4.2),side:THREE.DoubleSide}));
  windowLight.position.set(-14,20,-12);windowLight.lookAt(0,0,0);scene.add(windowLight);
  const bounce=new THREE.Mesh(new THREE.PlaneGeometry(14,18),new THREE.MeshBasicMaterial({color:new THREE.Color('#e7e9e4').multiplyScalar(.65),side:THREE.DoubleSide}));
  bounce.position.set(12,11,3);bounce.lookAt(0,0,0);scene.add(bounce);
  // Quiet wood-coloured bounce reveals the lower convex cap without a glow rim.
  const boardBounce=new THREE.Mesh(new THREE.PlaneGeometry(24,24),new THREE.MeshBasicMaterial({color:new THREE.Color('#9a713e').multiplyScalar(.35),side:THREE.DoubleSide}));
  boardBounce.position.set(0,-3,0);boardBounce.rotation.x=-Math.PI/2;scene.add(boardBounce);
  return scene;
}
