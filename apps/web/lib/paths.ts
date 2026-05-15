import path from "node:path";

export function repoRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../..");
}

export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.APP_DATA_DIR ?? "../../data");
}

export function storePath(): string {
  return path.join(dataDir(), "dev-store.json");
}

export function uploadsDir(): string {
  return path.join(dataDir(), "uploads");
}

export function artifactsDir(): string {
  return path.join(dataDir(), "artifacts");
}

export function exportsDir(): string {
  return path.join(dataDir(), "exports");
}
