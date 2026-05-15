# Architecture Overview

## Summary

The system ingests DOCX, LibreOffice/OpenDocument, PDF, PNG, JPG, and WebP source files, extracts image artifacts, produces draft Markdown/JSON interpretations, requires human review, and generates implementation-ready output packages.

## Components

- `apps/web`: Next.js App Router UI and API routes for projects, uploads, reviews, and output generation.
- `services/parser`: FastAPI service for document image extraction, OCR orchestration, classification, interpretation, and package generation.
- `supabase/migrations`: Production schema, RLS policies, and storage bucket definitions.
- `data`: Local development store for source uploads, extracted artifacts, exports, and `dev-store.json`.

## Data Flow

1. User creates a project.
2. User uploads a DOCX, OpenDocument file, PDF, or image batch.
3. Next.js stores the source locally in dev mode and creates a processing job.
4. FastAPI extracts embedded images or renders PDF pages when needed.
5. OCR runs behind an internal adapter interface. PaddleOCR is preferred when installed, Tesseract is the fallback, and a manual-review adapter preserves the workflow if OCR is unavailable.
6. The parser normalizes raw OCR into text, backend name, confidence, optional layout data, Markdown, and JSON.
7. When a vision provider is configured, the parser analyzes the image directly and creates a coding-oriented Markdown/JSON brief. OCR is supporting evidence, not the final product.
8. The classifier assigns an artifact type and final confidence score when provider interpretation is unavailable.
9. Draft Markdown and JSON are stored with the artifact.
10. Reviewer edits and approves or rejects the artifact.
11. Output generation only uses approved artifacts.

## OCR Adapter Contract

The parsing service owns OCR provider selection. Adapters expose:

- `extract_text(image_or_doc) -> raw_result`
- `normalize_result(raw_result) -> normalized_result`
- `get_confidence(raw_result) -> confidence_score`

The web app and database consume only normalized fields, including `raw_ocr_text`, `ocr_backend`, `ocr_confidence`, `layout_data`, `markdown_output`, and `json_output`.

## Dependencies

- Node.js 20+
- Python 3.11+
- Optional preferred OCR: PaddleOCR for layout-aware extraction
- Optional fallback OCR: Tesseract installed on the laptop
- Optional production services: Supabase project and Vercel deployment
- Optional LLM provider: Anthropic/Claude API key for future provider-backed generation

## Key Decisions

- V1 is end-to-end runnable locally without a hosted Supabase project by using a local JSON store that mirrors the Supabase schema.
- The Supabase migration is still first-class and defines the production data contract.
- OCR and interpretation degrade gracefully, preserving the review workflow even when native OCR or LLM providers are unavailable.
- OCR backend experimentation is isolated to the parser service.
- Human approval is required before output generation.
