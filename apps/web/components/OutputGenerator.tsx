"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FileDown } from "lucide-react";
import type { ExportContent, ExportFormat, PackageType, ProjectBundle } from "@/types/domain";

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
  const canGenerate = approved.length > 0 && selected.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) {
      setStatus("Review and approve at least one artifact first.");
      return;
    }
    setStatus("Generating package...");
    const response = await fetch("/api/output-packages", {
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
    if (!response.ok) {
      setStatus("Package could not be generated. Select approved artifacts.");
      return;
    }
    setStatus(packageType === "bulk_llm_export" ? "Bulk export generated." : "Package generated.");
    router.refresh();
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
          title={canGenerate ? "Generate output package" : "Approve an artifact first"}
        >
          <FileDown size={16} />
          Generate
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
      <span className="text-sm text-slate-600">{status}</span>
    </form>
  );
}
