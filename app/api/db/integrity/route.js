import {ownerAuthorized} from "../../../../lib/guard";
import {databaseIntegrity} from "../../../../lib/integrity";
export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=60;
export async function GET(){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{return Response.json(await databaseIntegrity({repair:false}),{headers:{"Cache-Control":"no-store"}})}
 catch(e){return Response.json({error:e.message},{status:500})}
}
export async function POST(){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{return Response.json(await databaseIntegrity({repair:true}),{headers:{"Cache-Control":"no-store"}})}
 catch(e){return Response.json({error:e.message},{status:500})}
}
