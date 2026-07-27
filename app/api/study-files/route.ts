import { getExternalUser } from "../../external-auth";

const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const extension = file instanceof File ? allowedTypes.get(file.type) : undefined;
  if (!(file instanceof File) || !extension || file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Use a PDF, DOC, DOCX, TXT, JPG, PNG, or WebP file under 10 MB." }, { status: 400 });
  }
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET || !env.DB) return Response.json({ error: "Secure storage is temporarily unavailable." }, { status: 503 });
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_email TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  const key = `study-files/${user.id}/${crypto.randomUUID()}.${extension}`;
  const now = new Date().toISOString();
  await env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: user.id },
  });
  await env.DB.prepare("INSERT INTO study_files (owner_email, object_key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(user.identityKey, key, file.name.slice(0, 240), file.type, file.size, now).run();
  return Response.json({ key, fileName: file.name.slice(0, 240), size: file.size }, { status: 201 });
}
