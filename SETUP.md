# Syllabus-Sync-Central Complete Backend Setup Guide

This guide covers the complete setup for running the full backend system locally:
1. **Ollama LLM Server** - Local language model inference
2. **Python FastAPI Backend** - Syllabus parsing service
3. **Node.js Express Backend** - Main application server

---

## System Requirements

- **macOS** (Apple Silicon or Intel) or **Linux** (Ubuntu 20.04+)
- **Docker & Docker Compose** (for containerized deployment)
- **Python 3.11+** (for local development)
- **Node.js 18+** (already installed)
- **RAM**: 12GB+ (8GB minimum if only running Ollama + Python)
- **Disk**: 20GB+ free space (for Ollama models)

---

## Quick Start (Docker Compose - Recommended)

The easiest way to get everything running together.

### 1. Install Ollama

Download and install from [https://ollama.ai](https://ollama.ai)

### 2. Pre-pull the Model

```bash
ollama pull llama3
```

This ensures the model is available when Docker starts.

### 3. Configure Environment

Copy the example env file:
```bash
cp .env.example .env
```

Update `.env` with your configuration (or keep defaults for local development):
```bash
# .env
PYTHON_BACKEND_URL=http://python-backend:8000  # Use Docker service name
OLLAMA_URL=http://ollama:11434                  # Use Docker service name
OLLAMA_MODEL=llama3
```

### 4. Start the Full Stack

```bash
docker-compose up
```

This will start:
- **Ollama** at `http://localhost:11434`
- **Python Backend** at `http://localhost:8000`
- **Node.js Backend** (if configured) at `http://localhost:3000`

### 5. Test the System

```bash
# Health check
curl http://localhost:8000/health

# Parse a PDF
curl -X POST http://localhost:8000/parse \
  -F "file=@/path/to/syllabus.pdf"

# Via Node proxy (once Node is running)
curl -X POST http://localhost:3000/api/parse-syllabus \
  -F "file=@/path/to/syllabus.pdf"
```

---

## Local Development (Without Docker)

For development with auto-reload and debugging.

### 1. Install Ollama

macOS:
```bash
brew install ollama
```

Linux:
```bash
curl https://ollama.ai/install.sh | sh
```

### 2. Start Ollama Server (in separate terminal)

```bash
# Pull the model
ollama pull llama3

# Start server
ollama serve
```

Server runs at `http://localhost:11434`

### 3. Setup Python Backend

```bash
cd python-backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create uploads directory
mkdir -p uploads
```

### 4. Start Python Backend (in another terminal)

```bash
cd python-backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Backend available at `http://localhost:8000`

### 5. Setup Node.js Backend

```bash
# From project root
npm install

# Create .env
cp .env.example .env
# Edit .env and set:
PYTHON_BACKEND_URL=http://localhost:8000
```

### 6. Start Node.js Backend (in another terminal)

```bash
npm run dev
```

Backend available at `http://localhost:3000`

### 7. Test Locally

```bash
# Test Python backend directly
curl -X POST http://localhost:8000/parse \
  -F "file=@/path/to/syllabus.pdf"

# Test Node proxy
curl -X POST http://localhost:3000/api/parse-syllabus \
  -F "file=@/path/to/syllabus.pdf"
```

---

## File Structure

```
Syllabus-Sync-Central/
├── python-backend/                # New Python FastAPI service
│   ├── app/
│   │   ├── main.py               # FastAPI endpoints
│   │   ├── pdf_parser.py         # PDF text extraction (PyMuPDF)
│   │   ├── llm_client.py         # Ollama API client
│   │   ├── prompt.py             # LLM prompts
│   │   ├── utils.py              # Utilities (chunking, JSON parsing)
│   │   ├── config.py             # Configuration
│   │   └── __init__.py
│   ├── uploads/                  # Temporary PDF storage
│   ├── Dockerfile                # Container definition
│   ├── .dockerignore
│   ├── requirements.txt          # Python dependencies
│   └── README.md                 # Detailed Python backend docs
│
├── server/                       # Existing Node.js backend
│   ├── routes.ts                # Updated with Python proxy
│   ├── index.ts
│   └── ...
│
├── docker-compose.yml           # All services (NEW)
├── .env.example                 # Environment template (NEW)
├── SETUP.md                     # This file (NEW)
└── ...
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User/Client                              │
│                   (Browser/Mobile App)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                     ┌─────▼─────┐
                     │  Node.js   │ :3000
                     │  Express   │
                     │  Backend   │
                     └─────┬─────┘
                           │
                 ┌─────────┴──────────┐
                 │                    │
           Local Parser         Proxy to Python
              (regex)               (LLM)
                 │                    │
                 │            ┌──────▼───────┐
                 │            │  Python      │ :8000
                 │            │  FastAPI     │
                 │            │  Backend     │
                 │            └──────┬───────┘
                 │                   │
                 │           ┌───────▼────────┐
                 │           │  Ollama LLM    │ :11434
                 │           │  (llama3)      │
                 │           └────────────────┘
                 │
        ┌────────▼────────┐
        │   Database      │
        │   (SQLite/PG)   │
        └─────────────────┘
```

**Flow**:
1. User uploads PDF to Node.js (`/api/parse-syllabus`)
2. Node.js proxies to Python backend (`http://python-backend:8000/parse`)
3. Python backend extracts PDF text (PyMuPDF) and sends to Ollama
4. Ollama (llama3) structures the output as JSON
5. Python backend deduplicates and returns clean todo list
6. Node.js stores results in database and returns to user

---

## Environment Variables

### Python Backend (docker-compose or .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://ollama:11434` | Ollama service endpoint |
| `OLLAMA_MODEL` | `llama3` | Model name (llama3, mistral, etc) |
| `OLLAMA_TIMEOUT` | `120` | Request timeout in seconds |
| `LOG_LEVEL` | `INFO` | Logging level |
| `PORT` | `8000` | FastAPI port |

### Node.js Backend (docker-compose or .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTHON_BACKEND_URL` | `http://localhost:8000` | Python backend URL |
| `PORT` | `3000` | Node.js server port |
| `OPENAI_API_KEY` | (optional) | For other AI features |

---

## API Endpoints

### Python Backend

**POST /parse**
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@syllabus.pdf"
```

Response (200 OK):
```json
{
  "todos": [
    {
      "title": "Midterm Exam",
      "due_date": "2026-03-15",
      "type": "exam",
      "course": "CS 101"
    }
  ]
}
```

**GET /health**
```bash
curl http://localhost:8000/health
```

### Node.js Backend

**POST /api/parse-syllabus** (proxies to Python backend)
```bash
curl -X POST http://localhost:3000/api/parse-syllabus \
  -F "file=@syllabus.pdf"
```

---

## Troubleshooting

### "Could not connect to Ollama"

**Problem**: Python backend can't reach Ollama

**Solution**:
- Ensure Ollama is running: `ollama serve`
- If using Docker, ensure service name is correct (`http://ollama:11434`)
- If using localhost, use `http://localhost:11434`
- Check firewall allows port 11434

### "Model not found: llama3"

**Solution**:
```bash
ollama pull llama3
```

### "Request timed out"

**Solution**:
- Increase `OLLAMA_TIMEOUT` in `.env` (default 120s)
- Ensure Ollama has sufficient RAM
- Check if model is fully loaded: `ollama list`

### "Python backend not reachable"

**Solution**:
- Ensure Python container is running: `docker-compose ps`
- Check logs: `docker-compose logs python-backend`
- If running locally, ensure Python service is running at `http://localhost:8000`

### "PDF contains no extractable text"

**Problem**: Scanned PDF (image-based), not text-based

**Solution**:
- Convert scanned PDF to text-based (use OCR software like tesseract)
- Or upload as DOCX/TXT instead

### "Invalid JSON from LLM"

**Problem**: Model output doesn't parse as JSON

**Solution**:
- Increase `OLLAMA_TIMEOUT` to allow model more thinking time
- Try smaller model if llama3 is too slow/inconsistent
- Check Ollama server logs for errors

---

## Performance Tuning

### For Slower Machines (4GB RAM)

Use a smaller model:
```bash
ollama pull mistral
```

Update `.env`:
```
OLLAMA_MODEL=mistral
OLLAMA_TIMEOUT=180  # Longer timeout for slower model
```

### For Faster Processing (8GB+ RAM)

Use a larger model:
```bash
ollama pull neural-chat
```

### For GPU Acceleration

If you have NVIDIA GPU (CUDA):
```bash
# Ollama auto-detects NVIDIA GPUs
# Just ensure nvidia-docker is installed
```

For more details: [Ollama GPU Support](https://github.com/ollama/ollama#gpu-support)

---

## Production Deployment

### Using Docker Compose

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Scale services (if needed)
docker-compose up -d --scale python-backend=2
```

### Kubernetes (Advanced)

See `kubernetes/` directory (if present) for Helm charts and manifests.

### Environment Setup

1. **Create `.env` from `.env.example`**
2. **Set production variables**:
   ```
   OLLAMA_URL=https://ollama.yourdomain.com  # Use HTTPS in production
   PYTHON_BACKEND_URL=https://api.yourdomain.com/python
   LOG_LEVEL=WARNING
   ```
3. **Ensure secure communication** (HTTPS/TLS)
4. **Set resource limits** in docker-compose or K8s
5. **Configure monitoring** (Prometheus, NewRelic, etc)
6. **Setup backups** for Ollama model cache
7. **Enable authentication** (JWT, API keys, etc)

---

## Development Workflow

### Adding a New Feature to Python Backend

1. Edit `python-backend/app/main.py` or relevant module
2. Test locally: `uvicorn app.main:app --reload`
3. Test with curl or Postman
4. Commit and push

### Adding a New Feature to Node.js Backend

1. Edit `server/routes.ts` or relevant file
2. Test locally: `npm run dev`
3. Commit and push

### Running Tests

```bash
# Python backend tests (if added)
cd python-backend
pytest tests/

# Node.js backend tests (if added)
npm test
```

---

## Useful Commands

### Ollama Management

```bash
# List available models
ollama list

# Pull a specific model
ollama pull llama3
ollama pull mistral

# Remove a model
ollama rm llama3

# Check model info
ollama show llama3
```

### Docker Compose

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f python-backend

# Stop all services
docker-compose down

# Rebuild images
docker-compose build

# Restart a service
docker-compose restart python-backend
```

### Python Backend (Local Dev)

```bash
# Install dependencies
pip install -r requirements.txt

# Run with auto-reload
uvicorn app.main:app --reload --port 8000

# Run with debug logging
LOG_LEVEL=DEBUG uvicorn app.main:app --reload

# Check dependencies for vulnerabilities
pip-audit

# Format code
black app/

# Lint code
ruff check app/
```

---

## Support & Troubleshooting

For detailed information:

1. **Python Backend Docs**: See [`python-backend/README.md`](python-backend/README.md)
2. **Ollama Docs**: https://ollama.ai
3. **FastAPI Docs**: https://fastapi.tiangolo.com
4. **Node.js Backend**: See existing documentation

---

## Quick Test Cases

### Test 1: Simple PDF

```bash
# Create a simple PDF with text
echo "Introduction to Programming\nProfessor: John Doe\nAssignments:\nAssignment 1 due March 15\nFinal Exam due May 1" > test.txt
# Convert to PDF (or use any simple PDF)

# Parse it
curl -X POST http://localhost:8000/parse -F "file=@test.pdf"
```

**Expected**: Extracts "Assignment 1" and "Final Exam" with dates

### Test 2: Complex PDF

Use one of the provided test syllabi:
- `/Users/retalsabbahi/Downloads/MA124 syllabus 2026.04.07.pdf`
- `/Users/retalsabbahi/Downloads/Syllabus(1) (3).pdf`

```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@MA124 syllabus 2026.04.07.pdf"
```

**Expected**: Multiple assignments with correctly parsed dates

### Test 3: Node.js Proxy

```bash
curl -X POST http://localhost:3000/api/parse-syllabus \
  -F "file=@MA124 syllabus 2026.04.07.pdf"
```

**Expected**: Same as direct Python endpoint

### Test 4: Error Handling

```bash
# Invalid file type
curl -X POST http://localhost:8000/parse \
  -F "file=@document.docx"
# Expected: 400 "File must be a PDF"

# Ollama unavailable
# Stop ollama, then try:
curl -X POST http://localhost:8000/parse \
  -F "file=@test.pdf"
# Expected: 503 "LLM service unavailable"
```

---

## Next Steps

1. ✅ **Setup**: Follow the Quick Start above
2. ✅ **Test**: Run the test cases
3. ✅ **Integrate**: Connect to frontend
4. ✅ **Deploy**: Follow production setup
5. ✅ **Monitor**: Setup logging and alerts

Good luck! 🚀

