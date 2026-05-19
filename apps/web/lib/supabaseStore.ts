import { randomUUID } from "node:crypto";
import {
  deleteManagedFile,
  managedFileName,
  readManagedFile,
  saveManagedFile
} from "@/lib/fileStorage";
import { getSupabaseServiceClient } from "@/lib/supabase";
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
  SourceDocument
} from "@/types/domain";
import type { PortableProjectBundle } from "@/lib/localStore";

type BackupFilePayload = {
  filename: string;
  content_base64: string | null;
  missing: boolean;
};

const PROJECT_BACKUP_SCHEMA = "images-to-md-briefing-tool-project-backup";
const PROJECT_BACKUP_VERSION = 1;

export async function listProjects(ownerId?: string): Promise<Project[]> {
  const owner = requireOwner(ownerId);
  const { data, error } = await supabase()
    .from("projects")
    .select("*")
    .eq("created_by", owner)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map(mapProject);
}

export async function listProjectSummaries(ownerId?: string): Promise<ProjectSummary[]> {
  const projects = await listProjects(ownerId);
  if (projects.length === 0) {
    return [];
  }
  const projectIds = projects.map((project) => project.id);
  const [{ data: artifacts, error: artifactsError }, { data: reviews, error: reviewsError }, { data: outputs, error: outputsError }, { data: sources, error: sourcesError }] =
    await Promise.all([
      supabase().from("artifacts").select("*").in("project_id", projectIds),
      supabase().from("artifact_reviews").select("*"),
      supabase().from("output_packages").select("*").in("project_id", projectIds),
      supabase().from("source_documents").select("*").in("project_id", projectIds)
    ]);
  throwIfError(artifactsError);
  throwIfError(reviewsError);
  throwIfError(outputsError);
  throwIfError(sourcesError);

  const artifactRows = (artifacts ?? []).map(mapArtifact);
  const reviewRows = (reviews ?? []).map(mapReview);
  const outputRows = (outputs ?? []).map(mapOutputPackage);
  const sourceRows = (sources ?? []).map(mapSourceDocument);
  return projects
    .map((project) => {
      const projectArtifacts = artifactRows.filter((artifact) => artifact.project_id === project.id);
      const artifactIds = new Set(projectArtifacts.map((artifact) => artifact.id));
      const latestReviews = projectArtifacts.map((artifact) => latestReview(reviewRows, artifact.id));
      return {
        ...project,
        source_count: sourceRows.filter((source) => source.project_id === project.id).length,
        artifact_count: projectArtifacts.length,
        approved_count: latestReviews.filter((review) => review?.review_status === "approved").length,
        output_package_count: outputRows.filter((output) => output.project_id === project.id).length,
        updated_at: mostRecentDate([
          project.updated_at,
          ...projectArtifacts.map((artifact) => artifact.updated_at),
          ...reviewRows.filter((review) => artifactIds.has(review.artifact_id)).map((review) => review.created_at),
          ...outputRows.filter((output) => output.project_id === project.id).map((output) => output.created_at)
        ])
      };
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createProject(input: { name: string; client_context?: string; created_by?: string }): Promise<Project> {
  const owner = requireOwner(input.created_by);
  await ensureProfile(owner);
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("projects")
    .insert({
      name: input.name,
      client_context: input.client_context ?? "",
      status: "active",
      created_by: owner,
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single();
  throwIfError(error);
  const project = mapProject(data);
  await audit(project.id, owner, "project_created", "project", project.id);
  return project;
}

export async function updateProject(input: {
  id: string;
  name?: string;
  client_context?: string;
  status?: Project["status"];
  ownerId?: string;
}): Promise<Project | null> {
  const owner = requireOwner(input.ownerId);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === "string") {
    patch.name = input.name;
  }
  if (typeof input.client_context === "string") {
    patch.client_context = input.client_context;
  }
  if (input.status) {
    patch.status = input.status;
  }
  const { data, error } = await supabase()
    .from("projects")
    .update(patch)
    .eq("id", input.id)
    .eq("created_by", owner)
    .select("*")
    .maybeSingle();
  throwIfError(error);
  if (!data) {
    return null;
  }
  const project = mapProject(data);
  await audit(
    project.id,
    owner,
    input.status === "archived" ? "project_archived" : input.status === "active" ? "project_restored" : "project_updated",
    "project",
    project.id,
    { status: project.status }
  );
  return project;
}

export async function deleteProject(projectId: string, ownerId?: string) {
  const owner = requireOwner(ownerId);
  const bundle = await getProjectBundle(projectId, owner);
  if (!bundle) {
    return null;
  }
  const allExtractions = await artifactExtractions(bundle.artifacts.map((artifact) => artifact.id));
  const allReviews = await artifactReviews(bundle.artifacts.map((artifact) => artifact.id));
  const filePaths = [
    ...bundle.source_documents.map((item) => item.storage_path),
    ...bundle.artifacts.map((item) => item.image_path),
    ...bundle.output_packages.map((item) => item.storage_path).filter((value): value is string => Boolean(value))
  ];
  const deletedRecords = {
    projects: 1,
    source_documents: bundle.source_documents.length,
    processing_jobs: bundle.processing_jobs.length,
    artifacts: bundle.artifacts.length,
    artifact_extractions: allExtractions.length,
    artifact_reviews: allReviews.length,
    output_packages: bundle.output_packages.length
  };

  await audit(projectId, owner, "project_deleted", "project", projectId, {
    project_name: bundle.project.name,
    deleted_records: deletedRecords
  });
  const { error } = await supabase().from("projects").delete().eq("id", projectId).eq("created_by", owner);
  throwIfError(error);

  let deletedFiles = 0;
  for (const filePath of filePaths) {
    if (await deleteManagedFile(filePath)) {
      deletedFiles += 1;
    }
  }

  return {
    project: bundle.project,
    deleted_files: deletedFiles,
    deleted_records: deletedRecords
  };
}

export async function getProjectBundle(projectId: string, ownerId?: string): Promise<ProjectBundle | null> {
  const owner = requireOwner(ownerId);
  const { data: projectRow, error: projectError } = await supabase()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("created_by", owner)
    .maybeSingle();
  throwIfError(projectError);
  if (!projectRow) {
    return null;
  }

  const [{ data: sources, error: sourceError }, { data: jobs, error: jobError }, { data: artifacts, error: artifactError }, { data: outputs, error: outputError }] =
    await Promise.all([
      supabase().from("source_documents").select("*").eq("project_id", projectId),
      supabase().from("processing_jobs").select("*").eq("project_id", projectId),
      supabase().from("artifacts").select("*").eq("project_id", projectId),
      supabase().from("output_packages").select("*").eq("project_id", projectId)
    ]);
  throwIfError(sourceError);
  throwIfError(jobError);
  throwIfError(artifactError);
  throwIfError(outputError);
  const artifactRows = (artifacts ?? []).map(mapArtifact);
  const artifactIds = artifactRows.map((artifact) => artifact.id);
  const [extractions, reviews] = await Promise.all([artifactExtractions(artifactIds), artifactReviews(artifactIds)]);

  return {
    project: mapProject(projectRow),
    source_documents: (sources ?? []).map(mapSourceDocument),
    processing_jobs: (jobs ?? []).map(mapProcessingJob),
    artifacts: artifactRows.map((artifact) => ({
      ...artifact,
      extraction: latestExtraction(extractions, artifact.id),
      latest_review: latestReview(reviews, artifact.id)
    })),
    output_packages: (outputs ?? []).map(mapOutputPackage)
  };
}

export async function createProjectBackupBundle(projectId: string, ownerId?: string): Promise<PortableProjectBundle | null> {
  const bundle = await getProjectBundle(projectId, ownerId);
  if (!bundle) {
    return null;
  }
  const artifactIds = bundle.artifacts.map((artifact) => artifact.id);
  const [extractions, reviews] = await Promise.all([artifactExtractions(artifactIds), artifactReviews(artifactIds)]);
  return {
    schema: PROJECT_BACKUP_SCHEMA,
    version: PROJECT_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    project: bundle.project,
    source_documents: await Promise.all(
      bundle.source_documents.map(async (record) => ({
        record,
        file: await readBackupFile(record.storage_path, record.filename)
      }))
    ),
    processing_jobs: bundle.processing_jobs,
    artifacts: await Promise.all(
      bundle.artifacts.map(async (record) => ({
        record,
        file: await readBackupFile(record.image_path, managedFileName(record.image_path))
      }))
    ),
    artifact_extractions: extractions,
    artifact_reviews: reviews,
    output_packages: await Promise.all(
      bundle.output_packages.map(async (record) => ({
        record,
        file: record.storage_path ? await readBackupFile(record.storage_path, managedFileName(record.storage_path)) : null
      }))
    )
  };
}

export async function importProjectBackupBundle(bundle: unknown, ownerId?: string) {
  const owner = requireOwner(ownerId);
  const parsed = parseProjectBackupBundle(bundle);
  await ensureProfile(owner);
  const now = new Date().toISOString();
  const projectId = randomUUID();
  const sourceIdMap = new Map(parsed.source_documents.map((item) => [item.record.id, randomUUID()]));
  const artifactIdMap = new Map(parsed.artifacts.map((item) => [item.record.id, randomUUID()]));
  const idMap = new Map<string, string>([
    [parsed.project.id, projectId],
    ...sourceIdMap,
    ...parsed.processing_jobs.map((item) => [item.id, randomUUID()] as const),
    ...artifactIdMap,
    ...parsed.artifact_extractions.map((item) => [item.id, randomUUID()] as const),
    ...parsed.artifact_reviews.map((item) => [item.id, randomUUID()] as const),
    ...parsed.output_packages.map((item) => [item.record.id, randomUUID()] as const)
  ]);
  const existingNames = (await listProjects(owner)).map((project) => project.name);
  const project: Project = {
    ...parsed.project,
    id: projectId,
    name: importedProjectName(parsed.project.name, existingNames),
    created_by: owner,
    updated_at: now
  };

  const sourceDocuments = await Promise.all(
    parsed.source_documents.map(async (item) => {
      const id = idMap.get(item.record.id) ?? randomUUID();
      const storagePath = await restoreBackupFile("source", owner, projectId, item.file, `${id}-${item.record.filename}`);
      return {
        ...item.record,
        id,
        project_id: projectId,
        storage_path: storagePath
      };
    })
  );
  const artifacts = await Promise.all(
    parsed.artifacts.map(async (item) => {
      const id = idMap.get(item.record.id) ?? randomUUID();
      const imagePath = await restoreBackupFile("artifact", owner, projectId, item.file, `${id}-${managedFileName(item.record.image_path)}`);
      return {
        ...item.record,
        id,
        project_id: projectId,
        source_document_id: item.record.source_document_id ? sourceIdMap.get(item.record.source_document_id) ?? null : null,
        image_path: imagePath
      };
    })
  );
  const processingJobs = parsed.processing_jobs.map((item) => ({
    ...item,
    id: idMap.get(item.id) ?? randomUUID(),
    project_id: projectId,
    source_document_id: item.source_document_id ? sourceIdMap.get(item.source_document_id) ?? null : null
  }));
  const artifactExtractions = parsed.artifact_extractions.map((item) => ({
    ...item,
    id: idMap.get(item.id) ?? randomUUID(),
    artifact_id: artifactIdMap.get(item.artifact_id) ?? item.artifact_id,
    json_output: remapKnownIds(item.json_output, idMap) as Record<string, unknown>
  }));
  const artifactReviews = parsed.artifact_reviews.map((item) => ({
    ...item,
    id: idMap.get(item.id) ?? randomUUID(),
    artifact_id: artifactIdMap.get(item.artifact_id) ?? item.artifact_id,
    reviewer_id: owner,
    edited_json: remapKnownIds(item.edited_json, idMap) as Record<string, unknown>
  }));
  const outputPackages = await Promise.all(
    parsed.output_packages.map(async (item) => {
      const id = idMap.get(item.record.id) ?? randomUUID();
      const storagePath = item.record.storage_path
        ? await restoreBackupFile("export", owner, projectId, item.file, `${id}-${managedFileName(item.record.storage_path)}`)
        : null;
      return {
        ...item.record,
        id,
        project_id: projectId,
        source_selection: item.record.source_selection.map((value) => idMap.get(value) ?? value),
        output_json: remapKnownIds(item.record.output_json, idMap) as Record<string, unknown>,
        storage_path: storagePath
      };
    })
  );

  await insertProjectGraph(project, sourceDocuments, processingJobs, artifacts, artifactExtractions, artifactReviews, outputPackages, owner);
  await audit(project.id, owner, "project_imported", "project", project.id, {
    original_project_id: parsed.project.id,
    original_project_name: parsed.project.name,
    backup_exported_at: parsed.exported_at
  });

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
  const owner = await projectOwner(input.project_id);
  const { data, error } = await supabase()
    .from("source_documents")
    .insert({
      project_id: input.project_id,
      filename: input.filename,
      file_type: input.file_type,
      storage_path: input.storage_path,
      page_count: input.page_count ?? null,
      uploaded_by: owner
    })
    .select("*")
    .single();
  throwIfError(error);
  const source = mapSourceDocument(data);
  await audit(input.project_id, owner, "source_uploaded", "source_document", source.id);
  return source;
}

export async function updateSourceDocumentPageCount(id: string, pageCount: number | null) {
  const { error } = await supabase().from("source_documents").update({ page_count: pageCount }).eq("id", id);
  throwIfError(error);
}

export async function createProcessingJob(input: {
  project_id: string;
  source_document_id?: string | null;
  stage: string;
  status: ProcessingJob["status"];
}): Promise<ProcessingJob> {
  const { data, error } = await supabase()
    .from("processing_jobs")
    .insert({
      project_id: input.project_id,
      source_document_id: input.source_document_id ?? null,
      stage: input.stage,
      status: input.status
    })
    .select("*")
    .single();
  throwIfError(error);
  return mapProcessingJob(data);
}

export async function updateProcessingJob(jobId: string, patch: Partial<Pick<ProcessingJob, "stage" | "status" | "error_log">>) {
  const { error } = await supabase()
    .from("processing_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  throwIfError(error);
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
}): Promise<Artifact> {
  const owner = await projectOwner(input.project_id);
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("artifacts")
    .insert({
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
    })
    .select("*")
    .single();
  throwIfError(error);
  const artifact = mapArtifact(data);
  const extraction: Omit<ArtifactExtraction, "id"> = {
    artifact_id: artifact.id,
    raw_ocr_text: input.raw_ocr_text,
    layout_data: input.layout_data,
    layout_summary: input.layout_summary,
    ui_elements_json: input.ui_elements_json,
    markdown_output: input.markdown_output,
    json_output: { ...input.json_output, artifact_id: artifact.id },
    created_at: now
  };
  await insertRows("artifact_extractions", [extraction]);
  await insertRows("artifact_reviews", [
    {
      artifact_id: artifact.id,
      reviewer_id: owner,
      review_status: "draft",
      edited_markdown: input.markdown_output,
      edited_json: extraction.json_output,
      notes: "",
      approved_at: null,
      version: 1,
      created_at: now
    }
  ]);
  await audit(input.project_id, owner, "artifact_extracted", "artifact", artifact.id);
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
  const current = await artifactById(input.artifact_id);
  const owner = await projectOwner(current.project_id);
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("artifacts")
    .update({
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
      updated_at: now
    })
    .eq("id", input.artifact_id)
    .select("*")
    .single();
  throwIfError(error);
  const artifact = mapArtifact(data);
  const extractionJson = { ...input.json_output, artifact_id: artifact.id };
  await insertRows("artifact_extractions", [
    {
      artifact_id: artifact.id,
      raw_ocr_text: input.raw_ocr_text,
      layout_data: input.layout_data,
      layout_summary: input.layout_summary,
      ui_elements_json: input.ui_elements_json,
      markdown_output: input.markdown_output,
      json_output: extractionJson,
      created_at: now
    }
  ]);
  await insertRows("artifact_reviews", [
    {
      artifact_id: artifact.id,
      reviewer_id: owner,
      review_status: "draft",
      edited_markdown: input.markdown_output,
      edited_json: extractionJson,
      notes: input.notes ?? "",
      approved_at: null,
      version: (await maxReviewVersion(artifact.id)) + 1,
      created_at: now
    }
  ]);
  await audit(artifact.project_id, owner, "artifact_reviewed", "artifact", artifact.id);
  return artifact;
}

export async function getArtifactDetail(artifactId: string, ownerId?: string) {
  const owner = requireOwner(ownerId);
  const artifact = await artifactByIdOrNull(artifactId);
  if (!artifact) {
    return null;
  }
  const project = await projectById(artifact.project_id, owner);
  if (!project) {
    return null;
  }
  const [source, extractions, reviews] = await Promise.all([
    artifact.source_document_id ? sourceDocumentById(artifact.source_document_id) : Promise.resolve(null),
    artifactExtractions([artifact.id]),
    artifactReviews([artifact.id])
  ]);
  return {
    artifact,
    source_document: source,
    extraction: latestExtraction(extractions, artifact.id),
    reviews: reviews.sort((a, b) => b.version - a.version),
    project
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
  const owner = requireOwner(input.ownerId);
  const artifact = await artifactById(input.artifact_id);
  const project = await projectById(artifact.project_id, owner);
  if (!project) {
    throw new Error("Artifact not found.");
  }
  const { error: artifactError } = await supabase()
    .from("artifacts")
    .update({
      artifact_type: input.artifact_type,
      confidence: input.confidence,
      category: input.category,
      subtype: input.subtype,
      classification_confidence: input.classification_confidence,
      classification_reasons: input.classification_reasons,
      updated_at: new Date().toISOString()
    })
    .eq("id", artifact.id);
  throwIfError(artifactError);
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("artifact_reviews")
    .insert({
      artifact_id: artifact.id,
      reviewer_id: owner,
      review_status: input.review_status,
      edited_markdown: input.edited_markdown,
      edited_json: input.edited_json,
      notes: input.notes,
      approved_at: input.review_status === "approved" ? now : null,
      version: (await maxReviewVersion(artifact.id)) + 1,
      created_at: now
    })
    .select("*")
    .single();
  throwIfError(error);
  await audit(
    artifact.project_id,
    owner,
    input.review_status === "approved" ? "artifact_approved" : input.review_status === "rejected" ? "artifact_rejected" : "artifact_reviewed",
    "artifact",
    artifact.id
  );
  return mapReview(data);
}

export async function createOutputPackage(input: {
  project_id: string;
  package_type: PackageType;
  source_selection: string[];
  output_markdown: string;
  output_json: Record<string, unknown>;
  storage_path?: string | null;
}): Promise<OutputPackage> {
  const owner = await projectOwner(input.project_id);
  const { data, error } = await supabase()
    .from("output_packages")
    .insert({
      project_id: input.project_id,
      package_type: input.package_type,
      source_selection: input.source_selection,
      output_markdown: input.output_markdown,
      output_json: input.output_json,
      storage_path: input.storage_path ?? null,
      created_by: owner,
      ...exportColumns(input.output_json)
    })
    .select("*")
    .single();
  throwIfError(error);
  const outputPackage = mapOutputPackage(data);
  await audit(input.project_id, owner, "output_generated", "output_package", outputPackage.id);
  return outputPackage;
}

export async function updateOutputPackage(input: {
  id: string;
  output_markdown: string;
  output_json: Record<string, unknown>;
  storage_path?: string | null;
}): Promise<OutputPackage> {
  const existing = await outputPackageById(input.id);
  const { data, error } = await supabase()
    .from("output_packages")
    .update({
      output_markdown: input.output_markdown,
      output_json: input.output_json,
      storage_path: input.storage_path ?? existing.storage_path,
      ...exportColumns(input.output_json)
    })
    .eq("id", input.id)
    .select("*")
    .single();
  throwIfError(error);
  const outputPackage = mapOutputPackage(data);
  await audit(outputPackage.project_id, await projectOwner(outputPackage.project_id), "output_generated", "output_package", outputPackage.id);
  return outputPackage;
}

export async function getOutputPackage(packageId: string, ownerId?: string): Promise<OutputPackage | null> {
  const owner = requireOwner(ownerId);
  const outputPackage = await outputPackageByIdOrNull(packageId);
  if (!outputPackage) {
    return null;
  }
  return (await projectById(outputPackage.project_id, owner)) ? outputPackage : null;
}

export async function deleteOutputPackage(packageId: string, ownerId?: string): Promise<OutputPackage | null> {
  const owner = requireOwner(ownerId);
  const outputPackage = await outputPackageByIdOrNull(packageId);
  if (!outputPackage) {
    return null;
  }
  if (!(await projectById(outputPackage.project_id, owner))) {
    return null;
  }
  const { error } = await supabase().from("output_packages").delete().eq("id", packageId);
  throwIfError(error);
  await audit(outputPackage.project_id, owner, "output_deleted", "output_package", outputPackage.id);
  return outputPackage;
}

export async function approvedArtifactsForProject(projectId: string, ownerId?: string) {
  const bundle = await getProjectBundle(projectId, ownerId);
  return bundle?.artifacts.filter((artifact) => artifact.latest_review?.review_status === "approved") ?? [];
}

async function insertProjectGraph(
  project: Project,
  sourceDocuments: SourceDocument[],
  processingJobs: ProcessingJob[],
  artifacts: Artifact[],
  extractions: ArtifactExtraction[],
  reviews: ArtifactReview[],
  outputPackages: OutputPackage[],
  owner: string
) {
  await insertRows("projects", [project]);
  await insertRows("source_documents", sourceDocuments.map((item) => ({ ...item, uploaded_by: owner })));
  await insertRows("processing_jobs", processingJobs);
  await insertRows("artifacts", artifacts);
  await insertRows("artifact_extractions", extractions);
  await insertRows("artifact_reviews", reviews);
  await insertRows("output_packages", outputPackages.map((item) => ({ ...item, created_by: owner, ...exportColumns(item.output_json) })));
}

async function readBackupFile(storagePath: string, fallbackFilename: string): Promise<BackupFilePayload> {
  try {
    const content = await readManagedFile(storagePath);
    return {
      filename: managedFileName(storagePath, fallbackFilename),
      content_base64: content.toString("base64"),
      missing: false
    };
  } catch {
    return {
      filename: managedFileName(storagePath, fallbackFilename),
      content_base64: null,
      missing: true
    };
  }
}

async function restoreBackupFile(
  kind: "source" | "artifact" | "export",
  ownerId: string,
  projectId: string,
  file: BackupFilePayload | null,
  fallbackFilename: string
) {
  if (!file || file.missing || !file.content_base64) {
    return saveManagedFile({
      kind,
      ownerId,
      projectId,
      filename: `${fallbackFilename}.missing.txt`,
      data: "This placeholder was created because the project backup did not contain the original file.\n",
      contentType: "text/plain; charset=utf-8"
    });
  }
  return saveManagedFile({
    kind,
    ownerId,
    projectId,
    filename: file.filename || fallbackFilename,
    data: Buffer.from(file.content_base64, "base64")
  });
}

async function artifactExtractions(artifactIds: string[]) {
  if (artifactIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase().from("artifact_extractions").select("*").in("artifact_id", artifactIds);
  throwIfError(error);
  return (data ?? []).map(mapExtraction);
}

async function artifactReviews(artifactIds: string[]) {
  if (artifactIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase().from("artifact_reviews").select("*").in("artifact_id", artifactIds);
  throwIfError(error);
  return (data ?? []).map(mapReview);
}

async function artifactById(id: string) {
  const { data, error } = await supabase().from("artifacts").select("*").eq("id", id).single();
  throwIfError(error);
  return mapArtifact(data);
}

async function artifactByIdOrNull(id: string) {
  const { data, error } = await supabase().from("artifacts").select("*").eq("id", id).maybeSingle();
  throwIfError(error);
  return data ? mapArtifact(data) : null;
}

async function outputPackageById(id: string) {
  const { data, error } = await supabase().from("output_packages").select("*").eq("id", id).single();
  throwIfError(error);
  return mapOutputPackage(data);
}

async function outputPackageByIdOrNull(id: string) {
  const { data, error } = await supabase().from("output_packages").select("*").eq("id", id).maybeSingle();
  throwIfError(error);
  return data ? mapOutputPackage(data) : null;
}

async function sourceDocumentById(id: string) {
  const { data, error } = await supabase().from("source_documents").select("*").eq("id", id).maybeSingle();
  throwIfError(error);
  return data ? mapSourceDocument(data) : null;
}

async function projectById(id: string, ownerId: string) {
  const { data, error } = await supabase().from("projects").select("*").eq("id", id).eq("created_by", ownerId).maybeSingle();
  throwIfError(error);
  return data ? mapProject(data) : null;
}

async function projectOwner(projectId: string) {
  const { data, error } = await supabase().from("projects").select("created_by").eq("id", projectId).single();
  throwIfError(error);
  if (!data) {
    throw new Error("Project not found.");
  }
  return String(data.created_by);
}

async function maxReviewVersion(artifactId: string) {
  const { data, error } = await supabase().from("artifact_reviews").select("version").eq("artifact_id", artifactId);
  throwIfError(error);
  return (data ?? []).reduce((max, item) => Math.max(max, Number(item.version ?? 0)), 0);
}

async function ensureProfile(userId: string) {
  const { error } = await supabase().from("profiles").upsert({ id: userId }, { onConflict: "id" });
  throwIfError(error);
}

async function insertRows(table: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return;
  }
  const { error } = await supabase().from(table).insert(rows);
  throwIfError(error);
}

async function audit(projectId: string, actorId: string, eventType: string, subjectType: string, subjectId: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase().from("audit_events").insert({
    project_id: projectId,
    actor_id: actorId,
    event_type: eventType,
    subject_type: subjectType,
    subject_id: subjectId,
    metadata
  });
  throwIfError(error);
}

function supabase() {
  const client = getSupabaseServiceClient();
  if (!client) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when Supabase mode is active.");
  }
  return client;
}

function requireOwner(ownerId?: string) {
  if (!ownerId) {
    throw new Error("Authenticated owner is required for Supabase persistence.");
  }
  return ownerId;
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    client_context: typeof row.client_context === "string" ? row.client_context : "",
    status: row.status === "archived" ? "archived" : "active",
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapSourceDocument(row: Record<string, unknown>): SourceDocument {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    filename: String(row.filename),
    file_type: String(row.file_type),
    storage_path: String(row.storage_path),
    page_count: typeof row.page_count === "number" ? row.page_count : null,
    uploaded_at: String(row.uploaded_at)
  };
}

function mapProcessingJob(row: Record<string, unknown>): ProcessingJob {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    source_document_id: row.source_document_id ? String(row.source_document_id) : null,
    stage: String(row.stage),
    status: row.status === "processing" || row.status === "completed" || row.status === "failed" ? row.status : "queued",
    error_log: typeof row.error_log === "string" ? row.error_log : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    source_document_id: row.source_document_id ? String(row.source_document_id) : null,
    page_number: typeof row.page_number === "number" ? row.page_number : null,
    image_path: String(row.image_path),
    artifact_type: String(row.artifact_type) as Artifact["artifact_type"],
    confidence: Number(row.confidence ?? 0),
    category: String(row.category ?? "unknown_manual_review") as Artifact["category"],
    subtype: String(row.subtype ?? "unknown_manual_review") as Artifact["subtype"],
    classification_confidence: Number(row.classification_confidence ?? 0),
    classification_reasons: asStringArray(row.classification_reasons),
    ocr_backend: String(row.ocr_backend ?? "unrecorded"),
    ocr_confidence: Number(row.ocr_confidence ?? 0),
    interpretation_backend: String(row.interpretation_backend ?? "local_template"),
    interpretation_confidence: Number(row.interpretation_confidence ?? 0),
    processing_status:
      row.processing_status === "processing" || row.processing_status === "completed" || row.processing_status === "failed" ? row.processing_status : "queued",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapExtraction(row: Record<string, unknown>): ArtifactExtraction {
  return {
    id: String(row.id),
    artifact_id: String(row.artifact_id),
    raw_ocr_text: String(row.raw_ocr_text ?? ""),
    layout_data: asRecordArray(row.layout_data),
    layout_summary: String(row.layout_summary ?? ""),
    ui_elements_json: asRecordArray(row.ui_elements_json),
    markdown_output: String(row.markdown_output ?? ""),
    json_output: asRecord(row.json_output),
    created_at: String(row.created_at)
  };
}

function mapReview(row: Record<string, unknown>): ArtifactReview {
  return {
    id: String(row.id),
    artifact_id: String(row.artifact_id),
    reviewer_id: String(row.reviewer_id ?? ""),
    review_status: row.review_status === "approved" || row.review_status === "rejected" ? row.review_status : "draft",
    edited_markdown: String(row.edited_markdown ?? ""),
    edited_json: asRecord(row.edited_json),
    notes: String(row.notes ?? ""),
    approved_at: typeof row.approved_at === "string" ? row.approved_at : null,
    version: Number(row.version ?? 1),
    created_at: String(row.created_at)
  };
}

function mapOutputPackage(row: Record<string, unknown>): OutputPackage {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    package_type: String(row.package_type) as PackageType,
    source_selection: asStringArray(row.source_selection),
    output_markdown: String(row.output_markdown ?? ""),
    output_json: asRecord(row.output_json),
    storage_path: typeof row.storage_path === "string" ? row.storage_path : null,
    created_at: String(row.created_at)
  };
}

function latestExtraction(items: ArtifactExtraction[], artifactId: string) {
  return items.filter((item) => item.artifact_id === artifactId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function latestReview(items: ArtifactReview[], artifactId: string) {
  return items.filter((item) => item.artifact_id === artifactId).sort((a, b) => b.version - a.version)[0];
}

function mostRecentDate(values: string[]) {
  return values.filter(Boolean).sort((a, b) => b.localeCompare(a))[0] ?? new Date().toISOString();
}

function exportColumns(outputJson: Record<string, unknown>) {
  const options = asRecord(outputJson.export_options);
  return {
    export_content: typeof options.content === "string" ? options.content : typeof outputJson.export_content === "string" ? outputJson.export_content : "markdown",
    export_format: typeof options.format === "string" ? options.format : typeof outputJson.export_format === "string" ? outputJson.export_format : "md",
    export_generated_at: typeof outputJson.export_generated_at === "string" ? outputJson.export_generated_at : new Date().toISOString(),
    export_generated_at_display:
      typeof outputJson.export_generated_at_display === "string" ? outputJson.export_generated_at_display : null
  };
}

function parseProjectBackupBundle(value: unknown): PortableProjectBundle {
  if (!isObject(value)) {
    throw new Error("Backup must be a JSON object.");
  }
  if (value.schema !== PROJECT_BACKUP_SCHEMA || value.version !== PROJECT_BACKUP_VERSION) {
    throw new Error("Unsupported project backup format.");
  }
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

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
