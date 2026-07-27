# InsightLab

InsightLab is a structured startup idea validation platform connecting founders, contributors, and investors through targeted research, reputation-weighted feedback, and evidence-focused analytics.

InsightLab v21 is under active development. It is an evolving MVP rather than a fully production-ready service, and the repository intentionally distinguishes persistent product data from clearly labeled demonstration content.

## Product Overview

InsightLab brings three perspectives into one validation workflow:

- Founders frame ideas, define target audiences, design surveys, attach research material, and review structured feedback.
- Contributors discover ideas, submit ratings, comments, or survey responses, and build points and reputation from the quality of their participation.
- Investors explore early projects, compare evidence, and inspect market and demand signals through an interactive workspace.

The product also includes public platform information, profile and rewards surfaces, multilingual interfaces, and a separate owner-only administration console.

## Problem

Early startup decisions are often based on small, unstructured, or socially biased feedback samples. Founders struggle to turn opinions into decision-useful evidence, contributors rarely receive credit for thoughtful feedback, and investors see polished narratives before they see the underlying learning process.

InsightLab is designed to make early validation more structured, transparent, and useful without presenting a score or model output as a guarantee of startup success.

## How InsightLab Works

1. A founder defines an idea or structured study, its target audience, requested evidence, and optional questionnaire.
2. Contributors provide ratings, reasoned comments, or survey responses.
3. Transparent quality rules weight contributions using factors such as specificity, constructiveness, relevance, consistency, duplicate risk, and prior reputation.
4. Founders review response quality, themes, and decision-support analysis.
5. Investors explore privacy-aware aggregate signals and compare early opportunities.

The complete Founder → Contributor → Analysis live-data loop is still being integrated. Some current discovery and analysis experiences use labeled demonstration records.

## Founder Workspace

The Founder workspace supports:

- Idea and study framing
- Target audience and visibility settings
- Requested-result selection
- Ratings, open feedback, and custom surveys
- Private research-file upload
- GitHub repository URL attachment
- Validation draft persistence
- Feedback and analysis views

GitHub support currently stores and displays a repository URL. It does not yet provide repository authorization, commit synchronization, or GitHub activity analysis.

## Contributor Workspace

The Contributor workspace supports:

- Category and keyword discovery
- Ratings, comments, and survey responses
- Transparent response-quality scoring
- Points and reputation updates
- Personal contribution and reward history

Contributor Discovery still contains demonstration ideas. Persistent response history and rewards are available for authenticated users when the backend services are configured.

## Investor Workspace

The Investor workspace provides:

- Early-project exploration
- Category and signal filtering
- Evidence-quality comparisons
- Opportunity maps and interactive insights
- Project comparison views

Investor projects, market signals, and model summaries are currently demonstration data and must not be interpreted as live investment recommendations.

## Admin Console

The separate `/admin` route provides owner-only operational views for:

- Users and role distribution
- Online presence
- Ideas and responses
- Points and reputation
- Moderation and content status
- Platform activity metrics

Admin access is checked by the server API in addition to the client interface. Changing the configured owner requires coordinated server and interface changes.

## Authentication

Supabase Authentication currently provides:

- Email and password registration
- Email and password sign-in
- Password-reset email flows
- Optional Google and GitHub OAuth when enabled in Supabase
- Bearer-token verification for protected API routes

Authentication credentials are not stored in the InsightLab business database. Public Supabase configuration is supplied at runtime; privileged Supabase keys must never be exposed to the browser or committed to this repository.

## Real Data vs Demo Data

When Supabase, Cloudflare D1, and Cloudflare R2 are configured, the application has persistent paths for:

- Accounts and authenticated sessions
- Profiles and profile preferences
- Presence and online counts
- Founder validation drafts and survey definitions
- Contributor responses
- Points, reputation, and pending redemption records
- Founder files and profile images
- Admin operational data
- Aggregate platform metrics

The following areas still include labeled demonstration or fallback content:

- Contributor Discovery ideas
- Investor projects and interactive insights
- Some marketing metrics and visualizations
- Contributor Insights when no live history is available
- Analysis baselines when stored response data is unavailable

Not every interface is production-ready. The live Founder → Contributor → Analysis workflow, visibility enforcement, and production data coverage remain active work.

## Technology Stack

- React 19
- TypeScript
- Next.js-compatible App Router through Vinext
- Vite
- Supabase Authentication
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Drizzle ORM and Drizzle Kit
- D3 geographic projection and world-atlas data
- ESLint and Node.js test runner

## Architecture

```text
Browser / React UI
        |
        | Supabase session and Bearer token
        v
App Router API routes
        |
        +-- Supabase Auth API: identity verification
        +-- Cloudflare D1: business records
        +-- Cloudflare R2: avatars and founder files
        |
        v
Vinext application on Cloudflare Workers
```

The main interface is implemented in `app/insightlab-app.tsx`. Server endpoints live under `app/api`, authentication verification is centralized in `app/external-auth.ts`, database definitions live under `db`, migrations live under `drizzle`, and the Cloudflare Worker entry point is `worker/index.ts`.

## Database and File Storage

Cloudflare D1 stores the primary product data, including profiles, validations, responses, presence, analysis records, points, reputation-related data, moderation state, and pending reward redemptions.

Drizzle schema definitions are in `db/schema.ts`, with generated SQL migrations in `drizzle/`.

Cloudflare R2 stores:

- Profile avatars
- Private Founder research files and attachments

The database stores object keys and file metadata. Demo-mode file selection remains local to the browser until the user signs in.

## Local Development

Requirements:

- Node.js 22.13 or newer
- npm
- Bash-compatible shell for the project scripts

```bash
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env.local
```

The local D1/R2 development bindings are configured through the project hosting and Vite configuration.

## Environment Variables

Only public Supabase browser configuration belongs in local application environment files:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
INSIGHTLAB_ADMIN_EMAILS=
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are public browser configuration.
`INSIGHTLAB_ADMIN_EMAILS` is a server-side, comma-separated Admin allowlist and
must be configured with real values only in an ignored `.env.local` file for
local development. Production values will be configured later through Sites
environment variables. If the Admin allowlist is missing or empty, the Admin
API fails closed and returns `403` to authenticated users.

Never commit:

- `.env` or `.env.local`
- Supabase `service_role` or secret keys
- OAuth client secrets
- SMTP credentials
- Resend API keys
- Stripe secret keys
- GitHub tokens
- Private keys

Deployment secrets must be configured through the hosting provider or appropriate secret manager.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite/Vinext development server |
| `npm run build` | Build and validate the production artifact |
| `npm start` | Start the production Vinext server |
| `npm run lint` | Run ESLint |
| `npm test` | Build the application and run rendered HTML tests |
| `npm run validate:artifact` | Validate the generated hosting artifact |
| `npm run db:generate` | Generate Drizzle migrations from the schema |
| `npm run install:ci` | Run the repository CI installation helper |

## Security

- Protected APIs verify Supabase Bearer tokens server-side.
- Admin APIs additionally enforce the configured owner identity on the server.
- Founder files are stored in R2 with ownership metadata and database records.
- Upload types and sizes are restricted by API routes.
- Environment files, secrets, local databases, build output, and editor state are ignored by Git.
- Model output is decision support, not a guaranteed predictor of commercial success.

Please report security issues according to `SECURITY.md` rather than opening a public issue.

## Current Limitations

- Contributor Discovery is not yet fully backed by live published validations.
- Investor datasets and comparisons are demonstrations.
- Some analysis views fall back to sample baselines.
- The end-to-end Founder → Contributor → Analysis workflow is still being completed.
- Database schema and migration consistency requires further production hardening.
- GitHub integration currently stores repository links only.
- Cash redemption, payment processing, membership charging, and settlement are not formally enabled.
- Predictive models have not been trained or validated against startup outcome labels.
- Legal, moderation, retention, reward, tax, refund, and privacy policies require final review before a broad public launch.

## Product Roadmap

Planned work includes:

- Complete the live Founder → Contributor → Analysis data loop
- Replace remaining demonstration discovery and investor datasets
- Strengthen server-side visibility and audience authorization
- Consolidate database schema and migrations
- Add production-ready GitHub integration
- Expand moderation, integrity, and audit workflows
- Configure and validate production email and OAuth providers
- Introduce payment and membership infrastructure only after test-mode and compliance review
- Improve automated testing, accessibility checks, and responsive regression coverage
- Establish GitHub-based CI/CD and deployment workflows

## Contributing

Read `CONTRIBUTING.md` before proposing changes. Contributions should preserve:

- Clear labeling of demonstration data
- Server-side authorization boundaries
- English, Simplified Chinese, and Spanish interface coverage
- Stable typography and component geometry across locales
- Responsive layouts and accessible interaction targets
- The existing dark plum, forest, burnt-orange, and warm neutral visual system

Run lint, tests, and a production build before opening a pull request.

## License Status

MIT License. See the repository's root `LICENSE` file for the full license text.
