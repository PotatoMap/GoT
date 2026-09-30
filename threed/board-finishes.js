// Palette interpretations of wood grain, not measured scans of each species.
export const FINISHES = {
  kaya: { name:'榧木', description:'细直木纹 · 温润蜜金', kind:'wood', seed:26019, grain:7, roughness:.76, bump:.008, colors:['#bd873d','#cf9e55','#a97232'], sides:['#99672f','#b88240','#815329'], dark:false },
  maple: { name:'枫木', description:'柔和弦纹 · 清浅乳白', kind:'wood', seed:4901, grain:30, roughness:.77, bump:.009, colors:['#d8c8a7','#e8ddc4','#b9a283'], sides:['#b9a17c','#cebb99','#9c825f'], dark:false },
  walnut: { name:'胡桃木', description:'起伏山纹 · 沉静褐棕', kind:'wood', seed:763, grain:60, roughness:.69, bump:.016, colors:['#71533e','#97775a','#4c3e33'], sides:['#574030','#795b43','#392e27'], dark:true },
  rosewood: { name:'花梨木', description:'交错深纹 · 暖赭红棕', kind:'wood', seed:1288, grain:23, roughness:.65, bump:.013, colors:['#945d46','#b78164','#654333'], sides:['#704231','#986349','#4d3328'], dark:true },
  bamboo: { name:'竹纹', description:'细密竹丝 · 自然竹节', kind:'bamboo', seed:482, grain:2, roughness:.81, bump:.014, colors:['#c3ad70','#dfce98','#a18a54'], sides:['#a38a50','#c3af75','#806a3d'], dark:false },
  slate: { name:'青石', description:'细颗粒石面 · 哑光青灰', kind:'stone', seed:9843, grain:0, roughness:.95, bump:.025, colors:['#73847e','#a5b1a5','#485b55'], sides:['#566962','#829285','#354841'], dark:true },
  'walnut-pbr': { name:'胡桃木实纹', description:'原创胡桃木纹理 · PBR 表面', kind:'wood', textureAsset:'walnut-veneer.jpg', seed:903, grain:60, roughness:.64, bump:.012, colors:['#78543a','#926847','#573e2d'], sides:['#63432f','#7a5439','#443023'], dark:true },
  'oak-pbr': { name:'浅橡木', description:'原创浅橡木纹理 · PBR 表面', kind:'wood', textureAsset:'white-oak-veneer.jpg', seed:1904, grain:22, roughness:.72, bump:.01, colors:['#e2cea7','#f0dfbd','#c5ac83'], sides:['#bda77f','#d2bb91','#98815e'], dark:false },
  'stone-pbr': { name:'岩层青石', description:'原创细层青石纹理 · PBR 表面', kind:'stone', textureAsset:'honed-slate.jpg', seed:721, grain:0, roughness:.88, bump:.018, colors:['#67736a','#818b80','#46504b'], sides:['#4d5b53','#69766c','#38443f'], dark:true }
};
export const TONES = ['natural','light','deep'];
export function resolveFinish(id='kaya', tone='natural') {
  if (!Object.hasOwn(FINISHES,id) || !TONES.includes(tone)) throw new RangeError('Unknown board finish');
  const finish=FINISHES[id], index=TONES.indexOf(tone);
  const lightGrid=finish.dark && tone!=='light' && !(id==='slate'&&tone==='natural');
  return {...finish,id,tone,top:finish.colors[index],side:finish.sides[index],grid:lightGrid?'#dfcc9f':'#483821',coordinates:lightGrid?'#e1d1ad':'#57442c',cursor:lightGrid?'#f5df98':'#355039'};
}
