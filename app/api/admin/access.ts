export function normalizeAdminEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function parseAdminEmailAllowlist(value: unknown) {
  return [...new Set(
    String(value ?? "")
      .split(",")
      .map(normalizeAdminEmail)
      .filter(Boolean),
  )];
}

export function hasAdminAccess(email: string | null, allowlistValue: unknown) {
  const normalized = normalizeAdminEmail(email);
  return Boolean(normalized && parseAdminEmailAllowlist(allowlistValue).includes(normalized));
}

export function getAdminAccessStatus(user:{email:string|null}|null,allowlistValue:unknown):200|401|403 {
  if(!user)return 401;
  return hasAdminAccess(user.email,allowlistValue)?200:403;
}
