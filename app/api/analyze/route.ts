import { getExternalUser } from "../../external-auth";
import { analyzeForUser } from "./core";

export async function GET(request:Request){
  const user=await getExternalUser(request);
  const {env}=await import("cloudflare:workers");
  return analyzeForUser(request,user,env.DB??null);
}
