
import {currentUser} from "../../../lib/guard";
export async function GET(){
 const u=await currentUser();
 if(!u)return Response.json({error:"Unauthorized"},{status:401});
 return Response.json({role:u.role,isOwner:u.role==="owner"});
}
