import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { artifactsDir, uploadsDir } from "@/lib/paths";
import { parseSourceDocument } from "@/lib/parser";
import {
  createArtifactWithExtraction,
  createProcessingJob,
  createSourceDocument,
  getProjectBundle,
  updateProcessingJob,
  updateSourceDocumentPageCount
} from "@/lib/store";

const allowedTypes = new Set(["docx", "odt", "odp", "ods", "odg", "pdf", "png", "jpg", "jpeg", "webp"]);

export async function POST(request: Request) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const formData = await request.formData();
  const projectId = String(formData.get("project_id") ?? "");
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (!projectId || files.length === 0) {
    return NextResponse.json({ error: "project_id and at least one file are required." }, { status: 400 });
  }
  const bundle = await getProjectBundle(projectId, storeOwnerId(authResult.auth));
  if (!bundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (bundle.project.status === "archived") {
    return NextResponse.json({ error: "Archived projects cannot receive new uploads." }, { status: 409 });
  }

  const results = [];
  for (const file of files) {
    const fileType = extensionFor(file.name);
    if (!allowedTypes.has(fileType)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 });
    }

    const uploadPath = path.join(uploadsDir(), `${Date.now()}-${safeName(file.name)}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(uploadPath, bytes);

    const sourceDocument = await createSourceDocument({
      project_id: projectId,
      filename: file.name,
      file_type: fileType,
      storage_path: uploadPath
    });
    const job = await createProcessingJob({
      project_id: projectId,
      source_document_id: sourceDocument.id,
      stage: "parse",
      status: "processing"
    });

    try {
      const parseResponse = await parseSourceDocument(file);
      await updateSourceDocumentPageCount(sourceDocument.id, parseResponse.page_count);
      const artifactIds = [];
      for (const artifact of parseResponse.artifacts) {
        const imageExt = extensionFor(artifact.image_filename) || "png";
        const imagePath = path.join(artifactsDir(), `${sourceDocument.id}-${artifactIds.length + 1}.${imageExt}`);
        await fs.writeFile(imagePath, Buffer.from(artifact.image_base64, "base64"));
        const storedArtifact = await createArtifactWithExtraction({
          project_id: projectId,
          source_document_id: sourceDocument.id,
          page_number: artifact.page_number,
          image_path: imagePath,
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
          json_output: artifact.json_output
        });
        artifactIds.push(storedArtifact.id);
      }
      await updateProcessingJob(job.id, { stage: "complete", status: "completed" });
      results.push({ source_document: sourceDocument, job_id: job.id, artifacts: artifactIds, warnings: parseResponse.warnings });
    } catch (error) {
      await updateProcessingJob(job.id, {
        stage: "failed",
        status: "failed",
        error_log: error instanceof Error ? error.message : String(error)
      });
      results.push({ source_document: sourceDocument, job_id: job.id, artifacts: [], warnings: [], error: String(error) });
    }
  }

  return NextResponse.json({ results });
}

function extensionFor(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function safeName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}
