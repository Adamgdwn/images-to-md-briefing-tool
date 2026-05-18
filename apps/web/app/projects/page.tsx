import { ProjectCreateForm } from "@/components/ProjectCreateForm";
import { ProjectList } from "@/components/ProjectList";
import { listProjectSummaries } from "@/lib/store";

export default async function ProjectsPage() {
  const projects = await listProjectSummaries();

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">Upload source material, review extracted artifacts, and generate build briefs.</p>
        </div>
      </div>
      <ProjectCreateForm />
      <ProjectList projects={projects} />
    </main>
  );
}
