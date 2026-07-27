import { getExternalUser } from "../../external-auth";

function clamp(n:number){ return Math.max(0,Math.min(100,Math.round(n))); }
function scoreText(text:string){
  const words=text.toLowerCase().split(/\s+/).filter(Boolean);
  const unique=new Set(words).size/Math.max(words.length,1);
  const specificity=clamp(28+Math.min(words.length,90)*.58+(/\d|because|example|when|if|因为|例如/.test(text.toLowerCase())?20:0));
  const constructiveness=clamp(35+(/suggest|could|would|improve|recommend|建议|可以/.test(text.toLowerCase())?32:0)+Math.min(words.length,60)*.32);
  const relevance=clamp(48+Math.min(words.length,70)*.42);
  const consistency=clamp(62+unique*30);
  const duplicateRisk=clamp((1-unique)*70+(/(.)\1{4,}/.test(text)?25:0));
  const quality=clamp(specificity*.30+constructiveness*.25+relevance*.20+consistency*.15+(100-duplicateRisk)*.10);
  return {specificity,constructiveness,relevance,consistency,duplicateRisk,quality,weight:Math.max(.35,Math.min(1.35,quality/78))};
}

function similarity(a:string,b:string){
  const left=new Set(a.toLowerCase().split(/\W+/).filter(x=>x.length>2));
  const right=new Set(b.toLowerCase().split(/\W+/).filter(x=>x.length>2));
  const intersection=[...left].filter(x=>right.has(x)).length;
  const union=new Set([...left,...right]).size||1;
  return intersection/union;
}

async function database(){
  const {env}=await import("cloudflare:workers"); if(!env.DB)throw new Error("Database unavailable");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, validation_id INTEGER NOT NULL, body TEXT NOT NULL,
    sentiment REAL, specificity REAL, constructiveness REAL, integrity_score REAL,
    reward_granted INTEGER NOT NULL DEFAULT 0, contributor_email TEXT, rating INTEGER,
    category TEXT, model_weight REAL, contribution_type TEXT NOT NULL DEFAULT 'comment',
    answer_json TEXT NOT NULL DEFAULT '{}', base_reward INTEGER NOT NULL DEFAULT 35,
    reputation_after REAL, created_at TEXT NOT NULL
  )`).run();
  const responseColumns=await env.DB.prepare("PRAGMA table_info(responses)").all<{name:string}>();
  if(!responseColumns.results.some(column=>column.name==="moderation_status")){
    await env.DB.prepare("ALTER TABLE responses ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'active'").run();
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, profile_email TEXT NOT NULL, amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL, reason TEXT NOT NULL, reference_type TEXT, reference_id TEXT, created_at TEXT NOT NULL
  )`).run();
  return env.DB;
}

export async function GET(request:Request){
  const user=await getExternalUser(request);
  if(!user)return Response.json({error:"Sign in required"},{status:401});
  const db=await database();
  const result=await db.prepare(`SELECT r.id,r.validation_id,r.body,r.rating,r.integrity_score,r.model_weight,r.contribution_type,
    r.reward_granted,r.created_at,COALESCE(v.title,'Idea #' || r.validation_id) AS idea_title,
    COALESCE(v.category,r.category,'Other') AS idea_category
    FROM responses r LEFT JOIN validations v ON v.id=r.validation_id
    WHERE r.contributor_email=? AND COALESCE(r.moderation_status,'active')!='removed' ORDER BY r.created_at DESC LIMIT 100`).bind(user.identityKey).all();
  const items=(result.results as Array<Record<string,unknown>>).map(row=>({
    id:Number(row.id),
    ideaTitle:String(row.idea_title),
    ideaCategory:String(row.idea_category),
    body:String(row.body),
    rating:Number(row.rating??0),
    quality:Number(row.integrity_score??0),
    weight:Number(row.model_weight??1),
    points:Number(row.reward_granted??0),
    contributionType:String(row.contribution_type??"comment"),
    createdAt:String(row.created_at),
    status:Number(row.integrity_score??0)>=70?"approved" as const:"review" as const,
  }));
  const contributions=items.length;
  const pointsEarned=items.reduce((sum,item)=>sum+item.points,0);
  const averageQuality=contributions?items.reduce((sum,item)=>sum+item.quality,0)/contributions:0;
  const averageWeight=contributions?items.reduce((sum,item)=>sum+item.weight,0)/contributions:0;
  const approved=items.filter(item=>item.status==="approved").length;
  const now=Date.now();
  const week=7*86_400_000;
  const buckets=Array.from({length:6},(_,index)=>{
    const start=now-(6-index)*week;
    const end=start+week;
    const rows=items.filter(item=>{
      const time=new Date(item.createdAt).getTime();
      return time>=start&&time<end;
    });
    return {
      label:new Date(start).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"}),
      points:rows.reduce((sum,item)=>sum+item.points,0),
      contributions:rows.length,
    };
  });
  return Response.json({
    summary:{contributions,pointsEarned,averageQuality,averageWeight,approved,pending:contributions-approved},
    items,
    activity:buckets,
  });
}

export async function POST(request:Request){
  const user=await getExternalUser(request); if(!user)return Response.json({error:"Sign in required"},{status:401});
  const body=await request.json() as {validationId?:number;body?:string;rating?:number;category?:string;contributionType?:string;answers?:unknown};
  const text=String(body.body??"").trim().slice(0,10_000);
  const rating=Number(body.rating??0);
  const contributionType=["rating","comment","survey"].includes(String(body.contributionType))?String(body.contributionType) as "rating"|"comment"|"survey":"comment";
  const answers=body.answers&&typeof body.answers==="object"&&!Array.isArray(body.answers)?body.answers as Record<string,unknown>:{};
  const answerJson=JSON.stringify(answers);
  if(rating<1||rating>5)return Response.json({error:"Choose a rating from 1 to 5."},{status:400});
  if(contributionType==="comment"&&text.length<20)return Response.json({error:"A reasoned comment of at least 20 characters is required."},{status:400});
  if(contributionType==="survey"&&!Object.keys(answers).length)return Response.json({error:"Complete the survey before submitting."},{status:400});
  if(answerJson.length>20_000)return Response.json({error:"The survey response is too large."},{status:400});
  const answerText=Object.values(answers).flatMap(value=>Array.isArray(value)?value:[value]).map(String).join(" ");
  const scoringText=contributionType==="rating"?`Verified category rating ${rating}`:`${text} ${answerText}`.trim();
  const harmfulPatterns=[
    /\b(kill yourself|racial slur|terrorist threat)\b/i,
    /(去死|垃圾人|种族歧视|恐怖袭击)/i,
    /\b(mátate|insulto racial|amenaza terrorista)\b/i,
  ];
  const harmful=harmfulPatterns.some(pattern=>pattern.test(scoringText));
  const rawScores=scoreText(scoringText);
  const qualityBonus=contributionType==="survey"?Math.min(10,Object.keys(answers).length*2):0;
  const scores={...rawScores,quality:clamp(rawScores.quality+qualityBonus),weight:Math.max(.35,Math.min(1.35,(rawScores.quality+qualityBonus)/78))};
  const sentiment=(rating-3)/2;
  const db=await database();
  const now=new Date().toISOString();
  const existing=contributionType==="rating"?{results:[] as Array<{body:string}>}:await db.prepare("SELECT body FROM responses WHERE validation_id=? AND LENGTH(body)>20 ORDER BY id DESC LIMIT 200").bind(body.validationId??1).all<{body:string}>();
  const maxSimilarity=existing.results.reduce((max,row)=>Math.max(max,similarity(scoringText,row.body)),0);
  const reputation=await db.prepare("SELECT reputation_score FROM profiles WHERE auth_id=? OR email=?").bind(user.id,user.identityKey).first<{reputation_score:number}>();
  const previousReputation=Math.max(0,Math.min(1000,Number(reputation?.reputation_score??500)));
  const reputationMultiplier=Math.max(.85,Math.min(1.15,.85+(previousReputation/1000)*.3));
  const duplicateMultiplier=maxSimilarity>.82?.35:maxSimilarity>.65?.7:1;
  const finalWeight=Math.max(.25,Math.min(1.45,scores.weight*reputationMultiplier*duplicateMultiplier));
  const baseReward=contributionType==="rating"?12:contributionType==="comment"?35:70;
  const rewardGranted=harmful?-Math.max(10,Math.round(baseReward*.75)):Math.max(1,Math.round(baseReward*finalWeight));
  const duplicatePenalty=maxSimilarity>.82?45:maxSimilarity>.65?15:0;
  const nextRaw=contributionType==="rating"
    ? previousReputation+.8
    : previousReputation*(contributionType==="survey" ? .91 : .94)+scores.quality*10*(contributionType==="survey" ? .09 : .06)-duplicatePenalty;
  const nextReputation=Math.max(0,Math.min(1000,Math.round(harmful?nextRaw-90:nextRaw)));
  const result=await db.prepare(`INSERT INTO responses (validation_id,body,sentiment,specificity,constructiveness,integrity_score,reward_granted,contributor_email,rating,category,model_weight,contribution_type,answer_json,base_reward,reputation_after,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(body.validationId??1,text,sentiment,scores.specificity,scores.constructiveness,scores.quality,rewardGranted,user.identityKey,rating,String(body.category??"Other").slice(0,100),finalWeight,contributionType,answerJson,baseReward,nextReputation,now).run();
  const profile=await db.prepare("SELECT points_balance FROM profiles WHERE auth_id=? OR email=?").bind(user.id,user.identityKey).first<{points_balance:number}>();
  const nextBalance=Math.max(0,Number(profile?.points_balance??100)+rewardGranted);
  const updates=[
    db.prepare("UPDATE profiles SET reputation_score=?,points_balance=?,updated_at=? WHERE auth_id=? OR email=?").bind(nextReputation,nextBalance,now,user.id,user.identityKey),
    db.prepare(`INSERT INTO points_ledger (profile_email,amount,balance_after,reason,reference_type,reference_id,created_at)
      VALUES (?,?,?,?,?,?,?)`).bind(user.identityKey,rewardGranted,nextBalance,harmful?"Safety policy penalty":"Verified contribution","response",String(result.meta.last_row_id),now),
  ];
  if(harmful)updates.push(db.prepare("UPDATE responses SET moderation_status='flagged' WHERE id=?").bind(result.meta.last_row_id));
  await db.batch(updates);
  return Response.json({
    id:result.meta.last_row_id,
    scores:{...scores,maxSimilarity,reputationMultiplier,finalWeight},
    rewardGranted,
    pointsBalance:nextBalance,
    moderation:{status:harmful?"flagged":"active",flags:harmful?["unsafe_language"]:[]},
    reputation:{previous:Math.round(previousReputation),current:nextReputation,change:nextReputation-Math.round(previousReputation)},
  },{status:201});
}
