from __future__ import annotations

import hashlib
import json
import logging
import math
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict

from domain.models import Chunk, RetrievedChunk, TokenUsage
from domain.services import normalize_tokens


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    gemini_api_key: str = ""
    qdrant_url: str = "http://qdrant:6333"
    auth_service_url: str = "http://auth-service:3001"
    user_service_url: str = "http://user-service:3002"
    audit_service_url: str = "http://audit-service:3003"
    ai_http_timeout_ms: int = 3000
    ai_llm_timeout_ms: int = 15000
    ai_min_score: float = 0.2
    gemini_price_input_per_mtok_usd: float = 0.30
    gemini_price_output_per_mtok_usd: float = 2.50

    @property
    def mode(self) -> str:
        return "gemini" if self.gemini_api_key.strip() else "local"


class JsonLogger:
    def __init__(self) -> None:
        self._logger = logging.getLogger("ai-agent-service")

    def log(self, level: str, trace_id: str, message: str, context: dict[str, Any]) -> None:
        payload = {
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "level": level,
            "service": "ai-agent-service",
            "traceId": trace_id,
            "message": message,
            "context": context,
        }
        self._logger.log(getattr(logging, level.upper(), logging.INFO), json.dumps(payload, ensure_ascii=False))


class SystemClock:
    def now_iso(self) -> str:
        return datetime.now(UTC).isoformat().replace("+00:00", "Z")

    def perf_counter(self) -> float:
        return time.perf_counter()


class LocalHashEmbeddingProvider:
    model = "local-hash-768"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * 768
            for token in normalize_tokens(text):
                digest = hashlib.sha256(token.encode()).hexdigest()
                index = int(digest[:8], 16) % 768
                vector[index] += 1 if int(digest[8:10], 16) % 2 == 0 else -1
            norm = math.sqrt(sum(value * value for value in vector))
            vectors.append([value / norm for value in vector] if norm else vector)
        return vectors


class LocalExtractiveLlmProvider:
    model = "local-extractive-v1"

    async def generate(self, prompt: str, contexts: list[RetrievedChunk]) -> tuple[str, TokenUsage]:
        answer = "Según el contexto disponible:\n" + "\n".join(
            f"- [{chunk.title}] {chunk.content[:300]}" for chunk in contexts[:3]
        )
        prompt_tokens = math.ceil(len(prompt) / 4)
        completion_tokens = math.ceil(len(answer) / 4)
        return answer, TokenUsage(prompt_tokens, completion_tokens, prompt_tokens + completion_tokens)


class GeminiEmbeddingProvider:
    model = "gemini-embedding-001"

    def __init__(self, api_key: str) -> None:
        from google import genai

        self.client = genai.Client(api_key=api_key)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            response = self.client.models.embed_content(
                model=self.model,
                contents=texts,
                config={"output_dimensionality": 768},
            )
            return [list(item.values) for item in response.embeddings]
        except Exception as exc:
            raise AIProviderError() from exc


SYSTEM_PROMPT = (
    "Eres el asistente de la plataforma Toka. Responde en español usando exclusivamente el contexto proporcionado. "
    "Si el contexto no contiene la respuesta, indícalo explícitamente. Cita el título de las fuentes utilizadas entre "
    "corchetes. Nunca reveles contraseñas, hashes, tokens JWT ni secretos."
)


class GeminiLlmProvider:
    model = "gemini-2.5-flash"

    def __init__(self, api_key: str) -> None:
        from google import genai

        self.client = genai.Client(api_key=api_key)

    async def generate(self, prompt: str, contexts: list[RetrievedChunk]) -> tuple[str, TokenUsage]:
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config={"temperature": 0.2, "max_output_tokens": 1024, "system_instruction": SYSTEM_PROMPT},
            )
            usage = response.usage_metadata
            prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
            completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
            total_tokens = getattr(usage, "total_token_count", 0) or 0
            return response.text or "", TokenUsage(prompt_tokens, completion_tokens, total_tokens)
        except Exception as exc:
            raise AIProviderError() from exc


class AIProviderError(Exception):
    pass


class VectorStoreError(Exception):
    pass


class InMemoryVectorStore:
    collection = "toka_knowledge"

    def __init__(self) -> None:
        self.points: dict[str, tuple[Chunk, list[float]]] = {}

    async def replace_source(self, source: str, chunks: list[Chunk], vectors: list[list[float]]) -> None:
        self.points = {point_id: item for point_id, item in self.points.items() if item[0].source != source}
        for chunk, vector in zip(chunks, vectors, strict=True):
            point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{chunk.source}#{chunk.chunk_index}"))
            self.points[point_id] = (chunk, vector)

    async def search(self, vector: list[float], limit: int) -> list[RetrievedChunk]:
        results = [
            RetrievedChunk(chunk.title, chunk.source, chunk.content, sum(a * b for a, b in zip(vector, stored, strict=True)))
            for chunk, stored in self.points.values()
        ]
        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]


class QdrantVectorStore:
    collection = "toka_knowledge"

    def __init__(self, url: str) -> None:
        from qdrant_client import QdrantClient
        from qdrant_client.http.models import Distance, VectorParams

        self.client = QdrantClient(url=url)
        self._distance = Distance
        self._params = VectorParams

    def ensure_collection(self) -> None:
        from qdrant_client.http.models import PayloadSchemaType

        try:
            if not self.client.collection_exists(self.collection):
                self.client.create_collection(self.collection, vectors_config=self._params(size=768, distance=self._distance.COSINE))
                self.client.create_payload_index(self.collection, "source", PayloadSchemaType.KEYWORD)
                return
            config = self.client.get_collection(self.collection).config.params.vectors
            if config.size != 768 or config.distance != self._distance.COSINE:
                raise VectorStoreError("collection configuration mismatch")
        except VectorStoreError:
            raise
        except Exception as exc:
            raise VectorStoreError() from exc

    async def replace_source(self, source: str, chunks: list[Chunk], vectors: list[list[float]]) -> None:
        from qdrant_client.http.models import FieldCondition, Filter, MatchValue, PointStruct

        try:
            self.client.delete(
                self.collection,
                points_selector=Filter(must=[FieldCondition(key="source", match=MatchValue(value=source))]),
            )
            points = [
                PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{chunk.source}#{chunk.chunk_index}")),
                    vector=vector,
                    payload={
                        "title": chunk.title, "source": chunk.source, "chunkIndex": chunk.chunk_index,
                        "content": chunk.content, "ingestedAt": chunk.ingested_at,
                    },
                )
                for chunk, vector in zip(chunks, vectors, strict=True)
            ]
            self.client.upsert(self.collection, points=points)
        except Exception as exc:
            raise VectorStoreError() from exc

    async def search(self, vector: list[float], limit: int) -> list[RetrievedChunk]:
        try:
            points = self.client.query_points(self.collection, query=vector, limit=limit).points
            return [
                RetrievedChunk(point.payload["title"], point.payload["source"], point.payload["content"], point.score)
                for point in points
            ]
        except Exception as exc:
            raise VectorStoreError() from exc


class HttpTokenValidator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def validate(self, authorization: str, trace_id: str) -> dict[str, Any] | None:
        try:
            async with httpx.AsyncClient(timeout=self.settings.ai_http_timeout_ms / 1000) as client:
                response = await client.get(
                    f"{self.settings.auth_service_url}/auth/validate",
                    headers={"Authorization": authorization, "X-Trace-Id": trace_id},
                )
            return response.json()["data"]["user"] if response.status_code == 200 else None
        except httpx.HTTPError:
            return None


class HttpLiveData:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def get_users(self, authorization: str, trace_id: str) -> tuple[int | None, list[dict[str, Any]]]:
        return await self._get(f"{self.settings.user_service_url}/users", authorization, trace_id)

    async def get_audits(self, authorization: str, trace_id: str) -> tuple[int | None, list[dict[str, Any]]]:
        return await self._get(f"{self.settings.audit_service_url}/audits?limit=20", authorization, trace_id, audits=True)

    async def _get(self, url: str, authorization: str, trace_id: str, audits: bool = False) -> tuple[int | None, list[dict[str, Any]]]:
        try:
            async with httpx.AsyncClient(timeout=self.settings.ai_http_timeout_ms / 1000) as client:
                response = await client.get(url, headers={"Authorization": authorization, "X-Trace-Id": trace_id})
            if response.status_code != 200:
                return response.status_code, []
            data = response.json().get("data", {})
            return 200, data.get("items", []) if audits else data
        except httpx.HTTPError:
            return None, []
