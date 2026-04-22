# Syllabus Parser Backend

A FastAPI service that extracts assignments and deadlines from PDF syllabi using a local LLM (Ollama).

## Architecture

- **PDF Extraction**: PyMuPDF (fitz)
- **LLM Inference**: Ollama (local, llama3)
- **API Framework**: FastAPI
- **Language**: Python 3.11+

## Quick Start (Local Development)

### Prerequisites

1. **Install Ollama**
   ```bash
   # macOS
   brew install ollama
   # or download from https://ollama.ai

   # Linux
   curl https://ollama.ai/install.sh | sh
   ```

2. **Pull model**
   ```bash
   ollama pull llama3
   ```

3. **Start Ollama server** (in background or separate terminal)
   ```bash
   ollama serve
   ```
   Ollama will be available at `http://localhost:11434`

### Setup Python Environment

```bash
# Navigate to python-backend
cd python-backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Run FastAPI Server

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Server will be available at `http://localhost:8000`

### Test the API

```bash
# Health check
curl http://localhost:8000/health

# Parse a PDF (replace with your PDF path)
curl -X POST http://localhost:8000/parse \
  -F "file=@/path/to/syllabus.pdf"
```

### Example Response

```json
{
  "todos": [
    {
      "title": "Midterm Exam",
      "due_date": "2026-03-15",
      "type": "exam",
      "course": "CS 101"
    },
    {
      "title": "Assignment 3",
      "due_date": "2026-03-20",
      "type": "homework",
      "course": "CS 101"
    }
  ]
}
```

## Docker Deployment

### Prerequisites

- Docker and Docker Compose installed

### Run with Docker Compose

From the project root:

```bash
docker-compose up
```

This will start:
- Ollama server on `http://localhost:11434`
- Python backend on `http://localhost:8000`
- Node.js backend on `http://localhost:3000`

### Run Python Backend Only

```bash
docker build -t syllabus-parser-backend python-backend/
docker run -p 8000:8000 \
  -e OLLAMA_URL=http://ollama:11434 \
  -e OLLAMA_MODEL=llama3 \
  syllabus-parser-backend
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3` | Model to use (llama3, mistral, etc) |
| `OLLAMA_TIMEOUT` | `60` | Request timeout in seconds |
| `PORT` | `8000` | FastAPI server port |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |

## API Reference

### POST /parse

Parse a PDF syllabus and extract structured assignments/deadlines.

**Request**:
```
POST /parse
Content-Type: multipart/form-data

file: <PDF binary>
```

**Response** (200 OK):
```json
{
  "todos": [
    {
      "title": "string",
      "due_date": "YYYY-MM-DD",
      "type": "homework | quiz | exam | project | lab | paper | presentation",
      "course": "string"
    }
  ]
}
```

**Error Responses**:

- **400 Bad Request**: Invalid PDF, no extractable text, or invalid LLM response
- **413 Payload Too Large**: File exceeds 50MB
- **503 Service Unavailable**: Ollama not reachable
- **504 Gateway Timeout**: LLM request timed out after retries
- **500 Internal Server Error**: Unexpected error

### GET /health

Health check endpoint.

**Response** (200 OK):
```json
{
  "status": "ok",
  "service": "syllabus-parser"
}
```

## Troubleshooting

### "Could not connect to Ollama"
- Ensure Ollama is running: `ollama serve`
- Check Ollama URL: default is `http://localhost:11434`
- If using Docker, ensure container can reach Ollama at `http://ollama:11434`

### "LLM request timed out"
- Increase `OLLAMA_TIMEOUT` (in seconds)
- Ensure Ollama has sufficient resources (RAM, CPU)
- Check if model is fully loaded: `ollama list`

### "PDF contains no extractable text"
- PDF may be image-based (scanned document) — OCR not supported
- PDF may be corrupted — try opening in PDF reader

### "Invalid JSON from LLM"
- Model may not be instruction-tuned well
- Try a different model: `ollama pull mistral`
- Increase number of retries in code

## Performance Notes

- **Chunk Size**: 4000 characters with 200-char overlap (configurable in `config.py`)
- **Large PDFs**: Split into multiple chunks, each processed separately
- **LLM Temperature**: Set to 0.1 for consistent, reproducible output
- **Memory**: llama3 (7B) requires ~4GB RAM, mistral (7B) requires ~3.5GB

## Development

### Project Structure

```
app/
├── __init__.py         # Package init
├── main.py             # FastAPI app and endpoints
├── pdf_parser.py       # PDF text extraction
├── llm_client.py       # Ollama API wrapper
├── prompt.py           # LLM prompt templates
├── utils.py            # Utilities (chunking, JSON parsing, date normalization)
└── config.py           # Configuration and environment variables
```

### Adding Features

1. **New extraction capability**: Add function to `utils.py`
2. **Different LLM**: Update `llm_client.py`
3. **Custom prompts**: Update `prompt.py` templates
4. **PDF handling**: Enhance `pdf_parser.py`

### Logging

Enable DEBUG logging:
```bash
LOG_LEVEL=DEBUG uvicorn app.main:app --reload
```

## Production Checklist

- [ ] Set up Ollama on dedicated server or GPU machine
- [ ] Use appropriate model size (llama3 7B, mistral 7B, or larger)
- [ ] Set `OLLAMA_TIMEOUT` appropriately for model size
- [ ] Enable HTTPS for file uploads
- [ ] Add authentication/authorization
- [ ] Set up monitoring and alerting
- [ ] Use persistent volumes for Ollama model cache
- [ ] Set resource limits in docker-compose or K8s
- [ ] Configure backup/recovery strategy

## License

MIT
