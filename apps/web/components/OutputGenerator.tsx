"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FileDown } from "lucide-react";
import type { PackageType, ProjectBundle } from "@/types/domain";

const packageTypes: Array<{ value: PackageType; label: string }> = [
  { value: "functional_additions", label: "Functional additions" },
  { value: "developer_stories", label: "Developer stories" },
  { value: "implementation_brief", label: "Implementation brief" },
  { value: "codex_ready_package", label: "Codex-ready package" }
];

export function OutputGenerator({ bundle }: { bundle: ProjectBundle }) {
  const router = useRouter();
  const approved = bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status === "approved");
  const drafts = bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status !== "approved");
  const [packageType, setPackageType] = useState<PackageType>("implementation_brief");
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
      body: JSON.stringify({ project_id: bundle.project.id, package_type: packageType, artifact_ids: selected })
    });
    if (!response.ok) {
      setStatus("Package could not be generated. Select approved artifacts.");
      return;
    }
    setStatus("Package generated.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border border-line bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
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
        <button
          disabled={!canGenerate}
          className="inline-flex h-10 items-center justify-center gap-2 bg-pine px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          title={canGenerate ? "Generate output package" : "Approve an artifact first"}
        >
          <FileDown size={16} />
          Generate
        </button>
      </div>
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
