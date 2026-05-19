import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { buildBulkLlmExport, exportTimestamp, formatTextExport, normalizeTextExportOptions, outputExtension } from "@/lib/outputExport";
import { exportsDir } from "@/lib/paths";
import { generatePackageWithParser } from "@/lib/parser";
import { getOutputPackage, getProjectBundle, updateOutputPackage } from "@/lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const outputPackage = await getOutputPackage(id, storeOwnerId(authResult.auth));
  if (!outputPackage) {
    return NextResponse.json({ error: "Output package not found." }, { status: 404 });
  }

  const bundle = await getProjectBundle(outputPackage.project_id, storeOwnerId(authResult.auth));
  if (!bundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (bundle.project.status === "archived") {
    return NextResponse.json({ error: "Archived projects cannot regenerate output packages." }, { status: 409 });
  }

  const artifacts = bundle.artifacts.filter(
    (artifact) => outputPackage.source_selection.includes(artifact.id) && artifact.latest_review?.review_status === "approved"
  );
  if (artifacts.length === 0) {
    return NextResponse.json({ error: "Original package selection has no approved artifacts." }, { status: 400 });
  }

  const generatedAt = exportTimestamp();
  const exportOptions = normalizeTextExportOptions(outputPackage.output_json.export_options);
  const generatedBase =
    outputPackage.package_type === "bulk_llm_export"
      ? buildBulkLlmExport(bundle, artifacts, generatedAt, exportOptions.content)
      : await generatePackageWithParser({
          package_type: outputPackage.package_type,
          artifacts: artifacts.map((artifact) => ({
            id: artifact.id,
            category: artifact.category,
            subtype: artifact.subtype,
            classification_reasons: artifact.classification_reasons,
            markdown_output: artifact.extraction?.markdown_output,
            json_output: artifact.extraction?.json_output,
            edited_markdown: artifact.latest_review?.edited_markdown,
            edited_json: artifact.latest_review?.edited_json,
            reviewer_notes: artifact.latest_review?.notes
          }))
        });

  const generated = formatTextExport(generatedBase, exportOptions, generatedAt);
  const filename = `${outputPackage.package_type}-${generatedAt.filename}-regenerated.${outputExtension(generated.output_json)}`;
  const exportPath = path.join(exportsDir(), filename);
  await fs.writeFile(exportPath, generated.output_markdown);
  const updated = await updateOutputPackage({
    id: outputPackage.id,
    output_markdown: generated.output_markdown,
    output_json: generated.output_json,
    storage_path: exportPath
  });

  return NextResponse.json({ output_package: updated });
}
