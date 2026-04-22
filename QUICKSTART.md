# Quick Start (5 Minutes)

Get the full backend system running immediately.

---

## Prerequisites

- **Ollama** installed: https://ollama.ai
- **Docker & Docker Compose** installed
- **PDF file** to test with

---

## Step 1: Install & Pull Model (2 min)

```bash
# Install Ollama (if not already done)
# macOS: brew install ollama
# Linux: curl https://ollama.ai/install.sh | sh

# Pull the model (download ~4GB)
ollama pull llama3

# Verify it works
ollama list
```

---

## Step 2: Start All Services (1 min)

```bash
# From project root
docker-compose up
```

Wait for all services to be healthy:
```
✓ ollama is healthy
✓ python-backend is healthy
```

---

## Step 3: Test (2 min)

### Health Check
```bash
curl http://localhost:8000/health
```

### Parse a PDF
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@/path/to/syllabus.pdf"
```

You should get back:
```json
{
  "todos": [
    {"title": "...", "due_date": "2026-03-15", "type": "exam", "course": "..."},
    ...
  ]
}
```

---

## That's It! 🎉

### What's Running

- **Ollama** (LLM) at `http://localhost:11434`
- **Python Backend** (Parser) at `http://localhost:8000`
- **Node.js Backend** (Optional) at `http://localhost:3000`

### Common Commands

```bash
# View logs
docker-compose logs -f python-backend

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Check what's running
docker-compose ps
```

---

## Next Steps

- See [SETUP.md](SETUP.md) for detailed setup & troubleshooting
- See [API_EXAMPLES.md](API_EXAMPLES.md) for API usage examples
- See [python-backend/README.md](python-backend/README.md) for backend docs

---

## Troubleshooting

**"Could not connect to Ollama"**
```bash
# Ensure ollama is running
ollama serve  # in another terminal
```

**"Python backend not responding"**
```bash
# Check logs
docker-compose logs python-backend

# Restart
docker-compose restart python-backend
```

**"Request timed out"**
- Large PDFs take longer (5-30 min depending on size)
- Wait for processing or increase timeout to 300+ seconds

**"Model not found"**
```bash
ollama pull llama3
```

---

## Local Development (No Docker)

```bash
# Terminal 1: Ollama
ollama serve

# Terminal 2: Python Backend
cd python-backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Terminal 3: Node.js (optional)
npm install
npm run dev
```

Then test the same way.

---

## One-Liner Test

```bash
curl -X POST http://localhost:8000/parse -F "file=@test.pdf" | jq '.todos | length'
```

Should print a number (number of extracted assignments).

---

## Architecture Overview

```
┌──────────────┐
│  Your PDF    │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│  Python Backend      │◄──── PDFs, HTTP requests
│  (FastAPI)           │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Ollama LLM          │◄──── Text extraction, LLM processing
│  (llama3)            │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Structured JSON     │◄──── Parsed assignments & dates
│  (Todos)             │
└──────────────────────┘
```

---

## File Structure

```
python-backend/              ← New Python service
├── app/main.py             ← FastAPI endpoints
├── app/pdf_parser.py       ← PDF text extraction
├── app/llm_client.py       ← Ollama API calls
├── app/prompt.py           ← LLM instructions
├── app/utils.py            ← Text chunking, JSON parsing
├── requirements.txt        ← Python dependencies
└── Dockerfile              ← Container image

docker-compose.yml          ← Start all services
SETUP.md                    ← Detailed setup guide
API_EXAMPLES.md             ← Usage examples
QUICKSTART.md               ← This file
test-llm-backend.sh         ← Test script
```

---

## Performance Expectations

| PDF Size | Time | Notes |
|----------|------|-------|
| 1-5 pages | 10-20s | Quick |
| 5-10 pages | 20-40s | Normal |
| 10-20 pages | 40-60s | Slow |
| 20+ pages | 60-300s | Very slow |

Times vary based on:
- Your CPU/GPU speed
- Model size (llama3 7B vs mistral 7B)
- PDF complexity
- System load

---

## Key Endpoints

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/health` | Health check |
| POST | `/parse` | Parse PDF (returns todos) |
| POST | `/api/parse-syllabus` | Node.js proxy |

---

## Environment Variables (Optional)

Create `.env`:
```
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=llama3
OLLAMA_TIMEOUT=120
PYTHON_BACKEND_URL=http://localhost:8000
LOG_LEVEL=INFO
```

---

## Production Ready?

The system is production-ready with:
- ✓ Error handling (corrupt PDFs, network errors, timeouts)
- ✓ Logging & monitoring hooks
- ✓ Docker containerization
- ✓ Health checks
- ✓ JSON validation
- ✓ Deduplication
- ✓ Resource limits

Just add:
- Authentication (API keys, JWT)
- HTTPS/TLS
- Rate limiting
- Monitoring (Prometheus, NewRelic)
- Persistent storage for results
- Backup strategy for LLM cache

See [SETUP.md](SETUP.md) Production section for details.

---

## Support

- **Setup issues?** → See [SETUP.md](SETUP.md)
- **API help?** → See [API_EXAMPLES.md](API_EXAMPLES.md)
- **Backend docs?** → See [python-backend/README.md](python-backend/README.md)
- **Ollama help?** → https://ollama.ai

---

## Success Indicators ✓

When everything is working:

1. **Health check responds:**
   ```bash
   curl http://localhost:8000/health
   {"status": "ok", "service": "syllabus-parser"}
   ```

2. **PDF parsing works:**
   ```bash
   curl -X POST http://localhost:8000/parse -F "file=@test.pdf"
   {"todos": [...]}
   ```

3. **Logs show progress:**
   ```bash
   docker-compose logs -f python-backend | grep -i "extracted"
   ```

Good luck! 🚀

