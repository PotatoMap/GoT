export const QUALITY = {
  low: { dpr:1.5, minDpr:1, textureSize:1024, shadowSize:0, segments:64, anisotropy:2 },
  balanced: { dpr:2, minDpr:1.5, textureSize:2048, shadowSize:2048, segments:96, anisotropy:8 },
  high: { dpr:3, minDpr:2, textureSize:4096, shadowSize:4096, segments:128, anisotropy:16 }
};
export function resolveQuality(value='auto', {mobile=false,memory=8}={}) {
  const id=Object.hasOwn(QUALITY,value)?value:(memory<=4?'low':mobile?'balanced':'high');
  return {id,...QUALITY[id]};
}
