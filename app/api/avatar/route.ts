import { getExternalUser } from "../../external-auth";

function safeImageType(type: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type);
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith("avatars/") || key.includes("..")) return new Response("Not found", { status: 404 });
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET) return new Response("Storage unavailable", { status: 503 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File) || !safeImageType(file.type) || file.size > 3_000_000) {
    return Response.json({ error: "Use a JPG, PNG, WebP, or GIF under 3 MB." }, { status: 400 });
  }
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET || !env.DB) return Response.json({ error: "Storage unavailable" }, { status: 503 });
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const key = `avatars/${user.id}/${crypto.randomUUID()}.${extension}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  await env.DB.prepare("UPDATE profiles SET avatar_key = ?, updated_at = ? WHERE auth_id = ? OR email = ?")
    .bind(key, new Date().toISOString(), user.id, user.identityKey).run();
  return Response.json({ avatarUrl: `/api/avatar?key=${encodeURIComponent(key)}` });
}
