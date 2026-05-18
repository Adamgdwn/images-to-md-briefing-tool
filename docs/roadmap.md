# Roadmap

This roadmap keeps the local tool useful while moving toward a product that could be sold. Keep each implementation chunk small enough to finish, verify, commit, push to `main`, and summarize before clearing context.

## Current State

- Local project workspace
- DOCX, OpenDocument, PDF, and image upload
- Embedded image extraction
- OCR and vision-backed interpretation
- Markdown and JSON artifact drafts
- Human review, approval, rejection, and version history
- Reviewer guidance notes for regeneration and export
- Bulk LLM export with artifact boundaries
- Timestamped exports and output deletion
- Ubuntu and Windows launchers
- Supabase schema and deployment path

## Near-Term Product Improvements

1. Project actions
   - Archive project.
   - Delete project with typed confirmation.
   - Delete related local files and records.
   - Rename project and edit context.

2. Review workflow polish
   - Clearer artifact status filters.
   - Last modified timestamps on projects and artifacts.
   - Safer visual distinction between draft, approved, and rejected artifacts.
   - Better empty states and progress feedback.

3. Export reliability
   - Export whole project bundle for backup.
   - Import project bundle into a clean local store.
   - Download latest export shortcut.
   - Export audit trail.

4. Authentication and ownership
   - Enforce signed-in user on server routes.
   - Move from local JSON store to Supabase-backed persistence.
   - Tie projects, files, artifacts, and exports to user ownership.
   - Add sign out and account state in navigation.

5. Hosted product readiness
   - Supabase migration parity with the local app.
   - Storage cleanup for source files, artifact images, and exports.
   - Deployment hardening.
   - Basic billing and plan enforcement.

## Later Product Bets

- Screenshot version comparison
- Artifact clustering
- Similarity search
- GitHub issue export
- Jira story export
- Reviewer-edit scoring
- UI improvement suggestions
- Team workspaces
- Client-branded export templates

## Companion Plans

- Product and monetization roadmap: `docs/product-monetization-roadmap.md`
- Chunked implementation plan: `docs/implementation-chunks.md`
- Context handoff template: `docs/context-handoff-template.md`
