import os
from pathlib import Path

# Ollama Configuration
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))

# File Upload Configuration
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB

# Text Processing
CHUNK_SIZE = 4000  # characters
CHUNK_OVERLAP = 200  # characters

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# FastAPI
API_HOST = "0.0.0.0"
API_PORT = int(os.getenv("PORT", "8000"))
