# Deployment Guide

## Local

Use the Ubuntu or Windows launchers in `scripts/`.

## Supabase

1. Create a Supabase project.
2. Run every SQL file in `supabase/migrations` in filename order.
3. Confirm these buckets exist:
   - `source-documents`
   - `artifact-images`
   - `output-packages`
4. Store hosted objects under `<auth.uid()>/<project-id>/...` so storage RLS can enforce ownership.
5. Configure auth providers for email/password and magic link.
6. Set web environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PARSER_URL`

See `docs/supabase-migration-path.md` for migration notes, storage policy expectations, and cascade-delete behavior.

When Supabase env vars are present, the web app enforces authentication on project, upload, artifact, review, and output API routes. Browser sign-in stores a short-lived HTTP-only app session cookie so server-rendered pages, artifact images, and file downloads can authorize the current user. Non-browser clients must pass a Supabase access token with `Authorization: Bearer <token>`.

When Supabase env vars are present, the web app also uses Supabase for persistence and storage. `SUPABASE_SERVICE_ROLE_KEY` is required on the server; missing service-role configuration is treated as a deployment error rather than a fallback to local JSON/files.

## Web App

Deploy `apps/web` to Vercel. Set `PARSER_URL` to the reachable FastAPI service URL.

## Parser

Deploy `services/parser` as a small Python service. Install dependencies from `services/parser/requirements.txt`. For OCR quality, install native Tesseract in the runtime image.

For higher-quality mixed-layout extraction, install the optional preferred OCR backend:

```bash
pip install -r services/parser/requirements-ocr-paddle.txt
```

Set:

- `OCR_PRIMARY_BACKEND=paddleocr`
- `OCR_FALLBACK_BACKEND=tesseract`
- `OCR_MIN_CONFIDENCE=0.45`

## LLM Provider

Output generation uses a deterministic local generator by default. For laptop use, `ANTHROPIC_AUTH_MODE=claude_code` lets the parser call the local Claude Code CLI and use the user's Claude account credentials. For hosted production, use API key mode with `ANTHROPIC_AUTH_MODE=api_key` and `ANTHROPIC_API_KEY`.
