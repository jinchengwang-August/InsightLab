import { getExternalUser } from "../../external-auth";

const createTables = [
  `CREATE TABLE IF NOT EXISTS validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'problem-discovery',
    target_responses INTEGER NOT NULL DEFAULT 100,
    reward_points INTEGER NOT NULL DEFAULT 50,
    visibility TEXT NOT NULL DEFAULT 'public',
    signal_score REAL,
    status TEXT NOT NULL DEFAULT 'draft',
    creator_email TEXT,
    study_type TEXT NOT NULL DEFAULT 'idea',
    requested_data TEXT NOT NULL DEFAULT '[]',
    survey_json TEXT NOT NULL DEFAULT '[]',
    attachment_key TEXT NOT NULL DEFAULT '',
    repository_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    validation_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    sentiment REAL,
    specificity REAL,
    constructiveness REAL,
    integrity_score REAL,
    reward_granted INTEGER NOT NULL DEFAULT 0,
    contributor_email TEXT,
    rating INTEGER,
    category TEXT,
    model_weight REAL,
    contribution_type TEXT NOT NULL DEFAULT 'comment',
    answer_json TEXT NOT NULL DEFAULT '{}',
    base_reward INTEGER NOT NULL DEFAULT 35,
    reputation_after REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (validation_id) REFERENCES validations(id)
  )`,
  `CREATE TABLE IF NOT EXISTS study_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_email TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

async function getDatabase() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("InsightLab database is not available.");
  return env.DB;
}

async function ensureSchema(db: D1Database) {
  await db.batch(createTables.map((sql) => db.prepare(sql)));
  const columns = await db.prepare("PRAGMA table_info(validations)").all<{name:string}>();
  if (!columns.results.some(column => column.name === "repository_url")) {
    await db.prepare("ALTER TABLE validations ADD COLUMN repository_url TEXT NOT NULL DEFAULT ''").run();
  }
}

export async function GET(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDatabase();
  await ensureSchema(db);
  const result = await db.prepare("SELECT * FROM validations WHERE status = 'published' OR creator_email = ? ORDER BY id DESC LIMIT 50").bind(user.identityKey).all();
  return Response.json({ validations: result.results });
}

export async function POST(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDatabase();
  await ensureSchema(db);
  const body = await request.json() as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (title.length < 5 || description.length < 20) {
    return Response.json({ error: "A clear title and description are required." }, { status: 400 });
  }
  const studyType = body.studyType === "survey" ? "survey" : "idea";
  const requestedData = Array.isArray(body.requestedData)
    ? body.requestedData.map(String).map(item => item.trim()).filter(Boolean).slice(0, 12)
    : [];
  const surveyQuestions = studyType === "survey" && Array.isArray(body.surveyQuestions)
    ? body.surveyQuestions.slice(0, 20).map((question) => {
      const row = question && typeof question === "object" ? question as Record<string, unknown> : {};
      const type = ["scale", "single", "multiple", "text"].includes(String(row.type)) ? String(row.type) : "text";
      return {
        id: String(row.id ?? crypto.randomUUID()).slice(0, 100),
        prompt: String(row.prompt ?? "").trim().slice(0, 500),
        type,
        required: Boolean(row.required),
        options: Array.isArray(row.options) ? row.options.map(String).map(item => item.trim()).filter(Boolean).slice(0, 8) : [],
      };
    }).filter(question => question.prompt.length >= 8)
    : [];
  if (!requestedData.length) return Response.json({ error: "Choose at least one requested result." }, { status: 400 });
  if (studyType === "survey" && !surveyQuestions.length) return Response.json({ error: "Add at least one complete survey question." }, { status: 400 });
  const attachmentKey = String(body.attachmentKey ?? "").trim().slice(0, 500);
  const repositoryUrl = String(body.repositoryUrl ?? "").trim().slice(0, 300);
  if (repositoryUrl && !/^https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+\/?$/i.test(repositoryUrl)) {
    return Response.json({ error: "Use a full GitHub repository URL." }, { status: 400 });
  }
  if (attachmentKey) {
    const ownedFile = await db.prepare("SELECT object_key FROM study_files WHERE object_key = ? AND owner_email = ?").bind(attachmentKey, user.identityKey).first();
    if (!ownedFile) return Response.json({ error: "The attached research file could not be verified." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const targetResponses = Math.max(25, Math.min(1000, Math.round(Number(body.targetResponses ?? 100))));
  const rewardPoints = Math.max(0, Math.min(1000, Math.round(Number(body.rewardPoints ?? 50))));
  const visibility = ["public", "targeted", "private"].includes(String(body.visibility)) ? String(body.visibility) : "public";
  const result = await db.prepare(
    "INSERT INTO validations (title, description, category, stage, target_responses, reward_points, visibility, status, creator_email, study_type, requested_data, survey_json, attachment_key, repository_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(title, description, String(body.category ?? "Other").slice(0, 100), String(body.stage ?? "problem-discovery").slice(0, 100), targetResponses, rewardPoints, visibility, "draft", user.identityKey, studyType, JSON.stringify(requestedData), JSON.stringify(surveyQuestions), attachmentKey, repositoryUrl, now).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, profile_email TEXT NOT NULL, amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL, reason TEXT NOT NULL, reference_type TEXT, reference_id TEXT, created_at TEXT NOT NULL
  )`).run();
  const profile=await db.prepare("SELECT points_balance FROM profiles WHERE auth_id=? OR email=?").bind(user.id,user.identityKey).first<{points_balance:number}>();
  const nextBalance=Number(profile?.points_balance??100)+20;
  await db.batch([
    db.prepare("UPDATE profiles SET points_balance=?,updated_at=? WHERE auth_id=? OR email=?").bind(nextBalance,now,user.id,user.identityKey),
    db.prepare(`INSERT INTO points_ledger (profile_email,amount,balance_after,reason,reference_type,reference_id,created_at)
      VALUES (?,20,?,'Created validation','validation',?,?)`).bind(user.identityKey,nextBalance,String(result.meta.last_row_id),now),
  ]);
  return Response.json({ id: result.meta.last_row_id, status: "draft", createdAt: now }, { status: 201 });
}
