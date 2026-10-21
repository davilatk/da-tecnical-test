from __future__ import annotations

import math
import re
import unicodedata

from .models import QualityReport

JWT_PATTERN = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
BCRYPT_PATTERN = re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}")


def normalize_tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return [token for token in normalized.split() if len(token) >= 2]


def chunk_text(text: str, maximum: int = 1000, overlap: int = 150) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + maximum, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start, end + 1)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        next_start = max(start + 1, end - overlap)
        while next_start < len(text) and text[next_start].isspace():
            next_start += 1
        start = next_start
    return chunks


def estimate_cost(
    prompt_tokens: int,
    completion_tokens: int,
    input_price_per_mtok: float,
    output_price_per_mtok: float,
    mode: str,
) -> float:
    if mode == "local":
        return 0.0
    return round(
        prompt_tokens / 1_000_000 * input_price_per_mtok
        + completion_tokens / 1_000_000 * output_price_per_mtok,
        8,
    )


def validate_quality(answer: str, context: str, sources_present: bool) -> tuple[str, QualityReport]:
    not_empty = bool(answer.strip())
    answer_tokens = [token for token in normalize_tokens(answer) if len(token) >= 4]
    context_tokens = set(normalize_tokens(context))
    grounded = bool(answer_tokens) and sum(token in context_tokens for token in answer_tokens) / len(answer_tokens) >= 0.5
    sensitive = bool(JWT_PATTERN.search(answer) or BCRYPT_PATTERN.search(answer) or "password_hash" in answer)
    within_limit = len(answer) <= 4000
    checks = [
        ("answer_not_empty", not_empty),
        ("sources_present", sources_present),
        ("grounded_in_context", grounded),
        ("no_sensitive_data", not sensitive),
        ("within_length_limit", within_limit),
    ]
    redacted = JWT_PATTERN.sub("[REDACTED]", answer)
    redacted = BCRYPT_PATTERN.sub("[REDACTED]", redacted).replace("password_hash", "[REDACTED]")
    if not within_limit:
        redacted = redacted[:4000]
    passed_count = sum(passed for _, passed in checks)
    report = QualityReport(
        passed=passed_count / 5 >= 0.8 and not_empty and not sensitive,
        score=round(passed_count / 5, 2),
        checks=[f"{check_id}:{'pass' if passed else 'fail'}" for check_id, passed in checks],
    )
    return redacted, report
