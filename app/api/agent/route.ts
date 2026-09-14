import { getExternalUser } from "../../external-auth";
import { runInsightAgent } from "./core";

type AgentPayload = {
  message?: string;
  role?: string;
  locale?: string;
  context?: unknown;
};

export async function POST(request: Request) {
  const user = await getExternalUser(request);
  if (!user) return Response.json({error: "Sign in required"}, {status: 401});
  const {env} = await import("cloudflare:workers");
  if (!env.DB) return Response.json({error: "Database unavailable"}, {status: 503});

  const profile = await env.DB.prepare("SELECT role FROM profiles WHERE auth_id=? OR email=? LIMIT 1")
    .bind(user.id, user.identityKey)
    .first<{role: string}>();
  if (!profile) return Response.json({error: "Complete registration before using Insight AI."}, {status: 403});

  const payload = await request.json() as AgentPayload;
  const message = String(payload.message ?? "").trim().slice(0, 1_800);
  if (message.length < 2) return Response.json({error: "Add a question or idea first."}, {status: 400});
  const role = ["founder", "contributor", "investor"].includes(String(profile.role))
    ? profile.role as "founder" | "contributor" | "investor"
    : "contributor";
  const locale = ["en", "zh", "es"].includes(String(payload.locale))
    ? payload.locale as "en" | "zh" | "es"
    : "en";
  const context = payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)
    ? payload.context as Record<string, unknown>
    : {};

  try {
    const result = await runInsightAgent({message, role, locale, context}, user, env);
    return Response.json(result.body, {
      status: result.status,
      headers: {"Cache-Control": "no-store"},
    });
  } catch {
    return Response.json(
      {error: "Insight AI could not complete this request."},
      {status: 502, headers: {"Cache-Control": "no-store"}},
    );
  }
}

