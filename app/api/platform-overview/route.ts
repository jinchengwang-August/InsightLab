async function getDatabase(){
  const {env}=await import("cloudflare:workers");
  if(!env.DB)throw new Error("Database unavailable");
  return env.DB;
}

export async function GET(){
  const db=await getDatabase();
  const now=Date.now();
  const sevenDaysAgo=new Date(now-7*86_400_000).toISOString();
  const [users,online,validations,responses,quality]=await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM profiles"),
    db.prepare("SELECT COUNT(*) AS count FROM presence WHERE last_seen >= ?").bind(now-120_000),
    db.prepare("SELECT COUNT(*) AS count FROM validations WHERE status != 'archived'"),
    db.prepare("SELECT COUNT(*) AS count FROM responses"),
    db.prepare("SELECT AVG(integrity_score) AS average FROM responses"),
  ]);
  const roles=await db.prepare("SELECT role,COUNT(*) AS count FROM profiles GROUP BY role").all();
  const activity=await db.prepare(`SELECT substr(created_at,1,10) AS day,COUNT(*) AS count FROM (
    SELECT created_at FROM profiles WHERE created_at >= ?
    UNION ALL SELECT created_at FROM validations WHERE created_at >= ?
    UNION ALL SELECT created_at FROM responses WHERE created_at >= ?
  ) GROUP BY substr(created_at,1,10) ORDER BY day`).bind(sevenDaysAgo,sevenDaysAgo,sevenDaysAgo).all();
  const count=(result:D1Result<unknown>)=>Number((result.results[0] as {count?:number}|undefined)?.count??0);
  const average=Number((quality.results[0] as {average?:number|null}|undefined)?.average??0);
  const roleMap={founder:0,contributor:0,investor:0};
  for(const row of roles.results as Array<{role:string;count:number}>){
    if(row.role in roleMap)roleMap[row.role as keyof typeof roleMap]=Number(row.count);
  }
  return Response.json({
    metrics:{
      users:count(users),
      online:count(online),
      validations:count(validations),
      responses:count(responses),
      averageQuality:average,
    },
    roles:roleMap,
    activity:(activity.results as Array<{day:string;count:number}>).map(row=>({day:row.day,count:Number(row.count)})),
    asOf:new Date().toISOString(),
  },{headers:{"cache-control":"no-store"}});
}
