import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/ReviewForm";
import { getArtifactDetail } from "@/lib/store";

export default async function ArtifactReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getArtifactDetail(id);
  if (!detail) {
    notFound();
  }
  const latestReview = detail.reviews[0];
  const isArchived = detail.project?.status === "archived";

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-6 py-4">
        <div>
          <Link href={`/projects/${detail.artifact.project_id}`} className="text-sm text-slate-600">
            Back to project
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-normal">Artifact Review</h1>
        </div>
        <div className="text-sm text-slate-600">
          Version {latestReview?.version ?? 0} · {latestReview?.review_status ?? "draft"}
          {isArchived ? " · archived project" : ""}
        </div>
      </div>
      <ReviewForm artifact={detail.artifact} extraction={detail.extraction} latestReview={latestReview} readOnly={isArchived} />
      <section className="border-t border-line bg-white px-6 py-5">
        <h2 className="text-sm font-semibold">Version history</h2>
        <div className="mt-3 grid gap-2">
          {detail.reviews.map((review) => (
            <div key={review.id} className="grid gap-1 border border-line p-3 text-sm md:grid-cols-[100px_130px_1fr]">
              <span>v{review.version}</span>
              <span>{review.review_status}</span>
              <span className="text-slate-600">{review.notes || "No notes"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
