import type { ProjectBundle } from "@/types/domain";

type BundleArtifact = ProjectBundle["artifacts"][number];

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

function artifactLabel(index: number) {
  return String(index + 1).padStart(3, "0");
}

function metadataLines(metadata: Record<string, unknown>) {
  return Object.entries(metadata).map(([key, value]) => `- ${key}: ${value ?? "n/a"}`);
}
