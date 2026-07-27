import { getExternalUser } from "../../external-auth";

async function hasAdminAccess(email: string | null) {
  if (!email) return false;
  const { env } = await import("cloudflare:workers");
  const values = env as unknown as Record<string, unknown>;
  const allowedEmails = String(values.INSIGHTLAB_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(email.trim().toLowerCase());
}

async function getDatabase() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database unavailable");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS presence (
    email TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    current_view TEXT NOT NULL DEFAULT 'home',
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  )`).run();
  const responseColumns=await env.DB.prepare("PRAGMA table_info(responses)").all<{name:string}>();
  if(!responseColumns.results.some(column=>column.name==="moderation_status")){
    await env.DB.prepare("ALTER TABLE responses ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'active'").run();
  }
  const profileColumns=await env.DB.prepare("PRAGMA table_info(profiles)").all<{name:string}>();
  if(!profileColumns.results.some(column=>column.name==="points_balance")){
    await env.DB.prepare("ALTER TABLE profiles ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 100").run();
  }
  return env.DB;
}

export async function GET(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!await hasAdminAccess(user.email)) return Response.json({ error: "Owner access required" }, { status: 403 });
  const db = await getDatabase();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const [usersCount,onlineCount,validationsCount,responsesCount,newUsersCount] = await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM profiles"),
    db.prepare("SELECT COUNT(*) AS count FROM presence WHERE last_seen >= ?").bind(now - 120_000),
    db.prepare("SELECT COUNT(*) AS count FROM validations WHERE status != 'archived'"),
    db.prepare("SELECT COUNT(*) AS count FROM responses"),
    db.prepare("SELECT COUNT(*) AS count FROM profiles WHERE created_at >= ?").bind(sevenDaysAgo),
  ]);
  const roles = await db.prepare("SELECT role, COUNT(*) AS count FROM profiles GROUP BY role ORDER BY count DESC").all();
  const users = await db.prepare(`SELECT p.display_name AS displayName,p.email,p.phone,p.role,p.member_tier AS memberTier,
    p.reputation_score AS reputationScore,p.points_balance AS pointsBalance,p.created_at AS createdAt,pr.last_seen AS lastSeen
    FROM profiles p LEFT JOIN presence pr ON pr.email=p.email ORDER BY p.created_at DESC LIMIT 100`).all();
  const activity = await db.prepare(`SELECT substr(created_at,1,10) AS day,COUNT(*) AS count FROM (
    SELECT created_at FROM profiles WHERE created_at >= ?
    UNION ALL SELECT created_at FROM validations WHERE created_at >= ?
    UNION ALL SELECT created_at FROM responses WHERE created_at >= ?
  ) GROUP BY substr(created_at,1,10) ORDER BY day`).bind(sevenDaysAgo,sevenDaysAgo,sevenDaysAgo).all();
  const posts=await db.prepare(`SELECT id,title,description,category,status,creator_email AS author,created_at AS createdAt
    FROM validations ORDER BY id DESC LIMIT 60`).all();
  const comments=await db.prepare(`SELECT r.id,r.body,r.rating,r.integrity_score AS integrityScore,
    COALESCE(r.moderation_status,'active') AS moderationStatus,r.contributor_email AS author,
    COALESCE(v.title,'Idea #'||r.validation_id) AS ideaTitle,r.created_at AS createdAt
    FROM responses r LEFT JOIN validations v ON v.id=r.validation_id ORDER BY r.id DESC LIMIT 100`).all();
  const count = (result:D1Result<unknown>) => Number((result.results[0] as {count?:number}|undefined)?.count ?? 0);
  return Response.json({
    metrics: {
      users: count(usersCount),
      online: count(onlineCount),
      validations: count(validationsCount),
      responses: count(responsesCount),
      newUsers7d: count(newUsersCount),
    },
    roles: roles.results,
    users: users.results,
    activity: activity.results,
    posts:posts.results,
    comments:comments.results,
    asOf: new Date().toISOString(),
  });
}

export async function POST(request:Request){
  const user=await getExternalUser(request);
  if(!user)return Response.json({error:"Sign in required"},{status:401});
  if(!await hasAdminAccess(user.email))return Response.json({error:"Owner access required"},{status:403});
  const body=await request.json() as {action?:string;type?:string;id?:number};
  const id=Math.round(Number(body.id));
  if(!Number.isFinite(id)||id<1)return Response.json({error:"Valid content id required"},{status:400});
  const db=await getDatabase();
  if(body.type==="post"){
    const status=body.action==="restore"?"draft":"archived";
    await db.prepare("UPDATE validations SET status=? WHERE id=?").bind(status,id).run();
  }else if(body.type==="comment"){
    const status=body.action==="restore"?"active":"removed";
    await db.prepare("UPDATE responses SET moderation_status=? WHERE id=?").bind(status,id).run();
  }else return Response.json({error:"Unknown content type"},{status:400});
  return Response.json({ok:true,id,action:body.action,type:body.type});
}
