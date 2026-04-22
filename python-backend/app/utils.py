import json
import logging
from datetime import datetime
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


def chunk_text(text: str, chunk_size: int = 4000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap

    return chunks


def safe_parse_json(
    text: str,
    retry_fn: Optional[Callable[[str], str]] = None
) -> Optional[dict[str, Any]]:
    """
    Safely parse JSON from LLM response.

    Attempts to extract and parse JSON. If parsing fails and retry_fn
    is provided, calls retry_fn to get a corrected response and tries again.
    """
    # Try to find JSON in the response
    text = text.strip()

    # Remove markdown code blocks if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    # First attempt
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}. Text preview: {text[:200]}")

        # Retry if callback provided
        if retry_fn:
            logger.info("Attempting to repair JSON...")
            corrected = retry_fn(text)
            try:
                result = json.loads(corrected.strip())
                logger.info("JSON repair successful")
                return result
            except json.JSONDecodeError as e2:
                logger.error(f"JSON repair failed: {e2}")
                return None

        return None


def normalize_date(date_str: str) -> Optional[str]:
    """
    Convert various date formats to YYYY-MM-DD.

    Handles: MM/DD/YYYY, DD/MM/YYYY, March 15, 3/15, 15-Mar, etc.
    Returns None if date cannot be parsed.
    """
    if not date_str or not isinstance(date_str, str):
        return None

    date_str = date_str.strip()

    # Common month abbreviations
    months = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    }

    # Patterns to try (order matters)
    patterns = [
        ("%m/%d/%Y", None),
        ("%m/%d/%y", None),
        ("%d/%m/%Y", None),
        ("%d/%m/%y", None),
        ("%Y-%m-%d", None),
        ("%B %d, %Y", None),
        ("%B %d, %y", None),
        ("%b %d, %Y", None),
        ("%b %d, %y", None),
        ("%B %d %Y", None),
        ("%b %d %Y", None),
        ("%d %B %Y", None),
        ("%d %b %Y", None),
    ]

    for pattern, _ in patterns:
        try:
            dt = datetime.strptime(date_str, pattern)
            # Handle 2-digit years
            if dt.year < 100:
                dt = dt.replace(year=dt.year + 2000 if dt.year < 50 else dt.year + 1900)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Try word-based parsing
    parts = date_str.lower().split()
    if len(parts) >= 2:
        # Try "March 15" or "15 March"
        for month_name, month_num in months.items():
            if month_name in parts:
                idx = parts.index(month_name)
                day_idx = (idx - 1) if idx > 0 else (idx + 1)
                if day_idx < len(parts):
                    try:
                        day = int(parts[day_idx].replace(',', ''))
                        year = 2026  # Default year
                        for part in parts:
                            if len(part) == 4 and part.isdigit():
                                year = int(part)
                        return f"{year:04d}-{month_num:02d}-{day:02d}"
                    except (ValueError, IndexError):
                        pass

    return None


def merge_chunks_json(
    chunk_responses: list[dict[str, Any]],
    deduplicate: bool = True
) -> dict[str, Any]:
    """
    Merge JSON responses from multiple chunks.

    Deduplicates tasks by (title, due_date, type) if deduplicate=True.
    Preserves course_name from first chunk.
    """
    if not chunk_responses:
        return {"course_name": None, "tasks": []}

    merged = {
        "course_name": chunk_responses[0].get("course_name"),
        "tasks": []
    }

    seen = set()
    for chunk in chunk_responses:
        for task in chunk.get("tasks", []):
            if deduplicate:
                key = (
                    task.get("title", "").strip(),
                    task.get("due_date", "").strip(),
                    task.get("type", "").strip()
                )
                if key in seen:
                    continue
                seen.add(key)
            merged["tasks"].append(task)

    return merged


def extract_json_from_text(text: str) -> Optional[dict[str, Any]]:
    """
    Extract JSON object from text, handling markdown code blocks.
    """
    text = text.strip()

    # Handle markdown code blocks
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            if part.strip().startswith("{"):
                text = part.strip()
                if text.startswith("json"):
                    text = text[4:].strip()
                break

    # Find JSON object
    start_idx = text.find("{")
    end_idx = text.rfind("}")

    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        text = text[start_idx:end_idx + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
