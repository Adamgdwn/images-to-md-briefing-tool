import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { regenerateArtifactImage } from "@/lib/parser";
import { getArtifactDetail, replaceArtifactExtraction } from "@/lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getArtifactDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const submittedNotes = typeof payload.reviewer_notes === "string" ? payload.reviewer_notes : "";
    const latestReview = detail.reviews[0];
    const reviewerNotes = (submittedNotes || cleanReviewerNotes(latestReview?.notes ?? "")).trim();
    const imageBuffer = await fs.readFile(detail.artifact.image_path);
    const regenerated = await regenerateArtifactImage({
      image: new Blob([imageBuffer], { type: contentType(detail.artifact.image_path) }),
      filename: detail.artifact.image_path.split("/").pop() ?? "artifact.png",
      sourceDocument: detail.source_document?.filename ?? "source image",
      artifactId: detail.artifact.id,
      pageNumber: detail.artifact.page_number,
      reviewerNotes
    });
    const artifact = regenerated.artifact;
    await replaceArtifactExtraction({
      artifact_id: detail.artifact.id,
      artifact_type: artifact.artifact_type,
      confidence: artifact.confidence,
      category: artifact.category,
      subtype: artifact.subtype,
      classification_confidence: artifact.classification_confidence,
      classification_reasons: artifact.classification_reasons,
      ocr_backend: artifact.ocr_backend,
      ocr_confidence: artifact.ocr_confidence,
      interpretation_backend: artifact.interpretation_backend,
      interpretation_confidence: artifact.interpretation_confidence,
      raw_ocr_text: artifact.raw_ocr_text,
      layout_data: artifact.layout_data,
      layout_summary: artifact.layout_summary,
      ui_elements_json: artifact.ui_elements,
      markdown_output: artifact.markdown_output,
      json_output: artifact.json_output,
      notes: reviewerNotes
    });
    return NextResponse.json({ artifact, warnings: regenerated.warnings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function contentType(filename: string): string {
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function cleanReviewerNotes(value: string) {
  return value
    .replace(/\n*Regenerated from source image using the reviewer notes above\.\s*$/g, "")
    .replace(/^Regenerated from source image\.\s*$/g, "")
    .trim();
}
