import * as localStore from "@/lib/localStore";
import * as supabaseStore from "@/lib/supabaseStore";
import { isSupabaseConfigured } from "@/lib/supabase";

export type { PortableProjectBundle } from "@/lib/localStore";

function store() {
  return isSupabaseConfigured() ? supabaseStore : localStore;
}

export const ensureDataDirs = localStore.ensureDataDirs;
export const readStore = localStore.readStore;
export const writeStore = localStore.writeStore;

export const listProjects: typeof localStore.listProjects = (...args) => store().listProjects(...args);
export const listProjectSummaries: typeof localStore.listProjectSummaries = (...args) => store().listProjectSummaries(...args);
export const createProject: typeof localStore.createProject = (...args) => store().createProject(...args);
export const updateProject: typeof localStore.updateProject = (...args) => store().updateProject(...args);
export const deleteProject: typeof localStore.deleteProject = (...args) => store().deleteProject(...args);
export const getProjectBundle: typeof localStore.getProjectBundle = (...args) => store().getProjectBundle(...args);
export const createProjectBackupBundle: typeof localStore.createProjectBackupBundle = (...args) => store().createProjectBackupBundle(...args);
export const importProjectBackupBundle: typeof localStore.importProjectBackupBundle = (...args) => store().importProjectBackupBundle(...args);
export const createSourceDocument: typeof localStore.createSourceDocument = (...args) => store().createSourceDocument(...args);
export const updateSourceDocumentPageCount: typeof localStore.updateSourceDocumentPageCount = (...args) => store().updateSourceDocumentPageCount(...args);
export const createProcessingJob: typeof localStore.createProcessingJob = (...args) => store().createProcessingJob(...args);
export const updateProcessingJob: typeof localStore.updateProcessingJob = (...args) => store().updateProcessingJob(...args);
export const createArtifactWithExtraction: typeof localStore.createArtifactWithExtraction = (...args) => store().createArtifactWithExtraction(...args);
export const replaceArtifactExtraction: typeof localStore.replaceArtifactExtraction = (...args) => store().replaceArtifactExtraction(...args);
export const getArtifactDetail: typeof localStore.getArtifactDetail = (...args) => store().getArtifactDetail(...args);
export const saveArtifactReview: typeof localStore.saveArtifactReview = (...args) => store().saveArtifactReview(...args);
export const createOutputPackage: typeof localStore.createOutputPackage = (...args) => store().createOutputPackage(...args);
export const updateOutputPackage: typeof localStore.updateOutputPackage = (...args) => store().updateOutputPackage(...args);
export const getOutputPackage: typeof localStore.getOutputPackage = (...args) => store().getOutputPackage(...args);
export const deleteOutputPackage: typeof localStore.deleteOutputPackage = (...args) => store().deleteOutputPackage(...args);
export const approvedArtifactsForProject: typeof localStore.approvedArtifactsForProject = (...args) => store().approvedArtifactsForProject(...args);
