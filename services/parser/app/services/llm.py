import os
import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.models.schemas import ArtifactCategory, ArtifactSubtype, ArtifactType, OutputPackageRequest
from app.services.classifier import legacy_artifact_type


@dataclass
class VisionInterpretation:
    backend: str
    confidence: float
    artifact_type: ArtifactType
    category: ArtifactCategory
    subtype: ArtifactSubtype
    classification_confidence: float
    classification_reasons: list[str]
    markdown_output: str
    json_output: dict[str, Any]


def generate_with_claude(payload: OutputPackageRequest) -> str | None:
    prompt = build_prompt(payload)
    if prefer_claude_code():
        try:
            cli_result = generate_with_claude_code(prompt)
        except RuntimeError:
            cli_result = None
        if cli_result:
            return cli_result

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 4000,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    blocks = data.get("content", [])
    return "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip() or None


def interpret_image_with_claude(
    image_base64: str,
    mime_type: str,
    source_document: str,
    page_number: int | None,
    artifact_id: str,
    raw_ocr_text: str,
    ocr_backend: str,
    ocr_confidence: float,
    reviewer_notes: str = "",
) -> VisionInterpretation | None:
    if prefer_claude_code():
        try:
            cli_result = interpret_image_with_claude_code(
                image_base64=image_base64,
                mime_type=mime_type,
                source_document=source_document,
                page_number=page_number,
                artifact_id=artifact_id,
                raw_ocr_text=raw_ocr_text,
                ocr_backend=ocr_backend,
                ocr_confidence=ocr_confidence,
                reviewer_notes=reviewer_notes,
            )
        except RuntimeError:
            cli_result = None
        if cli_result:
            return cli_result

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 5000,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": image_base64,
                            },
                        },
                        {
                            "type": "text",
                            "text": build_vision_prompt(
                                source_document=source_document,
                                page_number=page_number,
                                artifact_id=artifact_id,
                                raw_ocr_text=raw_ocr_text,
                                ocr_backend=ocr_backend,
                                ocr_confidence=ocr_confidence,
                                reviewer_notes=reviewer_notes,
                            ),
                        },
                    ],
                }
            ],
        },
        timeout=90,
    )
    response.raise_for_status()
    blocks = response.json().get("content", [])
    text = "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip()
    if not text:
        return None
    data = json.loads(extract_json_object(text))
    category = coerce_category(str(data.get("category", "unknown_manual_review")))
    subtype = coerce_subtype(str(data.get("subtype", "unknown_manual_review")))
    artifact_type = coerce_artifact_type(str(data.get("artifact_type", legacy_artifact_type(category, subtype).value)))
    confidence = clamp(float(data.get("confidence", 0.75)))
    classification_confidence = clamp(float(data.get("classification_confidence", confidence)))
    classification_reasons = [str(item) for item in data.get("classification_reasons", [])]
    markdown = str(data.get("markdown_output", "")).strip()
    if not markdown:
        markdown = markdown_from_vision_json(data)
    data.update(
        {
            "artifact_id": artifact_id,
            "source_document": source_document,
            "page_number": page_number,
            "artifact_type": artifact_type.value,
            "confidence": confidence,
            "category": category.value,
            "subtype": subtype.value,
            "classification_confidence": classification_confidence,
            "classification_reasons": classification_reasons,
            "ocr_backend": ocr_backend,
            "ocr_confidence": round(ocr_confidence, 2),
            "interpretation_backend": "claude_vision",
            "reviewer_notes": reviewer_notes,
            "review_status": "draft",
        }
    )
    return VisionInterpretation(
        backend="claude_vision",
        confidence=confidence,
        artifact_type=artifact_type,
        category=category,
        subtype=subtype,
        classification_confidence=classification_confidence,
        classification_reasons=classification_reasons,
        markdown_output=markdown,
        json_output=data,
    )


def prefer_claude_code() -> bool:
    mode = os.getenv("ANTHROPIC_AUTH_MODE", "claude_code").strip().lower()
    if mode in {"api", "api_key", "apikey"}:
        return False
    return resolve_claude_code_path() is not None


def generate_with_claude_code(prompt: str) -> str | None:
    result = run_claude_code(prompt)
    if not result:
        return None
    return result.strip()


def interpret_image_with_claude_code(
    image_base64: str,
    mime_type: str,
    source_document: str,
    page_number: int | None,
    artifact_id: str,
    raw_ocr_text: str,
    ocr_backend: str,
    ocr_confidence: float,
    reviewer_notes: str = "",
) -> VisionInterpretation | None:
    suffix = suffix_for_mime_type(mime_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as image_file:
        image_file.write(base64_to_bytes(image_base64))
        image_path = image_file.name

    try:
        prompt = (
            f"Read the image at this local path: {image_path}\n\n"
            + build_vision_prompt(
                source_document=source_document,
                page_number=page_number,
                artifact_id=artifact_id,
                raw_ocr_text=raw_ocr_text,
                ocr_backend=ocr_backend,
                ocr_confidence=ocr_confidence,
                reviewer_notes=reviewer_notes,
            )
        )
        text = run_claude_code(prompt)
        if not text:
            return None
        data = json.loads(extract_json_object(text))
        category = coerce_category(str(data.get("category", "unknown_manual_review")))
        subtype = coerce_subtype(str(data.get("subtype", "unknown_manual_review")))
        artifact_type = coerce_artifact_type(str(data.get("artifact_type", legacy_artifact_type(category, subtype).value)))
        confidence = clamp(float(data.get("confidence", 0.78)))
        classification_confidence = clamp(float(data.get("classification_confidence", confidence)))
        classification_reasons = [str(item) for item in data.get("classification_reasons", [])]
        markdown = str(data.get("markdown_output", "")).strip() or markdown_from_vision_json(data)
        data.update(
            {
                "artifact_id": artifact_id,
                "source_document": source_document,
                "page_number": page_number,
                "artifact_type": artifact_type.value,
                "confidence": confidence,
                "category": category.value,
                "subtype": subtype.value,
                "classification_confidence": classification_confidence,
                "classification_reasons": classification_reasons,
                "ocr_backend": ocr_backend,
                "ocr_confidence": round(ocr_confidence, 2),
                "interpretation_backend": "claude_code_account",
                "reviewer_notes": reviewer_notes,
                "review_status": "draft",
            }
        )
        return VisionInterpretation(
            backend="claude_code_account",
            confidence=confidence,
            artifact_type=artifact_type,
            category=category,
            subtype=subtype,
            classification_confidence=classification_confidence,
            classification_reasons=classification_reasons,
            markdown_output=markdown,
            json_output=data,
        )
    finally:
        Path(image_path).unlink(missing_ok=True)


def run_claude_code(prompt: str) -> str | None:
    claude_path = resolve_claude_code_path()
    if not claude_path:
        raise RuntimeError("Claude Code provider unavailable: CLI not found.")
    model = os.getenv("CLAUDE_CODE_MODEL", "sonnet")
    env = os.environ.copy()
    if os.getenv("ANTHROPIC_AUTH_MODE", "claude_code").strip().lower() not in {"api", "api_key", "apikey"}:
        env.pop("ANTHROPIC_API_KEY", None)
    try:
        completed = subprocess.run(
            [
                claude_path,
                "-p",
                "--output-format",
                "json",
                "--model",
                model,
                "--allowedTools",
                "Read",
                "--permission-mode",
                "bypassPermissions",
                "--no-session-persistence",
                prompt,
            ],
            env=env,
            capture_output=True,
            text=True,
            timeout=claude_code_timeout_seconds(),
            check=False,
        )
    except Exception as exc:
        raise RuntimeError(f"Claude Code provider unavailable: {exc}") from exc

    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "Claude Code failed.").strip())

    try:
        data = json.loads(completed.stdout)
        return str(data.get("result", "")).strip()
    except json.JSONDecodeError:
        return completed.stdout.strip() or None


def resolve_claude_code_path() -> str | None:
    configured = os.getenv("CLAUDE_CODE_PATH", "claude")
    resolved = executable_path(configured)
    if resolved:
        return resolved

    home = Path.home()
    candidates = [
        "claude",
        str(home / ".local/bin/claude"),
        str(home / ".npm-global/bin/claude"),
    ]
    nvm_dir = home / ".nvm/versions/node"
    if nvm_dir.exists():
        candidates.extend(str(path / "bin/claude") for path in sorted(nvm_dir.iterdir(), reverse=True) if path.is_dir())
    for candidate in candidates:
        resolved = executable_path(candidate)
        if resolved:
            return resolved
    return None


def executable_path(command: str) -> str | None:
    if "/" in command:
        return command if os.path.isfile(command) and os.access(command, os.X_OK) else None
    return shutil.which(command)


def claude_code_timeout_seconds() -> int:
    try:
        return max(1, int(os.getenv("CLAUDE_CODE_TIMEOUT_SECONDS", "180")))
    except ValueError:
        return 180


def build_prompt(payload: OutputPackageRequest) -> str:
    return f"""Create a concise {payload.package_type} from these approved screenshot artifacts.

Rules:
- Use only approved reviewed artifact content.
- Treat reviewer_notes as human guidance for focus, ambiguity resolution, and intent; do not treat notes as direct visual evidence unless supported by edited artifact content.
- Preserve source traceability when present.
- Keep ambiguities explicit.
- Return Markdown only.

Artifacts:
{payload.artifacts}
"""


def build_vision_prompt(
    source_document: str,
    page_number: int | None,
    artifact_id: str,
    raw_ocr_text: str,
    ocr_backend: str,
    ocr_confidence: float,
    reviewer_notes: str = "",
) -> str:
    reviewer_guidance = reviewer_notes.strip() or "(none provided)"
    return f"""You are creating a durable screenshot-to-coding brief for an internal build workflow.

The goal is not generic OCR. Convert the image into a compact Markdown and JSON artifact that gives a future LLM or developer enough information to use this screenshot for coding, implementation planning, or process analysis.

Source:
- artifact_id: {artifact_id}
- source_document: {source_document}
- page_number: {page_number or "n/a"}
- OCR backend: {ocr_backend}
- OCR confidence: {ocr_confidence:.2f}
- OCR text, if any:
{raw_ocr_text or "(none recovered)"}

Reviewer guidance:
{reviewer_guidance}

Use reviewer guidance as a focus and interpretation hint, especially for abstract visuals or screenshots where the important region is not obvious. Do not treat notes as visual evidence by themselves; reconcile them with what the image supports and put uncertainty in ambiguities.

Classify with this two-level taxonomy:
- category: ui_screen, ui_dialog, workflow_visual, presentation_visual, document_visual, unknown_manual_review
- subtype: dashboard_screen, settings_screen, data_entry_form, table_list_view, detail_view, auth_screen, editor_screen, navigation_home, confirmation_dialog, settings_dialog, auth_dialog, file_picker_dialog, export_dialog, warning_dialog, specialized_task_dialog, process_map, flowchart, decision_tree, swimlane_diagram, journey_map, relationship_map, slide_layout, executive_summary_slide, comparison_slide, annotated_mockup, concept_board, scanned_page, table_capture, form_snapshot, contract_section, report_page, annotated_document, signature_or_stamp_region, unknown_manual_review

Prefer structural evidence over OCR keywords alone. Use this priority when evidence overlaps: ui_dialog, workflow_visual, presentation_visual, document_visual, ui_screen, unknown_manual_review.

Return only valid JSON with this shape:
{{
  "artifact_type": "ui_form_screen",
  "confidence": 0.0,
  "category": "ui_dialog",
  "subtype": "specialized_task_dialog",
  "classification_confidence": 0.0,
  "classification_reasons": ["Bounded modal layout", "Paired action buttons"],
  "visible_text": ["all important visible labels and copy"],
  "layout_summary": "specific spatial description of the screen/image",
  "inferred_intent": "what this screen/process is for",
  "visual_structure": ["major regions from top to bottom / left to right"],
  "ui_elements": [
    {{
      "type": "button|input|select|radio|checkbox|table|dialog|menu|label|other",
      "label": "visible label",
      "location": "top-left|center|bottom-right etc",
      "state": "enabled|disabled|selected|empty|filled|unknown",
      "role": "primary|secondary|navigation|data-entry|display|unknown",
      "implementation_notes": "coding-relevant behavior or component note"
    }}
  ],
  "data_entities": ["domain objects, fields, IDs, files, accounts, records"],
  "user_actions": ["actions a user can take"],
  "workflow_notes": ["steps or process implications"],
  "validation_rules": ["required fields, disabled states, constraints, inferred rules"],
  "implementation_notes": ["concrete build notes useful to a developer"],
  "accessibility_notes": ["labels, focus, contrast, keyboard, modal behavior"],
  "ambiguities": ["things the screenshot does not prove"],
  "requested_additions": ["potential functional additions implied by the artifact"],
  "markdown_output": "A concise Markdown brief with Source, Visual summary, Visible text, UI elements, Behavior, Implementation notes, Ambiguities, and Requested additions sections."
}}

Choose interpretation emphasis by subtype:
- dashboard_screen: KPIs, filters, charts/tables, date ranges, actions, decision intent.
- data_entry_form: fields, likely required inputs, validation clues, primary/secondary actions, submission intent.
- ui_dialog subtypes: dialog purpose, focused task, input controls, confirm/cancel/close actions, disabled or warning states.
- workflow_visual subtypes: steps, transitions, decisions, actors/owners, dependencies, bottlenecks/risks.
- presentation_visual subtypes: main message, supporting structure, comparison logic, decision implication, likely audience.
- document_visual subtypes: document type, key text blocks, tables/stamps/signatures, business role, workflow relation.

Be specific. Include disabled buttons, selected radio options, modal/dialog titles, form field names, dropdown values, and background context when visible. Do not invent business requirements beyond what the image supports; put uncertainty in ambiguities."""


def base64_to_bytes(value: str) -> bytes:
    import base64

    return base64.b64decode(value)


def suffix_for_mime_type(mime_type: str) -> str:
    if mime_type == "image/jpeg":
        return ".jpg"
    if mime_type == "image/webp":
        return ".webp"
    return ".png"


def extract_json_object(text: str) -> str:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    raise ValueError("Claude vision response did not include a JSON object.")


def coerce_artifact_type(value: str) -> ArtifactType:
    try:
        return ArtifactType(value)
    except ValueError:
        return ArtifactType.mixed_visual


def coerce_category(value: str) -> ArtifactCategory:
    try:
        return ArtifactCategory(value)
    except ValueError:
        return ArtifactCategory.unknown_manual_review


def coerce_subtype(value: str) -> ArtifactSubtype:
    try:
        return ArtifactSubtype(value)
    except ValueError:
        return ArtifactSubtype.unknown_manual_review


def markdown_from_vision_json(data: dict[str, Any]) -> str:
    sections = [
        f"## Artifact - {str(data.get('subtype') or data.get('artifact_type', 'mixed_visual')).replace('_', ' ').title()}",
        "",
        "### Classification",
        f"- Category: {data.get('category', 'unknown_manual_review')}",
        f"- Subtype: {data.get('subtype', 'unknown_manual_review')}",
        f"- Confidence: {data.get('classification_confidence', data.get('confidence', 0))}",
        "",
        "### Visual summary",
        str(data.get("layout_summary", "")),
        "",
        "### Visible text",
        lines(data.get("visible_text")),
        "",
        "### UI elements",
        lines(format_ui_element(item) for item in data.get("ui_elements", [])),
        "",
        "### Implementation notes",
        lines(data.get("implementation_notes")),
        "",
        "### Ambiguities",
        lines(data.get("ambiguities")),
    ]
    return "\n".join(sections).strip() + "\n"


def lines(values: Any) -> str:
    items = list(values or [])
    return "\n".join(f"- {item}" for item in items) if items else "- None identified"


def format_ui_element(item: Any) -> str:
    if not isinstance(item, dict):
        return str(item)
    parts = [str(item.get("type", "element")), str(item.get("label", "unlabeled"))]
    if item.get("location"):
        parts.append(f"at {item['location']}")
    if item.get("state"):
        parts.append(f"state: {item['state']}")
    if item.get("implementation_notes"):
        parts.append(str(item["implementation_notes"]))
    return " - ".join(parts)


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
