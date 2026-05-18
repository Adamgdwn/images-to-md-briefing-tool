"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectSummary } from "@/types/domain";

type ProjectFilter = "active" | "archived" | "all";

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const filteredProjects = useMemo(
    () => projects.filter((project) => filter === "all" || project.status === filter),
    [filter, projects]
  );

  return (
    <section className="mt-6 overflow-hidden border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-mist px-4 py-3">
        <h2 className="text-sm font-semibold">Project workspace</h2>
        <div className="inline-flex border border-line bg-white text-sm">
          {(["active", "archived", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`h-9 px-3 font-medium capitalize ${filter === value ? "bg-pine text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="hidden grid-cols-[1.1fr_1fr_150px_150px_110px] border-b border-line bg-mist px-4 py-3 text-xs font-semibold uppercase text-slate-600 md:grid">
        <span>Name</span>
        <span>Context</span>
        <span>Counts</span>
        <span>Last activity</span>
        <span>Status</span>
      </div>
      {filteredProjects.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">No {filter === "all" ? "projects" : `${filter} projects`} found.</p>
      ) : (
        filteredProjects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className={`grid gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0 hover:bg-slate-50 md:grid-cols-[1.1fr_1fr_150px_150px_110px] ${
              project.status === "archived" ? "bg-slate-50 text-slate-500" : ""
            }`}
          >
            <span className="font-medium">{project.name}</span>
            <span className="text-slate-600">{project.client_context || "Internal"}</span>
            <span className="text-slate-600">
              {project.source_count} src · {project.artifact_count} art · {project.approved_count} ok · {project.output_package_count} exp
            </span>
            <span className="text-slate-600">{formatDateTime(project.updated_at)}</span>
            <span>
              <StatusBadge status={project.status} />
            </span>
          </Link>
        ))
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: ProjectSummary["status"] }) {
  const className =
    status === "active"
      ? "border-pine bg-green-50 text-pine"
      : "border-line bg-white text-slate-600";
  return <span className={`inline-flex px-2 py-1 text-xs font-semibold uppercase ${className}`}>{status}</span>;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
