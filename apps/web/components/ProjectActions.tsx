"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Download, Save, Trash2 } from "lucide-react";
import type { Project } from "@/types/domain";

export function ProjectActions({ project }: { project: Project }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [clientContext, setClientContext] = useState(project.client_context);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isArchived = project.status === "archived";

  async function updateProject(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("Saving...");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, client_context: clientContext })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Project could not be saved.");
        return;
      }
      setStatus("Project saved.");
      router.refresh();
    } catch {
      setStatus("Project could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function setProjectStatus(nextStatus: Project["status"]) {
    setIsSubmitting(true);
    setStatus(nextStatus === "archived" ? "Archiving..." : "Restoring...");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Project status could not be changed.");
        return;
      }
      setStatus(nextStatus === "archived" ? "Project archived." : "Project restored.");
      router.refresh();
    } catch {
      setStatus("Project status could not be changed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteProject() {
    if (deleteConfirmation !== project.name) {
      setStatus("Project name confirmation does not match.");
      return;
    }
    if (!window.confirm("Delete this project and all related local files? This cannot be undone.")) {
      return;
    }
    setIsDeleting(true);
    setStatus("Deleting project...");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm_name: deleteConfirmation })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Project could not be deleted.");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setStatus("Project could not be deleted.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Project actions</h2>
        <span className="text-sm text-slate-600">{project.status}</span>
      </div>
      <form onSubmit={updateProject} className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 border border-line px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Context
          <textarea
            value={clientContext}
            onChange={(event) => setClientContext(event.target.value)}
            className="min-h-20 resize-y border border-line p-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={isSubmitting || isDeleting}
            className="inline-flex h-9 items-center gap-2 bg-pine px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            title="Save project"
          >
            <Save size={16} />
            Save
          </button>
          <button
            type="button"
            onClick={() => void setProjectStatus(isArchived ? "active" : "archived")}
            disabled={isSubmitting || isDeleting}
            className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            title={isArchived ? "Restore project" : "Archive project"}
          >
            {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {isArchived ? "Restore" : "Archive"}
          </button>
          <a
            href={`/api/projects/${project.id}/bundle`}
            className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium"
            title="Export project backup"
          >
            <Download size={16} />
            Export backup
          </a>
        </div>
      </form>
      <div className="mt-4 border-t border-line pt-4">
        <label className="grid gap-1 text-sm font-medium">
          Type project name to delete
          <input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            className="h-10 border border-line px-3 text-sm"
            placeholder={project.name}
          />
        </label>
        <button
          type="button"
          onClick={deleteProject}
          disabled={isDeleting || deleteConfirmation !== project.name}
          className="mt-3 inline-flex h-9 items-center gap-2 border border-brick bg-white px-3 text-sm font-medium text-brick disabled:cursor-not-allowed disabled:opacity-60"
          title="Delete project"
        >
          <Trash2 size={16} />
          {isDeleting ? "Deleting..." : "Delete project"}
        </button>
      </div>
      <p className="mt-3 min-h-5 text-sm text-slate-600" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
