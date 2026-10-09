
import {NextResponse} from "next/server";
import {makeSession} from "../../../lib/auth";
export async function POST(req){
 const {password}=await req.json();
 const owner=process.env.OWNER_PASSWORD||"";
 const staff=process.env.ADMIN_PASSWORD||"";
 let role=null;
 if(owner&&password===owner)role="owner";
 else if(staff&&password===staff)role="staff";
 if(!role)return NextResponse.json({error:"Unauthorized"},{status:401});
 const r=NextResponse.json({ok:true,role});
 r.cookies.set("avavalt_session",makeSession(role),{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:604800});
 return r;
}
