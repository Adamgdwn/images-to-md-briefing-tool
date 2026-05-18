import { promises as fs } from "node:fs";
import path from "node:path";
import { repoRoot } from "@/lib/paths";

export async function upsertEnvLocal(values: Record<string, string>) {
  const envPath = path.join(repoRoot(), ".env.local");
  let lines: string[] = [];
  try {
    lines = (await fs.readFile(envPath, "utf8")).split(/\r?\n/);
  } catch {
    lines = [];
  }

  for (const [key, value] of Object.entries(values)) {
    const nextLine = `${key}=${quoteEnvValue(value)}`;
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      lines[index] = nextLine;
    } else {
      lines.push(nextLine);
    }
  }

  await fs.writeFile(envPath, `${lines.filter(Boolean).join("\n")}\n`);
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]*$/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
