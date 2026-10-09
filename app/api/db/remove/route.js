import {ownerAuthorized} from "../../../../lib/guard";
import {readDb,removeIdsAndSave} from "../../../../lib/db";
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{const {id}=await req.json();if(typeof id!=="string"||!/^avtr_[0-9a-f-]{36}$/i.test(id))return Response.json({error:"Valid avatar ID required"},{status:400});
 const db=await readDb();if(!db.avatars.some(a=>String(a.id).toLowerCase()===id.toLowerCase()))return Response.json({error:"Avatar ID not found"},{status:404});
 const result=await removeIdsAndSave([id],`Ava-Valt: Owner removed avatar ${id}`);return Response.json(result);
 }catch(e){return Response.json({error:e.message},{status:500})}
}
