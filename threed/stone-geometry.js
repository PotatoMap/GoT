import * as THREE from 'three';

export const STONE_SHAPES = {
  single: { name:'单凸', height:.2, contactScale:.88, description:'薄底贴盘，低弧面温润舒展' },
  double: { name:'双凸', height:.27, contactScale:.8, description:'双面浅弧，带细圆润边腰' }
};

export function createStoneGeometry(shape='single',segments=64) {
  if(!Object.hasOwn(STONE_SHAPES,shape))throw new RangeError('Unknown stone shape');
  const points=[];
  if(shape==='single') {
    // Flat foot with a very thin rolled edge, not a cylindrical skirt.
    points.push(new THREE.Vector2(0,0),new THREE.Vector2(.34,0),new THREE.Vector2(.425,.002),new THREE.Vector2(.46,.008),new THREE.Vector2(.472,.021));
    for(let i=0;i<=48;i++){
      const a=i/48*Math.PI/2;
      if(i)points.push(new THREE.Vector2(i===48?0:.472*Math.cos(a),.016+.184*Math.sin(a)));
    }
  } else {
    // Two shallow convex caps blend into a narrow, softly joined equatorial
    // belt, matching the low, broad side silhouette of a traditional double-
    // convex Yunzi. The profile stays rotationally smooth at both poles.
    const radius=.472,height=STONE_SHAPES.double.height,belt=.018,cap=(height-belt)/2;
    for(let i=0;i<=32;i++){
      const a=i/32*Math.PI/2;
      points.push(new THREE.Vector2(i===0?0:radius*Math.sin(a),cap*(1-Math.cos(a))));
    }
    points.push(new THREE.Vector2(radius,cap+belt));
    for(let i=1;i<=32;i++){
      const a=i/32*Math.PI/2;
      points.push(new THREE.Vector2(i===32?0:radius*Math.cos(a),cap+belt+cap*Math.sin(a)));
    }
  }
  const geometry=new THREE.LatheGeometry(points,segments);
  geometry.computeVertexNormals();geometry.computeBoundingBox();
  return geometry;
}

export const LIGHTING = {
  daylight: { name:'自然日光', key:'#fff5e6', intensity:2.35, fill:.2, ambient:.3, environment:.95, sharedKey:2.15, sharedFill:.32, sharedAmbient:.22, sharedEnvironment:1.05, localFill:14, x:-14,y:20,z:-12, shadowX:0,shadowZ:0 },
  sidelight: { name:'侧窗光', key:'#fff4df', intensity:2.9, fill:.12, ambient:.22, environment:.85, sharedKey:2.5, sharedFill:.26, sharedAmbient:.18, sharedEnvironment:.95, localFill:12, x:-18,y:16,z:-9, shadowX:0,shadowZ:0 },
  warm: { name:'柔和室内灯光', key:'#f6dfc2', intensity:1.85, fill:.27, ambient:.4, environment:.84, sharedKey:1.8, sharedFill:.34, sharedAmbient:.28, sharedEnvironment:.95, localFill:10, x:-10,y:18,z:-14, shadowX:0,shadowZ:0 }
};
