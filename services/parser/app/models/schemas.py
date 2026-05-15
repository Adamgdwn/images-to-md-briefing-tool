from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ArtifactType(str, Enum):
    ui_form_screen = "ui_form_screen"
    ui_dashboard_screen = "ui_dashboard_screen"
    workflow_diagram = "workflow_diagram"
    slide_layout = "slide_layout"
    table_heavy = "table_heavy"
    mixed_visual = "mixed_visual"
    unknown_manual_review = "unknown_manual_review"


class ArtifactCategory(str, Enum):
    ui_screen = "ui_screen"
    ui_dialog = "ui_dialog"
    workflow_visual = "workflow_visual"
    presentation_visual = "presentation_visual"
    document_visual = "document_visual"
    unknown_manual_review = "unknown_manual_review"


class ArtifactSubtype(str, Enum):
    dashboard_screen = "dashboard_screen"
    settings_screen = "settings_screen"
    data_entry_form = "data_entry_form"
    table_list_view = "table_list_view"
    detail_view = "detail_view"
    auth_screen = "auth_screen"
    editor_screen = "editor_screen"
    navigation_home = "navigation_home"
    confirmation_dialog = "confirmation_dialog"
    settings_dialog = "settings_dialog"
    auth_dialog = "auth_dialog"
    file_picker_dialog = "file_picker_dialog"
    export_dialog = "export_dialog"
    warning_dialog = "warning_dialog"
    specialized_task_dialog = "specialized_task_dialog"
    process_map = "process_map"
    flowchart = "flowchart"
    decision_tree = "decision_tree"
    swimlane_diagram = "swimlane_diagram"
    journey_map = "journey_map"
    relationship_map = "relationship_map"
    slide_layout = "slide_layout"
    executive_summary_slide = "executive_summary_slide"
    comparison_slide = "comparison_slide"
    annotated_mockup = "annotated_mockup"
    concept_board = "concept_board"
    scanned_page = "scanned_page"
    table_capture = "table_capture"
    form_snapshot = "form_snapshot"
    contract_section = "contract_section"
    report_page = "report_page"
    annotated_document = "annotated_document"
    signature_or_stamp_region = "signature_or_stamp_region"
    unknown_manual_review = "unknown_manual_review"


class ExtractedArtifact(BaseModel):
    source_filename: str
    page_number: int | None = None
    image_filename: str
    image_mime_type: str
    image_base64: str
    artifact_type: ArtifactType
    confidence: float = Field(ge=0, le=1)
    category: ArtifactCategory = ArtifactCategory.unknown_manual_review
    subtype: ArtifactSubtype = ArtifactSubtype.unknown_manual_review
    classification_confidence: float = Field(default=0.0, ge=0, le=1)
    classification_reasons: list[str] = Field(default_factory=list)
    ocr_backend: str
    ocr_confidence: float = Field(ge=0, le=1)
    interpretation_backend: str = "local_template"
    interpretation_confidence: float = Field(default=0.0, ge=0, le=1)
    raw_ocr_text: str = ""
    layout_data: list[dict[str, Any]] = Field(default_factory=list)
    layout_summary: str
    ui_elements: list[dict[str, Any]] = Field(default_factory=list)
    markdown_output: str
    json_output: dict[str, Any]


class ParseResponse(BaseModel):
    source_filename: str
    file_type: str
    page_count: int | None = None
    artifacts: list[ExtractedArtifact]
    warnings: list[str] = Field(default_factory=list)


class InterpretRequest(BaseModel):
    artifact_id: str | None = None
    source_document: str
    page_number: int | None = None
    artifact_type: ArtifactType
    confidence: float = Field(ge=0, le=1)
    category: ArtifactCategory = ArtifactCategory.unknown_manual_review
    subtype: ArtifactSubtype = ArtifactSubtype.unknown_manual_review
    classification_confidence: float = Field(default=0.0, ge=0, le=1)
    classification_reasons: list[str] = Field(default_factory=list)
    raw_ocr_text: str = ""
    layout_summary: str = ""
    ui_elements: list[dict[str, Any]] = Field(default_factory=list)


class OutputPackageRequest(BaseModel):
    package_type: str
    artifacts: list[dict[str, Any]]


class OutputPackageResponse(BaseModel):
    output_markdown: str
    output_json: dict[str, Any]
