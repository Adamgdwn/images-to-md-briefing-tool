"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Upload } from "lucide-react";
import { authFetch } from "@/lib/authClient";

export function UploadForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!files?.length) {
      setStatus("Choose at least one source file.");
      return;
    }
    setSubmitting(true);
    setStatus("Uploading and extracting artifacts...");
    const body = new FormData();
    body.append("project_id", projectId);
    Array.from(files).forEach((file) => body.append("files", file));
    const response = await authFetch("/api/uploads", { method: "POST", body });
    const result = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) {
      setStatus(result.error || "Upload failed. Check that the parser service is running.");
      return;
    }
    const artifacts = Array.isArray(result.results)
      ? result.results.reduce((total: number, item: { artifacts?: unknown[] }) => total + (Array.isArray(item.artifacts) ? item.artifacts.length : 0), 0)
      : 0;
    setStatus(`Processing complete. ${artifacts} artifact${artifacts === 1 ? "" : "s"} extracted.`);
    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 bg-white p-6">
      <label className="grid gap-2 text-sm font-medium">
        Source files
        <input
          type="file"
          multiple
          accept=".docx,.odt,.odp,.ods,.odg,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(event) => setFiles(event.target.files)}
          className="block w-full border border-line bg-white p-3 text-sm"
        />
      </label>
      <p className="text-sm text-slate-600">Upload DOCX, LibreOffice/OpenDocument files, PDFs, or batches of screenshots.</p>
      <div className="flex items-center gap-3">
        <button
          disabled={submitting}
          className="inline-flex h-10 items-center justify-center gap-2 bg-pine px-4 text-sm font-medium text-white disabled:opacity-50"
          title="Upload source files"
        >
          <Upload size={16} />
          Upload
        </button>
        <span className="text-sm text-slate-600">{status}</span>
      </div>
    </form>
  );
}
