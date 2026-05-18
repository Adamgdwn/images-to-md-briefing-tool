from __future__ import annotations

import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


DEFAULT_PARSER_URL = "http://127.0.0.1:8000"
MAX_FILE_BYTES = 50 * 1024 * 1024
DEFAULT_TEXT_LIMIT = 6000


def main() -> int:
    try:
        params = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input."}))
        return 1

    try:
        result = run(params)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1

    print(json.dumps(result, sort_keys=True))
    return 0


def run(params: dict[str, Any]) -> dict[str, Any]:
    action = clean_optional(params.get("action")) or "parse_source_document"
    parser_url = clean_optional(params.get("parser_url")) or os.getenv("FREEDOM_SCREENSHOT_BRIEFING_PARSER_URL") or os.getenv("SCREENSHOT_BRIEFING_PARSER_URL") or DEFAULT_PARSER_URL
    parser_url = parser_url.rstrip("/")
    max_text_chars = clamp_int(params.get("max_text_chars"), 500, 20000, DEFAULT_TEXT_LIMIT)

    if action == "health":
        return health(parser_url)

    file_path = resolve_input_file(params.get("file_path"))
    run_vision = bool(params.get("run_vision", False))

    if action == "interpret_image":
        payload = post_file(
            url=f"{parser_url}/interpret/image",
            file_path=file_path,
            fields={
                "source_document": clean_optional(params.get("source_document")) or file_path.name,
            },
        )
        return summarize_interpret_image(payload, parser_url, file_path, max_text_chars)

    if action == "parse_source_document":
        payload = post_file(
            url=f"{parser_url}/parse/source-document",
            file_path=file_path,
            fields={"run_vision": "true" if run_vision else "false"},
        )
        return summarize_parse_response(payload, parser_url, file_path, max_text_chars)

    raise ValueError("action must be health, interpret_image, or parse_source_document.")


def health(parser_url: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(f"{parser_url}/health", timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return {
            "status": "available",
            "parser_url": parser_url,
            "parser_status": payload.get("status", "unknown"),
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "parser_url": parser_url,
            "error": str(exc),
            "start_command": "cd /home/adamgoodwin/code/Applications/images-to-md-briefing-tool && bash scripts/launch-ubuntu.sh",
        }


def post_file(url: str, file_path: Path, fields: dict[str, str]) -> dict[str, Any]:
    boundary = f"----freedom-{uuid.uuid4().hex}"
    body = build_multipart_body(boundary, file_path, fields)
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(
            "Screenshot briefing parser is not reachable. "
            "Start it with: cd /home/adamgoodwin/code/Applications/images-to-md-briefing-tool && bash scripts/launch-ubuntu.sh"
        ) from exc


def build_multipart_body(boundary: str, file_path: Path, fields: dict[str, str]) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                str(value).encode(),
                b"\r\n",
            ]
        )

    mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode(),
            f"Content-Type: {mime_type}\r\n\r\n".encode(),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks)


def summarize_parse_response(
    payload: dict[str, Any],
    parser_url: str,
    file_path: Path,
    max_text_chars: int,
) -> dict[str, Any]:
    artifacts = payload.get("artifacts") if isinstance(payload.get("artifacts"), list) else []
    return {
        "status": "parsed",
        "parser_url": parser_url,
        "source_file": str(file_path),
        "source_filename": payload.get("source_filename"),
        "file_type": payload.get("file_type"),
        "page_count": payload.get("page_count"),
        "artifact_count": len(artifacts),
        "warnings": payload.get("warnings", []),
        "artifacts": [summarize_artifact(artifact, max_text_chars) for artifact in artifacts],
    }


def summarize_interpret_image(
    payload: dict[str, Any],
    parser_url: str,
    file_path: Path,
    max_text_chars: int,
) -> dict[str, Any]:
    artifact = payload.get("artifact") if isinstance(payload.get("artifact"), dict) else {}
    return {
        "status": "interpreted",
        "parser_url": parser_url,
        "source_file": str(file_path),
        "warnings": payload.get("warnings", []),
        "artifact": summarize_artifact(artifact, max_text_chars),
    }


def summarize_artifact(artifact: Any, max_text_chars: int) -> dict[str, Any]:
    if not isinstance(artifact, dict):
        return {}
    return {
        "source_filename": artifact.get("source_filename"),
        "page_number": artifact.get("page_number"),
        "artifact_type": artifact.get("artifact_type"),
        "category": artifact.get("category"),
        "subtype": artifact.get("subtype"),
        "confidence": artifact.get("confidence"),
        "ocr_backend": artifact.get("ocr_backend"),
        "ocr_confidence": artifact.get("ocr_confidence"),
        "interpretation_backend": artifact.get("interpretation_backend"),
        "interpretation_confidence": artifact.get("interpretation_confidence"),
        "layout_summary": truncate(artifact.get("layout_summary"), max_text_chars),
        "raw_ocr_text": truncate(artifact.get("raw_ocr_text"), max_text_chars),
        "markdown_output": truncate(artifact.get("markdown_output"), max_text_chars),
        "json_output": artifact.get("json_output"),
    }


def resolve_input_file(value: Any) -> Path:
    raw = clean_optional(value)
    if not raw:
        raise ValueError("file_path is required for this action.")

    path = Path(raw).expanduser().resolve()
    allowed_roots = [
        Path.home().resolve(),
        Path("/tmp").resolve(),
    ]
    if not any(is_relative_to(path, root) for root in allowed_roots):
        raise ValueError("file_path must be inside the operator home directory or /tmp.")
    if not path.is_file():
        raise ValueError(f"file_path does not exist or is not a file: {path}")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("file_path is larger than 50 MB.")
    return path


def clean_optional(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else ""


def clamp_int(value: Any, minimum: int, maximum: int, default: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        return default
    return max(minimum, min(maximum, value))


def truncate(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}\n...[truncated]"


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    raise SystemExit(main())
