import { getAdminAccessStatus, parseAdminEmailAllowlist } from "../access.ts";
import { buildCleanupPreview, noStoreJson } from "./core.ts";

type VerifiedIdentity = { email:string|null } | null;

type CleanupPreviewDependencies = {
  getUser:(request:Request)=>Promise<VerifiedIdentity>;
  getEnvironment:()=>Promise<{
    adminAllowlist:unknown;
    db:D1Database|null;
    bucket:R2Bucket|null;
  }>;
  buildPreview?:typeof buildCleanupPreview;
};

export async function handleCleanupPreview(request:Request,deps:CleanupPreviewDependencies) {
  if(request.method!=="GET")return noStoreJson({error:"Method not allowed"},405);
  const user=await deps.getUser(request);
  if(getAdminAccessStatus(user,"")===401)return noStoreJson({error:"Sign in required"},401);
  const environment=await deps.getEnvironment();
  const accessStatus=getAdminAccessStatus(user,environment.adminAllowlist);
  if(accessStatus===403)return noStoreJson({error:"Owner access required"},403);
  if(!environment.db||!environment.bucket){
    return noStoreJson({error:"Cleanup preview storage is unavailable"},503);
  }
  try{
    const preview=await (deps.buildPreview??buildCleanupPreview)(
      environment.db,
      environment.bucket,
      parseAdminEmailAllowlist(environment.adminAllowlist),
    );
    return noStoreJson(preview);
  }catch{
    return noStoreJson({error:"Cleanup preview could not be generated"},503);
  }
}
