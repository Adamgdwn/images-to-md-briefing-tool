# Contributing

Thank you for helping improve Screenshot Briefing Tool. The project exists to turn messy visual and document inputs into reviewed, implementation-ready Markdown and JSON artifacts.

## Good Contribution Areas

- clearer upload, review, and export workflows
- parser improvements for screenshots, PDFs, DOCX, and LibreOffice/OpenDocument files
- safer local launchers for Ubuntu and Windows
- better manual-review states and artifact previews
- documentation for local-first and hosted Supabase modes
- tests for extraction, review, export, and workspace behavior

## Ground Rules

- Do not commit real documents, client material, screenshots with personal data, API keys, service-role keys, or private `.env` files.
- Keep local development usable without hosted services.
- Keep hosted Supabase behavior documented and opt-in.
- Treat OCR and model output as review candidates, not authoritative final artifacts.
- Preserve manual review before exporting implementation briefs.
- Keep generated artifacts out of git unless they are small, sanitized examples intended for documentation.

## Development Checks

Run the checks that match your change. For general changes:

```bash
bash scripts/governance-preflight.sh
npm run typecheck
npm run lint
git diff --check
```

For parser changes, also run the relevant Python service tests or a local parser smoke test.

If a check is unavailable on your machine, mention that in the pull request.

## Pull Requests

Please describe:

- what changed
- which input or workflow it improves
- whether the change affects local-only or hosted Supabase mode
- which checks you ran
- any privacy or data-handling considerations

By contributing, you agree that your contribution is provided under the MIT License.
