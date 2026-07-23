"""
Minimal OpenRouter client (https://openrouter.ai) — one dependency-free
chat-completions call with retry/backoff. The key comes from
OPENROUTER_API_KEY; without it the AI layer cleanly disables itself.
"""
import json
import logging
import time

import httpx

from app.config import get_settings

log = logging.getLogger("discovery.ai.openrouter")

API_URL = "https://openrouter.ai/api/v1/chat/completions"
RETRIES = 3
TIMEOUT_S = 60


def enabled() -> bool:
    return bool(get_settings().openrouter_api_key)


def chat_json(system: str, user: str, max_tokens: int = 700) -> dict | None:
    """One chat call that must return a JSON object; returns None on failure."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        # OpenRouter attribution headers (optional but recommended)
        "HTTP-Referer": "https://github.com/Bhavani345-max",
        "X-Title": "Project Discovery Portal",
    }
    payload = {
        "model": settings.openrouter_model,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    for attempt in range(1, RETRIES + 1):
        try:
            resp = httpx.post(API_URL, headers=headers, json=payload, timeout=TIMEOUT_S)
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            return _parse_json(content)
        except (httpx.HTTPError, KeyError, IndexError) as ex:
            log.warning("OpenRouter attempt %d/%d failed: %s", attempt, RETRIES, ex)
            if attempt < RETRIES:
                time.sleep(2 ** attempt)
    return None


def _parse_json(content: str) -> dict | None:
    """Tolerant JSON extraction — some models wrap JSON in code fences."""
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.startswith("json"):
            content = content[4:]
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        log.warning("Model returned non-JSON content: %.120s", content)
        return None
