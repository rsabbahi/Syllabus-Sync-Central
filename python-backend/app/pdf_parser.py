import logging
from pathlib import Path

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


class PDFParsingError(Exception):
    """Raised when PDF extraction fails."""
    pass


def extract_text_from_pdf(pdf_path: str | Path) -> tuple[str, int]:
    """
    Extract all text from a PDF file.

    Returns:
        (extracted_text, page_count)

    Raises:
        PDFParsingError: If PDF is corrupted, encrypted, or cannot be read.
    """
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        raise PDFParsingError(f"PDF file not found: {pdf_path}")

    if not pdf_path.suffix.lower() == ".pdf":
        raise PDFParsingError("File is not a PDF")

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        raise PDFParsingError(f"Failed to open PDF: {e}")

    if doc.is_pdf:
        try:
            if doc.is_encrypted:
                # Try to open with empty password
                if not doc.authenticate(""):
                    raise PDFParsingError("PDF is password-protected")
        except Exception as e:
            logger.warning(f"PDF encryption check failed: {e}")

    text_parts = []
    page_count = len(doc)

    try:
        for page_num in range(page_count):
            try:
                page = doc[page_num]
                text = page.get_text()
                if text:
                    text_parts.append(text)
            except Exception as e:
                logger.warning(f"Failed to extract text from page {page_num + 1}: {e}")
                continue
    finally:
        doc.close()

    extracted_text = "\n".join(text_parts)

    # Clean up excessive whitespace
    lines = extracted_text.split("\n")
    lines = [line.rstrip() for line in lines]
    extracted_text = "\n".join(lines)

    # Remove excessive blank lines
    while "\n\n\n" in extracted_text:
        extracted_text = extracted_text.replace("\n\n\n", "\n\n")

    if not extracted_text or len(extracted_text.strip()) == 0:
        raise PDFParsingError("PDF contains no extractable text")

    logger.info(f"Extracted {len(extracted_text)} characters from {page_count} pages")
    return extracted_text, page_count
