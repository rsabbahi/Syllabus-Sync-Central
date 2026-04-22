"""LLM Prompt templates for syllabus parsing."""


def get_extraction_prompt(syllabus_text: str) -> str:
    """
    Generate prompt to extract assignments and deadlines from syllabus text.
    """
    return f"""You are a syllabus parser. Extract ONLY graded assignments and deadlines from the following syllabus text.

REQUIREMENTS:
1. Extract ONLY graded work (assignments, quizzes, exams, projects, labs, papers)
2. Ignore lectures, readings, office hours, policies, and non-graded content
3. Each task MUST have a clear due date (if no date, exclude it)
4. Normalize ALL dates to YYYY-MM-DD format
5. Do NOT hallucinate or guess missing data
6. Output ONLY valid JSON, nothing else

Return ONLY this JSON structure:
{{
  "course_name": "Course Name (extracted from syllabus)",
  "tasks": [
    {{
      "title": "Assignment/Quiz/Exam name",
      "type": "homework | quiz | exam | project | lab | paper | presentation",
      "due_date": "YYYY-MM-DD",
      "details": "Brief description (optional)"
    }}
  ]
}}

SYLLABUS TEXT:
{syllabus_text}

Return ONLY valid JSON. No explanations, no markdown, just JSON."""


def get_repair_prompt(invalid_json: str) -> str:
    """
    Generate prompt to fix invalid JSON from previous response.
    """
    return f"""The following is invalid JSON. Fix it and return ONLY valid JSON.

INVALID JSON:
{invalid_json}

Requirements:
1. Fix syntax errors
2. Ensure all fields are properly quoted and comma-separated
3. Ensure all dates are in YYYY-MM-DD format
4. Return ONLY valid JSON, nothing else

Return ONLY the corrected JSON."""
