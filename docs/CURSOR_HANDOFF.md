# Cursor handoff

InsightLab is a Next.js/Vinext application for founders, contributors, and
investors. The repository already includes project rules in `AGENTS.md` and
`.cursor/rules/insightlab.mdc`.

## Opening the project

Open the existing local repository folder in Cursor. Let codebase indexing
finish before asking the Agent to make broad changes.

Use GitHub as the synchronization source. A source ZIP is a release backup, not
the normal way to merge updates into an existing working folder.

## Safe start prompt

Ask Cursor Agent to:

1. read `AGENTS.md`, `docs/PROJECT_CONTEXT.md`, and this file;
2. perform a read-only repository audit;
3. confirm the current branch, worktree state, remote, and whether local `main`
   matches `origin/main`;
4. stop if local changes would be overwritten;
5. otherwise update `main` with a fast-forward-only pull;
6. report the resulting commit before editing anything.

## Change workflow

For each change, ask Cursor to create a feature branch, keep demo data labeled,
preserve all three locales, run lint/tests/build, and open a draft pull request.
Do not let it force-push, push directly to `main`, reveal environment values, or
create a replacement hosted Site.

## Architecture summary

- `app/insightlab-app.tsx`: public site, authentication gateway, and the three
  role experiences.
- `app/admin/`: separate owner console.
- `app/api/`: server API routes.
- `db/` and `drizzle/`: D1 data model and migrations.
- R2 binding `BUCKET`: private study files and profile images.
- Supabase: email/password and optional OAuth authentication.
- `.openai/hosting.json`: identity of the existing InsightLab Site.
