from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.models.schemas import InterpretRequest, OutputPackageRequest
from app.services.extractor import ImageCandidate, interpret_image_candidate, parse_source_document
from app.services.interpreter import generate_output_package, interpret_from_request

app = FastAPI(title="Screenshot Briefing Parser", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "screenshot-briefing-parser", "version": app.version}


@app.post("/parse/source-document")
async def parse_source(file: UploadFile = File(...), run_vision: bool = Form(False)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return await run_in_threadpool(parse_source_document, file.filename or "source-document", content, run_vision)


@app.post("/parse/images")
async def parse_images(files: list[UploadFile] = File(...)):
    artifacts = []
    warnings = []
    for file in files:
        response = await run_in_threadpool(parse_source_document, file.filename or "image", await file.read(), False)
        artifacts.extend(response.artifacts)
        warnings.extend(response.warnings)
    return {"artifacts": artifacts, "warnings": warnings}


@app.post("/classify/artifact")
def classify_artifact_endpoint(payload: InterpretRequest):
    markdown, json_output = interpret_from_request(payload)
    return {"markdown_output": markdown, "json_output": json_output}


@app.post("/interpret/artifact")
def interpret_artifact(payload: InterpretRequest):
    markdown, json_output = interpret_from_request(payload)
    return {"markdown_output": markdown, "json_output": json_output}


@app.post("/interpret/image")
async def interpret_image(
    file: UploadFile = File(...),
    source_document: str = Form("uploaded image"),
    artifact_id: str | None = Form(None),
    page_number: int | None = Form(None),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    artifact, warnings = await run_in_threadpool(
        interpret_image_candidate,
        source_document,
        ImageCandidate(
            filename=file.filename or "artifact-image",
            mime_type=file.content_type or "image/png",
            bytes_data=content,
            page_number=page_number,
        ),
        artifact_id,
    )
    return {"artifact": artifact, "warnings": warnings}


@app.post("/generate/output-package")
def generate_package(payload: OutputPackageRequest):
    return generate_output_package(payload)
