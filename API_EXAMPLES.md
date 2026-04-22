# API Examples & Test Cases

Complete examples for testing the Syllabus Parser backend.

---

## 1. Python Backend (Direct Access)

### Health Check

**Request:**
```bash
curl -v http://localhost:8000/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "syllabus-parser"
}
```

---

### Parse PDF

**Request:**
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@syllabus.pdf"
```

**Response (200 OK):**
```json
{
  "todos": [
    {
      "title": "Midterm Exam",
      "due_date": "2026-03-15",
      "type": "exam",
      "course": "CS 101: Introduction to Programming"
    },
    {
      "title": "Assignment 1: Hello World",
      "due_date": "2026-02-20",
      "type": "homework",
      "course": "CS 101: Introduction to Programming"
    },
    {
      "title": "Lab 1: Setting Up Environment",
      "due_date": "2026-02-13",
      "type": "lab",
      "course": "CS 101: Introduction to Programming"
    },
    {
      "title": "Quiz 1",
      "due_date": "2026-02-27",
      "type": "quiz",
      "course": "CS 101: Introduction to Programming"
    },
    {
      "title": "Final Project",
      "due_date": "2026-05-10",
      "type": "project",
      "course": "CS 101: Introduction to Programming"
    }
  ]
}
```

---

### Error Responses

**Invalid File Type (400):**
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@document.docx"
```

```json
{
  "error": "File must be a PDF"
}
```

**File Not Found (400):**
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@nonexistent.pdf"
```

```json
{
  "error": "PDF file not found: /path/to/nonexistent.pdf"
}
```

**Corrupted PDF (400):**
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@corrupted.pdf"
```

```json
{
  "error": "Failed to open PDF: [error details]"
}
```

**Empty or Scanned PDF (400):**
```bash
curl -X POST http://localhost:8000/parse \
  -F "file=@scanned.pdf"
```

```json
{
  "error": "PDF contains no extractable text"
}
```

**Ollama Unavailable (503):**
```bash
# Stop ollama first
curl -X POST http://localhost:8000/parse \
  -F "file=@syllabus.pdf"
```

```json
{
  "error": "LLM service unavailable. Ensure Ollama is running at http://localhost:11434"
}
```

**Request Timeout (504):**
```json
{
  "error": "Ollama request timed out after 60s"
}
```

---

## 2. Node.js Backend (Proxy)

### Parse via Node.js

**Request:**
```bash
curl -X POST http://localhost:3000/api/parse-syllabus \
  -F "file=@syllabus.pdf"
```

**Response (200 OK):**
```json
{
  "todos": [
    {
      "title": "Midterm Exam",
      "due_date": "2026-03-15",
      "type": "exam",
      "course": "CS 101: Introduction to Programming"
    }
    // ... more todos
  ]
}
```

**Note**: Same response format as Python backend, but goes through Node.js proxy.

---

## 3. Using Postman

### Collection JSON

Import this into Postman:

```json
{
  "info": {
    "name": "Syllabus Parser API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": "{{python_backend_url}}/health"
      }
    },
    {
      "name": "Parse PDF (Python)",
      "request": {
        "method": "POST",
        "url": "{{python_backend_url}}/parse",
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": "/path/to/syllabus.pdf"
            }
          ]
        }
      }
    },
    {
      "name": "Parse PDF (Node Proxy)",
      "request": {
        "method": "POST",
        "url": "{{node_backend_url}}/api/parse-syllabus",
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": "/path/to/syllabus.pdf"
            }
          ]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "python_backend_url",
      "value": "http://localhost:8000"
    },
    {
      "key": "node_backend_url",
      "value": "http://localhost:3000"
    }
  ]
}
```

---

## 4. Python Requests (Programmatic)

```python
import requests
import json

# Parse PDF
pdf_path = "syllabus.pdf"
url = "http://localhost:8000/parse"

with open(pdf_path, "rb") as f:
    files = {"file": f}
    response = requests.post(url, files=files, timeout=300)

if response.status_code == 200:
    data = response.json()
    todos = data["todos"]
    
    print(f"Found {len(todos)} assignments:")
    for todo in todos:
        print(f"  • {todo['title']} - {todo['due_date']} ({todo['type']})")
        print(f"    Course: {todo['course']}")
else:
    print(f"Error: {response.status_code}")
    print(response.json())
```

---

## 5. JavaScript (Node.js / Fetch)

```javascript
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function parseSyllabus(pdfPath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath));

  const response = await fetch('http://localhost:8000/parse', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 300000, // 5 minutes
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Parse failed');
  }

  const data = await response.json();
  return data.todos;
}

// Usage
parseSyllabus('syllabus.pdf')
  .then(todos => {
    console.log(`Found ${todos.length} assignments:`);
    todos.forEach(todo => {
      console.log(`  • ${todo.title} - ${todo.due_date}`);
    });
  })
  .catch(error => console.error('Error:', error));
```

---

## 6. JavaScript (Browser / fetch API)

```javascript
async function uploadSyllabus(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/parse-syllabus', {
    method: 'POST',
    body: formData,
    timeout: 300000, // 5 minutes
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  const data = await response.json();
  return data.todos;
}

// Usage with file input
document.getElementById('uploadInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  
  try {
    const todos = await uploadSyllabus(file);
    console.log('Successfully parsed:', todos);
    displayTodos(todos);
  } catch (error) {
    console.error('Error:', error);
    showError(error.message);
  }
});
```

---

## 7. Batch Processing (Multiple PDFs)

```bash
#!/bin/bash

# Process all PDFs in a directory
for pdf in /path/to/syllabi/*.pdf; do
  echo "Processing: $pdf"
  
  response=$(curl -s -X POST http://localhost:8000/parse \
    -F "file=@$pdf")
  
  course=$(echo "$response" | jq -r '.todos[0].course // "Unknown"')
  count=$(echo "$response" | jq '.todos | length')
  
  echo "  ✓ Found $count assignments in $course"
  echo "$response" > "parsed_$(basename $pdf .pdf).json"
done
```

---

## 8. Real-World Test PDFs

### Test with Provided Syllabi

```bash
# Test with actual syllabus files
curl -X POST http://localhost:8000/parse \
  -F "file=@/Users/retalsabbahi/Downloads/MA124 syllabus 2026.04.07.pdf"

curl -X POST http://localhost:8000/parse \
  -F "file=@/Users/retalsabbahi/Downloads/Syllabus(1) (3).pdf"
```

**Expected outputs** (based on previous testing):

MA124 (Calculus II):
```json
{
  "todos": [
    {"title": "Midterm1", "due_date": "2026-03-05", "type": "exam", "course": "Math 124 Calculus II"},
    {"title": "Midterm2", "due_date": "2026-04-09", "type": "exam", "course": "Math 124 Calculus II"},
    {"title": "Final Exam", "due_date": "2026-05-05", "type": "exam", "course": "Math 124 Calculus II"}
  ]
}
```

EK125 (Programming for Engineers):
```json
{
  "todos": [
    {"title": "Discussion 1: Quiz 1", "due_date": "2026-01-23", "type": "quiz", "course": "ENG EK 125 Introduction to Programming for Engineers"},
    {"title": "Discussion 2: Quiz 2", "due_date": "2026-01-30", "type": "quiz", "course": "ENG EK 125 Introduction to Programming for Engineers"},
    // ... 20+ more assignments
  ]
}
```

---

## 9. Performance Testing

### Load Test (using Apache Bench)

```bash
# Warm up
curl -s -X POST http://localhost:8000/parse \
  -F "file=@test.pdf" > /dev/null

# Single PDF test (measures end-to-end time)
time curl -s -X POST http://localhost:8000/parse \
  -F "file=@test.pdf" | jq . > /dev/null

# Concurrent requests (3 at a time)
for i in {1..3}; do
  curl -s -X POST http://localhost:8000/parse \
    -F "file=@test.pdf" &
done
wait
```

---

## 10. Debugging

### Enable Debug Logging

```bash
# Python backend
LOG_LEVEL=DEBUG uvicorn app.main:app --port 8000

# Check detailed response
curl -v -X POST http://localhost:8000/parse \
  -F "file=@syllabus.pdf" \
  2>&1 | head -50
```

### Check Backend Status

```bash
# Python backend health
curl -s http://localhost:8000/health | jq .

# Ollama status
curl -s http://localhost:11434/api/tags | jq .

# Docker logs
docker-compose logs python-backend
docker-compose logs ollama
```

---

## Response Format Reference

### Success Response

```json
{
  "todos": [
    {
      "title": "Assignment Name",
      "due_date": "YYYY-MM-DD",
      "type": "homework | quiz | exam | project | lab | paper | presentation",
      "course": "Course Name"
    }
  ]
}
```

### Error Response

```json
{
  "error": "Human-readable error message",
  "detail": "Optional technical details"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | ✓ Success |
| 400 | ✗ Bad request (invalid file, corrupted PDF, etc) |
| 413 | ✗ File too large (>50MB) |
| 503 | ✗ Service unavailable (Ollama not running) |
| 504 | ✗ Gateway timeout (LLM request took too long) |

---

## Tips & Best Practices

1. **Large PDFs**: PDFs over 20-30 pages take longer to process (chunking + multiple LLM calls)
2. **Timeouts**: Set client timeout to at least 5 minutes (300s) for large files
3. **Scanned PDFs**: Won't work - requires text-based PDFs (use OCR first if needed)
4. **Date Formats**: LLM converts various date formats (3/15, March 15, 15-Mar, etc) to YYYY-MM-DD
5. **Model Speed**: llama3 is ~7B params, takes ~10-30s per chunk depending on hardware
6. **Deduplication**: LLM output is automatically deduplicated by (title, due_date, type)

---

## Common Issues & Solutions

### "Empty JSON response"
- Ensure file is readable: `file syllabus.pdf`
- Check Ollama is running: `ollama serve`
- Check logs: `docker-compose logs python-backend`

### "Timeout errors"
- Increase timeout in client (300s minimum for large PDFs)
- Increase OLLAMA_TIMEOUT in .env (default 60s)
- Check Ollama resource usage: `top`, `nvidia-smi`

### "Invalid dates in response"
- LLM might misinterpret date format
- Pre-process PDF if dates are in unusual format
- Manually correct in your app

### "Missing assignments"
- Syllabus may have assignments without clear due dates
- Assignments in prose (paragraphs) are harder to extract than tables
- LLM conservative to avoid false positives

---

## Next Steps

1. ✅ Test with health check: `curl http://localhost:8000/health`
2. ✅ Parse a test PDF: `curl -X POST http://localhost:8000/parse -F "file=@test.pdf"`
3. ✅ Verify Node.js proxy: `curl -X POST http://localhost:3000/api/parse-syllabus -F "file=@test.pdf"`
4. ✅ Integrate with frontend
5. ✅ Deploy to production

For issues, check [SETUP.md](SETUP.md) troubleshooting section.
