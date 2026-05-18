import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { artifactsDir, exportsDir, storePath, uploadsDir } from "@/lib/paths";
import type {
  Artifact,
  ArtifactExtraction,
  ArtifactReview,
  OutputPackage,
  PackageType,
  ProcessingJob,
  Project,
  ProjectBundle,
  SourceDocument,
  StoreData
} from "@/types/domain";

const SYSTEM_USER = "local-user";

const emptyStore = (): StoreData => ({
  projects: [],
  source_documents: [],
  processing_jobs: [],
  artifacts: [],
  artifact_extractions: [],
  artifact_reviews: [],
  output_packages: [],
  audit_events: []
});

export async function ensureDataDirs() {
  await Promise.all([
    fs.mkdir(path.dirname(storePath()), { recursive: true }),
    fs.mkdir(uploadsDir(), { recursive: true }),
    fs.mkdir(artifactsDir(), { recursive: true }),
    fs.mkdir(exportsDir(), { recursive: true })
  ]);
}

export async function readStore(): Promise<StoreData> {
  await ensureDataDirs();
  try {
    return JSON.parse(await fs.readFile(storePath(), "utf8")) as StoreData;
  } catch {
    const data = emptyStore();
    await writeStore(data);
    return data;
  }
}

export async function writeStore(data: StoreData) {
  await ensureDataDirs();
  await fs.writeFile(storePath(), JSON.stringify(data, null, 2));
}

export async function listProjects(): Promise<Project[]> {
  const data = await readStore();
  return data.projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createProject(input: { name: string; client_context?: string }): Promise<Project> {
  const data = await readStore();
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: input.name,
    client_context: input.client_context ?? "",
    status: "active",
    created_by: SYSTEM_USER,
    created_at: now,
    updated_at: now
  };
  data.projects.push(project);
  data.audit_events.push(audit(project.id, "project_created", "project", project.id));
  await writeStore(data);
  return project;
}

export async function getProjectBundle(projectId: string): Promise<ProjectBundle | null> {
  const data = await readStore();
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }
  const sourceDocuments = data.source_documents.filter((item) => item.project_id === projectId);
  const artifacts = data.artifacts
    .filter((item) => item.project_id === projectId)
    .map((artifact) => ({
      ...normalizeArtifact(artifact),
      extraction: latestExtraction(data, artifact.id),
      latest_review: latestReview(data, artifact.id)
    }));

  return {
    project,
    source_documents: sourceDocuments,
    artifacts,
    processing_jobs: data.processing_jobs.filter((item) => item.project_id === projectId),
    output_packages: data.output_packages.filter((item) => item.project_id === projectId)
  };
}

export async function createSourceDocument(input: {
  project_id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  page_count?: number | null;
}): Promise<SourceDocument> {
  const data = await readStore();
  const sourceDocument: SourceDocument = {
    id: randomUUID(),
    project_id: input.project_id,
    filename: input.filename,
    file_type: input.file_type,
    storage_path: input.storage_path,
    page_count: input.page_count ?? null,
    uploaded_at: new Date().toISOString()
  };
  data.source_documents.push(sourceDocument);
  data.audit_events.push(audit(input.project_id, "source_uploaded", "source_document", sourceDocument.id));
  await writeStore(data);
  return sourceDocument;
}

export async function updateSourceDocumentPageCount(id: string, pageCount: number | null) {
  const data = await readStore();
  const doc = data.source_documents.find((item) => item.id === id);
  if (doc) {
    doc.page_count = pageCount;
  }
  await writeStore(data);
}

export async function createProcessingJob(input: {
  project_id: string;
  source_document_id?: string | null;
  stage: string;
  status: ProcessingJob["status"];
}): Promise<ProcessingJob> {
  const data = await readStore();
  const now = new Date().toISOString();
  const job: ProcessingJob = {
    id: randomUUID(),
    project_id: input.project_id,
    source_document_id: input.source_document_id ?? null,
    stage: input.stage,
    status: input.status,
    error_log: null,
    created_at: now,
    updated_at: now
  };
  data.processing_jobs.push(job);
  await writeStore(data);
  return job;
}

export async function updateProcessingJob(
  jobId: string,
  patch: Partial<Pick<ProcessingJob, "stage" | "status" | "error_log">>
) {
  const data = await readStore();
  const job = data.processing_jobs.find((item) => item.id === jobId);
  if (job) {
    Object.assign(job, patch, { updated_at: new Date().toISOString() });
  }
  await writeStore(data);
}

export async function createArtifactWithExtraction(input: {
  project_id: string;
  source_document_id: string;
  page_number: number | null;
  image_path: string;
  artifact_type: Artifact["artifact_type"];
  confidence: number;
  category: Artifact["category"];
  subtype: Artifact["subtype"];
  classification_confidence: number;
  classification_reasons: string[];
  ocr_backend: string;
  ocr_confidence: number;
  interpretation_backend: string;
  interpretation_confidence: number;
  raw_ocr_text: string;
  layout_data: Array<Record<string, unknown>>;
  layout_summary: string;
  ui_elements_json: Array<Record<string, unknown>>;
  markdown_output: string;
  json_output: Record<string, unknown>;
  notes?: string;
}): Promise<Artifact> {
  const data = await readStore();
  const now = new Date().toISOString();
  const artifact: Artifact = {
    id: randomUUID(),
    project_id: input.project_id,
    source_document_id: input.source_document_id,
    page_number: input.page_number,
    image_path: input.image_path,
    artifact_type: input.artifact_type,
    confidence: input.confidence,
    category: input.category,
    subtype: input.subtype,
    classification_confidence: input.classification_confidence,
    classification_reasons: input.classification_reasons,
    ocr_backend: input.ocr_backend,
    ocr_confidence: input.ocr_confidence,
    interpretation_backend: input.interpretation_backend,
    interpretation_confidence: input.interpretation_confidence,
    processing_status: "completed",
    created_at: now,
    updated_at: now
  };
  const extraction: ArtifactExtraction = {
    id: randomUUID(),
    artifact_id: artifact.id,
    raw_ocr_text: input.raw_ocr_text,
    layout_data: input.layout_data,
    layout_summary: input.layout_summary,
    ui_elements_json: input.ui_elements_json,
    markdown_output: input.markdown_output,
    json_output: { ...input.json_output, artifact_id: artifact.id },
    created_at: now
  };
  data.artifacts.push(artifact);
  data.artifact_extractions.push(extraction);
  data.artifact_reviews.push({
    id: randomUUID(),
    artifact_id: artifact.id,
    reviewer_id: SYSTEM_USER,
    review_status: "draft",
    edited_markdown: extraction.markdown_output,
    edited_json: extraction.json_output,
    notes: "",
    approved_at: null,
    version: 1,
    created_at: now
  });
  data.audit_events.push(audit(input.project_id, "artifact_extracted", "artifact", artifact.id));
  await writeStore(data);
  return artifact;
}

export async function replaceArtifactExtraction(input: {
  artifact_id: string;
  artifact_type: Artifact["artifact_type"];
  confidence: number;
  category: Artifact["category"];
  subtype: Artifact["subtype"];
  classification_confidence: number;
  classification_reasons: string[];
  ocr_backend: string;
  ocr_confidence: number;
  interpretation_backend: string;
  interpretation_confidence: number;
  raw_ocr_text: string;
  layout_data: Array<Record<string, unknown>>;
  layout_summary: string;
  ui_elements_json: Array<Record<string, unknown>>;
  markdown_output: string;
  json_output: Record<string, unknown>;
  notes?: string;
}): Promise<Artifact> {
  const data = await readStore();
  const artifact = data.artifacts.find((item) => item.id === input.artifact_id);
  if (!artifact) {
    throw new Error("Artifact not found.");
  }
  const now = new Date().toISOString();
  artifact.artifact_type = input.artifact_type;
  artifact.confidence = input.confidence;
  artifact.category = input.category;
  artifact.subtype = input.subtype;
  artifact.classification_confidence = input.classification_confidence;
  artifact.classification_reasons = input.classification_reasons;
  artifact.ocr_backend = input.ocr_backend;
  artifact.ocr_confidence = input.ocr_confidence;
  artifact.interpretation_backend = input.interpretation_backend;
  artifact.interpretation_confidence = input.interpretation_confidence;
  artifact.processing_status = "completed";
  artifact.updated_at = now;

  const extraction: ArtifactExtraction = {
    id: randomUUID(),
    artifact_id: artifact.id,
    raw_ocr_text: input.raw_ocr_text,
    layout_data: input.layout_data,
    layout_summary: input.layout_summary,
    ui_elements_json: input.ui_elements_json,
    markdown_output: input.markdown_output,
    json_output: { ...input.json_output, artifact_id: artifact.id },
    created_at: now
  };
  const currentVersion = data.artifact_reviews
    .filter((item) => item.artifact_id === artifact.id)
    .reduce((max, item) => Math.max(max, item.version), 0);
  data.artifact_extractions.push(extraction);
  data.artifact_reviews.push({
    id: randomUUID(),
    artifact_id: artifact.id,
    reviewer_id: SYSTEM_USER,
    review_status: "draft",
    edited_markdown: extraction.markdown_output,
    edited_json: extraction.json_output,
    notes: input.notes ?? "",
    approved_at: null,
    version: currentVersion + 1,
    created_at: now
  });
  data.audit_events.push(audit(artifact.project_id, "artifact_reviewed", "artifact", artifact.id));
  await writeStore(data);
  return artifact;
}

export async function getArtifactDetail(artifactId: string) {
  const data = await readStore();
  const artifact = data.artifacts.find((item) => item.id === artifactId);
  if (!artifact) {
    return null;
  }
  return {
    artifact: normalizeArtifact(artifact),
    source_document: data.source_documents.find((item) => item.id === artifact.source_document_id) ?? null,
    extraction: latestExtraction(data, artifact.id),
    reviews: data.artifact_reviews
      .filter((item) => item.artifact_id === artifact.id)
      .sort((a, b) => b.version - a.version),
    project: data.projects.find((item) => item.id === artifact.project_id) ?? null
  };
}

function normalizeArtifact(artifact: Artifact): Artifact {
  return {
    ...artifact,
    ocr_backend: artifact.ocr_backend ?? "unrecorded",
    ocr_confidence: artifact.ocr_confidence ?? 0,
    category: artifact.category ?? "unknown_manual_review",
    subtype: artifact.subtype ?? "unknown_manual_review",
    classification_confidence: artifact.classification_confidence ?? artifact.confidence ?? 0,
    classification_reasons: artifact.classification_reasons ?? [],
    interpretation_backend: artifact.interpretation_backend ?? "local_template",
    interpretation_confidence: artifact.interpretation_confidence ?? artifact.confidence ?? 0
  };
}

export async function saveArtifactReview(input: {
  artifact_id: string;
  review_status: ArtifactReview["review_status"];
  edited_markdown: string;
  edited_json: Record<string, unknown>;
  notes: string;
  artifact_type: Artifact["artifact_type"];
  confidence: number;
  category: Artifact["category"];
  subtype: Artifact["subtype"];
  classification_confidence: number;
  classification_reasons: string[];
}): Promise<ArtifactReview> {
  const data = await readStore();
  const artifact = data.artifacts.find((item) => item.id === input.artifact_id);
  if (!artifact) {
    throw new Error("Artifact not found.");
  }
  artifact.artifact_type = input.artifact_type;
  artifact.confidence = input.confidence;
  artifact.category = input.category;
  artifact.subtype = input.subtype;
  artifact.classification_confidence = input.classification_confidence;
  artifact.classification_reasons = input.classification_reasons;
  artifact.updated_at = new Date().toISOString();
  const currentVersion = data.artifact_reviews
    .filter((item) => item.artifact_id === input.artifact_id)
    .reduce((max, item) => Math.max(max, item.version), 0);
  const now = new Date().toISOString();
  const review: ArtifactReview = {
    id: randomUUID(),
    artifact_id: input.artifact_id,
    reviewer_id: SYSTEM_USER,
    review_status: input.review_status,
    edited_markdown: input.edited_markdown,
    edited_json: input.edited_json,
    notes: input.notes,
    approved_at: input.review_status === "approved" ? now : null,
    version: currentVersion + 1,
    created_at: now
  };
  data.artifact_reviews.push(review);
  data.audit_events.push(
    audit(
      artifact.project_id,
      input.review_status === "approved" ? "artifact_approved" : input.review_status === "rejected" ? "artifact_rejected" : "artifact_reviewed",
      "artifact",
      artifact.id
    )
  );
  await writeStore(data);
  return review;
}

export async function createOutputPackage(input: {
  project_id: string;
  package_type: PackageType;
  source_selection: string[];
  output_markdown: string;
  output_json: Record<string, unknown>;
  storage_path?: string | null;
}): Promise<OutputPackage> {
  const data = await readStore();
  const outputPackage: OutputPackage = {
    id: randomUUID(),
    project_id: input.project_id,
    package_type: input.package_type,
    source_selection: input.source_selection,
    output_markdown: input.output_markdown,
    output_json: input.output_json,
    storage_path: input.storage_path ?? null,
    created_at: new Date().toISOString()
  };
  data.output_packages.push(outputPackage);
  data.audit_events.push(audit(input.project_id, "output_generated", "output_package", outputPackage.id));
  await writeStore(data);
  return outputPackage;
}

export async function updateOutputPackage(input: {
  id: string;
  output_markdown: string;
  output_json: Record<string, unknown>;
  storage_path?: string | null;
}): Promise<OutputPackage> {
  const data = await readStore();
  const outputPackage = data.output_packages.find((item) => item.id === input.id);
  if (!outputPackage) {
    throw new Error("Output package not found.");
  }
  outputPackage.output_markdown = input.output_markdown;
  outputPackage.output_json = input.output_json;
  outputPackage.storage_path = input.storage_path ?? outputPackage.storage_path;
  data.audit_events.push(audit(outputPackage.project_id, "output_generated", "output_package", outputPackage.id));
  await writeStore(data);
  return outputPackage;
}

export async function getOutputPackage(packageId: string): Promise<OutputPackage | null> {
  const data = await readStore();
  return data.output_packages.find((item) => item.id === packageId) ?? null;
}

export async function deleteOutputPackage(packageId: string): Promise<OutputPackage | null> {
  const data = await readStore();
  const index = data.output_packages.findIndex((item) => item.id === packageId);
  if (index < 0) {
    return null;
  }
  const [outputPackage] = data.output_packages.splice(index, 1);
  data.audit_events.push(audit(outputPackage.project_id, "output_deleted", "output_package", outputPackage.id));
  await writeStore(data);
  return outputPackage;
}

export async function approvedArtifactsForProject(projectId: string) {
  const bundle = await getProjectBundle(projectId);
  if (!bundle) {
    return [];
  }
  return bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status === "approved");
}

function latestExtraction(data: StoreData, artifactId: string): ArtifactExtraction | undefined {
  return data.artifact_extractions
    .filter((item) => item.artifact_id === artifactId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function latestReview(data: StoreData, artifactId: string): ArtifactReview | undefined {
  return data.artifact_reviews
    .filter((item) => item.artifact_id === artifactId)
    .sort((a, b) => b.version - a.version)[0];
}

function audit(projectId: string, eventType: string, subjectType: string, subjectId: string) {
  return {
    id: randomUUID(),
    project_id: projectId,
    actor_id: SYSTEM_USER,
    event_type: eventType,
    subject_type: subjectType,
    subject_id: subjectId,
    metadata: {},
    created_at: new Date().toISOString()
  };
}
