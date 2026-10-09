
import crypto from "crypto";
const secret=()=>process.env.SESSION_SECRET||"";
export function makeSession(role="staff"){
  const safeRole=role==="owner"?"owner":"staff";
  const payload=`avavalt:${safeRole}:${Date.now()+1000*60*60*24*7}`;
  const sig=crypto.createHmac("sha256",secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}
export function sessionInfo(v){
  try{
    const raw=Buffer.from(v||"","base64url").toString();
    const parts=raw.split(":");
    // V2.16 sessions are avavalt:<role>:<expiry>:<signature>.
    if(parts.length!==4||parts[0]!=="avavalt")return null;
    const role=parts[1];
    if(role!=="owner"&&role!=="staff")return null;
    if(Number(parts[2])<Date.now())return null;
    const payload=`${parts[0]}:${role}:${parts[2]}`;
    const sig=crypto.createHmac("sha256",secret()).update(payload).digest("hex");
    const a=Buffer.from(sig),b=Buffer.from(parts[3]);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    return {role,expires:Number(parts[2])};
  }catch{return null}
}
export function validSession(v){return !!sessionInfo(v)}
