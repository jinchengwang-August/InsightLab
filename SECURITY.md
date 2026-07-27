# Security policy

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting or the Security Advisory flow and include the affected route, reproduction steps, impact, and a safe proof of concept.

Do not include real tokens, passwords, provider secrets, private files, or personal data.

Security fixes apply to the latest default-branch version. Browser code may use only the Supabase Project URL and publishable key. `service_role` keys and provider secrets must remain server-side. Protected APIs must verify a bearer session, authenticated files must use protected storage routes, and public analytics must remain aggregated.
