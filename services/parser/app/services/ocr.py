import os
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from functools import lru_cache
from io import BytesIO
from typing import Any

from PIL import Image


@dataclass
class RawOcrResult:
    backend: str
    payload: Any
    warnings: list[str] = field(default_factory=list)


@dataclass
class NormalizedOcrResult:
    backend: str
    raw_text: str
    confidence: float
    layout_data: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class OcrAdapter(ABC):
    name: str

    @abstractmethod
    def extract_text(self, image_bytes: bytes) -> RawOcrResult:
        """Extract raw provider-specific OCR data from an image."""

    @abstractmethod
    def normalize_result(self, raw_result: RawOcrResult) -> NormalizedOcrResult:
        """Convert provider-specific OCR data into the parser contract."""

    @abstractmethod
    def get_confidence(self, raw_result: RawOcrResult) -> float:
        """Return a 0..1 confidence score for the provider result."""

    def extract_normalized(self, image_bytes: bytes) -> NormalizedOcrResult:
        raw_result = self.extract_text(image_bytes)
        return self.normalize_result(raw_result)


class PaddleOcrAdapter(OcrAdapter):
    name = "paddleocr"

    def __init__(self) -> None:
        try:
            from paddleocr import PaddleOCR
        except Exception as exc:  # pragma: no cover - optional heavy dependency
            raise RuntimeError(f"PaddleOCR is unavailable: {exc}") from exc

        language = os.getenv("OCR_PADDLE_LANG", "en")
        try:
            self.engine = PaddleOCR(
                lang=language,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=True,
            )
        except TypeError:
            self.engine = PaddleOCR(lang=language, use_angle_cls=True)

    def extract_text(self, image_bytes: bytes) -> RawOcrResult:
        with tempfile.NamedTemporaryFile(suffix=".png") as image_file:
            image_file.write(image_bytes)
            image_file.flush()
            payload = self.engine.predict(image_file.name)
        return RawOcrResult(backend=self.name, payload=payload)

    def normalize_result(self, raw_result: RawOcrResult) -> NormalizedOcrResult:
        lines = flatten_paddle_payload(raw_result.payload)
        text_lines = [line["text"] for line in lines if line["text"]]
        confidence = self.get_confidence(raw_result)
        return NormalizedOcrResult(
            backend=self.name,
            raw_text="\n".join(text_lines),
            confidence=confidence,
            layout_data=lines,
            warnings=raw_result.warnings,
        )

    def get_confidence(self, raw_result: RawOcrResult) -> float:
        lines = flatten_paddle_payload(raw_result.payload)
        confidences = [line["confidence"] for line in lines if isinstance(line.get("confidence"), (int, float))]
        if not confidences:
            return 0.0
        return clamp(sum(confidences) / len(confidences))


class TesseractAdapter(OcrAdapter):
    name = "tesseract"

    def extract_text(self, image_bytes: bytes) -> RawOcrResult:
        try:
            import pytesseract
            from pytesseract import Output

            with Image.open(BytesIO(image_bytes)) as image:
                payload = pytesseract.image_to_data(image, output_type=Output.DICT)
            return RawOcrResult(backend=self.name, payload=payload)
        except Exception as exc:  # pragma: no cover - depends on local native tools
            raise RuntimeError(f"Tesseract OCR is unavailable: {exc}") from exc

    def normalize_result(self, raw_result: RawOcrResult) -> NormalizedOcrResult:
        payload = raw_result.payload
        layout_data: list[dict[str, Any]] = []
        text_lines: list[str] = []
        count = len(payload.get("text", []))
        for index in range(count):
            text = str(payload["text"][index]).strip()
            confidence = parse_confidence(payload.get("conf", ["-1"])[index])
            if not text:
                continue
            text_lines.append(text)
            layout_data.append(
                {
                    "text": text,
                    "confidence": confidence,
                    "bbox": [
                        payload.get("left", [0])[index],
                        payload.get("top", [0])[index],
                        payload.get("width", [0])[index],
                        payload.get("height", [0])[index],
                    ],
                }
            )
        return NormalizedOcrResult(
            backend=self.name,
            raw_text="\n".join(text_lines),
            confidence=self.get_confidence(raw_result),
            layout_data=layout_data,
            warnings=raw_result.warnings,
        )

    def get_confidence(self, raw_result: RawOcrResult) -> float:
        confidences = [
            parse_confidence(value)
            for value in raw_result.payload.get("conf", [])
            if parse_confidence(value) >= 0
        ]
        if not confidences:
            return 0.0
        return clamp(sum(confidences) / len(confidences) / 100)


class ManualReviewOcrAdapter(OcrAdapter):
    name = "manual_review"

    def extract_text(self, image_bytes: bytes) -> RawOcrResult:
        return RawOcrResult(
            backend=self.name,
            payload={"text": "", "layout": []},
            warnings=["No OCR backend was available; artifact was created for manual review."],
        )

    def normalize_result(self, raw_result: RawOcrResult) -> NormalizedOcrResult:
        return NormalizedOcrResult(
            backend=self.name,
            raw_text="",
            confidence=0.0,
            layout_data=[],
            warnings=raw_result.warnings,
        )

    def get_confidence(self, raw_result: RawOcrResult) -> float:
        return 0.0


def extract_ocr(image_bytes: bytes) -> NormalizedOcrResult:
    min_confidence = float(os.getenv("OCR_MIN_CONFIDENCE", "0.45"))
    adapter_names = [
        os.getenv("OCR_PRIMARY_BACKEND", "paddleocr"),
        os.getenv("OCR_FALLBACK_BACKEND", "tesseract"),
        "manual_review",
    ]

    warnings: list[str] = []
    best_result: NormalizedOcrResult | None = None
    for adapter_name in adapter_names:
        try:
            adapter = build_adapter(adapter_name)
            result = adapter.extract_normalized(image_bytes)
            result.warnings = warnings + result.warnings
            if best_result is None or result.confidence > best_result.confidence:
                best_result = result
            if result.confidence >= min_confidence:
                return result
            warnings.append(f"{adapter.name} confidence {result.confidence:.2f} below threshold {min_confidence:.2f}.")
        except Exception as exc:
            warnings.append(str(exc))

    if best_result:
        best_result.warnings = warnings + best_result.warnings
        return best_result
    return ManualReviewOcrAdapter().extract_normalized(image_bytes)


@lru_cache(maxsize=4)
def build_adapter(name: str) -> OcrAdapter:
    normalized = name.strip().lower()
    if normalized == "paddleocr":
        return PaddleOcrAdapter()
    if normalized == "tesseract":
        return TesseractAdapter()
    if normalized in {"manual", "manual_review", "none"}:
        return ManualReviewOcrAdapter()
    raise RuntimeError(f"Unknown OCR backend configured: {name}")


def flatten_paddle_payload(payload: Any) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    if not payload:
        return lines

    pages = payload if isinstance(payload, list) else [payload]
    for page in pages:
        page_json = getattr(page, "json", None)
        if isinstance(page_json, dict):
            page = page_json.get("res", page_json)

        if isinstance(page, dict) and isinstance(page.get("rec_texts"), list):
            scores = page.get("rec_scores") or []
            boxes = page.get("rec_polys") or page.get("dt_polys") or page.get("rec_boxes") or []
            for index, text_value in enumerate(page["rec_texts"]):
                text = str(text_value).strip()
                if not text:
                    continue
                confidence = scores[index] if index < len(scores) else 0.0
                bbox = boxes[index] if index < len(boxes) else []
                lines.append({"text": text, "confidence": clamp(float(confidence)), "bbox": normalize_bbox(bbox)})
            continue

        page_items = page if isinstance(page, list) else [page]
        for item in page_items:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            bbox = item[0]
            text_payload = item[1]
            if isinstance(text_payload, (list, tuple)) and len(text_payload) >= 2:
                text = str(text_payload[0]).strip()
                confidence = clamp(float(text_payload[1]))
                lines.append({"text": text, "confidence": confidence, "bbox": bbox})
    return lines


def normalize_bbox(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def parse_confidence(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return -1.0


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
