from app.models.schemas import ArtifactCategory, ArtifactSubtype, ArtifactType, InterpretRequest, OutputPackageRequest, OutputPackageResponse
from app.services.llm import generate_with_claude


def build_interpretation(
    artifact_id: str,
    source_document: str,
    page_number: int | None,
    artifact_type: ArtifactType,
    confidence: float,
    category: ArtifactCategory,
    subtype: ArtifactSubtype,
    classification_confidence: float,
    classification_reasons: list[str],
    raw_ocr_text: str,
    image_filename: str,
    ocr_backend: str | None = None,
    ocr_confidence: float | None = None,
) -> tuple[str, dict]:
    visible_text = [line.strip() for line in raw_ocr_text.splitlines() if line.strip()]
    ui_elements = infer_ui_elements(visible_text, category, subtype)
    layout_summary = summarize_layout(category, subtype, visible_text)
    ambiguities = infer_ambiguities(category, subtype, visible_text)
    requested_additions = infer_requested_additions(category, subtype)

    json_output = {
        "artifact_id": artifact_id,
        "source_document": source_document,
        "page_number": page_number,
        "artifact_type": artifact_type.value,
        "confidence": round(confidence, 2),
        "category": category.value,
        "subtype": subtype.value,
        "classification_confidence": round(classification_confidence, 2),
        "classification_reasons": classification_reasons,
        "ocr_backend": ocr_backend,
        "ocr_confidence": round(ocr_confidence, 2) if ocr_confidence is not None else None,
        "visible_text": visible_text,
        "layout_summary": layout_summary,
        "ui_elements": ui_elements,
        "inferred_intent": infer_intent(artifact_type),
        "ambiguities": ambiguities,
        "requested_additions": requested_additions,
        "review_status": "draft",
    }

    confidence_label = "high" if confidence >= 0.75 else "medium" if confidence >= 0.5 else "low"
    ocr_block = "\n".join(f"- {line}" for line in visible_text) or "- No OCR text recovered"
    elements_block = "\n".join(format_element(element) for element in ui_elements) or "- No functional elements identified"
    ambiguities_block = "\n".join(f"- {item}" for item in ambiguities) or "- None identified"
    additions_block = "\n".join(f"- {item}" for item in requested_additions) or "- None identified"

    markdown = f"""## Artifact {artifact_id[:8]} - {title_for(subtype.value)}

### Source
- File: {source_document}
- Page: {page_number or "n/a"}
- Image: {image_filename}
- Type: {artifact_type.value}
- Confidence: {confidence_label}
- Category: {category.value}
- Subtype: {subtype.value}
- Classification confidence: {classification_confidence:.2f}
- OCR backend: {ocr_backend or "unrecorded"}
- OCR confidence: {ocr_confidence if ocr_confidence is not None else "n/a"}

### Classification reasons
{chr(10).join(f"- {reason}" for reason in classification_reasons) or "- None recorded"}

### OCR text
{ocr_block}

### Layout summary
{layout_summary}

### Functional elements
{elements_block}

### Inferred intent
{json_output["inferred_intent"]}

### Ambiguities
{ambiguities_block}

### Requested additions
{additions_block}
"""
    return markdown, json_output


def interpret_from_request(payload: InterpretRequest) -> tuple[str, dict]:
    artifact_id = payload.artifact_id or "draft"
    return build_interpretation(
        artifact_id=artifact_id,
        source_document=payload.source_document,
        page_number=payload.page_number,
        artifact_type=payload.artifact_type,
        confidence=payload.confidence,
        category=payload.category,
        subtype=payload.subtype,
        classification_confidence=payload.classification_confidence,
        classification_reasons=payload.classification_reasons,
        raw_ocr_text=payload.raw_ocr_text,
        image_filename="uploaded artifact",
        ocr_backend=None,
        ocr_confidence=None,
    )


def generate_output_package(payload: OutputPackageRequest) -> OutputPackageResponse:
    claude_markdown = generate_with_claude(payload)
    if claude_markdown:
        return OutputPackageResponse(
            output_markdown=claude_markdown + "\n",
            output_json={"package_type": payload.package_type, "provider": "claude", "artifact_count": len(payload.artifacts)},
        )

    title = {
        "functional_additions": "Functional Additions",
        "developer_stories": "Developer Stories",
        "implementation_brief": "Implementation Brief",
        "codex_ready_package": "Codex-Ready Briefing Package",
    }.get(payload.package_type, "Implementation Brief")

    sections = [f"# {title}", ""]
    package_items = []
    for index, artifact in enumerate(payload.artifacts, start=1):
        data = artifact.get("edited_json") or artifact.get("json_output") or {}
        markdown = artifact.get("edited_markdown") or artifact.get("markdown_output") or ""
        artifact_title = data.get("layout_summary") or f"Artifact {index}"
        sections.append(f"## {index}. {artifact_title}")

        if payload.package_type == "functional_additions":
            additions = data.get("requested_additions") or []
            sections.extend(f"- {item}" for item in additions)
        elif payload.package_type == "developer_stories":
            intent = data.get("inferred_intent", "support the reviewed workflow")
            sections.append(f"### Story")
            sections.append(f"As a user, I want the product to {intent.lower()} so that the reviewed workflow is supported.")
            sections.append("### Acceptance criteria")
            for item in data.get("requested_additions", ["The reviewed behavior is implemented"]):
                sections.append(f"- {item}")
        elif payload.package_type == "codex_ready_package":
            sections.append("### Build context")
            sections.append(markdown.strip())
            sections.append("### Codex instruction")
            sections.append("Implement the approved behavior described above. Preserve source traceability and call out ambiguities before coding.")
        else:
            sections.append(markdown.strip())

        sections.append("")
        package_items.append(data)

    return OutputPackageResponse(
        output_markdown="\n".join(sections).strip() + "\n",
        output_json={"package_type": payload.package_type, "artifacts": package_items},
    )


def infer_ui_elements(visible_text: list[str], category: ArtifactCategory, subtype: ArtifactSubtype) -> list[dict]:
    elements: list[dict] = []
    for line in visible_text:
        lower = line.lower()
        if any(word in lower for word in ["save", "submit", "continue", "cancel", "add", "delete"]):
            elements.append({"type": "button", "label": line, "role": "primary" if "save" in lower or "submit" in lower else "secondary"})
        elif any(word in lower for word in ["filter", "search"]):
            elements.append({"type": "input", "label": line})
        elif category == ArtifactCategory.workflow_visual:
            elements.append({"type": "workflow_step", "label": line})
    return elements[:12]


def summarize_layout(category: ArtifactCategory, subtype: ArtifactSubtype, visible_text: list[str]) -> str:
    if category == ArtifactCategory.ui_dialog:
        return f"Focused {subtype.value.replace('_', ' ')} with bounded task controls and confirm/cancel behavior."
    if category == ArtifactCategory.workflow_visual:
        return f"{subtype.value.replace('_', ' ').title()} with steps, transitions, or decision structure."
    if category == ArtifactCategory.presentation_visual:
        return f"{subtype.value.replace('_', ' ').title()} intended for briefing, review, or communication."
    if category == ArtifactCategory.document_visual:
        return f"{subtype.value.replace('_', ' ').title()} with document-centric content rather than application chrome."
    if category == ArtifactCategory.ui_screen:
        return f"{subtype.value.replace('_', ' ').title()} with persistent application workspace controls."
    if visible_text:
        return "Mixed visual artifact with recoverable text and review-required structure."
    return "Image artifact needs manual review because no reliable text was recovered."


def infer_intent(artifact_type: ArtifactType) -> str:
    return {
        ArtifactType.workflow_diagram: "Documents a process flow and decision sequence.",
        ArtifactType.ui_dashboard_screen: "Lets a user monitor status and act on summarized information.",
        ArtifactType.ui_form_screen: "Lets a user enter, review, or submit application data.",
        ArtifactType.table_heavy: "Presents structured records for comparison or operational review.",
        ArtifactType.slide_layout: "Communicates a summarized concept, recommendation, or plan.",
        ArtifactType.mixed_visual: "Combines visual and textual information that needs reviewer interpretation.",
        ArtifactType.unknown_manual_review: "Requires human review before downstream implementation use.",
    }[artifact_type]


def infer_ambiguities(category: ArtifactCategory, subtype: ArtifactSubtype, visible_text: list[str]) -> list[str]:
    if not visible_text:
        return ["No OCR text was recovered; reviewer should inspect the image manually."]
    if category in {ArtifactCategory.ui_screen, ArtifactCategory.ui_dialog}:
        return ["Which fields are required and what validation rules apply?"]
    if category == ArtifactCategory.workflow_visual:
        return ["Are all decision branches represented in the source artifact?"]
    if category == ArtifactCategory.document_visual:
        return ["What surrounding workflow or source document context should this capture be tied to?"]
    return ["Confirm whether inferred structure matches the intended source context."]


def infer_requested_additions(category: ArtifactCategory, subtype: ArtifactSubtype) -> list[str]:
    if subtype == ArtifactSubtype.dashboard_screen:
        return ["Add explicit empty, loading, and error states for dashboard data."]
    if category in {ArtifactCategory.ui_screen, ArtifactCategory.ui_dialog}:
        return ["Add validation feedback and unsaved-change handling where applicable."]
    if category == ArtifactCategory.workflow_visual:
        return ["Translate reviewed steps into implementation tasks with dependencies."]
    if category == ArtifactCategory.document_visual:
        return ["Preserve document provenance and reviewed text blocks in implementation notes."]
    return ["Preserve reviewed artifact details in implementation notes."]


def title_for(value: str) -> str:
    return value.replace("_", " ").title()


def format_element(element: dict) -> str:
    label = element.get("label", "Unlabeled")
    element_type = element.get("type", "element").replace("_", " ").title()
    role = element.get("role")
    return f"- {element_type}: {label}" + (f" ({role})" if role else "")
