"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CheckCircle, FileDown, LoaderCircle } from "lucide-react";
import { authFetch } from "@/lib/authClient";
import type { ExportContent, ExportFormat, OutputPackage, PackageType, ProjectBundle } from "@/types/domain";

const packageTypes: Array<{ value: PackageType; label: string }> = [
  { value: "bulk_llm_export", label: "Bulk LLM export" },
  { value: "functional_additions", label: "Functional additions" },
  { value: "developer_stories", label: "Developer stories" },
  { value: "implementation_brief", label: "Implementation brief" },
  { value: "codex_ready_package", label: "Codex-ready package" }
];

const exportContents: Array<{ value: ExportContent; label: string }> = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "both", label: "Markdown + JSON" }
];

const exportFormats: Array<{ value: ExportFormat; label: string }> = [
  { value: "md", label: ".md" },
  { value: "txt", label: ".txt" },
  { value: "json", label: ".json" }
];

export function OutputGenerator({ bundle }: { bundle: ProjectBundle }) {
  const router = useRouter();
  const approved = bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status === "approved");
  const drafts = bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status !== "approved");
  const [packageType, setPackageType] = useState<PackageType>("bulk_llm_export");
  const [exportContent, setExportContent] = useState<ExportContent>("markdown");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("md");
  const [selected, setSelected] = useState<string[]>(approved.map((artifact) => artifact.id));
  const [status, setStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<OutputPackage | null>(null);
  const canGenerate = approved.length > 0 && selected.length > 0 && !isGenerating;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isGenerating) {
      return;
    }
    if (!canGenerate) {
      setStatus("Review and approve at least one artifact first.");
      return;
    }
    setLastGenerated(null);
    setIsGenerating(true);
    setStatus("Generating package...");
    try {
      const response = await authFetch("/api/output-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: bundle.project.id,
          package_type: packageType,
          artifact_ids: selected,
          export_content: exportContent,
          export_format: exportFormat
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(result.error || "Package could not be generated. Select approved artifacts.");
        return;
      }
      const outputPackage = result.output_package as OutputPackage;
      setLastGenerated(outputPackage);
      setStatus(`Generated at ${exportDisplayTime(outputPackage.output_json, outputPackage.created_at)}.`);
      router.refresh();
    } catch {
      setStatus("Package could not be generated. Check the app logs and try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border border-line bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_140px_120px_auto]">
        <select
          value={packageType}
          onChange={(event) => setPackageType(event.target.value as PackageType)}
          className="h-10 border border-line px-3 text-sm"
        >
          {packageTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <select
          value={exportContent}
          onChange={(event) => setExportContent(event.target.value as ExportContent)}
          className="h-10 border border-line px-3 text-sm"
          title="Choose export content"
        >
          {exportContents.map((content) => (
            <option key={content.value} value={content.value}>
              {content.label}
            </option>
          ))}
        </select>
        <select
          value={exportFormat}
          onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
          className="h-10 border border-line px-3 text-sm"
          title="Choose file format"
        >
          {exportFormats.map((format) => (
            <option key={format.value} value={format.value}>
              {format.label}
            </option>
          ))}
        </select>
        <button
          disabled={!canGenerate}
          className="inline-flex h-10 items-center justify-center gap-2 bg-pine px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          title={canGenerate ? "Generate output package" : isGenerating ? "Generation in progress" : "Approve an artifact first"}
        >
          {isGenerating ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />}
          {isGenerating ? "Generating..." : "Generate"}
        </button>
      </div>
      {packageType === "bulk_llm_export" ? (
        <p className="text-sm text-slate-600">
          Exports selected approved artifacts as separate sections with explicit boundaries and source metadata.
        </p>
      ) : null}
      <div className="grid gap-2">
        {approved.length === 0 ? (
          <div className="grid gap-2 text-sm text-slate-600">
            <p>Review and approve at least one artifact before generating output.</p>
            {drafts[0] ? (
              <a href={`/artifacts/${drafts[0].id}`} className="font-medium text-pine">
                Open first draft artifact
              </a>
            ) : null}
          </div>
        ) : (
          approved.map((artifact) => (
            <label key={artifact.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(artifact.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, artifact.id] : current.filter((id) => id !== artifact.id)
                  )
                }
              />
              {artifact.category}/{artifact.subtype} · {artifact.extraction?.layout_summary ?? artifact.id}
            </label>
          ))
        )}
      </div>
      <div className="min-h-9" aria-live="polite">
        {lastGenerated ? (
          <div className="flex flex-wrap items-center gap-2 border border-pine bg-green-50 px-3 py-2 text-sm text-pine">
            <CheckCircle size={16} />
            <span>{status}</span>
            <a href={`/api/output-packages/${lastGenerated.id}/download`} className="font-medium underline">
              Download latest export
            </a>
          </div>
        ) : (
          <span className="text-sm text-slate-600">{status}</span>
        )}
      </div>
    </form>
  );
}

function exportDisplayTime(outputJson: Record<string, unknown>, fallback: string) {
  if (typeof outputJson.export_generated_at_display === "string") {
    return outputJson.export_generated_at_display;
  }
  return new Date(fallback).toLocaleString();
}
