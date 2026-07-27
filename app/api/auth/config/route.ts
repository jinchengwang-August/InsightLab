import { getPublicAuthConfig } from "../../../external-auth";

export async function GET() {
  const config = await getPublicAuthConfig();
  let providers = { email: config.configured, phone: false, google: false, github: false };

  if (config.configured) {
    try {
      const response = await fetch(`${config.url}/auth/v1/settings`, {
        headers: { apikey: config.key },
        signal: AbortSignal.timeout(2_500),
      });
      if (response.ok) {
        const settings = await response.json() as {
          external?: Record<string, boolean>;
        };
        providers = {
          email: Boolean(settings.external?.email),
          phone: Boolean(settings.external?.phone),
          google: Boolean(settings.external?.google),
          github: Boolean(settings.external?.github),
        };
      }
    } catch {
      // The client still receives the public project configuration and can
      // surface a useful connection error if provider discovery is unavailable.
    }
  }

  return Response.json(
    {
      configured: config.configured,
      url: config.configured ? config.url : null,
      publishableKey: config.configured ? config.key : null,
      providers,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
