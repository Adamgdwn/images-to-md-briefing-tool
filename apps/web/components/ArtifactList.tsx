"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectBundle, ReviewStatus } from "@/types/domain";

type ArtifactWithReview = ProjectBundle["artifacts"][number];
type ArtifactFilter = ReviewStatus | "all";

export function ArtifactList({ artifacts }: { artifacts: ArtifactWithReview[] }) {
  const [filter, setFilter] = useState<ArtifactFilter>("all");
  const filteredArtifacts = useMemo(
    () => artifacts.filter((artifact) => filter === "all" || reviewStatus(artifact) === filter),
    [artifacts, filter]
  );
  const counts = {
    all: artifacts.length,
    draft: artifacts.filter((artifact) => reviewStatus(artifact) === "draft").length,
    approved: artifacts.filter((artifact) => reviewStatus(artifact) === "approved").length,
    rejected: artifacts.filter((artifact) => reviewStatus(artifact) === "rejected").length
  };

  if (artifacts.length === 0) {
    return <p className="px-4 py-6 text-sm text-slate-600">No artifacts extracted yet.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {(["all", "draft", "approved", "rejected"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`h-8 border border-line px-3 text-sm font-medium capitalize ${
              filter === value ? "bg-pine text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {value} {counts[value]}
          </button>
        ))}
      </div>
      {filteredArtifacts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">No {filter} artifacts found.</p>
      ) : (
        <div className="divide-y divide-line">
          {filteredArtifacts.map((artifact) => (
            <Link
              key={artifact.id}
              href={`/artifacts/${artifact.id}`}
              className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[160px_1fr_190px]"
            >
              <img
                src={`/api/artifacts/${artifact.id}/image`}
                alt="Extracted artifact preview"
                className="h-24 w-full border border-line object-contain"
              />
              <div>
                <p className="text-sm font-medium">{artifact.extraction?.layout_summary ?? artifact.artifact_type}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {artifact.category} / {artifact.subtype} · class {artifact.classification_confidence.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  OCR {artifact.ocr_backend} · {artifact.ocr_confidence.toFixed(2)} · Interpretation {artifact.interpretation_backend}
                </p>
                <p className="mt-1 text-xs text-slate-600">Last changed {formatDateTime(latestActivity(artifact))}</p>
              </div>
              <div className="grid content-start gap-2 text-sm">
                <ReviewBadge status={reviewStatus(artifact)} />
                <span className="text-xs text-slate-600">
                  v{artifact.latest_review?.version ?? 0} · {artifact.latest_review ? formatDateTime(artifact.latest_review.created_at) : "not reviewed"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const className = {
    approved: "border-pine bg-green-50 text-pine",
    rejected: "border-brick bg-red-50 text-brick",
    draft: "border-line bg-mist text-slate-700"
  }[status];
  return <span className={`inline-flex w-fit px-2 py-1 text-xs font-semibold uppercase ${className}`}>{status}</span>;
}

function reviewStatus(artifact: ArtifactWithReview): ReviewStatus {
  return artifact.latest_review?.review_status ?? "draft";
}

function latestActivity(artifact: ArtifactWithReview) {
  return [artifact.updated_at, artifact.extraction?.created_at, artifact.latest_review?.created_at]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
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
