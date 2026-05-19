import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { artifactsDir, dataDir, exportsDir, storePath, uploadsDir } from "@/lib/paths";
import type {
  Artifact,
  ArtifactExtraction,
  ArtifactReview,
  OutputPackage,
  PackageType,
  ProcessingJob,
  Project,
  ProjectBundle,
  ProjectSummary,
  SourceDocument,
  StoreData
} from "@/types/domain";

const SYSTEM_USER = "local-user";
const PROJECT_BACKUP_SCHEMA = "images-to-md-briefing-tool-project-backup";
const PROJECT_BACKUP_VERSION = 1;

type BackupFilePayload = {
  filename: string;
  content_base64: string | null;
  missing: boolean;
};

type BackupRecord<T> = {
  record: T;
  file: BackupFilePayload | null;
};

export type PortableProjectBundle = {
  schema: typeof PROJECT_BACKUP_SCHEMA;
  version: typeof PROJECT_BACKUP_VERSION;
  exported_at: string;
  project: Project;
  source_documents: Array<BackupRecord<SourceDocument>>;
  processing_jobs: ProcessingJob[];
  artifacts: Array<BackupRecord<Artifact>>;
  artifact_extractions: ArtifactExtraction[];
  artifact_reviews: ArtifactReview[];
  output_packages: Array<BackupRecord<OutputPackage>>;
};

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

export async function listProjects(ownerId?: string): Promise<Project[]> {
  const data = await readStore();
  return filterProjects(data.projects, ownerId).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function listProjectSummaries(ownerId?: string): Promise<ProjectSummary[]> {
  const data = await readStore();
  return filterProjects(data.projects, ownerId)
    .map((project) => {
      const projectArtifacts = data.artifacts.filter((artifact) => artifact.project_id === project.id);
      const projectArtifactIds = new Set(projectArtifacts.map((artifact) => artifact.id));
      const latestReviews = projectArtifacts.map((artifact) => latestReview(data, artifact.id));
      return {
        ...project,
        source_count: data.source_documents.filter((source) => source.project_id === project.id).length,
        artifact_count: projectArtifacts.length,
        approved_count: latestReviews.filter((review) => review?.review_status === "approved").length,
        output_package_count: data.output_packages.filter((outputPackage) => outputPackage.project_id === project.id).length,
        updated_at: mostRecentDate([
          project.updated_at,
          ...projectArtifacts.map((artifact) => artifact.updated_at),
          ...data.artifact_reviews.filter((review) => projectArtifactIds.has(review.artifact_id)).map((review) => review.created_at),
          ...data.output_packages.filter((outputPackage) => outputPackage.project_id === project.id).map((outputPackage) => outputPackage.created_at)
        ])
      };
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createProject(input: { name: string; client_context?: string; created_by?: string }): Promise<Project> {
  const data = await readStore();
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: input.name,
    client_context: input.client_context ?? "",
    status: "active",
    created_by: input.created_by ?? SYSTEM_USER,
    created_at: now,
    updated_at: now
  };
  data.projects.push(project);
  data.audit_events.push(audit(project.id, "project_created", "project", project.id));
  await writeStore(data);
  return project;
}

export async function updateProject(input: {
  id: string;
  name?: string;
  client_context?: string;
  status?: Project["status"];
  ownerId?: string;
}): Promise<Project | null> {
  const data = await readStore();
  const project = data.projects.find((item) => item.id === input.id);
  if (!project || !canAccessProject(project, input.ownerId)) {
    return null;
  }
  const now = new Date().toISOString();
  if (typeof input.name === "string") {
    project.name = input.name;
  }
  if (typeof input.client_context === "string") {
    project.client_context = input.client_context;
  }
  if (input.status) {
    project.status = input.status;
  }
  project.updated_at = now;
  data.audit_events.push(
    audit(
      project.id,
      input.status === "archived" ? "project_archived" : input.status === "active" ? "project_restored" : "project_updated",
      "project",
      project.id,
      { status: project.status }
    )
  );
  await writeStore(data);
  return project;
}

export async function deleteProject(projectId: string, ownerId?: string): Promise<{
  project: Project;
  deleted_files: number;
  deleted_records: Record<string, number>;
} | null> {
  const data = await readStore();
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || !canAccessProject(project, ownerId)) {
    return null;
  }

  const sourceDocuments = data.source_documents.filter((item) => item.project_id === projectId);
  const processingJobs = data.processing_jobs.filter((item) => item.project_id === projectId);
  const artifacts = data.artifacts.filter((item) => item.project_id === projectId);
  const artifactIds = new Set(artifacts.map((item) => item.id));
  const artifactExtractions = data.artifact_extractions.filter((item) => artifactIds.has(item.artifact_id));
  const artifactReviews = data.artifact_reviews.filter((item) => artifactIds.has(item.artifact_id));
  const outputPackages = data.output_packages.filter((item) => item.project_id === projectId);
  const filePaths = [
    ...sourceDocuments.map((item) => item.storage_path),
    ...artifacts.map((item) => item.image_path),
    ...outputPackages.map((item) => item.storage_path).filter((value): value is string => Boolean(value))
  ];
  const deletedRecords = {
    projects: 1,
    source_documents: sourceDocuments.length,
    processing_jobs: processingJobs.length,
    artifacts: artifacts.length,
    artifact_extractions: artifactExtractions.length,
    artifact_reviews: artifactReviews.length,
    output_packages: outputPackages.length
  };

  data.audit_events.push(
    audit(project.id, "project_deleted", "project", project.id, {
      project_name: project.name,
      deleted_records: deletedRecords
    })
  );
  data.projects = data.projects.filter((item) => item.id !== projectId);
  data.source_documents = data.source_documents.filter((item) => item.project_id !== projectId);
  data.processing_jobs = data.processing_jobs.filter((item) => item.project_id !== projectId);
  data.artifacts = data.artifacts.filter((item) => item.project_id !== projectId);
  data.artifact_extractions = data.artifact_extractions.filter((item) => !artifactIds.has(item.artifact_id));
  data.artifact_reviews = data.artifact_reviews.filter((item) => !artifactIds.has(item.artifact_id));
  data.output_packages = data.output_packages.filter((item) => item.project_id !== projectId);
  await writeStore(data);

  let deletedFiles = 0;
  for (const filePath of filePaths) {
    if (await unlinkManagedFile(filePath)) {
      deletedFiles += 1;
    }
  }

  return {
    project,
    deleted_files: deletedFiles,
    deleted_records: deletedRecords
  };
}

export async function getProjectBundle(projectId: string, ownerId?: string): Promise<ProjectBundle | null> {
  const data = await readStore();
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || !canAccessProject(project, ownerId)) {
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

export async function createProjectBackupBundle(projectId: string, ownerId?: string): Promise<PortableProjectBundle | null> {
  const data = await readStore();
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || !canAccessProject(project, ownerId)) {
    return null;
  }

  const sourceDocuments = data.source_documents.filter((item) => item.project_id === projectId);
  const artifacts = data.artifacts.filter((item) => item.project_id === projectId);
  const artifactIds = new Set(artifacts.map((item) => item.id));
  const outputPackages = data.output_packages.filter((item) => item.project_id === projectId);

  return {
    schema: PROJECT_BACKUP_SCHEMA,
    version: PROJECT_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    project,
    source_documents: await Promise.all(
      sourceDocuments.map(async (record) => ({
        record,
        file: await readBackupFile(record.storage_path, record.filename)
      }))
    ),
    processing_jobs: data.processing_jobs.filter((item) => item.project_id === projectId),
    artifacts: await Promise.all(
      artifacts.map(async (record) => ({
        record,
        file: await readBackupFile(record.image_path, path.basename(record.image_path))
      }))
    ),
    artifact_extractions: data.artifact_extractions.filter((item) => artifactIds.has(item.artifact_id)),
    artifact_reviews: data.artifact_reviews.filter((item) => artifactIds.has(item.artifact_id)),
    output_packages: await Promise.all(
      outputPackages.map(async (record) => ({
        record,
        file: record.storage_path ? await readBackupFile(record.storage_path, path.basename(record.storage_path)) : null
      }))
    )
  };
}

export async function importProjectBackupBundle(bundle: unknown, ownerId?: string): Promise<{
  project: Project;
  imported_counts: Record<string, number>;
}> {
  const parsed = parseProjectBackupBundle(bundle);
  const data = await readStore();
  const now = new Date().toISOString();
  const projectIdMap = new Map([[parsed.project.id, randomUUID()]]);
  const sourceIdMap = new Map(parsed.source_documents.map((item) => [item.record.id, randomUUID()]));
  const jobIdMap = new Map(parsed.processing_jobs.map((item) => [item.id, randomUUID()]));
  const artifactIdMap = new Map(parsed.artifacts.map((item) => [item.record.id, randomUUID()]));
  const extractionIdMap = new Map(parsed.artifact_extractions.map((item) => [item.id, randomUUID()]));
  const reviewIdMap = new Map(parsed.artifact_reviews.map((item) => [item.id, randomUUID()]));
  const outputIdMap = new Map(parsed.output_packages.map((item) => [item.record.id, randomUUID()]));
  const idMap = new Map<string, string>([
    ...projectIdMap,
    ...sourceIdMap,
    ...jobIdMap,
    ...artifactIdMap,
    ...extractionIdMap,
    ...reviewIdMap,
    ...outputIdMap
  ]);
  const newProjectId = projectIdMap.get(parsed.project.id) ?? randomUUID();
  const project: Project = {
    ...parsed.project,
    id: newProjectId,
    name: importedProjectName(parsed.project.name, data.projects.map((item) => item.name)),
    created_by: ownerId ?? SYSTEM_USER,
    updated_at: now
  };

  const sourceDocuments = await Promise.all(
    parsed.source_documents.map(async (item) => {
      const id = sourceIdMap.get(item.record.id) ?? randomUUID();
      const storagePath =
        (await restoreBackupFile(item.file, uploadsDir(), `${id}-${safeFileName(item.record.filename)}`)) ??
        (await writeMissingBackupMarker(uploadsDir(), `${id}-missing-${safeFileName(item.record.filename)}`));
      return {
        ...item.record,
        id,
        project_id: newProjectId,
        storage_path: storagePath
      };
    })
  );
  const processingJobs = parsed.processing_jobs.map((item) => ({
    ...item,
    id: jobIdMap.get(item.id) ?? randomUUID(),
    project_id: newProjectId,
    source_document_id: item.source_document_id ? sourceIdMap.get(item.source_document_id) ?? null : null
  }));
  const artifacts = await Promise.all(
    parsed.artifacts.map(async (item) => {
      const id = artifactIdMap.get(item.record.id) ?? randomUUID();
      const imagePath =
        (await restoreBackupFile(item.file, artifactsDir(), `${id}-${safeFileName(path.basename(item.record.image_path))}`)) ??
        (await writeMissingBackupMarker(artifactsDir(), `${id}-missing-${safeFileName(path.basename(item.record.image_path))}`));
      return {
        ...item.record,
        id,
        project_id: newProjectId,
        source_document_id: item.record.source_document_id ? sourceIdMap.get(item.record.source_document_id) ?? null : null,
        image_path: imagePath
      };
    })
  );
  const artifactExtractions = parsed.artifact_extractions.map((item) => ({
    ...item,
    id: extractionIdMap.get(item.id) ?? randomUUID(),
    artifact_id: artifactIdMap.get(item.artifact_id) ?? item.artifact_id,
    json_output: remapKnownIds(item.json_output, idMap) as Record<string, unknown>
  }));
  const artifactReviews = parsed.artifact_reviews.map((item) => ({
    ...item,
    id: reviewIdMap.get(item.id) ?? randomUUID(),
    artifact_id: artifactIdMap.get(item.artifact_id) ?? item.artifact_id,
    edited_json: remapKnownIds(item.edited_json, idMap) as Record<string, unknown>
  }));
  const outputPackages = await Promise.all(
    parsed.output_packages.map(async (item) => {
      const id = outputIdMap.get(item.record.id) ?? randomUUID();
      const storagePath = item.record.storage_path
        ? await restoreBackupFile(item.file, exportsDir(), `${id}-${safeFileName(path.basename(item.record.storage_path))}`)
        : null;
      return {
        ...item.record,
        id,
        project_id: newProjectId,
        source_selection: item.record.source_selection.map((sourceId) => idMap.get(sourceId) ?? sourceId),
        output_json: remapKnownIds(item.record.output_json, idMap) as Record<string, unknown>,
        storage_path: storagePath,
        created_at: item.record.created_at
      };
    })
  );

  data.projects.push(project);
  data.source_documents.push(...sourceDocuments);
  data.processing_jobs.push(...processingJobs);
  data.artifacts.push(...artifacts);
  data.artifact_extractions.push(...artifactExtractions);
  data.artifact_reviews.push(...artifactReviews);
  data.output_packages.push(...outputPackages);
  data.audit_events.push(
    audit(project.id, "project_imported", "project", project.id, {
      original_project_id: parsed.project.id,
      original_project_name: parsed.project.name,
      backup_exported_at: parsed.exported_at
    })
  );
  await writeStore(data);

  return {
    project,
    imported_counts: {
      source_documents: sourceDocuments.length,
      processing_jobs: processingJobs.length,
      artifacts: artifacts.length,
      artifact_extractions: artifactExtractions.length,
      artifact_reviews: artifactReviews.length,
      output_packages: outputPackages.length
    }
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

export async function getArtifactDetail(artifactId: string, ownerId?: string) {
  const data = await readStore();
  const artifact = data.artifacts.find((item) => item.id === artifactId);
  if (!artifact) {
    return null;
  }
  const project = data.projects.find((item) => item.id === artifact.project_id) ?? null;
  if (!project || !canAccessProject(project, ownerId)) {
    return null;
  }
  return {
    artifact: normalizeArtifact(artifact),
    source_document: data.source_documents.find((item) => item.id === artifact.source_document_id) ?? null,
    extraction: latestExtraction(data, artifact.id),
    reviews: data.artifact_reviews
      .filter((item) => item.artifact_id === artifact.id)
      .sort((a, b) => b.version - a.version),
    project
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
  ownerId?: string;
}): Promise<ArtifactReview> {
  const data = await readStore();
  const artifact = data.artifacts.find((item) => item.id === input.artifact_id);
  if (!artifact) {
    throw new Error("Artifact not found.");
  }
  const project = data.projects.find((item) => item.id === artifact.project_id);
  if (!project || !canAccessProject(project, input.ownerId)) {
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

export async function getOutputPackage(packageId: string, ownerId?: string): Promise<OutputPackage | null> {
  const data = await readStore();
  const outputPackage = data.output_packages.find((item) => item.id === packageId) ?? null;
  if (!outputPackage) {
    return null;
  }
  const project = data.projects.find((item) => item.id === outputPackage.project_id);
  if (!project || !canAccessProject(project, ownerId)) {
    return null;
  }
  return outputPackage;
}

export async function deleteOutputPackage(packageId: string, ownerId?: string): Promise<OutputPackage | null> {
  const data = await readStore();
  const index = data.output_packages.findIndex((item) => item.id === packageId);
  if (index < 0) {
    return null;
  }
  const project = data.projects.find((item) => item.id === data.output_packages[index].project_id);
  if (!project || !canAccessProject(project, ownerId)) {
    return null;
  }
  const [outputPackage] = data.output_packages.splice(index, 1);
  data.audit_events.push(audit(outputPackage.project_id, "output_deleted", "output_package", outputPackage.id));
  await writeStore(data);
  return outputPackage;
}

export async function approvedArtifactsForProject(projectId: string, ownerId?: string) {
  const bundle = await getProjectBundle(projectId, ownerId);
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

function mostRecentDate(values: string[]) {
  return values.filter(Boolean).sort((a, b) => b.localeCompare(a))[0] ?? new Date().toISOString();
}

function filterProjects(projects: Project[], ownerId?: string) {
  return ownerId ? projects.filter((project) => project.created_by === ownerId) : projects;
}

function canAccessProject(project: Project, ownerId?: string) {
  return !ownerId || project.created_by === ownerId;
}

async function unlinkManagedFile(filePath: string) {
  const resolvedPath = path.resolve(filePath);
  const resolvedDataDir = path.resolve(dataDir());
  if (!resolvedPath.startsWith(`${resolvedDataDir}${path.sep}`)) {
    return false;
  }
  try {
    await fs.unlink(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

async function readBackupFile(filePath: string, fallbackFilename: string): Promise<BackupFilePayload> {
  const filename = safeFileName(path.basename(filePath) || fallbackFilename);
  try {
    const content = await fs.readFile(filePath);
    return {
      filename,
      content_base64: content.toString("base64"),
      missing: false
    };
  } catch {
    return {
      filename,
      content_base64: null,
      missing: true
    };
  }
}

async function restoreBackupFile(file: BackupFilePayload | null, directory: string, fallbackFilename: string): Promise<string | null> {
  if (!file || file.missing || !file.content_base64) {
    return null;
  }
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, safeFileName(fallbackFilename || file.filename));
  await fs.writeFile(filePath, Buffer.from(file.content_base64, "base64"));
  return filePath;
}

async function writeMissingBackupMarker(directory: string, filename: string): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${safeFileName(filename)}.missing.txt`);
  await fs.writeFile(filePath, "This placeholder was created because the project backup did not contain the original file.\n");
  return filePath;
}

function parseProjectBackupBundle(value: unknown): PortableProjectBundle {
  if (!isObject(value)) {
    throw new Error("Backup must be a JSON object.");
  }
  if (value.schema !== PROJECT_BACKUP_SCHEMA || value.version !== PROJECT_BACKUP_VERSION) {
    throw new Error("Unsupported project backup format.");
  }
  if (!isObject(value.project) || typeof value.project.id !== "string" || typeof value.project.name !== "string") {
    throw new Error("Backup is missing project metadata.");
  }
  assertArray(value.source_documents, "source_documents");
  assertArray(value.processing_jobs, "processing_jobs");
  assertArray(value.artifacts, "artifacts");
  assertArray(value.artifact_extractions, "artifact_extractions");
  assertArray(value.artifact_reviews, "artifact_reviews");
  assertArray(value.output_packages, "output_packages");
  return value as PortableProjectBundle;
}

function importedProjectName(originalName: string, existingNames: string[]) {
  const names = new Set(existingNames);
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
  const base = `${originalName} (Imported ${timestamp})`;
  let candidate = base;
  let counter = 2;
  while (names.has(candidate)) {
    candidate = `${base} ${counter}`;
    counter += 1;
  }
  return candidate;
}

function remapKnownIds(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === "string") {
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapKnownIds(item, idMap));
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapKnownIds(item, idMap)]));
  }
  return value;
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Backup is missing ${name}.`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeFileName(value: string) {
  return (value || "file").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function audit(projectId: string, eventType: string, subjectType: string, subjectId: string, metadata: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    project_id: projectId,
    actor_id: SYSTEM_USER,
    event_type: eventType,
    subject_type: subjectType,
    subject_id: subjectId,
    metadata,
    created_at: new Date().toISOString()
  };
}
