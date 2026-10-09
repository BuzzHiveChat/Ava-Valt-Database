// Pure scheduling rules. No network calls, VRChat API, or side effects.
export const HOUR = 60 * 60 * 1000;
export function maxPerHour(v){return Math.max(1,Math.min(5,Number.isFinite(Number(v))?Math.trunc(Number(v)):5));}
export function recentAttempts(attempts, now=Date.now()){
 return (Array.isArray(attempts)?attempts:[]).filter(x=>{
  const t=Date.parse(x?.at||"");
  return Number.isFinite(t)&&t<=now&&t>now-HOUR;
 });
}
export function remainingSlots(doc, now=Date.now(), limit=5){
 return Math.max(0,maxPerHour(limit)-recentAttempts(doc?.autoReview?.attempts,now).length);
}
export function eligibleAvatars(doc, now=Date.now()){
 return (doc?.avatars||[]).filter(a=>a?.id&&!Array.isArray(a.autoReviewSuggestion)&&!(Date.parse(a.autoReviewNextTryAt||"")>now))
  .sort((a,b)=>(Date.parse(a.autoReviewLastCheckedAt||"")||0)-(Date.parse(b.autoReviewLastCheckedAt||"")||0));
}
export function isProviderBlocked(doc, now=Date.now()){
 const s=doc?.autoReview||{};
 return !!s.blocked||(Date.parse(s.pausedUntil||"")>now);
}
