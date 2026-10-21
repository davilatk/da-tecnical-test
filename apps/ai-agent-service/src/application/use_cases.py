from __future__ import annotations

import asyncio
import uuid
from dataclasses import asdict
from typing import Any

from domain.models import AnswerMetrics, Chunk, KnowledgeDocument, RetrievedChunk, Source, TokenUsage
from domain.services import chunk_text, estimate_cost, validate_quality
from infrastructure.adapters import AIProviderError, VectorStoreError

INSUFFICIENT_INFORMATION = "No encontré información suficiente en la base de conocimiento ni en los datos disponibles para responder."


class IngestDocumentsUseCase:
    def __init__(self, embeddings: Any, vector_store: Any, clock: Any, logger: Any) -> None:
        self.embeddings, self.vector_store, self.clock, self.logger = embeddings, vector_store, clock, logger

    async def execute(self, documents: list[KnowledgeDocument], trace_id: str) -> dict[str, Any]:
        reports = []
        total = 0
        try:
            for document in documents:
                contents = chunk_text(document.content)
                chunks = [Chunk(document.title, document.source, index, content, self.clock.now_iso()) for index, content in enumerate(contents)]
                vectors = await self.embeddings.embed([chunk.content for chunk in chunks])
                await self.vector_store.replace_source(document.source, chunks, vectors)
                reports.append({"title": document.title, "source": document.source, "chunks": len(chunks)})
                total += len(chunks)
        except AIProviderError:
            raise
        except Exception as exc:
            raise VectorStoreError() from exc
        result = {
            "collection": "toka_knowledge",
            "embeddingModel": self.embeddings.model,
            "documentsIngested": len(documents),
            "chunksIndexed": total,
            "documents": reports,
        }
        self.logger.log("info", trace_id, "knowledge ingestion completed", {
            "documentsIngested": len(documents), "chunksIndexed": total, "embeddingModel": self.embeddings.model,
        })
        return result


class AskQuestionUseCase:
    def __init__(self, embeddings: Any, llm: Any, vector_store: Any, live_data: Any, settings: Any, clock: Any, logger: Any) -> None:
        self.embeddings, self.llm, self.vector_store = embeddings, llm, vector_store
        self.live_data, self.settings, self.clock, self.logger = live_data, settings, clock, logger

    async def execute(
        self, question: str, top_k: int, include_live_data: bool, user: dict[str, Any], authorization: str, trace_id: str
    ) -> dict[str, Any]:
        started = self.clock.perf_counter()
        roles = user["roles"]
        tasks = [self._retrieve(question, top_k)]
        if include_live_data:
            tasks.append(self.live_data.get_users(authorization, trace_id))
            if "ADMIN" in roles or "AUDITOR" in roles:
                tasks.append(self.live_data.get_audits(authorization, trace_id))
        results = await asyncio.gather(*tasks)
        retrieved = results[0]
        position = 1
        live_chunks: list[RetrievedChunk] = []
        if include_live_data:
            users_status, users = results[position]
            position += 1
            if users_status == 200:
                live_chunks.append(self._users_chunk(users))
            else:
                self.logger.log("warn", trace_id, "live dependency skipped", {"dependency": "user-service", "status": users_status})
            if "ADMIN" in roles or "AUDITOR" in roles:
                audits_status, audits = results[position]
                if audits_status == 200:
                    live_chunks.append(self._audits_chunk(audits))
                else:
                    self.logger.log("warn", trace_id, "live dependency skipped", {"dependency": "audit-service", "status": audits_status})
        contexts = retrieved + live_chunks
        context_text = "\n\n".join(f"[{chunk.title}] ({chunk.source})\n{chunk.content}" for chunk in contexts)
        sources = self._sources(contexts)
        if not contexts:
            answer, usage = INSUFFICIENT_INFORMATION, TokenUsage(0, 0, 0)
        else:
            prompt = f"Contexto:\n{context_text}\n\nPregunta: {question}"
            answer, usage = await self.llm.generate(prompt, contexts)
        answer, quality = validate_quality(answer, context_text, bool(sources))
        metrics = AnswerMetrics(
            latency_ms=max(0, int((self.clock.perf_counter() - started) * 1000)),
            tokens=usage,
            estimated_cost_usd=estimate_cost(
                usage.prompt_tokens, usage.completion_tokens,
                self.settings.gemini_price_input_per_mtok_usd, self.settings.gemini_price_output_per_mtok_usd, self.settings.mode,
            ),
            quality_validation=quality,
        )
        result = {
            "answer": answer,
            "sources": [asdict(source) for source in sources],
            "metrics": {
                "latency_ms": metrics.latency_ms,
                "tokens": asdict(metrics.tokens),
                "estimated_cost_usd": metrics.estimated_cost_usd,
                "quality_validation": asdict(metrics.quality_validation),
            },
        }
        self.logger.log("info", trace_id, "question answered", {
            "userId": user["id"], "questionLength": len(question), "sourcesCount": len(sources),
            "latencyMs": metrics.latency_ms, "totalTokens": usage.total_tokens,
            "estimatedCostUsd": metrics.estimated_cost_usd, "qualityPassed": quality.passed, "mode": self.settings.mode,
        })
        return result

    async def _retrieve(self, question: str, top_k: int) -> list[RetrievedChunk]:
        try:
            vector = (await self.embeddings.embed([question]))[0]
            return [item for item in await self.vector_store.search(vector, top_k) if item.score >= self.settings.ai_min_score]
        except AIProviderError:
            raise
        except Exception as exc:
            raise VectorStoreError() from exc

    @staticmethod
    def _users_chunk(users: list[dict[str, Any]]) -> RetrievedChunk:
        content = "\n".join(
            f"- {user.get('fullName')} <{user.get('email')}> | id={user.get('id')} | department={user.get('department')} | "
            f"status={user.get('status')} | roles={','.join(user.get('roles', []))}" for user in users[:50]
        )
        return RetrievedChunk("Directorio de usuarios (tiempo real)", "user-service:GET /users", content, 1.0)

    @staticmethod
    def _audits_chunk(audits: list[dict[str, Any]]) -> RetrievedChunk:
        content = "\n".join(
            f"- {item.get('occurredAt')} {item.get('eventType')} actor={item.get('actorId')} target={item.get('targetId')} "
            f"source={item.get('serviceSource')}" for item in audits
        )
        return RetrievedChunk("Auditoría reciente (tiempo real)", "audit-service:GET /audits", content, 1.0)

    @staticmethod
    def _sources(chunks: list[RetrievedChunk]) -> list[Source]:
        sources: dict[str, Source] = {}
        for chunk in chunks:
            candidate = Source(chunk.title, chunk.source, round(min(1.0, max(0.0, chunk.score)), 4))
            if candidate.source not in sources or candidate.score > sources[candidate.source].score:
                sources[candidate.source] = candidate
        return sorted(sources.values(), key=lambda source: (-source.score, source.source))
