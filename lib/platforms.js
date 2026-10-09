// Conservative interpretation of platform evidence from community providers.
// An 'Unknown' or negative rating must never be treated as proof of a build.
function positive(value){
 if(typeof value!=='string')return false;
 const s=value.trim().toLowerCase();
 return !!s && !/^(?:unknown|none|n\/?a|not available|unavailable|unsupported|not supported|false|0|null|no build|missing)$/i.test(s);
}
function addToken(out,value){
 if(value==null||value===false)return;
 if(Array.isArray(value)){for(const v of value)addToken(out,v);return;}
 if(typeof value==='object'){
  // Only positive flags prove a platform; never treat a false flag as support.
  for(const [key,name] of Object.entries({pc:'PC',windows:'PC',standalonewindows:'PC',quest:'Android',android:'Android',ios:'iOS'})){
   const flag=value[key];
   if(flag===true||flag===1||flag==='true'||flag==='supported'||flag?.supported===true||flag?.available===true)out.add(name);
  }
  for(const k of ['platform','platformName','targetPlatform','platforms','supportedPlatforms','supported_platforms']){
   if(value[k]!=null)addToken(out,value[k]);
  }
  return;
 }
 if(typeof value!=='string'||!positive(value))return;
 // Process individual comma/plus/slash tokens, so 'PC, Quest unsupported' only adds PC.
 for(const segment of value.toLowerCase().split(/\s*(?:[+,•|;]|\s+\/\s+|,)\s*/)){
  const p=segment.trim();
  if(!p||/\b(?:unsupported|not supported|unavailable|no build|disabled|not available|false|unknown)\b/.test(p))continue;
  if(p==='w'||p==='pc'||p==='win32'||p==='win64'||p.includes('standalonewindows')||p.includes('windows')||/(^|[\s/_-])pc($|[\s/_-])/.test(p))out.add('PC');
  if(p==='a'||p.includes('android')||p.includes('quest')||/(^|[\s/_-])a($|[\s/_-])/.test(p))out.add('Android');
  if(p==='i'||p.includes('ios')||p.includes('iphone')||p.includes('ipad')||/(^|[\s/_-])i($|[\s/_-])/.test(p))out.add('iOS');
 }
}

export function platformSetFromAny(x){
 const out=new Set();
 if(!x||typeof x!=='object')return [];
 for(const k of ['platforms','platform','compatibility','supportedPlatforms','supported_platforms','platformLabel','platform_label','platformDisplay','platform_display','platformBadges','buildPlatforms','platformSupport','platformsSupported']){
  addToken(out,x[k]);
 }
 for(const k of ['unityPackages','unity_packages','packages','versions'])addToken(out,x[k]);
 for(const [keys,label] of [
  [['pc','windows','hasPc','has_pc'],'PC'],
  [['android','quest','hasAndroid','has_android'],'Android'],
  [['ios','hasIos','has_ios'],'iOS']
 ]) if(keys.some(k=>x[k]===true))out.add(label);
 // Explicit performance ratings indicate available builds, even when a different
 // platform was already present. A 'None'/'Unknown' rating does not.
 const perf=x.performance||x.perf||{};
 const ratings=[
  ['PC',[perf.standalonewindows,perf.pc,perf.pc_rating,perf.pcRating,x.performancePc,x.performance_pc]],
  ['Android',[perf.android,perf.android_rating,perf.androidRating,perf.quest,perf.quest_rating,perf.questRating,x.performanceAndroid,x.performance_android]],
  ['iOS',[perf.ios,perf.ios_rating,perf.iosRating,x.performanceIos,x.performance_ios]]
 ];
 for(const [name,values] of ratings)if(values.some(positive))out.add(name);
 return ['PC','Android','iOS'].filter(p=>out.has(p));
}

export function hasKnownPlatform(a){return platformSetFromAny(a).length>0;}
export function normalizedPlatformString(a){return platformSetFromAny(a).join(' • ');}
export function normalizeAvatarPlatforms(a){
 const platforms=platformSetFromAny(a);
 return platforms.length?{...a,platforms}:a;
}
