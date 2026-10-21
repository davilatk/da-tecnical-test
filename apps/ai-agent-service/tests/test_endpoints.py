from fastapi.testclient import TestClient

from app.main import create_app
from infrastructure.adapters import InMemoryVectorStore, Settings


class TokenValidator:
    async def validate(self, authorization, trace_id):
        if authorization == "Bearer valid":
            return {"id": "usr_1", "email": "user@toka.com", "roles": ["ADMIN"]}
        return None


class LiveData:
    async def get_users(self, authorization, trace_id):
        return 200, [{"id": "usr_2", "fullName": "Ana", "email": "ana@toka.com", "department": "Engineering", "status": "ACTIVE", "roles": ["USER"]}]

    async def get_audits(self, authorization, trace_id):
        return 200, [{"occurredAt": "2026-10-21T00:00:00Z", "eventType": "user.created", "actorId": "usr_1", "targetId": "usr_2", "serviceSource": "user-service"}]


def client():
    return TestClient(create_app(
        settings=Settings(gemini_api_key=""),
        vector_store=InMemoryVectorStore(),
        token_validator=TokenValidator(),
        live_data=LiveData(),
    ))


def test_ingest_and_ask_with_exact_response_shapes():
    with client() as api:
        ingest = api.post("/ai/ingest", headers={"Authorization": "Bearer valid", "X-Trace-Id": "trc_test"}, json={
            "documents": [{"title": "Roles", "source": "knowledge/roles.md", "content": "ADMIN puede administrar usuarios."}],
        })
        assert ingest.status_code == 201
        assert ingest.json()["traceId"] == "trc_test"
        response = api.post("/ai/ask", headers={"Authorization": "Bearer valid"}, json={"question": "¿Quién administra?", "includeLiveData": False})
    assert response.status_code == 200
    data = response.json()["data"]
    assert set(data) == {"answer", "sources", "metrics"}
    assert set(data["metrics"]) == {"latency_ms", "tokens", "estimated_cost_usd", "quality_validation"}


def test_validation_and_authentication_errors_use_contract():
    with client() as api:
        invalid = api.post("/ai/ask", headers={"Authorization": "Bearer valid"}, json={"question": "ok", "unknown": True})
        unauthorized = api.post("/ai/ask", json={"question": "ok"})
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert unauthorized.status_code == 401
    assert unauthorized.json()["error"]["code"] == "TOKEN_INVALID_OR_REVOKED"
