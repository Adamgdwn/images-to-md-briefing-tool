# Implementation Chunks

Use this plan to keep coding quality high across context resets. Each chunk should end with:

- Governance preflight result
- Files changed
- Tests/checks run
- Commit hash
- Push to `main`
- Short handoff note

Do not start the next chunk until the current chunk is committed and the app is in a known runnable state.

## Chunk 1: Project Lifecycle Controls

Goal: make project management safe and complete in local mode.

Scope:

- Archive project action.
- Delete project action with typed project-name confirmation.
- Delete related local files:
  - source uploads
  - artifact images
  - exports
- Remove related records:
  - source documents
  - processing jobs
  - artifacts
  - artifact extractions
  - artifact reviews
  - output packages
- Keep or record an audit event before deletion.
- Rename project and edit context.

Verification:

- Create a test project.
- Upload a small image.
- Generate an export.
- Archive and confirm it disappears or is visually marked.
- Delete and confirm records/files are removed.
- Run `npm run check`.

## Chunk 2: Project List and Review Workflow Polish

Goal: make the app easier to trust during repeated use.

Scope:

- Project list timestamps and artifact/export counts.
- Filters for active/archived projects.
- Artifact list filters by draft/approved/rejected.
- Clear latest-review version and updated timestamp.
- More obvious approved state.
- Better progress and failure messages for upload, regenerate, and export.

Verification:

- Exercise one project with draft, approved, and rejected artifacts.
- Confirm mobile and desktop layouts stay readable.
- Run `npm run check`.

## Chunk 3: Backup and Portability

Goal: protect local work and make demos/pilots safe.

Scope:

- Export full project bundle as a zip or JSON package.
- Include project metadata, source documents, artifact images, reviews, and output packages.
- Import a project bundle into a clean local store.
- Handle duplicate project names safely.
- Add manual docs for backup/import.

Verification:

- Export a project.
- Delete or use a fresh local store.
- Import the project.
- Confirm artifact images, reviews, and exports still open.
- Run `npm run check`.

## Chunk 4: Supabase Schema Parity

Goal: make hosted persistence match current local behavior.

Scope:

- Add `bulk_llm_export` to Supabase `package_type`.
- Add `output_deleted` and future project lifecycle events to audit enum.
- Add fields needed for export options and generated timestamps if necessary.
- Confirm cascade delete behavior.
- Review storage bucket policies for source documents, artifact images, and output packages.
- Document migration path.

Verification:

- Apply migration to a test Supabase project or local Supabase when available.
- Confirm RLS policies still protect user-owned records.
- Run `npm run check`.

## Chunk 5: Real Auth Enforcement

Goal: make sign-in meaningful.

Scope:

- Add server-side session helpers.
- Require authenticated user for project, upload, artifact, review, and output routes when Supabase mode is active.
- Keep explicit local mode behavior for laptop use.
- Add sign out.
- Show current auth/local mode state in navigation.

Verification:

- Local mode still works without Supabase env vars.
- Supabase mode blocks unauthenticated API access.
- Signed-in user can only see their projects.
- Run `npm run check`.

## Chunk 6: Supabase Persistence Adapter

Goal: move from local JSON to a durable hosted data layer.

Scope:

- Create a store interface that can use local JSON or Supabase.
- Move project CRUD first.
- Move source documents, artifacts, reviews, and output packages.
- Move file storage from local folders to Supabase storage.
- Keep local mode available.

Verification:

- Same workflow passes in local mode.
- Same workflow passes in Supabase mode.
- Records and storage objects are user-owned.
- Run `npm run check`.

## Chunk 7: Billing and Pilot Readiness

Goal: make a controlled paid pilot possible.

Scope:

- Define plan limits.
- Add Stripe test-mode checkout or manual entitlement flag.
- Track usage counts by project/user.
- Add privacy and data handling docs.
- Add onboarding checklist for pilot users.

Verification:

- Free/local mode behavior is explicit.
- Paid/entitled user path is clear.
- Limits fail gracefully.
- Run `npm run check`.

## Chunk 8: Integrations

Goal: turn reviewed briefs into delivery artifacts.

Scope:

- GitHub issue export.
- Linear or Jira export.
- Export templates by target.
- Per-artifact selection and grouping.

Verification:

- Generate issues from approved artifacts only.
- Preserve artifact IDs and source traceability.
- Run `npm run check`.
