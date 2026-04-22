import logging

import requests

from .config import OLLAMA_MODEL, OLLAMA_TIMEOUT, OLLAMA_URL

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Raised when Ollama API call fails."""
    pass


def call_ollama(prompt: str, model: str = OLLAMA_MODEL, timeout: int = OLLAMA_TIMEOUT) -> str:
    """
    Call Ollama API to generate text.

    Args:
        prompt: Input prompt for the model
        model: Model name (default: llama3)
        timeout: Request timeout in seconds

    Returns:
        Generated text from model

    Raises:
        OllamaError: If API call fails
    """
    endpoint = f"{OLLAMA_URL}/api/generate"

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "temperature": 0.1,  # Low temperature for consistent output
    }

    logger.info(f"Calling Ollama: model={model}, prompt_len={len(prompt)}")

    try:
        response = requests.post(
            endpoint,
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise OllamaError(f"Ollama request timed out after {timeout}s")
    except requests.exceptions.ConnectionError:
        raise OllamaError(
            f"Could not connect to Ollama at {OLLAMA_URL}. "
            "Ensure Ollama is running and accessible."
        )
    except requests.exceptions.RequestException as e:
        raise OllamaError(f"Ollama API error: {e}")

    try:
        data = response.json()
    except Exception as e:
        raise OllamaError(f"Failed to parse Ollama response: {e}")

    result = data.get("response", "").strip()

    if not result:
        raise OllamaError("Ollama returned empty response")

    logger.info(f"Ollama response: {len(result)} characters")
    return result


def call_ollama_with_retry(
    prompt: str,
    model: str = OLLAMA_MODEL,
    timeout: int = OLLAMA_TIMEOUT,
    max_retries: int = 1
) -> str:
    """
    Call Ollama with automatic retry on timeout.

    Args:
        prompt: Input prompt
        model: Model name
        timeout: Request timeout in seconds
        max_retries: Number of retries on timeout

    Returns:
        Generated text

    Raises:
        OllamaError: If all retries fail
    """
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return call_ollama(prompt, model, timeout)
        except OllamaError as e:
            last_error = e
            if "timeout" in str(e).lower():
                logger.warning(f"Timeout on attempt {attempt + 1}/{max_retries + 1}, retrying...")
                continue
            else:
                raise

    raise OllamaError(f"Failed after {max_retries + 1} attempts: {last_error}")
