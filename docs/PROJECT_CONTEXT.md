# InsightLab Project Context

## Vision

InsightLab is an idea-validation network where founders publish early ideas or structured surveys, contributors provide scored evidence and earn points, and investors inspect privacy-safe early market signals.

## Required product surfaces

- General marketing site with animated typography, restrained pointer effects, platform achievements, partner globe, Meet Us, Trust Center, Help, membership, and platform-wide insights.
- Founder workspace for idea framing, requested-data selection, survey design, GitHub repository links, private file upload, live feedback, and analysis.
- Contributor workspace for category discovery, search, ratings, comments, surveys, points, personal contribution history, and continuous reputation.
- Investor workspace and interactive insights for comparing early opportunities and evidence quality.
- Profile with avatar, LinkedIn-style cover choices, headline, biography, interests, language, website, and account status.
- Separate `/admin` owner console for users, presence, posts, comments, moderation, points, and operational status.

## Authentication

- Public site appears before login.
- Registration and login are separate.
- Email OTP, Google, and GitHub are supported when enabled in Supabase.
- A login identity without an InsightLab profile must be rejected and directed to registration.
- Registration collects basic information and role, creates a profile, then returns the user to login.

## Scoring and rewards

- New profiles receive a 100-point welcome balance.
- Creating a validation and submitting a contribution create points-ledger entries.
- Contribution rewards are adjusted by specificity, constructiveness, relevance, duplicate similarity, contribution type, and prior reputation.
- Obvious unsafe-language flags can deduct points and reputation and enter the moderation queue.
- The present model is explainable decision support, not a trained guarantee of commercial success.
- Redemption requests are persistent but cash payouts and membership charging remain disabled until verified merchant/payment infrastructure is configured.

## Localization

- Supported locales: English, Simplified Chinese, and Spanish.
- Every product-owned label, paragraph, button, placeholder, title, error, modal, and navigation item should have all three versions.
- Locale changes must not change font size or component geometry.
- User-generated content remains in its original language.

## Hosting and integrations

- Current public site: `https://insightlab-platform.jinchengwang07.chatgpt.site`
- Supabase project URL: `https://qnmtaifwvecmwjbtopqi.supabase.co`
- Intended GitHub repository: `jinchengwang-August/InsightLab`
- Stripe should use Checkout in test mode first. Apple Pay, cards, and eligible WeChat Pay support depend on the verified merchant account and product/country configuration.

## Owner access

Admin access is enforced by the server route using the comma-separated
`INSIGHTLAB_ADMIN_EMAILS` environment variable. Values are trimmed and
compared case-insensitively. Missing or empty configuration denies all Admin
access. Administrator identities must be configured in the deployment
environment and must never be committed to the repository.

## Remaining production work

- Finish counsel-reviewed Privacy Policy, Terms, refund/cancellation, reward/tax, IP, moderation, and retention policies.
- Configure working SMTP and enabled Supabase OAuth providers.
- Connect verified Stripe test/live environments and webhooks.
- Replace remaining labeled investor and marketing demo datasets with live records.
- Train and validate predictive models only after outcome labels are available.
