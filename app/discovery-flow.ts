export type DiscoveryMode = "loading" | "live" | "demo" | "error";

export function discoveryModeForResponse(ok: boolean, publishedCount: number): Exclude<DiscoveryMode, "loading"> {
  if (!ok) return "error";
  return publishedCount > 0 ? "live" : "demo";
}
