# Screenshot Briefing Tool

Internal application for turning screenshot-heavy DOCX, LibreOffice/OpenDocument, PDF, and image inputs into reviewed Markdown/JSON artifacts and implementation-ready briefing packages.

## Status

- Owner: Adam Goodwin
- Technical lead: codex session
- Risk tier: medium
- Production status: v1 local runnable scaffold

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind
- Auth/database/storage target: Supabase
- Parsing service: Python FastAPI
- Local development store: `data/dev-store.json`

## Quick Start

Ubuntu:

```bash
bash scripts/launch-ubuntu.sh
```

Windows PowerShell:

```powershell
.\scripts\launch-windows.ps1
```

Then open `http://localhost:3000`.

The launchers install Node and Python dependencies, start FastAPI on `127.0.0.1:8000`, start Next.js on `localhost:3000`, wait for both services, and open the browser.

Install launch icons:

```bash
bash scripts/install-launcher-ubuntu.sh
```

```powershell
.\scripts\install-launcher-windows.ps1
```

Stop the local app:

```bash
bash scripts/stop-app.sh
```

```powershell
.\scripts\stop-windows.ps1
```

OCR backend selection happens inside the parser service. PaddleOCR is the preferred optional backend, Tesseract is the fallback, and artifacts still flow to manual review when OCR is unavailable.

For useful image-to-Markdown coding briefs on this laptop, open `Provider` in the app and use **Claude account via Claude Code**. This uses the local Claude Code sign-in rather than storing an API key in this app.

API key mode is still supported by setting `.env.local`:

```bash
ANTHROPIC_AUTH_MODE=api_key
ANTHROPIC_API_KEY=...
```

Then relaunch the desktop icon or run `bash scripts/launch-ubuntu.sh`.

Supported uploads: `.docx`, `.odt`, `.odp`, `.ods`, `.odg`, `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.webp`.

## Manual Setup

```bash
npm install
python3 -m venv services/parser/.venv
source services/parser/.venv/bin/activate
pip install -r services/parser/requirements.txt

cd services/parser
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another shell:

```bash
npm --workspace apps/web run dev
```

## Supabase

Apply every SQL file in `supabase/migrations` in filename order to provision the production database, RLS policies, and storage buckets. The local app uses the same entity shape through a JSON store when Supabase env vars are absent. When Supabase env vars are present, records and files are written to Supabase database/storage and `SUPABASE_SERVICE_ROLE_KEY` is required on the server. See `docs/supabase-migration-path.md` before applying hosted storage policies to existing data.

## Validation

```bash
bash scripts/governance-preflight.sh
npm run typecheck
npm run lint
```

## Documentation

- `docs/architecture.md`
- `docs/manual.md`
- `docs/roadmap.md`
- `docs/deployment-guide.md`
- `docs/supabase-migration-path.md`
- `docs/runbook.md`
- `docs/CHANGELOG.md`
- `docs/risks/risk-register.md`

## Support Model

This is an internal tool. Operational ownership stays with the project owner until a production maintainer is assigned.
