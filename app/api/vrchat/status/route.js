import {ownerAuthorized} from "../../../../lib/guard";
import {vrchatStatus} from "../../../../lib/vrchat";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function GET(){if(!await ownerAuthorized())return Response.json({error:"UnownerAuthorized"},{status:403});return Response.json(await vrchatStatus(),{headers:{"Cache-Control":"no-store"}})}
