import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUp, ImageIcon, PackageCheck } from "lucide-react";
import { OutputGenerator } from "@/components/OutputGenerator";
import { OutputPackageCard } from "@/components/OutputPackageCard";
import { getProjectBundle } from "@/lib/store";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) {
    notFound();
  }

  const approvedCount = bundle.artifacts.filter((artifact) => artifact.latest_review?.review_status === "approved").length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{bundle.project.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{bundle.project.client_context || "No project context provided."}</p>
        </div>
        <Link
          href={`/projects/${bundle.project.id}/upload`}
          className="inline-flex h-10 items-center gap-2 bg-pine px-4 text-sm font-medium text-white"
        >
          <FileUp size={16} />
          Upload
        </Link>
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
          {bundle.artifacts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-600">No artifacts extracted yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {bundle.artifacts.map((artifact) => (
                <Link key={artifact.id} href={`/artifacts/${artifact.id}`} className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[160px_1fr_170px]">
                  <img src={`/api/artifacts/${artifact.id}/image`} alt="Extracted artifact preview" className="h-24 w-full border border-line object-contain" />
                  <div>
                    <p className="text-sm font-medium">{artifact.extraction?.layout_summary ?? artifact.artifact_type}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {artifact.category} / {artifact.subtype} · class {artifact.classification_confidence.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Legacy {artifact.artifact_type} · confidence {artifact.confidence.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      OCR {artifact.ocr_backend} · {artifact.ocr_confidence.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Interpretation {artifact.interpretation_backend} · {artifact.interpretation_confidence.toFixed(2)}
                    </p>
                  </div>
                  <span className="self-start text-sm font-medium text-pine">
                    {artifact.latest_review?.review_status === "approved" ? "Approved" : "Review and approve"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid content-start gap-4">
          <OutputGenerator bundle={bundle} />
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
