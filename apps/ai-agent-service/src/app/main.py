from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from application.use_cases import AskQuestionUseCase, IngestDocumentsUseCase
from domain.models import KnowledgeDocument
from infrastructure.adapters import (
    AIProviderError,
    GeminiEmbeddingProvider,
    GeminiLlmProvider,
    HttpLiveData,
    HttpTokenValidator,
    InMemoryVectorStore,
    JsonLogger,
    LocalExtractiveLlmProvider,
    LocalHashEmbeddingProvider,
    QdrantVectorStore,
    Settings,
    SystemClock,
    VectorStoreError,
)
from presentation.schemas import AskRequest, IngestRequest


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str, details: list[dict[str, Any]] | None = None) -> None:
        self.status, self.code, self.message, self.details = status, code, message, details or []


def trace_id(request: Request) -> str:
    return request.headers.get("X-Trace-Id") or f"trc_{uuid.uuid4().hex}"


def error_response(error: ServiceError, request: Request) -> JSONResponse:
    return JSONResponse(status_code=error.status, content={
        "success": False,
        "error": {"code": error.code, "message": error.message, "details": error.details},
        "traceId": trace_id(request),
    })


def create_app(
    settings: Settings | None = None,
    vector_store: Any | None = None,
    token_validator: Any | None = None,
    live_data: Any | None = None,
    logger: Any | None = None,
    clock: Any | None = None,
) -> FastAPI:
    settings, logger, clock = settings or Settings(), logger or JsonLogger(), clock or SystemClock()
    embeddings = GeminiEmbeddingProvider(settings.gemini_api_key) if settings.mode == "gemini" else LocalHashEmbeddingProvider()
    llm = GeminiLlmProvider(settings.gemini_api_key) if settings.mode == "gemini" else LocalExtractiveLlmProvider()
    store = vector_store or QdrantVectorStore(settings.qdrant_url)
    validator = token_validator or HttpTokenValidator(settings)
    live = live_data or HttpLiveData(settings)
    ingest = IngestDocumentsUseCase(embeddings, store, clock, logger)
    ask = AskQuestionUseCase(embeddings, llm, store, live, settings, clock, logger)
    app = FastAPI()
    app.state.ingest_use_case = ingest

    @app.on_event("startup")
    async def initialize_vector_store() -> None:
        if vector_store is None:
            try:
                store.ensure_collection()
            except VectorStoreError as exc:
                logger.log("error", "trc_startup", "vector store initialization failed", {
                    "dependency": "qdrant", "errorType": type(exc).__name__,
                })
                raise

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for item in exc.errors():
            location = [str(part) for part in item["loc"] if part != "body"]
            details.append({"field": ".".join(location), "message": item["msg"]})
        return error_response(ServiceError(400, "VALIDATION_ERROR", "Request validation failed", details), request)

    @app.exception_handler(ServiceError)
    async def service_error(request: Request, exc: ServiceError) -> JSONResponse:
        return error_response(exc, request)

    @app.exception_handler(AIProviderError)
    async def provider_error(request: Request, exc: AIProviderError) -> JSONResponse:
        logger.log("error", trace_id(request), "AI provider failed", {"dependency": "gemini", "errorType": type(exc).__name__})
        return error_response(ServiceError(500, "AI_PROVIDER_ERROR", "AI provider failed"), request)

    @app.exception_handler(VectorStoreError)
    async def vector_error(request: Request, exc: VectorStoreError) -> JSONResponse:
        logger.log("error", trace_id(request), "vector store failed", {"dependency": "qdrant", "errorType": type(exc).__name__})
        return error_response(ServiceError(500, "VECTOR_STORE_ERROR", "Vector store failed"), request)

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        return error_response(ServiceError(500, "INTERNAL_ERROR", "Internal server error"), request)

    async def authenticated(request: Request, permitted: set[str]) -> tuple[str, dict[str, Any], str]:
        authorization = request.headers.get("Authorization", "")
        current_trace_id = trace_id(request)
        if not authorization.startswith("Bearer "):
            raise ServiceError(401, "TOKEN_INVALID_OR_REVOKED", "Token is invalid or revoked")
        user = await validator.validate(authorization, current_trace_id)
        if not user:
            raise ServiceError(401, "TOKEN_INVALID_OR_REVOKED", "Token is invalid or revoked")
        if not permitted.intersection(user.get("roles", [])):
            raise ServiceError(403, "FORBIDDEN", "Insufficient role")
        return authorization, user, current_trace_id

    @app.post("/ai/ingest", status_code=201)
    async def ingest_documents(payload: IngestRequest, request: Request) -> JSONResponse:
        _, _, current_trace_id = await authenticated(request, {"ADMIN"})
        data = await ingest.execute([KnowledgeDocument(item.title, item.source, item.content) for item in payload.documents], current_trace_id)
        return JSONResponse(status_code=201, content={"success": True, "data": data, "traceId": current_trace_id})

    @app.post("/ai/ask")
    async def ask_question(payload: AskRequest, request: Request) -> JSONResponse:
        authorization, user, current_trace_id = await authenticated(request, {"ADMIN", "USER", "AUDITOR"})
        data = await ask.execute(payload.question, payload.topK, payload.includeLiveData, user, authorization, current_trace_id)
        return JSONResponse(status_code=200, content={"success": True, "data": data, "traceId": current_trace_id})

    return app


app = create_app()
