import base64
import mimetypes
import uuid
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image

from app.models.schemas import ArtifactCategory, ArtifactSubtype, ArtifactType, ExtractedArtifact, ParseResponse
from app.services.classifier import classify_artifact
from app.services.interpreter import build_interpretation
from app.services.llm import apply_reviewer_guidance, interpret_image_with_claude
from app.services.ocr import extract_ocr

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
ODF_SUFFIXES = {"odt", "odp", "ods", "odg"}


@dataclass
class ImageCandidate:
    filename: str
    mime_type: str
    bytes_data: bytes
    page_number: int | None = None


def parse_source_document(filename: str, content: bytes, run_vision: bool = False) -> ParseResponse:
    suffix = Path(filename).suffix.lower().lstrip(".")
    warnings: list[str] = []
    candidates: list[ImageCandidate] = []
    page_count: int | None = None

    if suffix == "docx":
        candidates, doc_warnings = extract_docx_images(filename, content)
        warnings.extend(doc_warnings)
    elif suffix in ODF_SUFFIXES:
        candidates, doc_warnings = extract_odf_images(filename, content)
        warnings.extend(doc_warnings)
    elif suffix == "pdf":
        candidates, page_count, pdf_warnings = extract_pdf_images(filename, content)
        warnings.extend(pdf_warnings)
    elif suffix in {"png", "jpg", "jpeg", "webp"}:
        mime_type = mimetypes.types_map.get(f".{suffix}", "image/png")
        candidates = [ImageCandidate(filename=filename, mime_type=mime_type, bytes_data=content)]
        page_count = 1
    else:
        warnings.append(f"Unsupported file type: {suffix}")

    artifacts: list[ExtractedArtifact] = []
    for candidate in candidates:
        artifact, artifact_warnings = interpret_image_candidate(filename, candidate, run_vision=run_vision)
        warnings.extend(artifact_warnings)
        artifacts.append(artifact)

    return ParseResponse(
        source_filename=filename,
        file_type=suffix,
        page_count=page_count,
        artifacts=artifacts,
        warnings=dedupe(warnings),
    )


def interpret_image_candidate(
    source_filename: str,
    candidate: ImageCandidate,
    artifact_id: str | None = None,
    reviewer_notes: str = "",
    run_vision: bool = True,
) -> tuple[ExtractedArtifact, list[str]]:
    artifact_id = artifact_id or str(uuid.uuid4())
    warnings: list[str] = []
    ocr_result = extract_ocr(candidate.bytes_data)
    warnings.extend(ocr_result.warnings)
    image_base64 = base64.b64encode(candidate.bytes_data).decode("ascii")

    vision = None
    if run_vision:
        try:
            vision = interpret_image_with_claude(
                image_base64=image_base64,
                mime_type=candidate.mime_type,
                source_document=source_filename,
                page_number=candidate.page_number,
                artifact_id=artifact_id,
                raw_ocr_text=ocr_result.raw_text,
                ocr_backend=ocr_result.backend,
                ocr_confidence=ocr_result.confidence,
                reviewer_notes=reviewer_notes,
            )
        except Exception as exc:
            warnings.append(f"Vision interpretation unavailable: {exc}")
    else:
        warnings.append("Vision interpretation deferred during upload; use Regenerate on the artifact for Claude enrichment.")

    if vision:
        json_output = vision.json_output
        json_output["layout_data"] = ocr_result.layout_data
        return (
            ExtractedArtifact(
                source_filename=source_filename,
                page_number=candidate.page_number,
                image_filename=candidate.filename,
                image_mime_type=candidate.mime_type,
                image_base64=image_base64,
                artifact_type=vision.artifact_type,
                confidence=vision.confidence,
                category=vision.category,
                subtype=vision.subtype,
                classification_confidence=vision.classification_confidence,
                classification_reasons=vision.classification_reasons,
                ocr_backend=ocr_result.backend,
                ocr_confidence=ocr_result.confidence,
                interpretation_backend=vision.backend,
                interpretation_confidence=vision.confidence,
                raw_ocr_text=ocr_result.raw_text,
                layout_data=ocr_result.layout_data,
                layout_summary=str(json_output.get("layout_summary", "Vision-generated artifact interpretation.")),
                ui_elements=list(json_output.get("ui_elements", [])),
                markdown_output=vision.markdown_output,
                json_output=json_output,
            ),
            warnings,
        )

    width, height = image_dimensions(candidate.bytes_data)
    classification = classify_artifact(ocr_result.raw_text, width, height, ocr_result.layout_data)
    artifact_type = classification.artifact_type
    confidence = classification.confidence if ocr_result.raw_text else 0.25
    if confidence < 0.45:
        artifact_type = ArtifactType.unknown_manual_review
        category = ArtifactCategory.unknown_manual_review
        subtype = ArtifactSubtype.unknown_manual_review
    else:
        category = classification.category
        subtype = classification.subtype
    markdown, json_output = build_interpretation(
        artifact_id=artifact_id,
        source_document=source_filename,
        page_number=candidate.page_number,
        artifact_type=artifact_type,
        confidence=confidence,
        category=category,
        subtype=subtype,
        classification_confidence=classification.confidence,
        classification_reasons=classification.reasons,
        raw_ocr_text=ocr_result.raw_text,
        image_filename=candidate.filename,
        ocr_backend=ocr_result.backend,
        ocr_confidence=ocr_result.confidence,
    )
    json_output["ocr_backend"] = ocr_result.backend
    json_output["ocr_confidence"] = round(ocr_result.confidence, 2)
    json_output["interpretation_backend"] = "local_template"
    json_output["interpretation_confidence"] = confidence
    json_output["layout_data"] = ocr_result.layout_data
    if reviewer_notes:
        markdown = apply_reviewer_guidance(markdown, json_output, reviewer_notes)
    return (
        ExtractedArtifact(
            source_filename=source_filename,
            page_number=candidate.page_number,
            image_filename=candidate.filename,
            image_mime_type=candidate.mime_type,
            image_base64=image_base64,
            artifact_type=artifact_type,
            confidence=confidence,
            category=category,
            subtype=subtype,
            classification_confidence=classification.confidence,
            classification_reasons=classification.reasons,
            ocr_backend=ocr_result.backend,
            ocr_confidence=ocr_result.confidence,
            interpretation_backend="local_template",
            interpretation_confidence=confidence,
            raw_ocr_text=ocr_result.raw_text,
            layout_data=ocr_result.layout_data,
            layout_summary=json_output["layout_summary"],
            ui_elements=json_output["ui_elements"],
            markdown_output=markdown,
            json_output=json_output,
        ),
        warnings,
    )


def extract_docx_images(filename: str, content: bytes) -> tuple[list[ImageCandidate], list[str]]:
    warnings: list[str] = []
    candidates: list[ImageCandidate] = []
    with zipfile.ZipFile(BytesIO(content)) as archive:
        media_names = [
            name
            for name in archive.namelist()
            if name.startswith("word/media/") and Path(name).suffix.lower() in IMAGE_SUFFIXES
        ]
        candidates = candidates_from_zip_media(filename, archive, media_names)
    if not candidates:
        warnings.append("No embedded images found in DOCX.")
    return candidates, warnings


def extract_odf_images(filename: str, content: bytes) -> tuple[list[ImageCandidate], list[str]]:
    warnings: list[str] = []
    candidates: list[ImageCandidate] = []
    with zipfile.ZipFile(BytesIO(content)) as archive:
        media_names = [
            name
            for name in archive.namelist()
            if Path(name).suffix.lower() in IMAGE_SUFFIXES
            and not name.startswith("Thumbnails/")
            and not name.startswith("Configurations2/")
        ]
        candidates = candidates_from_zip_media(filename, archive, media_names)
    if not candidates:
        warnings.append("No embedded images found in OpenDocument file.")
    return candidates, warnings


def candidates_from_zip_media(filename: str, archive: zipfile.ZipFile, media_names: list[str]) -> list[ImageCandidate]:
    candidates: list[ImageCandidate] = []
    for index, media_name in enumerate(media_names, start=1):
        data = archive.read(media_name)
        suffix = Path(media_name).suffix.lower()
        mime_type = mimetypes.types_map.get(suffix, "image/png")
        candidates.append(
            ImageCandidate(
                filename=f"{Path(filename).stem}-image-{index}{suffix or '.png'}",
                mime_type=mime_type,
                bytes_data=data,
                page_number=None,
            )
        )
    return candidates


def extract_pdf_images(filename: str, content: bytes) -> tuple[list[ImageCandidate], int | None, list[str]]:
    warnings: list[str] = []
    candidates: list[ImageCandidate] = []
    try:
        import fitz

        document = fitz.open(stream=content, filetype="pdf")
        for page_index in range(len(document)):
            page = document[page_index]
            image_refs = page.get_images(full=True)
            if image_refs:
                for image_index, image_ref in enumerate(image_refs, start=1):
                    xref = image_ref[0]
                    extracted = document.extract_image(xref)
                    image_bytes = extracted["image"]
                    extension = extracted.get("ext", "png")
                    candidates.append(
                        ImageCandidate(
                            filename=f"{Path(filename).stem}-page-{page_index + 1}-image-{image_index}.{extension}",
                            mime_type=f"image/{'jpeg' if extension == 'jpg' else extension}",
                            bytes_data=image_bytes,
                            page_number=page_index + 1,
                        )
                    )
            else:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                candidates.append(
                    ImageCandidate(
                        filename=f"{Path(filename).stem}-page-{page_index + 1}.png",
                        mime_type="image/png",
                        bytes_data=pixmap.tobytes("png"),
                        page_number=page_index + 1,
                    )
                )
        return candidates, len(document), warnings
    except Exception as exc:  # pragma: no cover - depends on optional native package
        warnings.append(f"PDF extraction unavailable: {exc}")
        return candidates, None, warnings


def image_dimensions(content: bytes) -> tuple[int | None, int | None]:
    try:
        with Image.open(BytesIO(content)) as image:
            return image.width, image.height
    except Exception:
        return None, None


def dedupe(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
