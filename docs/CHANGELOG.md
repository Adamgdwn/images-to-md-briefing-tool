# Changelog

## 0.1.0

- Added Next.js App Router web app.
- Added FastAPI parser service.
- Added Supabase migration for core schema, RLS policies, and storage buckets.
- Added local runnable project, upload, review, approval, and output package workflow.
- Added Ubuntu and Windows launchers.
- Added modular OCR adapter layer with PaddleOCR-preferred, Tesseract-fallback, and manual-review behavior.
- Added background launchers, stop scripts, and installable desktop launch icons.
- Added LibreOffice/OpenDocument upload support and clearer review-before-generate UI behavior.
- Added Claude vision interpretation for coding-oriented image-to-Markdown artifact briefs and real artifact regeneration.
- Added provider settings and Claude Code account mode so local users can connect with their Claude account instead of an API key.
- Hardened desktop launchers with app-specific health checks, nvm-aware startup, safer PID handling, and quoted environment/launcher paths.
- Added Bulk LLM export mode with explicit per-artifact boundaries and Markdown download support for approved artifacts.
- Added export content and file-format controls for generated packages, including Markdown, JSON, combined, `.md`, `.txt`, and `.json` output.
- Routed reviewer guidance notes into artifact regeneration, output packages, and bulk exports for clearer human-directed interpretation.
- Fixed artifact regeneration so unsaved reviewer guidance notes are sent with the request and preserved as notes instead of being replaced by regeneration status text.
- Added product monetization roadmap, chunked implementation plan, and context handoff template for high-quality iterative development.
- Added local project lifecycle controls for rename/context edits, archive/restore, and permanent deletion with related record/file cleanup.
- Added project and artifact filters, last-activity timestamps, review-version metadata, and clearer workflow status messages.
- Added full-project JSON backups and imports for moving or restoring projects with source files, artifact images, reviews, and exports.
- Added Supabase schema parity migration for bulk exports, lifecycle audit events, export option fields, audit retention, and user-owned storage policies.
- Added mode-aware auth enforcement for project, upload, artifact, review, and output routes, plus account state and sign-out controls.
