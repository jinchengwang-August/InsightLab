const themeRules=[
  ["convenience",["easy","convenient","pickup","door","time","effort"]],
  ["trust",["trust","safe","hygiene","reliable","privacy"]],
  ["price",["price","cost","fee","deposit","pay"]],
  ["adoption",["switch","try","use","adopt","habit"]],
  ["sustainability",["climate","waste","reuse","environment","sustainable"]],
] as const;

type AnalysisIdentity = { identityKey:string } | null;

export async function analyzeForUser(request:Request,user:AnalysisIdentity,db:D1Database|null){
  if(!user)return Response.json({error:"Sign in required"},{status:401});
  if(!db)throw new Error("Database unavailable");
  const requestedId=Number(new URL(request.url).searchParams.get("validationId")??0);
  const validation=requestedId>0
    ?await db.prepare("SELECT id,creator_email FROM validations WHERE id = ?").bind(requestedId).first<{id:number;creator_email:string|null}>()
    :await db.prepare("SELECT id,creator_email FROM validations WHERE creator_email = ? ORDER BY created_at DESC, id DESC LIMIT 1").bind(user.identityKey).first<{id:number;creator_email:string|null}>();
  if(!validation)return Response.json({error:"No validation is available for analysis"},{status:404});
  if(!validation.creator_email||validation.creator_email!==user.identityKey)return Response.json({error:"Only the study owner can view contributor-level analysis"},{status:403});
  const id=Number(validation.id);
  const result=await db.prepare(`SELECT r.body,r.sentiment,r.integrity_score,r.model_weight,r.category,
    COALESCE(p.display_name,'Anonymous contributor') AS contributor_name
    FROM responses r LEFT JOIN profiles p ON p.email=r.contributor_email
    WHERE r.validation_id=?`).bind(id).all();
  const rows=result.results as Array<Record<string,unknown>>;
  const totalWeight=rows.reduce((sum,row)=>sum+Number(row.model_weight??1),0)||1;
  const sentiment=rows.reduce((sum,row)=>sum+Number(row.sentiment??0)*Number(row.model_weight??1),0)/totalWeight;
  const quality=rows.reduce((sum,row)=>sum+Number(row.integrity_score??0)*Number(row.model_weight??1),0)/totalWeight;
  const themes=themeRules.map(([name,keys])=>({name,evidence:rows.reduce((count,row)=>count+(keys.some(key=>String(row.body).toLowerCase().includes(key))?Number(row.model_weight??1):0),0)/totalWeight})).sort((a,b)=>b.evidence-a.evidence);
  const confidence=Math.min(97,Math.round(55+Math.sqrt(rows.length)*4+quality*.18));
  const signalScore=Math.round(50+sentiment*25+quality*.2);
  return Response.json({modelVersion:"insight-v1.2",responseCount:rows.length,signalScore,confidence,weightedSentiment:sentiment,averageQuality:quality,themes,contributors:rows.slice(0,50)});
}
