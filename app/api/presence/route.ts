import { getExternalUser } from "../../external-auth";

async function getDatabase() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database unavailable");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS presence (
      email TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      current_view TEXT NOT NULL DEFAULT 'home',
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS presence_last_seen_idx ON presence (last_seen)"),
  ]);
  return env.DB;
}

async function currentOnline(db: D1Database) {
  const threshold = Date.now() - 120_000;
  const row = await db.prepare("SELECT COUNT(*) AS count FROM presence WHERE last_seen >= ?").bind(threshold).first<{ count:number }>();
  return Number(row?.count ?? 0);
}

export async function GET(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDatabase();
  return Response.json({ online: await currentOnline(db), windowSeconds: 120, asOf: new Date().toISOString() });
}

export async function POST(request:Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { view?:string };
  const db = await getDatabase();
  const profile = await db.prepare("SELECT role, display_name FROM profiles WHERE auth_id = ? OR email = ?").bind(user.id, user.identityKey).first<{ role:string; display_name:string }>();
  const now = Date.now();
  await db.prepare(`INSERT INTO presence (email,display_name,role,current_view,first_seen,last_seen)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,current_view=excluded.current_view,last_seen=excluded.last_seen`)
    .bind(user.identityKey, profile?.display_name ?? user.displayName, profile?.role ?? "unregistered", String(body.view ?? "home").slice(0,40), now, now).run();
  return Response.json({ online: await currentOnline(db), windowSeconds: 120, asOf: new Date().toISOString() });
}
