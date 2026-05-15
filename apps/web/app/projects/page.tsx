import Link from "next/link";
import { ProjectCreateForm } from "@/components/ProjectCreateForm";
import { listProjects } from "@/lib/store";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">Upload source material, review extracted artifacts, and generate build briefs.</p>
        </div>
      </div>
      <ProjectCreateForm />
      <section className="mt-6 overflow-hidden border border-line bg-white">
        <div className="grid grid-cols-[1.2fr_1fr_140px] border-b border-line bg-mist px-4 py-3 text-xs font-semibold uppercase text-slate-600">
          <span>Name</span>
          <span>Context</span>
          <span>Status</span>
        </div>
        {projects.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">No projects yet.</p>
        ) : (
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="grid grid-cols-[1.2fr_1fr_140px] border-b border-line px-4 py-3 text-sm last:border-b-0 hover:bg-slate-50"
            >
              <span className="font-medium">{project.name}</span>
              <span className="text-slate-600">{project.client_context || "Internal"}</span>
              <span className="text-slate-600">{project.status}</span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
