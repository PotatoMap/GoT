import * as THREE from 'three';

// Original, deterministic surface drawings. Only the selected surface owns GPU textures.
export function tableSurface(kind) {
  const size=1024,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');let seed=78291;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle={wood:'#69503b',tatami:'#92916c',stone:'#858985'}[kind];ctx.fillRect(0,0,size,size);
  if(kind==='wood'){
    for(let plank=0;plank<4;plank++){
      ctx.fillStyle=['#74563d','#674c36','#70513b','#795b40'][plank];ctx.fillRect(plank*256,0,256,size);
      for(let i=0;i<400;i++){
        const x=plank*256+random()*256,phase=random()*6.28;
        ctx.beginPath();
        for(let y=0;y<=size;y+=8){const px=x+Math.sin(y/size*Math.PI*2+phase)*4+Math.sin(y/size*Math.PI*4+phase)*3;y?ctx.lineTo(px,y):ctx.moveTo(px,y);}
        ctx.strokeStyle=i%3?'rgba(29,16,8,.04)':'rgba(236,204,153,.04)';ctx.lineWidth=.4+random()*1.3;ctx.stroke();
      }
      ctx.fillStyle='rgba(20,12,6,.24)';ctx.fillRect(plank*256,0,1.5,size);
      ctx.fillStyle='rgba(224,190,139,.12)';ctx.fillRect(plank*256+2,0,1,size);
    }
  }else if(kind==='tatami'){
    for(let y=0;y<size;y+=4){
      ctx.fillStyle=y%8?'#a8a47b':'#85865f';ctx.fillRect(0,y,size,2);
      for(let x=0;x<size;x+=16){ctx.fillStyle=`rgba(232,214,155,${.12+random()*.17})`;ctx.fillRect(x+(y%8?8:0),y,12,1);}
    }
    for(let x=0;x<size;x+=32){ctx.fillStyle='rgba(47,55,30,.2)';ctx.fillRect(x,0,1,size);}
    for(const x of [0,1000]){
      ctx.fillStyle='#36483b';ctx.fillRect(x,0,24,size);
      for(let y=0;y<size;y+=10){ctx.strokeStyle='rgba(191,186,136,.17)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+24,y+12);ctx.stroke();}
    }
  }else{
    for(let i=0;i<1500;i++){
      const x=random()*size,y=random()*size,r=3+random()*44,g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,i%2?'rgba(42,50,47,.035)':'rgba(230,230,215,.045)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);
    }
  }
  const pixels=ctx.getImageData(0,0,size,size);
  for(let i=0;i<pixels.data.length;i+=4){const n=(random()-.5)*(kind==='stone'?26:6);for(let k=0;k<3;k++)pixels.data[i+k]+=n;}
  ctx.putImageData(pixels,0,0);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(5,5);map.anisotropy=4;
  const bump=map.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;
  return new THREE.MeshStandardMaterial({map,bumpMap:bump,bumpScale:kind==='stone'?.018:.005,roughness:kind==='wood'?.72:.94,metalness:0});
}
