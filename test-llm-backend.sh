#!/bin/bash

# Test script for Python LLM backend
# Usage: ./test-llm-backend.sh [pdf_path]

set -e

PYTHON_URL="${PYTHON_BACKEND_URL:-http://localhost:8000}"
NODE_URL="${NODE_URL:-http://localhost:3000}"
PDF_FILE="${1:-}"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        Syllabus Parser LLM Backend Test Suite                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Health Check
echo "✓ TEST 1: Health Check"
echo "  Endpoint: GET /health"
response=$(curl -s -w "\n%{http_code}" "$PYTHON_URL/health")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" -eq 200 ]; then
  echo "  Status: ✓ OK ($http_code)"
  echo "  Response: $body"
else
  echo "  Status: ✗ FAILED ($http_code)"
  echo "  Response: $body"
  echo ""
  echo "⚠️  Python backend not responding. Make sure it's running:"
  echo "  cd python-backend && uvicorn app.main:app --port 8000"
  exit 1
fi
echo ""

# Test 2: Parse PDF (if provided)
if [ -z "$PDF_FILE" ]; then
  echo "⚠️  No PDF provided. To test PDF parsing:"
  echo "  ./test-llm-backend.sh /path/to/syllabus.pdf"
  echo ""
  exit 0
fi

if [ ! -f "$PDF_FILE" ]; then
  echo "✗ Error: File not found: $PDF_FILE"
  exit 1
fi

echo "✓ TEST 2: Parse PDF"
echo "  File: $PDF_FILE"
echo "  Endpoint: POST /parse"
echo "  Status: Processing..."
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST "$PYTHON_URL/parse" \
  -F "file=@$PDF_FILE" \
  --max-time 300)

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" -eq 200 ]; then
  echo "  Status: ✓ OK ($http_code)"
  echo ""

  # Parse JSON response
  todos=$(echo "$body" | jq '.todos | length' 2>/dev/null || echo "?")

  echo "  Response Summary:"
  echo "  ├─ Todos extracted: $todos"
  echo "  └─ Full response:"
  echo ""

  # Pretty print JSON
  echo "$body" | jq '.' 2>/dev/null || echo "$body"

  echo ""
  echo "✓ PDF parsing successful!"

elif [ "$http_code" -eq 400 ]; then
  echo "  Status: ✗ Bad Request ($http_code)"
  echo "  Message: $body"
  echo ""
  echo "  Possible causes:"
  echo "  • File is not a valid PDF"
  echo "  • File is password-protected"
  echo "  • PDF contains no extractable text (scanned image)"
  exit 1

elif [ "$http_code" -eq 503 ]; then
  echo "  Status: ✗ Service Unavailable ($http_code)"
  echo "  Message: $body"
  echo ""
  echo "  Make sure Ollama is running:"
  echo "  • Check: ollama serve (in another terminal)"
  echo "  • Verify: curl http://localhost:11434/api/tags"
  exit 1

else
  echo "  Status: ✗ Error ($http_code)"
  echo "  Response: $body"
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   ✓ All Tests Passed!                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
