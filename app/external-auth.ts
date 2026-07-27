export type AppIdentity = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  identityKey: string;
};

type SupabaseUserPayload = {
  id?: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function runtimeAuthConfig(env: unknown) {
  const values = env as Record<string, unknown>;
  const url = String(values.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = String(values.SUPABASE_PUBLISHABLE_KEY ?? "");
  return { url, key, configured: Boolean(url && key) };
}

export async function verifyExternalUser(
  request: Request,
  environment: unknown,
  fetcher: typeof fetch = fetch,
): Promise<AppIdentity | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const config = runtimeAuthConfig(environment);
  if (!config.configured) return null;

  const response = await fetcher(`${config.url}/auth/v1/user`, {
    headers: {
      authorization,
      apikey: config.key,
    },
  });
  if (!response.ok) return null;
  const payload = await response.json() as SupabaseUserPayload;
  const id = String(payload.id ?? "");
  if (!id) return null;
  const email = payload.email ? String(payload.email).toLowerCase() : null;
  const phone = payload.phone ? String(payload.phone) : null;
  const metadata = payload.user_metadata ?? {};
  const displayName = String(metadata.full_name ?? metadata.name ?? email?.split("@")[0] ?? phone ?? "InsightLab member").slice(0, 80);
  return {
    id,
    email,
    phone,
    displayName,
    identityKey: email ?? (phone ? `phone:${phone}` : `auth:${id}`),
  };
}

export async function getExternalUser(request: Request): Promise<AppIdentity | null> {
  const { env } = await import("cloudflare:workers");
  return verifyExternalUser(request, env);
}

export async function getPublicAuthConfig() {
  const { env } = await import("cloudflare:workers");
  return runtimeAuthConfig(env);
}
