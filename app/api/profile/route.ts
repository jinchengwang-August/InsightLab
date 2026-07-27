import { getExternalUser } from "../../external-auth";

async function db() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database unavailable");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    member_tier TEXT NOT NULL DEFAULT 'free',
    reputation_score REAL NOT NULL DEFAULT 500,
    points_balance INTEGER NOT NULL DEFAULT 100,
    interests TEXT NOT NULL DEFAULT '[]',
    headline TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    avatar_key TEXT NOT NULL DEFAULT '',
    cover_style TEXT NOT NULL DEFAULT 'signal',
    preferred_language TEXT NOT NULL DEFAULT 'en',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(profiles)").all<{name:string}>();
  if (!columns.results.some(column => column.name === "points_balance")) {
    await env.DB.prepare("ALTER TABLE profiles ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 100").run();
  }
  if (!columns.results.some(column => column.name === "cover_style")) {
    await env.DB.prepare("ALTER TABLE profiles ADD COLUMN cover_style TEXT NOT NULL DEFAULT 'signal'").run();
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_email TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    created_at TEXT NOT NULL
  )`).run();
  return env.DB;
}

const selectProfile = `SELECT display_name AS displayName, role, member_tier AS memberTier,
  reputation_score AS reputationScore, points_balance AS pointsBalance, interests, headline, bio, location, website,
  avatar_key AS avatarKey, cover_style AS coverStyle, email, phone, preferred_language AS preferredLanguage
  FROM profiles WHERE auth_id = ? OR email = ? LIMIT 1`;

function publicProfile(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    ...row,
    interests: JSON.parse(String(row.interests ?? "[]")),
    preferredLanguage: ["en", "zh", "es"].includes(String(row.preferredLanguage)) ? String(row.preferredLanguage) : "en",
    avatarUrl: row.avatarKey ? `/api/avatar?key=${encodeURIComponent(String(row.avatarKey))}` : "",
  };
}

export async function GET(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const database = await db();
  const row = await database.prepare(selectProfile).bind(user.id, user.identityKey).first<Record<string, unknown>>();
  return Response.json({ profile: publicProfile(row) });
}

export async function POST(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as {
    role?: string;
    displayName?: string;
    interests?: string[];
    headline?: string;
    bio?: string;
    location?: string;
    website?: string;
    preferredLanguage?: string;
    coverStyle?: string;
  };
  if (!["founder", "contributor", "investor"].includes(body.role ?? "")) {
    return Response.json({ error: "Valid role required" }, { status: 400 });
  }
  const displayName = String(body.displayName ?? user.displayName).trim().slice(0, 80);
  if (displayName.length < 2) return Response.json({ error: "Display name required" }, { status: 400 });
  const clean = {
    headline: String(body.headline ?? "").trim().slice(0, 120),
    bio: String(body.bio ?? "").trim().slice(0, 600),
    location: String(body.location ?? "").trim().slice(0, 80),
    website: String(body.website ?? "").trim().slice(0, 200),
    interests: JSON.stringify((body.interests ?? []).slice(0, 12).map(item => String(item).slice(0, 40))),
    preferredLanguage: ["en", "zh", "es"].includes(body.preferredLanguage ?? "") ? body.preferredLanguage! : "en",
    coverStyle: ["signal","ember","forest","constellation"].includes(body.coverStyle??"") ? body.coverStyle! : "signal",
  };
  const now = new Date().toISOString();
  const database = await db();
  const existing = await database.prepare("SELECT id FROM profiles WHERE auth_id = ? OR email = ? LIMIT 1")
    .bind(user.id, user.identityKey).first<{id:number}>();
  if (existing) {
    await database.prepare(`UPDATE profiles SET auth_id=?,phone=?,display_name=?,role=?,interests=?,
      headline=?,bio=?,location=?,website=?,preferred_language=?,cover_style=?,updated_at=? WHERE id=?`)
      .bind(user.id, user.phone, displayName, body.role, clean.interests, clean.headline,
        clean.bio, clean.location, clean.website, clean.preferredLanguage, clean.coverStyle, now, existing.id).run();
  } else {
    await database.prepare(`INSERT INTO profiles
      (auth_id,email,phone,display_name,role,member_tier,interests,headline,bio,location,website,preferred_language,cover_style,created_at,updated_at)
      VALUES (?, ?, ?, ?, ?, 'free', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(user.id, user.identityKey, user.phone, displayName, body.role, clean.interests,
        clean.headline, clean.bio, clean.location, clean.website, clean.preferredLanguage, clean.coverStyle, now, now).run();
    await database.prepare(`INSERT INTO points_ledger
      (profile_email,amount,balance_after,reason,reference_type,reference_id,created_at)
      VALUES (?,100,100,'Welcome bonus','account',?,?)`)
      .bind(user.identityKey,user.id,now).run();
  }
  const row = await database.prepare(selectProfile).bind(user.id, user.identityKey).first<Record<string, unknown>>();
  return Response.json({ profile: publicProfile(row) }, { status: 201 });
}
