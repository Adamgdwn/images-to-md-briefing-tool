# Runbook

## Health Checks

- Web app identity: `http://127.0.0.1:3000/api/health`
- Web page: `http://127.0.0.1:3000/projects`
- Parser identity: `http://127.0.0.1:8000/health`

The launchers require the identity health responses to include `status: ok` and the expected app name before reusing a running service on the same port.

## Launch

Ubuntu:

```bash
bash scripts/launch-ubuntu.sh
```

Windows:

```powershell
.\scripts\launch-windows.ps1
```

Logs are written to `data/logs`.

## Common Issues

### Upload fails

Confirm the parser is running:

```bash
curl http://127.0.0.1:8000/health
```

Confirm the web service is this app:

```bash
curl http://127.0.0.1:3000/api/health
```

### Unable to connect

Start the launcher again. It will restart missing services and open the browser when ready. If it still fails, inspect `data/logs/web.log` and `data/logs/parser.log`.

### OCR is empty

Install native Tesseract. The app still works without it, but artifacts will need manual review.

### Output package fails

At least one artifact must be approved before package generation.

### Local data reset

Stop the app and remove:

```bash
rm -f data/dev-store.json
rm -f data/uploads/* data/artifacts/* data/exports/*
```

## Governance

Run before substantial changes:

```bash
bash scripts/governance-preflight.sh
```
