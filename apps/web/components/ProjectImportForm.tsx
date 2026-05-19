"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { authFetch } from "@/lib/authClient";

export function ProjectImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Choose a project backup JSON file.");
      return;
    }
    setImporting(true);
    setStatus("Importing backup...");
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await authFetch("/api/projects/import", {
        method: "POST",
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Project backup could not be imported.");
        return;
      }
      setStatus("Project backup imported.");
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } catch {
      setStatus("Project backup could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border-b border-line bg-white px-6 py-5 md:grid-cols-[1fr_auto]">
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="h-10 border border-line px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
      />
      <button
        className="inline-flex h-10 items-center justify-center gap-2 border border-line bg-white px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        disabled={importing}
        title="Import project backup"
      >
        <Upload size={16} />
        {importing ? "Importing..." : "Import backup"}
      </button>
      <p className="min-h-5 text-sm text-slate-600 md:col-span-2" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
