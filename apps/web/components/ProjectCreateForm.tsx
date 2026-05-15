"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";

export function ProjectCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [clientContext, setClientContext] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, client_context: clientContext })
    });
    setSubmitting(false);
    if (!response.ok) {
      setError("Project could not be created.");
      return;
    }
    const data = await response.json();
    router.push(`/projects/${data.project.id}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border-b border-line bg-white px-6 py-5 md:grid-cols-[1fr_1fr_auto]">
      <input
        className="h-10 border border-line px-3 text-sm outline-none focus:border-pine"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Project name"
        required
      />
      <input
        className="h-10 border border-line px-3 text-sm outline-none focus:border-pine"
        value={clientContext}
        onChange={(event) => setClientContext(event.target.value)}
        placeholder="Client or context"
      />
      <button
        className="inline-flex h-10 items-center justify-center gap-2 bg-pine px-4 text-sm font-medium text-white disabled:opacity-50"
        disabled={submitting}
        title="Create project"
      >
        <Plus size={16} />
        Create
      </button>
      {error ? <p className="text-sm text-brick md:col-span-3">{error}</p> : null}
    </form>
  );
}
