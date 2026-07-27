# InsightLab Agent Guide

Read `docs/PROJECT_CONTEXT.md` before making product changes.

## Product rules

- InsightLab serves founders, contributors, and investors.
- Preserve the dark plum, forest, and burnt-orange visual identity.
- Public pages lead to authentication only after the user chooses to start.
- `/admin` is a separate owner-only surface.
- Interface copy must remain synchronized across English, Simplified Chinese, and Spanish.
- Changing language must not change typography size, component dimensions, or information hierarchy.
- Never translate user-authored ideas, profiles, comments, or survey answers automatically.
- Demo data must remain visibly labeled.
- Never describe the transparent scoring baseline as a guaranteed predictor of startup success.

## Data and security

- Supabase handles authentication.
- D1 stores profiles, validations, responses, presence, points, and moderation records.
- R2 stores private founder files and profile images.
- Never commit `.env`, secret keys, SMTP credentials, OAuth secrets, or Stripe secret keys.
- Test payment changes in Stripe test mode before any live configuration.

## Quality gate

Run:

```bash
npm run lint
npm run build
```

Check phone, tablet, and desktop layouts. Preserve touch targets, internal modal scrolling, and safe horizontal scrolling for data tables.
