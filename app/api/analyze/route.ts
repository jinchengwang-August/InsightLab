import { getExternalUser } from "../../external-auth";

const themeRules=[
  ["convenience",["easy","convenient","pickup","door","time","effort"]],
  ["trust",["trust","safe","hygiene","reliable","privacy"]],
  ["price",["price","cost","fee","deposit","pay"]],
  ["adoption",["switch","try","use","adopt","habit"]],
  ["sustainability",["climate","waste","reuse","environment","sustainable"]],
] as const;

export async function GET(request:Request){
  const user=await getExternalUser(request); if(!user)return Response.json({error:"Sign in required"},{status:401});
  const {env}=await import("cloudflare:workers"); if(!env.DB)throw new Error("Database unavailable");
  const id=Number(new URL(request.url).searchParams.get("validationId")??1);
  const validation = await env.DB.prepare("SELECT creator_email FROM validations WHERE id = ?").bind(id).first<{creator_email:string|null}>();
  if (validation?.creator_email && validation.creator_email !== user.identityKey) return Response.json({error:"Only the study owner can view contributor-level analysis"},{status:403});
  const result=await env.DB.prepare(`SELECT r.body,r.sentiment,r.integrity_score,r.model_weight,r.category,
    COALESCE(p.display_name,'Anonymous contributor') AS contributor_name
    FROM responses r LEFT JOIN profiles p ON p.email=r.contributor_email
    WHERE r.validation_id=?`).bind(id).all();
  const rows=result.results as Array<Record<string,unknown>>;
  const totalWeight=rows.reduce((s,r)=>s+Number(r.model_weight??1),0)||1;
  const sentiment=rows.reduce((s,r)=>s+Number(r.sentiment??0)*Number(r.model_weight??1),0)/totalWeight;
  const quality=rows.reduce((s,r)=>s+Number(r.integrity_score??0)*Number(r.model_weight??1),0)/totalWeight;
  const themes=themeRules.map(([name,keys])=>({name,evidence:rows.reduce((n,r)=>n+(keys.some(k=>String(r.body).toLowerCase().includes(k))?Number(r.model_weight??1):0),0)/totalWeight})).sort((a,b)=>b.evidence-a.evidence);
  const confidence=Math.min(97,Math.round(55+Math.sqrt(rows.length)*4+quality*.18));
  const signalScore=Math.round(50+sentiment*25+quality*.2);
  return Response.json({modelVersion:"insight-v1.2",responseCount:rows.length,signalScore,confidence,weightedSentiment:sentiment,averageQuality:quality,themes,contributors:rows.slice(0,50)});
}
