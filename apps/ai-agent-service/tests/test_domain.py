import asyncio
import math

from domain.services import chunk_text, estimate_cost, validate_quality
from infrastructure.adapters import LocalHashEmbeddingProvider


def test_chunking_respects_size_overlap_and_empty_values():
    text = "word " * 500
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert all(len(chunk) <= 1000 for chunk in chunks)
    assert chunks[0][-100:] in chunks[1]
    assert chunk_text("   ") == []


def test_local_embedding_is_deterministic_normalized_and_semantic():
    provider = LocalHashEmbeddingProvider()
    first, same, related, unrelated = asyncio.run(provider.embed([
        "roles admin auditor", "roles admin auditor", "admin roles", "baseball stadium",
    ]))
    cosine = lambda left, right: sum(a * b for a, b in zip(left, right))
    assert len(first) == 768
    assert math.isclose(math.sqrt(sum(value * value for value in first)), 1.0)
    assert first == same
    assert cosine(first, related) > cosine(first, unrelated)


def test_cost_and_quality_contract():
    assert estimate_cost(1210, 96, 0.30, 2.50, "gemini") == 0.000603
    assert estimate_cost(1210, 96, 0.30, 2.50, "local") == 0.0
    answer, report = validate_quality("El rol ADMIN existe", "El rol ADMIN existe", True)
    assert answer == "El rol ADMIN existe"
    assert report.checks == [
        "answer_not_empty:pass", "sources_present:pass", "grounded_in_context:pass",
        "no_sensitive_data:pass", "within_length_limit:pass",
    ]
    _, unsafe = validate_quality("eyJabc.def.ghi password_hash", "eyJabc.def.ghi password_hash", True)
    assert not unsafe.passed
    redacted, length = validate_quality("x" * 4001, "x " * 4001, True)
    assert len(redacted) == 4000
    assert length.checks[-1] == "within_length_limit:fail"
