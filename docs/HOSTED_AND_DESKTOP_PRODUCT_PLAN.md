# Hosted SaaS and Desktop Product Plan

## Purpose

This plan turns the screenshot briefing tool into a shareable product without losing the local desktop workflow that made it useful in the first place.

The recommended path is both:

- **Hosted SaaS first** for fast sharing, demos, account-based usage, updates, and monetization.
- **Downloadable desktop edition second** for private/local work, sensitive documents, and users who prefer a controlled machine workflow.

## Product Direction

The hosted app should be the primary commercial surface. It is easier to sell, easier to support, and easier to improve continuously. Users can sign in, upload files, review artifacts, regenerate outputs, and export LLM-ready briefs from a normal URL.

The desktop app should remain a serious differentiator rather than the first packaging burden. It can serve users who want local processing, local files, or a private workflow, but it should build on the same product language, data model, and export standards as the hosted app.

## Target Architecture

### Hosted Edition

- **Web app:** Next.js on Vercel.
- **Database/auth/storage:** Supabase.
- **Parser/OCR service:** FastAPI deployed as a separate long-running service.
- **LLM generation:** configured provider integration, with user-visible status and clear failure states.
- **Billing:** Stripe once the hosted workflow is stable.

Vercel should host the web app, not the OCR/parser service. The parser has Python and OCR dependencies that fit better on a service host such as Render, Fly.io, Railway, Cloud Run, or a small VPS.

### Desktop Edition

- **Local app shell:** keep the launcher flow initially.
- **Local services:** Next.js app plus FastAPI parser.
- **Persistence:** local JSON/files for private mode, Supabase for signed-in sync mode where desired.
- **Future packaging:** consider Tauri or Electron only after hosted product validation.

## Chunk 7: Hosted MVP

Goal: make the product usable from a public URL.

Scope:

- Deploy the Next.js web app to Vercel.
- Add production, preview, and development environment variables in Vercel.
- Deploy the FastAPI parser/OCR service separately.
- Point `PARSER_URL` at the hosted parser service.
- Confirm Supabase auth, storage, and database persistence work from the hosted app.
- Configure Supabase auth redirect URLs for local, preview, and production.
- Run a full workflow smoke test: sign up, upload, extract, review, regenerate, approve, bulk export, download.

Exit criteria:

- A user can access the app from a public URL.
- Hosted mode does not fall back to local storage.
- Uploads, artifact images, reviews, and exports persist in Supabase.
- A signed-out user cannot access project data.
- Basic runbook notes exist for deployment and rollback.

## Chunk 8: Product Readiness

Goal: make the hosted app reliable enough for real outside testers.

Scope:

- Add a first-run onboarding flow.
- Add account/profile settings.
- Add clearer empty states and upload failure states.
- Add parser/LLM provider status visibility.
- Add usage limits before billing is turned on.
- Add basic error tracking and structured logs.
- Add privacy and data handling copy.
- Add backup/export guidance for user-owned data.
- Harden timeout handling for large documents.

Exit criteria:

- Testers can understand what to do without handholding.
- Failed parser, OCR, or LLM calls produce actionable messages.
- Usage can be capped before costs become surprising.
- Support/debug information is available without exposing secrets.

## Chunk 9: Monetization

Goal: create a simple paid path without overcomplicating the product.

Scope:

- Add Stripe customer records and subscription state.
- Add free, paid, and admin/internal plan concepts.
- Gate high-cost features by plan or usage.
- Add billing portal access.
- Add usage counters for uploads, pages, exports, and LLM regenerations.
- Add a simple pricing page or upgrade screen.
- Add admin visibility for users, projects, and usage.

Suggested first pricing model:

- Free trial or free tier with tight page/export limits.
- Paid individual tier for higher monthly usage.
- Team tier later, only after account/workspace needs are clearer.

Exit criteria:

- A user can subscribe, manage billing, and unlock higher usage.
- The app prevents uncontrolled cost growth.
- Billing state is visible and testable.

## Chunk 10: Desktop Edition

Goal: make local/private usage easier to distribute after hosted demand is proven.

Scope:

- Stabilize the existing launchers as the first desktop delivery path.
- Add a simple local settings screen for provider mode, parser health, and storage mode.
- Add an export/import bridge between local and hosted projects.
- Decide whether Tauri or Electron is justified.
- Package installers only after dependency and update behavior is predictable.
- Document privacy differences between local-only and Supabase-backed modes.

Exit criteria:

- A non-developer can install or launch the local edition.
- The local edition has a clear update path.
- Users understand where their data is stored.
- Local and hosted exports remain compatible.

## Important Product Decisions

### Hosted First

The hosted edition should lead because it validates the market fastest. It is easier to share, demo, support, and monetize.

### Desktop Second

The desktop edition should not disappear. It is useful for privacy-sensitive workflows and can become a premium trust feature once the core product is proven.

### Shared Core

Both editions should keep the same project model, artifact review model, and export formats. Diverging the product into two separate systems would create avoidable maintenance drag.

### No Weak Fallbacks

Hosted mode must fail closed when Supabase or auth configuration is incomplete. Local mode is valid only when intentionally configured.

## Open Questions

- What is the first public production domain?
- Which parser hosting provider should be used?
- Should uploaded files be retained indefinitely, deleted after export, or controlled by user settings?
- What usage unit matters most for pricing: pages, images, exports, regenerations, or projects?
- Should the first paid product target individuals, consultants, agencies, or internal software teams?

## Near-Term Recommendation

Proceed with Chunk 7 next.

The shortest commercially useful path is:

1. Vercel for the web app.
2. Supabase for auth, database, and storage.
3. Separate hosted parser service.
4. Public smoke test.
5. Limited external testers.

After that, improve product readiness and billing before investing heavily in a polished downloadable app.
