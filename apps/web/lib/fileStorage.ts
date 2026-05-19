import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { artifactsDir, dataDir, exportsDir, uploadsDir } from "@/lib/paths";
import { getSupabaseServiceClient, isSupabaseConfigured } from "@/lib/supabase";

type ManagedFileKind = "source" | "artifact" | "export";

const buckets: Record<ManagedFileKind, string> = {
  source: "source-documents",
  artifact: "artifact-images",
  export: "output-packages"
};

export async function saveManagedFile(input: {
  kind: ManagedFileKind;
  ownerId?: string;
  projectId: string;
  filename: string;
  data: Buffer | string;
  contentType?: string;
}) {
  if (isSupabaseConfigured()) {
    if (!input.ownerId) {
      throw new Error("Supabase storage requires an authenticated owner.");
    }
    const supabase = requireSupabaseStorageClient();
    const bucket = buckets[input.kind];
    const objectName = `${input.ownerId}/${input.projectId}/${randomUUID()}-${safeName(input.filename)}`;
    const { error } = await supabase.storage.from(bucket).upload(objectName, input.data, {
      contentType: input.contentType,
      upsert: false
    });
    if (error) {
      throw new Error(error.message);
    }
    return storageUri(bucket, objectName);
  }

  const directory = localDirectory(input.kind);
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${Date.now()}-${randomUUID()}-${safeName(input.filename)}`);
  await fs.writeFile(filePath, input.data);
  return filePath;
}

export async function readManagedFile(storagePath: string) {
  const remote = parseStorageUri(storagePath);
  if (remote) {
    const supabase = requireSupabaseStorageClient();
    const { data, error } = await supabase.storage.from(remote.bucket).download(remote.objectName);
    if (error) {
      throw new Error(error.message);
    }
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(storagePath);
}

export async function deleteManagedFile(storagePath: string | null | undefined) {
  if (!storagePath) {
    return false;
  }
  const remote = parseStorageUri(storagePath);
  if (remote) {
    const supabase = requireSupabaseStorageClient();
    const { error } = await supabase.storage.from(remote.bucket).remove([remote.objectName]);
    if (error) {
      return false;
    }
    return true;
  }

  const resolvedPath = path.resolve(storagePath);
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

export function managedFileName(storagePath: string, fallback = "file") {
  const remote = parseStorageUri(storagePath);
  return safeName(path.basename(remote?.objectName ?? storagePath) || fallback);
}

export function contentTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }
  if (lower.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  return "image/png";
}

function requireSupabaseStorageClient() {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when Supabase mode is active.");
  }
  return supabase;
}

function parseStorageUri(value: string) {
  if (!value.startsWith("supabase://")) {
    return null;
  }
  const withoutProtocol = value.slice("supabase://".length);
  const separatorIndex = withoutProtocol.indexOf("/");
  if (separatorIndex < 0) {
    throw new Error("Invalid Supabase storage path.");
  }
  return {
    bucket: withoutProtocol.slice(0, separatorIndex),
    objectName: withoutProtocol.slice(separatorIndex + 1)
  };
}

function storageUri(bucket: string, objectName: string) {
  return `supabase://${bucket}/${objectName}`;
}

function localDirectory(kind: ManagedFileKind) {
  if (kind === "source") {
    return uploadsDir();
  }
  if (kind === "artifact") {
    return artifactsDir();
  }
  return exportsDir();
}

function safeName(value: string) {
  return (value || "file").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}
