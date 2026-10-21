from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeDocument:
    title: str
    source: str
    content: str


@dataclass(frozen=True)
class Chunk:
    title: str
    source: str
    chunk_index: int
    content: str
    ingested_at: str


@dataclass(frozen=True)
class RetrievedChunk:
    title: str
    source: str
    content: str
    score: float


@dataclass(frozen=True)
class Source:
    title: str
    source: str
    score: float


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass(frozen=True)
class QualityReport:
    passed: bool
    score: float
    checks: list[str]


@dataclass(frozen=True)
class AnswerMetrics:
    latency_ms: int
    tokens: TokenUsage
    estimated_cost_usd: float
    quality_validation: QualityReport
