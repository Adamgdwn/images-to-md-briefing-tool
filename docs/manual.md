# Manual

## Start the App

Ubuntu:

```bash
bash scripts/launch-ubuntu.sh
```

Windows:

```powershell
.\scripts\launch-windows.ps1
```

Open `http://localhost:3000`.

## Launch Icon

Ubuntu:

```bash
bash scripts/install-launcher-ubuntu.sh
```

Windows:

```powershell
.\scripts\install-launcher-windows.ps1
```

The icon starts the parser and web app in the background, waits until they are ready, and opens the project workspace.

## Stop the App

Ubuntu:

```bash
bash scripts/stop-app.sh
```

Windows:

```powershell
.\scripts\stop-windows.ps1
```

## Workflow

1. Create a project from the project list.
2. Open the project and select Upload.
3. Upload DOCX, LibreOffice/OpenDocument files, PDF, PNG, JPG, JPEG, or WebP files.
4. Wait for processing to complete.
5. Open each extracted artifact.
6. Review the original image beside the Markdown and JSON draft.
7. Adjust artifact type, confidence, Markdown, JSON, reviewer guidance notes, ambiguities, or requested additions.
8. Save draft, approve, or reject.
9. Return to the project and generate an output package from approved artifacts.

Project actions are available from the project detail page. You can rename a project, edit its context, archive it, restore it, or permanently delete it. Deleting a project requires typing the project name and removes related local uploads, artifact images, exports, and store records.

The project list includes active/archived filters, last activity timestamps, and counts for sources, artifacts, and exports. Project artifact lists can be filtered by draft, approved, or rejected review status, and each artifact row shows the latest review version and timestamp.

Reviewer guidance notes are passed into regeneration and output generation. You can type notes and immediately use Regenerate; saving the draft first is not required. Use them to point the engine at the important region, intent, or ambiguity in abstract screenshots; the generated output should reconcile notes with the visible image rather than treating notes as standalone evidence.

## Backup and Import

Use Export backup on a project detail page to download a full project backup JSON file. The backup includes project metadata, source documents, artifact images, extraction records, reviewer notes, reviews, and generated output packages.

Use Import backup on the project list to restore a backup JSON file into the local store. Imports create a new project with fresh internal IDs, copy included files back into local storage, and add an imported timestamp to duplicate project names so existing projects are not overwritten.

Keep project backup JSON files somewhere durable if you need to move work between machines or recover after deleting local app data.

## Authentication

When Supabase environment variables are configured, use `/login` for email/password sign-in, sign-up, or magic-link delivery. Without those variables, the app runs in local laptop mode for end-to-end development.

## Output Modes

- Bulk LLM export
- Functional additions
- Developer stories
- Implementation brief
- Codex-ready package

Use Bulk LLM export when you want to pass many approved screenshots from one source document to another LLM without blending them together. It exports a manifest plus one bounded section per artifact, using explicit `BEGIN_ARTIFACT` and `END_ARTIFACT` markers around each reviewed Markdown/JSON payload. The generator can export Markdown, JSON, or both as `.md`, `.txt`, or `.json` text files.

## OCR Notes

The parser selects OCR backends internally. PaddleOCR is the preferred backend when installed, Tesseract is the fallback, and the app still creates manual-review artifacts when OCR is unavailable or confidence is low.

For image-to-Markdown interpretation, open `Provider` in the app and connect Claude through Claude Code. This uses your local Claude account sign-in. Without Claude Code sign-in or API key mode, the tool can still extract artifacts, but generated Markdown will be limited to OCR/template output.

API key mode is still supported with:

```bash
ANTHROPIC_AUTH_MODE=api_key
ANTHROPIC_API_KEY=...
```

Optional PaddleOCR setup:

```bash
services/parser/.venv/bin/pip install -r services/parser/requirements-ocr-paddle.txt
```

Provider controls:

- `OCR_PRIMARY_BACKEND=paddleocr`
- `OCR_FALLBACK_BACKEND=tesseract`
- `OCR_MIN_CONFIDENCE=0.45`

## Supported Uploads

- Word: `.docx`
- LibreOffice/OpenDocument: `.odt`, `.odp`, `.ods`, `.odg`
- PDF: `.pdf`
- Images: `.png`, `.jpg`, `.jpeg`, `.webp`

Documents can contain multiple embedded images; each extracted image becomes a separate artifact for review.
