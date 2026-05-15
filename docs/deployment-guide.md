# Deployment Guide

## Local

Use the Ubuntu or Windows launchers in `scripts/`.

## Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Confirm these buckets exist:
   - `source-documents`
   - `artifact-images`
   - `output-packages`
4. Configure auth providers for email/password and magic link.
5. Set web environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PARSER_URL`

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
