export type ArtifactType =
  | "ui_form_screen"
  | "ui_dashboard_screen"
  | "workflow_diagram"
  | "slide_layout"
  | "table_heavy"
  | "mixed_visual"
  | "unknown_manual_review";

export type ArtifactCategory =
  | "ui_screen"
  | "ui_dialog"
  | "workflow_visual"
  | "presentation_visual"
  | "document_visual"
  | "unknown_manual_review";

export type ArtifactSubtype =
  | "dashboard_screen"
  | "settings_screen"
  | "data_entry_form"
  | "table_list_view"
  | "detail_view"
  | "auth_screen"
  | "editor_screen"
  | "navigation_home"
  | "confirmation_dialog"
  | "settings_dialog"
  | "auth_dialog"
  | "file_picker_dialog"
  | "export_dialog"
  | "warning_dialog"
  | "specialized_task_dialog"
  | "process_map"
  | "flowchart"
  | "decision_tree"
  | "swimlane_diagram"
  | "journey_map"
  | "relationship_map"
  | "slide_layout"
  | "executive_summary_slide"
  | "comparison_slide"
  | "annotated_mockup"
  | "concept_board"
  | "scanned_page"
  | "table_capture"
  | "form_snapshot"
  | "contract_section"
  | "report_page"
  | "annotated_document"
  | "signature_or_stamp_region"
  | "unknown_manual_review";

export type ProcessingStatus = "queued" | "processing" | "completed" | "failed";
export type ReviewStatus = "draft" | "approved" | "rejected";
export type PackageType =
  | "functional_additions"
  | "developer_stories"
  | "implementation_brief"
  | "codex_ready_package";

export type Project = {
  id: string;
  name: string;
  client_context: string;
  status: "active" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SourceDocument = {
  id: string;
  project_id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  page_count: number | null;
  uploaded_at: string;
};

export type ProcessingJob = {
  id: string;
  project_id: string;
  source_document_id: string | null;
  stage: string;
  status: ProcessingStatus;
  error_log: string | null;
  created_at: string;
  updated_at: string;
};

export type Artifact = {
  id: string;
  project_id: string;
  source_document_id: string | null;
  page_number: number | null;
  image_path: string;
  artifact_type: ArtifactType;
  confidence: number;
  category: ArtifactCategory;
  subtype: ArtifactSubtype;
  classification_confidence: number;
  classification_reasons: string[];
  ocr_backend: string;
  ocr_confidence: number;
  interpretation_backend: string;
  interpretation_confidence: number;
  processing_status: ProcessingStatus;
  created_at: string;
  updated_at: string;
};

export type ArtifactExtraction = {
  id: string;
  artifact_id: string;
  raw_ocr_text: string;
  layout_data: Array<Record<string, unknown>>;
  layout_summary: string;
  ui_elements_json: Array<Record<string, unknown>>;
  markdown_output: string;
  json_output: Record<string, unknown>;
  created_at: string;
};

export type ArtifactReview = {
  id: string;
  artifact_id: string;
  reviewer_id: string;
  review_status: ReviewStatus;
  edited_markdown: string;
  edited_json: Record<string, unknown>;
  notes: string;
  approved_at: string | null;
  version: number;
  created_at: string;
};

export type OutputPackage = {
  id: string;
  project_id: string;
  package_type: PackageType;
  source_selection: string[];
  output_markdown: string;
  output_json: Record<string, unknown>;
  storage_path: string | null;
  created_at: string;
};

export type ProjectBundle = {
  project: Project;
  source_documents: SourceDocument[];
  artifacts: Array<Artifact & { extraction?: ArtifactExtraction; latest_review?: ArtifactReview }>;
  processing_jobs: ProcessingJob[];
  output_packages: OutputPackage[];
};

export type StoreData = {
  projects: Project[];
  source_documents: SourceDocument[];
  processing_jobs: ProcessingJob[];
  artifacts: Artifact[];
  artifact_extractions: ArtifactExtraction[];
  artifact_reviews: ArtifactReview[];
  output_packages: OutputPackage[];
  audit_events: Array<Record<string, unknown>>;
};
