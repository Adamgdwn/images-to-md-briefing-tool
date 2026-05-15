import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exportsDir } from "@/lib/paths";
import { generatePackageWithParser } from "@/lib/parser";
import { createOutputPackage, getProjectBundle } from "@/lib/store";

const packageSchema = z.object({
  project_id: z.string().min(1),
  package_type: z.enum(["functional_additions", "developer_stories", "implementation_brief", "codex_ready_package"]),
  artifact_ids: z.array(z.string()).min(1)
});

export async function POST(request: Request) {
  const parsed = packageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const bundle = await getProjectBundle(parsed.data.project_id);
  if (!bundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const artifacts = bundle.artifacts.filter(
    (artifact) => parsed.data.artifact_ids.includes(artifact.id) && artifact.latest_review?.review_status === "approved"
  );
  if (artifacts.length === 0) {
    return NextResponse.json({ error: "Select at least one approved artifact." }, { status: 400 });
  }

  const generated = await generatePackageWithParser({
    package_type: parsed.data.package_type,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      markdown_output: artifact.extraction?.markdown_output,
      json_output: artifact.extraction?.json_output,
      edited_markdown: artifact.latest_review?.edited_markdown,
      edited_json: artifact.latest_review?.edited_json
    }))
  });
  const filename = `${parsed.data.package_type}-${Date.now()}.md`;
  const exportPath = path.join(exportsDir(), filename);
  await fs.writeFile(exportPath, generated.output_markdown);
  const outputPackage = await createOutputPackage({
    project_id: parsed.data.project_id,
    package_type: parsed.data.package_type,
    source_selection: artifacts.map((artifact) => artifact.id),
    output_markdown: generated.output_markdown,
    output_json: generated.output_json,
    storage_path: exportPath
  });

  return NextResponse.json({ output_package: outputPackage });
}
