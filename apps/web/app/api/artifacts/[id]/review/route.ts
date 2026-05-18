import { NextResponse } from "next/server";
import { z } from "zod";
import { getArtifactDetail, saveArtifactReview } from "@/lib/store";

const reviewSchema = z.object({
  review_status: z.enum(["draft", "approved", "rejected"]),
  edited_markdown: z.string(),
  edited_json: z.record(z.unknown()),
  notes: z.string().optional(),
  artifact_type: z.enum([
    "ui_form_screen",
    "ui_dashboard_screen",
    "workflow_diagram",
    "slide_layout",
    "table_heavy",
    "mixed_visual",
    "unknown_manual_review"
  ]),
  confidence: z.number().min(0).max(1),
  category: z.enum(["ui_screen", "ui_dialog", "workflow_visual", "presentation_visual", "document_visual", "unknown_manual_review"]),
  subtype: z.enum([
    "dashboard_screen",
    "settings_screen",
    "data_entry_form",
    "table_list_view",
    "detail_view",
    "auth_screen",
    "editor_screen",
    "navigation_home",
    "confirmation_dialog",
    "settings_dialog",
    "auth_dialog",
    "file_picker_dialog",
    "export_dialog",
    "warning_dialog",
    "specialized_task_dialog",
    "process_map",
    "flowchart",
    "decision_tree",
    "swimlane_diagram",
    "journey_map",
    "relationship_map",
    "slide_layout",
    "executive_summary_slide",
    "comparison_slide",
    "annotated_mockup",
    "concept_board",
    "scanned_page",
    "table_capture",
    "form_snapshot",
    "contract_section",
    "report_page",
    "annotated_document",
    "signature_or_stamp_region",
    "unknown_manual_review"
  ]),
  classification_confidence: z.number().min(0).max(1),
  classification_reasons: z.array(z.string())
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const detail = await getArtifactDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }
  if (detail.project?.status === "archived") {
    return NextResponse.json({ error: "Archived project artifacts cannot be reviewed." }, { status: 409 });
  }
  const review = await saveArtifactReview({
    artifact_id: id,
    ...parsed.data,
    notes: parsed.data.notes ?? ""
  });
  return NextResponse.json({ review });
}
