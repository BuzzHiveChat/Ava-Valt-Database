
import {cookies} from "next/headers";
import {sessionInfo} from "./auth";
export async function currentUser(){
  const c=await cookies();
  return sessionInfo(c.get("avavalt_session")?.value);
}
export async function authorized(){return !!(await currentUser())}
export async function ownerAuthorized(){return (await currentUser())?.role==="owner"}
export async function requireRole(role="staff"){
  const u=await currentUser();
  if(!u)return {ok:false,status:401,error:"Unauthorized"};
  if(role==="owner"&&u.role!=="owner")return {ok:false,status:403,error:"Owner access required"};
  return {ok:true,user:u};
}
