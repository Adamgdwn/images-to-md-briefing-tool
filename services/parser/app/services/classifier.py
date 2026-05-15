from dataclasses import dataclass, field
from typing import Any

from app.models.schemas import ArtifactCategory, ArtifactSubtype, ArtifactType


PRIORITY = [
    ArtifactCategory.ui_dialog,
    ArtifactCategory.workflow_visual,
    ArtifactCategory.presentation_visual,
    ArtifactCategory.document_visual,
    ArtifactCategory.ui_screen,
    ArtifactCategory.unknown_manual_review,
]


@dataclass
class ClassificationResult:
    category: ArtifactCategory
    subtype: ArtifactSubtype
    confidence: float
    reasons: list[str] = field(default_factory=list)

    @property
    def artifact_type(self) -> ArtifactType:
        return legacy_artifact_type(self.category, self.subtype)


def classify_artifact(
    raw_text: str,
    width: int | None = None,
    height: int | None = None,
    layout_data: list[dict[str, Any]] | None = None,
) -> ClassificationResult:
    text = " ".join(raw_text.lower().replace("\n", " ").split())
    layout_count = len(layout_data or [])
    evidence: dict[ArtifactCategory, tuple[float, list[str]]] = {
        category: (0.0, []) for category in ArtifactCategory
    }

    def add(category: ArtifactCategory, points: float, reason: str) -> None:
        score, reasons = evidence[category]
        evidence[category] = (score + points, reasons + [reason])

    wide = bool(width and height and width > height * 1.45)
    tall = bool(width and height and height > width * 1.25)
    compact = bool(width and height and width < 1200 and height < 1000)

    paired_actions = has_any(text, ["ok", "cancel", "apply", "confirm", "save", "close"])
    modal_terms = has_any(text, ["password", "login", "log in", "warning", "confirm", "browse", "export", "digital id"])
    if paired_actions:
        add(ArtifactCategory.ui_dialog, 2.5, "Paired action buttons or close/confirm controls")
    if compact and paired_actions:
        add(ArtifactCategory.ui_dialog, 1.5, "Compact bounded layout with task actions")
    if modal_terms:
        add(ArtifactCategory.ui_dialog, 1.0, "Task-specific dialog language")

    workflow_terms = count_matches(text, ["step", "process", "decision", "approve", "reject", "flow", "transition", "owner", "dependency", "lane"])
    if workflow_terms:
        add(ArtifactCategory.workflow_visual, min(4.0, workflow_terms * 0.8), "Process, transition, or decision terminology")
    if has_any(text, ["yes", "no"]) and workflow_terms:
        add(ArtifactCategory.workflow_visual, 1.0, "Decision branch language")

    presentation_terms = count_matches(text, ["agenda", "overview", "summary", "objective", "recommendation", "next steps", "comparison", "audience"])
    if presentation_terms:
        add(ArtifactCategory.presentation_visual, min(4.0, presentation_terms * 0.8), "Presentation or briefing terminology")
    if wide and presentation_terms:
        add(ArtifactCategory.presentation_visual, 1.0, "Wide presentation-like composition")

    document_terms = count_matches(text, ["signature", "stamp", "contract", "report", "section", "paragraph", "form", "table", "date", "amount"])
    if document_terms and not paired_actions:
        add(ArtifactCategory.document_visual, min(4.0, document_terms * 0.65), "Document, form, table, or signature content")
    if tall and document_terms:
        add(ArtifactCategory.document_visual, 1.0, "Page-like vertical composition")

    screen_terms = count_matches(text, ["dashboard", "settings", "search", "filter", "table", "details", "editor", "home", "navigation", "status", "chart"])
    if screen_terms:
        add(ArtifactCategory.ui_screen, min(4.0, screen_terms * 0.65), "Application screen controls or workspace terminology")
    if layout_count > 20 and not compact:
        add(ArtifactCategory.ui_screen, 0.8, "Multiple detected text regions")

    if not text.strip():
        return ClassificationResult(
            category=ArtifactCategory.unknown_manual_review,
            subtype=ArtifactSubtype.unknown_manual_review,
            confidence=0.25,
            reasons=["No reliable OCR text available"],
        )

    category = best_category(evidence)
    raw_score, reasons = evidence[category]
    if raw_score < 1.2:
        return ClassificationResult(
            category=ArtifactCategory.unknown_manual_review,
            subtype=ArtifactSubtype.unknown_manual_review,
            confidence=0.35,
            reasons=["Weak or conflicting structural evidence"],
        )

    subtype, subtype_reasons = classify_subtype(category, text, wide, tall)
    confidence = min(0.92, 0.45 + raw_score * 0.08)
    if len(text.split()) > 8:
        confidence = min(0.96, confidence + 0.05)
    return ClassificationResult(
        category=category,
        subtype=subtype,
        confidence=round(confidence, 3),
        reasons=dedupe(reasons + subtype_reasons),
    )


def best_category(evidence: dict[ArtifactCategory, tuple[float, list[str]]]) -> ArtifactCategory:
    best = max(evidence, key=lambda category: (evidence[category][0], -PRIORITY.index(category)))
    best_score = evidence[best][0]
    close = [category for category, (score, _) in evidence.items() if category != best and best_score - score < 0.5 and score > 1.0]
    if close:
        ranked = sorted([best, *close], key=lambda category: PRIORITY.index(category))
        return ranked[0]
    return best


def classify_subtype(category: ArtifactCategory, text: str, wide: bool, tall: bool) -> tuple[ArtifactSubtype, list[str]]:
    if category == ArtifactCategory.ui_dialog:
        if has_any(text, ["password", "login", "log in", "digital id", "certificate"]):
            return ArtifactSubtype.auth_dialog, ["Authentication or credential controls"]
        if has_any(text, ["warning", "error", "failed", "danger"]):
            return ArtifactSubtype.warning_dialog, ["Warning or error language"]
        if has_any(text, ["export", "download", "package"]):
            return ArtifactSubtype.export_dialog, ["Export or package action language"]
        if has_any(text, ["browse", "file", "folder", "path"]):
            return ArtifactSubtype.file_picker_dialog, ["File/path selection controls"]
        if has_any(text, ["settings", "preferences", "options"]):
            return ArtifactSubtype.settings_dialog, ["Settings or options controls"]
        if has_any(text, ["confirm", "are you sure", "delete"]):
            return ArtifactSubtype.confirmation_dialog, ["Confirmation task language"]
        return ArtifactSubtype.specialized_task_dialog, ["Single focused task"]

    if category == ArtifactCategory.ui_screen:
        if has_any(text, ["dashboard", "kpi", "metric", "chart", "trend"]):
            return ArtifactSubtype.dashboard_screen, ["Dashboard/KPI cues"]
        if has_any(text, ["settings", "preferences", "configuration"]):
            return ArtifactSubtype.settings_screen, ["Settings page cues"]
        if has_any(text, ["password", "sign in", "email address", "login"]):
            return ArtifactSubtype.auth_screen, ["Authentication screen cues"]
        if has_any(text, ["table", "row", "column", "filter", "search"]):
            return ArtifactSubtype.table_list_view, ["Table/list controls"]
        if has_any(text, ["edit", "editor", "canvas", "format"]):
            return ArtifactSubtype.editor_screen, ["Editor workspace cues"]
        if has_any(text, ["details", "profile", "summary"]):
            return ArtifactSubtype.detail_view, ["Detail view cues"]
        if has_any(text, ["home", "navigation", "welcome"]):
            return ArtifactSubtype.navigation_home, ["Navigation home cues"]
        return ArtifactSubtype.data_entry_form, ["Form or data entry controls"]

    if category == ArtifactCategory.workflow_visual:
        if has_any(text, ["yes", "no", "decision"]):
            return ArtifactSubtype.decision_tree, ["Decision branch cues"]
        if has_any(text, ["lane", "owner", "department", "role"]):
            return ArtifactSubtype.swimlane_diagram, ["Owner/lane cues"]
        if has_any(text, ["journey", "touchpoint"]):
            return ArtifactSubtype.journey_map, ["Journey/touchpoint cues"]
        if has_any(text, ["relationship", "depends", "dependency"]):
            return ArtifactSubtype.relationship_map, ["Relationship/dependency cues"]
        if has_any(text, ["flow", "start", "end"]):
            return ArtifactSubtype.flowchart, ["Flowchart cues"]
        return ArtifactSubtype.process_map, ["Process sequence cues"]

    if category == ArtifactCategory.presentation_visual:
        if has_any(text, ["executive", "summary"]):
            return ArtifactSubtype.executive_summary_slide, ["Executive summary cues"]
        if has_any(text, ["versus", "vs", "comparison", "compare"]):
            return ArtifactSubtype.comparison_slide, ["Comparison cues"]
        if has_any(text, ["mockup", "annotation", "annotated"]):
            return ArtifactSubtype.annotated_mockup, ["Annotated mockup cues"]
        if has_any(text, ["concept", "idea", "board"]):
            return ArtifactSubtype.concept_board, ["Concept board cues"]
        if wide:
            return ArtifactSubtype.slide_layout, ["Slide-like wide layout"]
        return ArtifactSubtype.slide_layout, ["Presentation-style structure"]

    if category == ArtifactCategory.document_visual:
        if has_any(text, ["signature", "stamp", "seal"]):
            return ArtifactSubtype.signature_or_stamp_region, ["Signature/stamp cues"]
        if has_any(text, ["contract", "agreement", "clause"]):
            return ArtifactSubtype.contract_section, ["Contract section cues"]
        if has_any(text, ["report", "findings", "analysis"]):
            return ArtifactSubtype.report_page, ["Report page cues"]
        if has_any(text, ["table", "row", "column", "total"]):
            return ArtifactSubtype.table_capture, ["Table capture cues"]
        if has_any(text, ["form", "field", "name", "address"]):
            return ArtifactSubtype.form_snapshot, ["Form snapshot cues"]
        if has_any(text, ["annotation", "comment", "markup"]):
            return ArtifactSubtype.annotated_document, ["Annotation cues"]
        if tall:
            return ArtifactSubtype.scanned_page, ["Page-like capture"]
        return ArtifactSubtype.form_snapshot, ["Document-centric content"]

    return ArtifactSubtype.unknown_manual_review, ["Manual review required"]


def legacy_artifact_type(category: ArtifactCategory, subtype: ArtifactSubtype) -> ArtifactType:
    if category == ArtifactCategory.ui_dialog:
        return ArtifactType.ui_form_screen
    if category == ArtifactCategory.workflow_visual:
        return ArtifactType.workflow_diagram
    if category == ArtifactCategory.presentation_visual:
        return ArtifactType.slide_layout
    if category == ArtifactCategory.document_visual:
        return ArtifactType.table_heavy if subtype == ArtifactSubtype.table_capture else ArtifactType.mixed_visual
    if category == ArtifactCategory.ui_screen:
        if subtype == ArtifactSubtype.dashboard_screen:
            return ArtifactType.ui_dashboard_screen
        if subtype == ArtifactSubtype.table_list_view:
            return ArtifactType.table_heavy
        return ArtifactType.ui_form_screen
    return ArtifactType.unknown_manual_review


def has_any(text: str, markers: list[str]) -> bool:
    return any(marker in text for marker in markers)


def count_matches(text: str, markers: list[str]) -> int:
    return sum(1 for marker in markers if marker in text)


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out
