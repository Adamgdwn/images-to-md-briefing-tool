import Link from "next/link";
import { notFound } from "next/navigation";
import { UploadForm } from "@/components/UploadForm";
import { getProjectBundle } from "@/lib/store";

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) {
    notFound();
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-5 px-6 py-6">
      <div>
        <Link href={`/projects/${bundle.project.id}`} className="text-sm text-slate-600">
          Back to project
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Upload Source Files</h1>
        <p className="mt-1 text-sm text-slate-600">DOCX, PDF, PNG, JPG, and WebP are supported for v1.</p>
      </div>
      {bundle.project.status === "archived" ? (
        <p className="border border-line bg-white p-4 text-sm text-slate-600">This project is archived.</p>
      ) : (
        <UploadForm projectId={bundle.project.id} />
      )}
    </main>
  );
}
