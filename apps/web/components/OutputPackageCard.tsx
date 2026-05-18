"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { OutputPackage } from "@/types/domain";

const packageLabels: Record<OutputPackage["package_type"], string> = {
  functional_additions: "Functional additions",
  developer_stories: "Developer stories",
  implementation_brief: "Implementation brief",
  codex_ready_package: "Codex-ready package",
  bulk_llm_export: "Bulk LLM export"
};

export function OutputPackageCard({ item }: { item: OutputPackage }) {
  const router = useRouter();
  const [status, setStatus] = useState("");

  async function regenerate() {
    setStatus("Regenerating...");
    const response = await fetch(`/api/output-packages/${item.id}/regenerate`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "Could not regenerate output.");
      return;
    }
    setStatus("Regenerated.");
    router.refresh();
  }

  return (
    <details className="p-4">
      <summary className="cursor-pointer text-sm font-medium">{packageLabels[item.package_type]}</summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`/api/output-packages/${item.id}/download`}
          className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium"
          title="Download Markdown export"
        >
          <Download size={16} />
          Download
        </a>
        <button
          type="button"
          onClick={regenerate}
          className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium"
          title="Regenerate output from the same approved artifacts"
        >
          <RefreshCw size={16} />
          Regenerate Output
        </button>
        <span className="text-sm text-slate-600">{status}</span>
      </div>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap bg-slate-50 p-3 text-xs leading-5">{item.output_markdown}</pre>
    </details>
  );
}
