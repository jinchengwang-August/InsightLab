import { getExternalUser } from "../../external-auth";

async function database(){
  const {env}=await import("cloudflare:workers");
  if(!env.DB)throw new Error("Database unavailable");
  const columns=await env.DB.prepare("PRAGMA table_info(profiles)").all<{name:string}>();
  if(!columns.results.some(column=>column.name==="points_balance")){
    await env.DB.prepare("ALTER TABLE profiles ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 100").run();
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, profile_email TEXT NOT NULL, amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL, reason TEXT NOT NULL, reference_type TEXT, reference_id TEXT, created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, profile_email TEXT NOT NULL, reward_code TEXT NOT NULL,
    points_cost INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
  )`).run();
  return env.DB;
}

export async function GET(request:Request){
  const user=await getExternalUser(request);
  if(!user)return Response.json({error:"Sign in required"},{status:401});
  const db=await database();
  const profile=await db.prepare("SELECT points_balance AS pointsBalance,member_tier AS memberTier,reputation_score AS reputationScore FROM profiles WHERE auth_id=? OR email=?")
    .bind(user.id,user.identityKey).first<Record<string,unknown>>();
  const ledger=await db.prepare(`SELECT id,amount,balance_after AS balanceAfter,reason,reference_type AS referenceType,
    reference_id AS referenceId,created_at AS createdAt FROM points_ledger WHERE profile_email=? ORDER BY id DESC LIMIT 50`)
    .bind(user.identityKey).all();
  return Response.json({account:profile??{pointsBalance:100,memberTier:"free",reputationScore:500},ledger:ledger.results});
}

export async function POST(request:Request){
  const user=await getExternalUser(request);
  if(!user)return Response.json({error:"Sign in required"},{status:401});
  const body=await request.json() as {rewardCode?:string};
  const catalog:Record<string,{cost:number;label:string}>={
    coffee:{cost:500,label:"$5 partner coffee credit"},
    cash10:{cost:1200,label:"$10 cash-back review"},
    proMonth:{cost:2500,label:"One month InsightLab Pro"},
  };
  const reward=catalog[String(body.rewardCode??"")];
  if(!reward)return Response.json({error:"Unknown reward"},{status:400});
  const db=await database();
  const profile=await db.prepare("SELECT points_balance FROM profiles WHERE auth_id=? OR email=?").bind(user.id,user.identityKey).first<{points_balance:number}>();
  const balance=Number(profile?.points_balance??100);
  if(balance<reward.cost)return Response.json({error:"Not enough points"},{status:409});
  const next=balance-reward.cost;
  const now=new Date().toISOString();
  const redemption=await db.prepare("INSERT INTO redemptions (profile_email,reward_code,points_cost,status,created_at) VALUES (?,?,?,'pending',?)")
    .bind(user.identityKey,body.rewardCode,reward.cost,now).run();
  await db.batch([
    db.prepare("UPDATE profiles SET points_balance=?,updated_at=? WHERE auth_id=? OR email=?").bind(next,now,user.id,user.identityKey),
    db.prepare(`INSERT INTO points_ledger (profile_email,amount,balance_after,reason,reference_type,reference_id,created_at)
      VALUES (?,?,?,?,?,?,?)`).bind(user.identityKey,-reward.cost,next,`Redeemed: ${reward.label}`,"redemption",String(redemption.meta.last_row_id),now),
  ]);
  return Response.json({ok:true,balance:next,status:"pending",label:reward.label});
}
