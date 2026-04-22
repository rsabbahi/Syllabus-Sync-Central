import logging
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .llm_client import OllamaError, call_ollama_with_retry
from .pdf_parser import PDFParsingError, extract_text_from_pdf
from .prompt import get_extraction_prompt, get_repair_prompt
from .utils import chunk_text, extract_json_from_text, merge_chunks_json, safe_parse_json

# Configure logging
logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Syllabus Parser Backend",
    description="Extract assignments and deadlines from PDF syllabi using local LLM",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint for docker-compose."""
    return {"status": "ok", "service": "syllabus-parser"}


@app.post("/parse")
async def parse_syllabus(file: UploadFile = File(...)):
    """
    Parse a PDF syllabus and extract assignments/deadlines.

    Accepts multipart/form-data with 'file' field containing PDF.

    Returns:
        {
            "todos": [
                {"title": str, "due_date": str, "type": str, "course": str}
            ]
        }
    """
    logger.info(f"Received upload: {file.filename}")

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Validate file size
    content = await file.read()
    if len(content) > config.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {config.MAX_UPLOAD_SIZE / 1024 / 1024:.0f}MB"
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Save temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        logger.error(f"Failed to save upload: {e}")
        raise HTTPException(status_code=500, detail="Failed to save file")

    try:
        # Extract text from PDF
        try:
            pdf_text, page_count = extract_text_from_pdf(tmp_path)
            logger.info(f"Extracted text from {page_count} pages, {len(pdf_text)} chars")
        except PDFParsingError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Chunk text if needed
        chunks = chunk_text(pdf_text, chunk_size=config.CHUNK_SIZE, overlap=config.CHUNK_OVERLAP)
        logger.info(f"Split into {len(chunks)} chunks")

        # Process chunks
        chunk_responses = []
        for i, chunk in enumerate(chunks):
            logger.info(f"Processing chunk {i + 1}/{len(chunks)}")
            try:
                prompt = get_extraction_prompt(chunk)
                response_text = call_ollama_with_retry(prompt)

                # Try to extract JSON
                parsed = extract_json_from_text(response_text)
                if parsed is None:
                    # Retry with repair prompt
                    logger.warning("Invalid JSON, attempting repair...")
                    repair_response = call_ollama_with_retry(
                        get_repair_prompt(response_text)
                    )
                    parsed = extract_json_from_text(repair_response)

                if parsed is None:
                    logger.warning(f"Failed to parse JSON from chunk {i + 1}, skipping")
                    continue

                chunk_responses.append(parsed)
            except OllamaError as e:
                logger.error(f"LLM error on chunk {i + 1}: {e}")
                if i == 0:  # If first chunk fails, return error
                    raise HTTPException(status_code=503, detail=str(e))
                # Otherwise continue with remaining chunks

        if not chunk_responses:
            raise HTTPException(
                status_code=400,
                detail="Could not extract structured data from syllabus"
            )

        # Merge results
        merged = merge_chunks_json(chunk_responses, deduplicate=True)
        course_name = merged.get("course_name")
        tasks = merged.get("tasks", [])

        logger.info(f"Extracted {len(tasks)} tasks, course: {course_name}")

        # Convert to todo format
        todos = []
        for task in tasks:
            todo = {
                "title": task.get("title", ""),
                "due_date": task.get("due_date", ""),
                "type": task.get("type", ""),
                "course": course_name or ""
            }
            if todo["title"] and todo["due_date"]:  # Only include complete tasks
                todos.append(todo)

        return JSONResponse({"todos": todos})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        # Clean up temp file
        try:
            Path(tmp_path).unlink()
        except Exception as e:
            logger.warning(f"Failed to delete temp file: {e}")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Syllabus Parser Backend",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "parse": "POST /parse (multipart/form-data with 'file' PDF)"
        }
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=config.API_HOST,
        port=config.API_PORT,
        log_level=config.LOG_LEVEL.lower()
    )
