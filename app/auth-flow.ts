type SessionResult = {
  data?: {
    session?: {
      access_token?: string;
      user?: { id?: string };
    } | null;
  };
  error?: unknown;
};

export function hasVerifiedSupabaseSession(result: SessionResult | null | undefined) {
  const session = result?.data?.session;
  return Boolean(!result?.error && session?.access_token && session.user?.id);
}
