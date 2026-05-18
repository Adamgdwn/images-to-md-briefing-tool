import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUp, ImageIcon, PackageCheck } from "lucide-react";
import { ArtifactList } from "@/components/ArtifactList";
import { OutputGenerator } from "@/components/OutputGenerator";
import { OutputPackageCard } from "@/components/OutputPackageCard";
import { ProjectActions } from "@/components/ProjectActions";
import { getProjectBundle } from "@/lib/store";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) {
    notFound();
  }

  const approvedCount = bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status === "approved").length;
  const isArchived = bundle.project.status === "archived";

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal">{bundle.project.name}</h1>
            {isArchived ? <span className="border border-line bg-mist px-2 py-1 text-xs font-semibold uppercase text-slate-600">Archived</span> : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">{bundle.project.client_context || "No project context provided."}</p>
        </div>
        {isArchived ? null : (
          <Link
            href={`/projects/${bundle.project.id}/upload`}
            className="inline-flex h-10 items-center gap-2 bg-pine px-4 text-sm font-medium text-white"
          >
            <FileUp size={16} />
            Upload
          </Link>
        )}
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Sources" value={bundle.source_documents.length} />
        <Metric label="Artifacts" value={bundle.artifacts.length} />
        <Metric label="Approved" value={approvedCount} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="border border-line bg-white">
          <div className="flex items-center gap-2 border-b border-line bg-mist px-4 py-3">
            <ImageIcon size={16} aria-hidden="true" />
            <h2 className="text-sm font-semibold">Artifacts</h2>
          </div>
          <ArtifactList artifacts={bundle.artifacts} />
        </div>

        <div className="grid content-start gap-4">
          <ProjectActions project={bundle.project} />
          {isArchived ? null : <OutputGenerator bundle={bundle} />}
          <div className="border border-line bg-white">
            <div className="flex items-center gap-2 border-b border-line bg-mist px-4 py-3">
              <PackageCheck size={16} />
              <h2 className="text-sm font-semibold">Output packages</h2>
            </div>
            {bundle.output_packages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600">No packages generated.</p>
            ) : (
              <div className="divide-y divide-line">
                {bundle.output_packages.map((item) => (
                  <OutputPackageCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-white p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
