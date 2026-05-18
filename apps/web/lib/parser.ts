import type { ArtifactCategory, ArtifactSubtype, ArtifactType } from "@/types/domain";

export type ParserArtifact = {
  source_filename: string;
  page_number: number | null;
  image_filename: string;
  image_mime_type: string;
  image_base64: string;
  artifact_type: ArtifactType;
  confidence: number;
  category: ArtifactCategory;
  subtype: ArtifactSubtype;
  classification_confidence: number;
  classification_reasons: string[];
  ocr_backend: string;
  ocr_confidence: number;
  interpretation_backend: string;
  interpretation_confidence: number;
  raw_ocr_text: string;
  layout_data: Array<Record<string, unknown>>;
  layout_summary: string;
  ui_elements: Array<Record<string, unknown>>;
  markdown_output: string;
  json_output: Record<string, unknown>;
};

export type ParseResponse = {
  source_filename: string;
  file_type: string;
  page_count: number | null;
  artifacts: ParserArtifact[];
  warnings: string[];
};

export async function parseSourceDocument(file: File): Promise<ParseResponse> {
  const parserUrl = process.env.PARSER_URL ?? "http://127.0.0.1:8000";
  const formData = new FormData();
  formData.append("file", file, file.name);
  const response = await fetch(`${parserUrl}/parse/source-document`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(`Parser failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as ParseResponse;
}

export async function generatePackageWithParser(input: {
  package_type: string;
  artifacts: Array<Record<string, unknown>>;
}) {
  const parserUrl = process.env.PARSER_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(`${parserUrl}/generate/output-package`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Package generator failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as { output_markdown: string; output_json: Record<string, unknown> };
}

export async function regenerateArtifactImage(input: {
  image: Blob;
  filename: string;
  sourceDocument: string;
  artifactId: string;
  pageNumber: number | null;
  reviewerNotes?: string;
}): Promise<{ artifact: ParserArtifact; warnings: string[] }> {
  const parserUrl = process.env.PARSER_URL ?? "http://127.0.0.1:8000";
  const formData = new FormData();
  formData.append("file", input.image, input.filename);
  formData.append("source_document", input.sourceDocument);
  formData.append("artifact_id", input.artifactId);
  if (input.pageNumber !== null) {
    formData.append("page_number", String(input.pageNumber));
  }
  if (input.reviewerNotes?.trim()) {
    formData.append("reviewer_notes", input.reviewerNotes.trim());
  }
  const response = await fetch(`${parserUrl}/interpret/image`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(`Image regeneration failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as { artifact: ParserArtifact; warnings: string[] };
}
