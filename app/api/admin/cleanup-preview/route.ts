import { getExternalUser } from "../../../external-auth";
import { handleCleanupPreview } from "./handler";

export async function GET(request:Request) {
  return handleCleanupPreview(request,{
    getUser:getExternalUser,
    getEnvironment:async()=>{
      const {env}=await import("cloudflare:workers");
      return {
        adminAllowlist:env.INSIGHTLAB_ADMIN_EMAILS,
        db:env.DB??null,
        bucket:env.BUCKET??null,
      };
    },
  });
}
