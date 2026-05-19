"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { Check, RotateCcw, Save, X } from "lucide-react";
import { authFetch } from "@/lib/authClient";
import type { Artifact, ArtifactCategory, ArtifactExtraction, ArtifactReview, ArtifactSubtype, ArtifactType } from "@/types/domain";

const artifactTypes: ArtifactType[] = [
  "ui_form_screen",
  "ui_dashboard_screen",
  "workflow_diagram",
  "slide_layout",
  "table_heavy",
  "mixed_visual",
  "unknown_manual_review"
];

const categories: ArtifactCategory[] = ["ui_screen", "ui_dialog", "workflow_visual", "presentation_visual", "document_visual", "unknown_manual_review"];

const subtypes: ArtifactSubtype[] = [
  "dashboard_screen",
  "settings_screen",
  "data_entry_form",
  "table_list_view",
  "detail_view",
  "auth_screen",
  "editor_screen",
  "navigation_home",
  "confirmation_dialog",
  "settings_dialog",
  "auth_dialog",
  "file_picker_dialog",
  "export_dialog",
  "warning_dialog",
  "specialized_task_dialog",
  "process_map",
  "flowchart",
  "decision_tree",
  "swimlane_diagram",
  "journey_map",
  "relationship_map",
  "slide_layout",
  "executive_summary_slide",
  "comparison_slide",
  "annotated_mockup",
  "concept_board",
  "scanned_page",
  "table_capture",
  "form_snapshot",
  "contract_section",
  "report_page",
  "annotated_document",
  "signature_or_stamp_region",
  "unknown_manual_review"
];

export function ReviewForm({
  artifact,
  extraction,
  latestReview,
  readOnly = false
}: {
  artifact: Artifact;
  extraction?: ArtifactExtraction;
  latestReview?: ArtifactReview;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [artifactType, setArtifactType] = useState<ArtifactType>(artifact.artifact_type);
  const [confidence, setConfidence] = useState(String(artifact.confidence));
  const [category, setCategory] = useState<ArtifactCategory>(artifact.category);
  const [subtype, setSubtype] = useState<ArtifactSubtype>(artifact.subtype);
  const [classificationConfidence, setClassificationConfidence] = useState(String(artifact.classification_confidence));
  const [classificationReasons, setClassificationReasons] = useState(artifact.classification_reasons.join("\n"));
  const [markdown, setMarkdown] = useState(latestReview?.edited_markdown || extraction?.markdown_output || "");
  const [jsonText, setJsonText] = useState(JSON.stringify(latestReview?.edited_json || extraction?.json_output || {}, null, 2));
  const [notes, setNotes] = useState(latestReview?.notes || "");
  const [status, setStatus] = useState("");

  const confidenceLabel = useMemo(() => {
    const value = Number(confidence);
    if (value >= 0.75) return "High";
    if (value >= 0.5) return "Medium";
    return "Low";
  }, [confidence]);

  async function submit(reviewStatus: "draft" | "approved" | "rejected") {
    setStatus(reviewStatus === "approved" ? "Approving..." : reviewStatus === "rejected" ? "Rejecting..." : "Saving draft...");
    if (readOnly) {
      setStatus("Archived project artifacts cannot be changed.");
      return;
    }
    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      setStatus("JSON is invalid.");
      return;
    }
    const classificationReasonsList = classificationReasons
      .split(/\r?\n/)
      .map((reason) => reason.trim())
      .filter(Boolean);
    parsedJson = {
      ...parsedJson,
      artifact_type: artifactType,
      confidence: Number(confidence),
      category,
      subtype,
      classification_confidence: Number(classificationConfidence),
      classification_reasons: classificationReasonsList
    };

    const response = await authFetch(`/api/artifacts/${artifact.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        review_status: reviewStatus,
        edited_markdown: markdown,
        edited_json: parsedJson,
        notes,
        artifact_type: artifactType,
        confidence: Number(confidence),
        category,
        subtype,
        classification_confidence: Number(classificationConfidence),
        classification_reasons: classificationReasonsList
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(result.error || "Review could not be saved.");
      return;
    }
    setStatus(
      reviewStatus === "approved"
        ? `Approved as v${result.review?.version ?? ""}.`
        : reviewStatus === "rejected"
          ? `Rejected as v${result.review?.version ?? ""}.`
          : `Draft saved as v${result.review?.version ?? ""}.`
    );
    router.refresh();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit("draft");
  }

  return (
    <form onSubmit={onSubmit} className="grid min-h-[calc(100vh-155px)] grid-cols-1 gap-0 border-t border-line bg-white lg:grid-cols-[minmax(320px,0.95fr)_minmax(420px,1.05fr)]">
      <section className="border-b border-line bg-slate-100 p-4 lg:border-b-0 lg:border-r">
        <div className="sticky top-4">
          <img
            src={`/api/artifacts/${artifact.id}/image`}
            alt="Original artifact"
            className="max-h-[72vh] w-full border border-line bg-white object-contain"
          />
        </div>
      </section>
      <section className="grid gap-4 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_120px]">
          <label className="grid gap-1 text-sm font-medium">
            Artifact type
            <select
              value={artifactType}
              onChange={(event) => setArtifactType(event.target.value as ArtifactType)}
              className="h-10 border border-line px-3 text-sm"
            >
              {artifactTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Confidence
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={confidence}
              onChange={(event) => setConfidence(event.target.value)}
              className="h-10 border border-line px-3 text-sm"
            />
          </label>
          <div className="grid gap-1 text-sm font-medium">
            Level
            <div className="flex h-10 items-center border border-line px-3 text-sm">{confidenceLabel}</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px]">
          <label className="grid gap-1 text-sm font-medium">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ArtifactCategory)}
              className="h-10 border border-line px-3 text-sm"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Subtype
            <select
              value={subtype}
              onChange={(event) => setSubtype(event.target.value as ArtifactSubtype)}
              className="h-10 border border-line px-3 text-sm"
            >
              {subtypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Class confidence
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={classificationConfidence}
              onChange={(event) => setClassificationConfidence(event.target.value)}
              className="h-10 border border-line px-3 text-sm"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Classification reasons
          <textarea
            value={classificationReasons}
            onChange={(event) => setClassificationReasons(event.target.value)}
            className="min-h-20 resize-y border border-line p-3 text-sm"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1 text-sm font-medium">
            OCR backend
            <div className="flex h-10 items-center border border-line px-3 text-sm">{artifact.ocr_backend}</div>
          </div>
          <div className="grid gap-1 text-sm font-medium">
            OCR confidence
            <div className="flex h-10 items-center border border-line px-3 text-sm">{artifact.ocr_confidence.toFixed(2)}</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1 text-sm font-medium">
            Interpretation backend
            <div className="flex h-10 items-center border border-line px-3 text-sm">{artifact.interpretation_backend}</div>
          </div>
          <div className="grid gap-1 text-sm font-medium">
            Interpretation confidence
            <div className="flex h-10 items-center border border-line px-3 text-sm">{artifact.interpretation_confidence.toFixed(2)}</div>
          </div>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Markdown
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            className="min-h-72 resize-y border border-line p-3 font-mono text-sm leading-6"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          JSON
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            className="min-h-64 resize-y border border-line p-3 font-mono text-sm leading-6"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Reviewer guidance notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-24 resize-y border border-line p-3 text-sm"
            placeholder="Point out what the next regeneration or export should focus on."
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={readOnly}
            className="inline-flex h-10 items-center gap-2 border border-line bg-white px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            title="Save draft"
          >
            <Save size={16} />
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => void submit("approved")}
            disabled={readOnly}
            className="inline-flex h-10 items-center gap-2 bg-pine px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            title="Approve artifact"
          >
            <Check size={16} />
            Approve
          </button>
          <button
            type="button"
            onClick={() => void submit("rejected")}
            disabled={readOnly}
            className="inline-flex h-10 items-center gap-2 bg-brick px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            title="Reject artifact"
          >
            <X size={16} />
            Reject
          </button>
          <button
            type="button"
            onClick={async () => {
              if (readOnly) {
                setStatus("Archived project artifacts cannot be regenerated.");
                return;
              }
              setStatus("Regenerating from image...");
              const response = await authFetch(`/api/artifacts/${artifact.id}/regenerate`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ reviewer_notes: notes })
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) {
                setStatus(result.error || "Regeneration failed. Check parser logs.");
                return;
              }
              const warnings = Array.isArray(result.warnings) ? result.warnings : [];
              const visionWarning = warnings.find((warning: string) => warning.includes("Vision interpretation unavailable"));
              setStatus(visionWarning || "Regenerated.");
              router.refresh();
            }}
            disabled={readOnly}
            className="inline-flex h-10 items-center gap-2 border border-line bg-white px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            title="Regenerate interpretation"
          >
            <RotateCcw size={16} />
            Regenerate
          </button>
          <span className="text-sm text-slate-600">{status}</span>
        </div>
      </section>
    </form>
  );
}
