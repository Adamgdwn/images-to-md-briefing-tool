# Product Monetization Roadmap

## Product Thesis

Screenshot-heavy requirements, walkthroughs, and process documents are expensive to convert into implementation-ready work. This tool turns those images into reviewed, source-traceable Markdown and JSON packages that downstream LLMs and developers can use without losing artifact boundaries or reviewer intent.

The practical wedge is not generic OCR. The value is the review loop: extract visual artifacts, generate a coding-oriented interpretation, let a human correct intent, then export clean bounded packages for another LLM or delivery system.

## Primary Customers

- Solo builders and consultants who receive screenshot-heavy notes from clients.
- Internal operations teams turning process screenshots into implementation tickets.
- Product managers documenting workflows from desktop apps, PDFs, and training docs.
- Agencies that need repeatable handoff packages for AI-assisted development.

## Core Paid Use Cases

- Convert client walkthrough documents into implementation briefs.
- Convert training or SOP documents into structured product requirements.
- Prepare screenshot batches for coding agents without context blending.
- Produce traceable Markdown/JSON packages from reviewed visual evidence.
- Maintain reusable project archives for future change requests.

## Positioning

Working name: Screenshot Briefing Tool.

Possible product positioning:

- "Turn screenshot-heavy notes into implementation-ready briefs."
- "Human-reviewed visual requirements for coding agents."
- "Clean LLM handoff packages from documents, PDFs, and screenshots."

Avoid positioning as a pure OCR product. The stronger position is AI-assisted requirements extraction with human review and export discipline.

## Pricing Hypotheses

### Local Pro

One-time or annual desktop license for consultants and solo builders.

- Local projects
- Claude Code provider support
- Bulk LLM exports
- Project backup/import
- No hosted storage

Candidate price: $99 to $299/year.

### Hosted Solo

Subscription for cloud storage and cross-device access.

- Supabase-backed account
- Private projects
- Hosted artifact storage
- Monthly processing limits
- Export history

Candidate price: $15 to $29/month.

### Team

Subscription for teams and agencies.

- Shared workspaces
- Roles and permissions
- Comment/review assignment
- Export templates
- Audit trail
- Higher processing limits

Candidate price: $49 to $149/month per workspace, or per-seat pricing after validation.

### Services-Assisted Package

For early market validation, offer a done-with-you conversion package.

- Customer sends screenshot-heavy docs.
- Tool is used internally.
- Deliver reviewed Markdown/JSON briefs and implementation tickets.

Candidate price: fixed project packages from $500 to $2,500 depending on scope.

## Monetization Milestones

### M0: Local Internal Tool

Goal: Keep the current workflow fast and reliable for personal use.

Required:

- Project archive/delete
- Project rename/edit context
- Backup/export project bundle
- Cleaner status and timestamp handling
- Stable launch/restart flow

Revenue: none.

### M1: Pilot-Ready Local Pro

Goal: Test with trusted users or client work without hosting risk.

Required:

- Project import/export
- Redaction guidance and data safety notes
- Better onboarding/manual
- Export templates
- Basic telemetry-free usage log
- Packaged installer or scripted setup

Revenue: consulting, early-access license, or paid pilot.

### M2: Hosted Private Beta

Goal: Multi-user hosted app with real account boundaries.

Required:

- Real auth enforcement on all server routes
- Supabase persistence parity
- Private storage buckets with cleanup
- User-owned projects
- Stripe test-mode billing
- Terms/privacy draft
- Admin support tools

Revenue: beta subscriptions or paid pilots.

### M3: Marketable SaaS

Goal: Self-serve product for consultants, agencies, and product teams.

Required:

- Workspace/team model
- Billing plans and limits
- Durable background jobs
- Job retry and failure recovery
- Usage metering
- Export integrations
- Security posture suitable for client screenshots

Revenue: SaaS subscriptions and service-assisted onboarding.

## Product Risks

- Image interpretation can miss abstract intent without reviewer guidance.
- Hosted use may involve sensitive client screenshots.
- LLM provider costs can be unpredictable without limits.
- Users may expect end-to-end ticket generation before the review loop is strong enough.
- Multi-user storage and auth must be correct before any client data is hosted.

## Validation Questions

- Will consultants pay for local-only export discipline?
- Is the strongest buyer a solo builder, agency, or internal ops team?
- Which export target matters first: Markdown, JSON, GitHub issues, Jira, or Linear?
- Do users want hosted collaboration, or is privacy-preserving local use the differentiator?
- What is the smallest paid pilot that proves this saves real delivery time?
