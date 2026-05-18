import type { ExportContent, ExportFormat, ProjectBundle } from "@/types/domain";

type BundleArtifact = ProjectBundle["artifacts"][number];
type GeneratedOutput = {
  output_markdown: string;
  output_json: Record<string, unknown>;
};

export type TextExportOptions = {
  content: ExportContent;
  format: ExportFormat;
};

export const defaultTextExportOptions: TextExportOptions = {
  content: "markdown",
  format: "md"
};

export function buildBulkLlmExport(bundle: ProjectBundle, artifacts: BundleArtifact[]) {
  const sourceById = new Map(bundle.source_documents.map((source) => [source.id, source]));
  const sections = [
    `# Bulk LLM Export - ${bundle.project.name}`,
    "",
    "## Instructions For Downstream LLMs",
    "",
    "- Treat each artifact section as a separate reviewed screenshot artifact.",
    "- Do not merge requirements, UI elements, or ambiguities across artifact boundaries unless explicitly asked.",
    "- Use the artifact index, artifact ID, source document, and page/image metadata when citing evidence.",
    "",
    "## Export Manifest",
    "",
    `- Project: ${bundle.project.name}`,
    `- Project ID: ${bundle.project.id}`,
    `- Approved artifact count: ${artifacts.length}`,
    "- Boundary format: `BEGIN_ARTIFACT` / `END_ARTIFACT` HTML comments",
    "",
    ...artifacts.flatMap((artifact, index) => {
      const source = artifact.source_document_id ? sourceById.get(artifact.source_document_id) : null;
      return [`- ${artifactLabel(index)} | ${artifact.id} | ${source?.filename ?? "Unknown source"} | ${artifact.category}/${artifact.subtype}`];
    }),
    ""
  ];

  const artifactJson = [];
  for (const [index, artifact] of artifacts.entries()) {
    const source = artifact.source_document_id ? sourceById.get(artifact.source_document_id) : null;
    const reviewedMarkdown = artifact.latest_review?.edited_markdown || artifact.extraction?.markdown_output || "";
    const reviewedJson = artifact.latest_review?.edited_json || artifact.extraction?.json_output || {};
    const label = artifactLabel(index);
    const metadata = {
      artifact_index: label,
      artifact_id: artifact.id,
      source_document_id: artifact.source_document_id,
      source_document: source?.filename ?? null,
      page_number: artifact.page_number,
      image_path: artifact.image_path,
      category: artifact.category,
      subtype: artifact.subtype,
      artifact_type: artifact.artifact_type,
      review_status: artifact.latest_review?.review_status ?? null,
      approved_at: artifact.latest_review?.approved_at ?? null
    };

    sections.push(
      `<!-- BEGIN_ARTIFACT ${label} id=${artifact.id} -->`,
      "",
      `# Artifact ${label}: ${artifact.category}/${artifact.subtype}`,
      "",
      "## Artifact Metadata",
      "",
      ...metadataLines(metadata),
      "",
      "<!-- BEGIN_REVIEWED_MARKDOWN -->",
      "",
      reviewedMarkdown.trim() || "_No reviewed Markdown recorded._",
      "",
      "<!-- END_REVIEWED_MARKDOWN -->",
      "",
      "<!-- BEGIN_REVIEWED_JSON -->",
      "",
      "```json",
      JSON.stringify(reviewedJson, null, 2),
      "```",
      "",
      "<!-- END_REVIEWED_JSON -->",
      "",
      `<!-- END_ARTIFACT ${label} id=${artifact.id} -->`,
      ""
    );
    artifactJson.push({ metadata, reviewed_markdown: reviewedMarkdown, reviewed_json: reviewedJson });
  }

  return {
    output_markdown: sections.join("\n").trim() + "\n",
    output_json: {
      package_type: "bulk_llm_export",
      project_id: bundle.project.id,
      artifact_count: artifacts.length,
      artifacts: artifactJson
    }
  };
}

export function formatTextExport(generated: GeneratedOutput, options: TextExportOptions): GeneratedOutput {
  const normalized = normalizeTextExportOptions(options);
  const jsonText = JSON.stringify(generated.output_json, null, 2);
  let outputText = generated.output_markdown;

  if (normalized.format === "json") {
    outputText =
      JSON.stringify(
        {
          export_content: normalized.content,
          markdown_output: normalized.content === "json" ? undefined : generated.output_markdown,
          json_output: normalized.content === "markdown" ? undefined : generated.output_json
        },
        null,
        2
      ) + "\n";
  } else if (normalized.content === "json") {
    outputText = `${jsonText}\n`;
  } else if (normalized.content === "both" && normalized.format === "md") {
    outputText = `${generated.output_markdown.trim()}\n\n---\n\n## JSON Payload\n\n\`\`\`json\n${jsonText}\n\`\`\`\n`;
  } else if (normalized.content === "both") {
    outputText = `${generated.output_markdown.trim()}\n\n--- JSON PAYLOAD ---\n\n${jsonText}\n`;
  }

  return {
    output_markdown: outputText,
    output_json: {
      ...generated.output_json,
      export_options: normalized,
      source_markdown_output: generated.output_markdown,
      source_json_output: generated.output_json
    }
  };
}

export function normalizeTextExportOptions(value: unknown): TextExportOptions {
  const candidate = isRecord(value) ? value : {};
  const content = candidate.content === "json" || candidate.content === "both" || candidate.content === "markdown" ? candidate.content : "markdown";
  const format = candidate.format === "txt" || candidate.format === "json" || candidate.format === "md" ? candidate.format : "md";
  return { content, format };
}

export function outputExtension(outputJson: Record<string, unknown>) {
  return normalizeTextExportOptions(outputJson.export_options).format;
}

export function outputContentType(format: ExportFormat) {
  if (format === "json") {
    return "application/json; charset=utf-8";
  }
  if (format === "md") {
    return "text/markdown; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

function artifactLabel(index: number) {
  return String(index + 1).padStart(3, "0");
}

function metadataLines(metadata: Record<string, unknown>) {
  return Object.entries(metadata).map(([key, value]) => `- ${key}: ${value ?? "n/a"}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
