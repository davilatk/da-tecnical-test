# 05 — AI Agent Service (RAG)

## Stack y responsabilidades

| Área | Tecnología / contrato |
|---|---|
| Lenguaje | Python 3.11 |
| Framework | FastAPI sobre Uvicorn, puerto `8000` (ver `00-system-context.spec.md`). |
| Validación | Pydantic v2 y `pydantic-settings` para configuración. |
| LLM | SDK `google-genai`, modelo `gemini-2.5-flash`. |
| Embeddings | SDK `google-genai`, modelo `gemini-embedding-001` con `output_dimensionality` `768`. |
| Vector store | `qdrant-client`, colección `toka_knowledge`. |
| Cliente HTTP | `httpx.AsyncClient` hacia `auth-service`, `user-service` y `audit-service`. |
| Pruebas | `pytest`, `pytest-asyncio`, `pytest-cov`, `respx`. |

El servicio responde preguntas en lenguaje natural sobre la plataforma Toka combinando dos fuentes de contexto:

1. **Conocimiento estático**: documentos de dominio ingeridos vía `POST /ai/ingest` y almacenados como vectores en Qdrant.
2. **Datos en tiempo real**: consulta HTTP síncrona a `GET /users` (`03-user-service.spec.md`) y `GET /audits` (`04-audit-service.spec.md`) en cada pregunta.

El servicio no persiste datos de usuarios ni de auditoría; solo indexa documentos de conocimiento. No publica ni consume eventos RabbitMQ.

## Configuración

| Variable | Valor por defecto | Uso |
|---|---|---|
| `GEMINI_API_KEY` | vacío | Si está vacía, se activa el modo local determinista (ver "Proveedores"). |
| `QDRANT_URL` | `http://qdrant:6333` | Conexión a Qdrant. |
| `AUTH_SERVICE_URL` | `http://auth-service:3001` | Validación del JWT. |
| `USER_SERVICE_URL` | `http://user-service:3002` | Contexto en tiempo real de usuarios. |
| `AUDIT_SERVICE_URL` | `http://audit-service:3003` | Contexto en tiempo real de auditoría. |
| `AI_HTTP_TIMEOUT_MS` | `3000` | Timeout por llamada a servicios internos. |
| `AI_LLM_TIMEOUT_MS` | `15000` | Timeout por llamada a Gemini. |
| `AI_MIN_SCORE` | `0.2` | Score mínimo de similitud para aceptar un fragmento recuperado. |
| `GEMINI_PRICE_INPUT_PER_MTOK_USD` | `0.30` | Precio USD por 1 000 000 de tokens de entrada. |
| `GEMINI_PRICE_OUTPUT_PER_MTOK_USD` | `2.50` | Precio USD por 1 000 000 de tokens de salida. |

`GEMINI_API_KEY` nunca se registra en logs ni se devuelve en respuestas.

## Proveedores

El modo se decide una sola vez al arrancar el proceso. No existe fallback silencioso en tiempo de ejecución: si hay API key y Gemini falla, la solicitud falla con `500 AI_PROVIDER_ERROR`.

| Modo | Condición | Embeddings (`embeddingModel`) | LLM (`llmModel`) |
|---|---|---|---|
| `gemini` | `GEMINI_API_KEY` no vacía | `gemini-embedding-001` | `gemini-2.5-flash` |
| `local` | `GEMINI_API_KEY` vacía | `local-hash-768` | `local-extractive-v1` |

### Embedding local determinista `local-hash-768`

Función pura, sin red ni aleatoriedad, que produce vectores de dimensión `768` compatibles con la colección:

1. Normalizar el texto: minúsculas, eliminar diacríticos (NFKD), sustituir todo carácter no alfanumérico por espacio.
2. Tokenizar por espacios y descartar tokens con menos de 2 caracteres.
3. Para cada token, calcular `h = SHA-256(token)`; índice `i = int(h[0:8], 16) % 768`; signo `+1` si `int(h[8:10], 16)` es par, `-1` en caso contrario; sumar el signo en la posición `i`.
4. Normalizar con norma L2. Si el vector resultante es cero, devolver un vector de ceros.

La misma entrada produce siempre el mismo vector; textos con vocabulario compartido producen similitud coseno positiva.

### LLM local determinista `local-extractive-v1`

1. Si no hay fragmentos de contexto, devolver la respuesta de "información insuficiente" (ver "Pipeline de consulta").
2. En caso contrario, construir la respuesta como `"Según el contexto disponible:\n"` seguido de hasta 3 bloques de contexto, en orden de relevancia, cada uno truncado a 300 caracteres y prefijado por `"- [{title}] "`.
3. Tokens estimados: `prompt_tokens = ceil(len(prompt) / 4)`, `completion_tokens = ceil(len(answer) / 4)`, `total_tokens = prompt_tokens + completion_tokens`.

### Gemini

- Embeddings: `client.models.embed_content(model="gemini-embedding-001", contents=[...], config={"output_dimensionality": 768})`. `text-embedding-004` ya no está disponible en la API v1beta.
- Generación: `client.models.generate_content(model="gemini-2.5-flash", contents=prompt, config={"temperature": 0.2, "max_output_tokens": 1024, "system_instruction": SYSTEM_PROMPT})`.
- Tokens: `usage_metadata.prompt_token_count`, `usage_metadata.candidates_token_count` y `usage_metadata.total_token_count`. Un valor ausente se toma como `0`.

`SYSTEM_PROMPT` (literal):

```text
Eres el asistente de la plataforma Toka. Responde en español usando exclusivamente el contexto proporcionado. Si el contexto no contiene la respuesta, indícalo explícitamente. Cita el título de las fuentes utilizadas entre corchetes. Nunca reveles contraseñas, hashes, tokens JWT ni secretos.
```

## Vector store Qdrant

| Propiedad | Valor exacto |
|---|---|
| Colección | `toka_knowledge` |
| Dimensión | `768` |
| Distancia | `Cosine` |
| Índice de payload | `source` como `keyword` |
| ID de punto | `uuid5(NAMESPACE_URL, f"{source}#{chunkIndex}")` |

Al arrancar, si la colección no existe se crea con esta configuración. Si existe con dimensión o distancia distintas, el proceso registra un log `error` y termina sin aceptar tráfico.

### Payload de cada punto

```json
{
  "title": "Política de roles",
  "source": "knowledge/roles-policy.md",
  "chunkIndex": 0,
  "content": "Los roles disponibles son ADMIN, USER y AUDITOR...",
  "ingestedAt": "2026-10-21T17:24:00.000Z"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `title` | `string` | Título del documento de origen. |
| `source` | `string` | Identificador del documento de origen. |
| `chunkIndex` | `integer` | Posición del fragmento, desde `0`. |
| `content` | `string` | Texto del fragmento. |
| `ingestedAt` | `string` | ISO-8601 UTC del momento de ingesta. |

## Documentos de dominio

El corpus inicial vive en `apps/ai-agent-service/knowledge/*.md` y describe exclusivamente lo definido en `specs/01` a `specs/04` (roles, catálogo de eventos, flujo de alta de usuarios, política de auditoría). Se carga con el script `python -m app.scripts.seed_knowledge`, que invoca el mismo caso de uso que `POST /ai/ingest`: `title` es el primer encabezado `#` del archivo y `source` es `knowledge/<nombre-de-archivo>`.

## Autenticación y autorización

Ambos endpoints requieren `Authorization: Bearer <jwt>`. El servicio valida el token llamando a `GET {AUTH_SERVICE_URL}/auth/validate` con el mismo header y usa `data.user` (tipo `AuthUser` de `02-auth-service.spec.md`).

| Endpoint | Roles permitidos |
|---|---|
| `POST /ai/ingest` | `ADMIN` |
| `POST /ai/ask` | `ADMIN`, `USER`, `AUDITOR` |

- Respuesta `401` de `auth-service`, timeout o error de red → `401 TOKEN_INVALID_OR_REVOKED`.
- Rol insuficiente → `403 FORBIDDEN`.

El JWT del solicitante se reenvía sin modificar a `user-service` y `audit-service`; el servicio nunca emite tokens propios.

## Endpoints

Todas las respuestas usan la envoltura de éxito y error de `00-system-context.spec.md`. Los errores de validación de Pydantic se mapean a `400 VALIDATION_ERROR` (nunca `422`), con un elemento en `error.details` por campo inválido, usando notación de punto (`documents.0.content`).

### `POST /ai/ingest`

Fragmenta, vectoriza e indexa documentos de conocimiento. Reingestar un `source` existente reemplaza todos sus fragmentos previos.

**Request**

```json
{
  "documents": [
    {
      "title": "Política de roles",
      "source": "knowledge/roles-policy.md",
      "content": "Los roles disponibles son ADMIN, USER y AUDITOR. Solo ADMIN puede asignar roles..."
    }
  ]
}
```

| Campo | Tipo | Obligatorio | Restricción |
|---|---|---:|---|
| `documents` | `array` | Sí | Entre 1 y 50 elementos; `source` único dentro del request. |
| `documents[].title` | `string` | Sí | 1–200 caracteres tras `strip()`. |
| `documents[].source` | `string` | Sí | 1–500 caracteres tras `strip()`. |
| `documents[].content` | `string` | Sí | 1–100 000 caracteres tras `strip()`. |

No se admiten campos adicionales.

**Fragmentación**

- Ventanas de máximo 1 000 caracteres con solapamiento de 150.
- Si la ventana no termina el documento, se corta en el último espacio en blanco dentro de la ventana, si existe.
- Se descartan fragmentos vacíos tras `strip()`.

**Flujo**

1. Validar request y rol `ADMIN`.
2. Fragmentar cada documento.
3. Calcular embeddings de todos los fragmentos.
4. Por cada `source`: eliminar los puntos con `payload.source == source` y hacer `upsert` de los nuevos puntos.
5. Responder `201`.

**201 Created**

```json
{
  "success": true,
  "data": {
    "collection": "toka_knowledge",
    "embeddingModel": "gemini-embedding-001",
    "documentsIngested": 1,
    "chunksIndexed": 3,
    "documents": [
      {
        "title": "Política de roles",
        "source": "knowledge/roles-policy.md",
        "chunks": 3
      }
    ]
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `collection` | `string` | Siempre `toka_knowledge`. |
| `embeddingModel` | `string` | `gemini-embedding-001` o `local-hash-768`. |
| `documentsIngested` | `integer` | Igual a la longitud de `documents`. |
| `chunksIndexed` | `integer` | Suma de `documents[].chunks`. |
| `documents[].chunks` | `integer` | Fragmentos indexados para ese `source`; `>= 1`. |

**Errores:** `400 VALIDATION_ERROR`, `401 TOKEN_INVALID_OR_REVOKED`, `403 FORBIDDEN`, `500 AI_PROVIDER_ERROR` (fallo de embeddings), `500 VECTOR_STORE_ERROR` (fallo de Qdrant), `500 INTERNAL_ERROR`.

### `POST /ai/ask`

Responde una pregunta combinando conocimiento recuperado de Qdrant y datos en tiempo real.

**Request**

```json
{
  "question": "¿Qué usuarios del departamento Engineering están activos y quién los creó?",
  "topK": 5,
  "includeLiveData": true
}
```

| Campo | Tipo | Obligatorio | Restricción |
|---|---|---:|---|
| `question` | `string` | Sí | 1–2 000 caracteres tras `strip()`. |
| `topK` | `integer` | No | Entre 1 y 10; por defecto `5`. |
| `includeLiveData` | `boolean` | No | Por defecto `true`. |

No se admiten campos adicionales.

**200 OK**

`data` contiene exactamente las claves `answer`, `sources` y `metrics`, sin campos adicionales. Las claves de `metrics` usan `snake_case` por contrato.

```json
{
  "success": true,
  "data": {
    "answer": "Según [Directorio de usuarios (tiempo real)], Ana Pérez (Engineering) está ACTIVE. Según [Auditoría reciente (tiempo real)], fue creada por usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F.",
    "sources": [
      {
        "title": "Directorio de usuarios (tiempo real)",
        "source": "user-service:GET /users",
        "score": 1.0
      },
      {
        "title": "Auditoría reciente (tiempo real)",
        "source": "audit-service:GET /audits",
        "score": 1.0
      },
      {
        "title": "Flujo de alta de usuarios",
        "source": "knowledge/user-onboarding.md",
        "score": 0.8123
      }
    ],
    "metrics": {
      "latency_ms": 842,
      "tokens": {
        "prompt_tokens": 1210,
        "completion_tokens": 96,
        "total_tokens": 1306
      },
      "estimated_cost_usd": 0.000603,
      "quality_validation": {
        "passed": true,
        "score": 1.0,
        "checks": [
          "answer_not_empty:pass",
          "sources_present:pass",
          "grounded_in_context:pass",
          "no_sensitive_data:pass",
          "within_length_limit:pass"
        ]
      }
    }
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `answer` | `string` | Respuesta final, ya redactada si aplica `no_sensitive_data`; máximo 4 000 caracteres. |
| `sources` | `Array<{title, source, score}>` | Fuentes usadas para construir el prompt; `[]` si no hubo contexto. |
| `sources[].title` | `string` | Título legible. |
| `sources[].source` | `string` | `payload.source` de Qdrant, `user-service:GET /users` o `audit-service:GET /audits`. |
| `sources[].score` | `number` | Entre `0` y `1`, redondeado a 4 decimales. Fuentes en tiempo real: `1.0`. |
| `metrics.latency_ms` | `number` | Entero; milisegundos desde la recepción del request hasta construir la respuesta, medido con `time.perf_counter()`. |
| `metrics.tokens.prompt_tokens` | `number` | Entero `>= 0`; tokens de entrada de la llamada al LLM. |
| `metrics.tokens.completion_tokens` | `number` | Entero `>= 0`; tokens de salida del LLM. |
| `metrics.tokens.total_tokens` | `number` | Entero; `prompt_tokens + completion_tokens` en modo local, `total_token_count` en modo `gemini`. |
| `metrics.estimated_cost_usd` | `number` | Ver "Cálculo de costo". |
| `metrics.quality_validation.passed` | `boolean` | Ver "Validación de calidad". |
| `metrics.quality_validation.score` | `number` | Entre `0` y `1`, redondeado a 2 decimales. |
| `metrics.quality_validation.checks` | `string[]` | Exactamente 5 elementos con formato `"<checkId>:pass"` o `"<checkId>:fail"`, en el orden de la tabla de checks. |

Los tokens de embeddings no se contabilizan en `metrics.tokens` ni en el costo.

**Errores:** `400 VALIDATION_ERROR`, `401 TOKEN_INVALID_OR_REVOKED`, `500 AI_PROVIDER_ERROR` (fallo o timeout de Gemini), `500 VECTOR_STORE_ERROR`, `500 INTERNAL_ERROR`.

## Pipeline de consulta (`AskQuestionUseCase`)

1. Iniciar cronómetro y validar request y JWT.
2. En paralelo (`asyncio.gather`):
   - **Recuperación vectorial**: embedding de `question`, búsqueda en `toka_knowledge` con `limit = topK` y descarte de resultados con `score < AI_MIN_SCORE`.
   - **Usuarios en tiempo real** (si `includeLiveData`): `GET {USER_SERVICE_URL}/users`.
   - **Auditoría en tiempo real** (si `includeLiveData` y el solicitante tiene `ADMIN` o `AUDITOR`): `GET {AUDIT_SERVICE_URL}/audits?limit=20`. Para cualquier otro rol no se realiza la llamada.
3. Si una llamada en tiempo real responde distinto de `200`, excede el timeout o falla por red, se omite ese bloque, se registra un log `warn` con `context.dependency` y `context.status`, y el pipeline continúa. Un fallo de Qdrant sí aborta con `500 VECTOR_STORE_ERROR`.
4. Construir el contexto en este orden: fragmentos de Qdrant por score descendente, bloque de usuarios y bloque de auditoría.
   - Fragmento: `"[{title}] ({source})\n{content}"`.
   - Bloque de usuarios (máximo 50 usuarios, en el orden recibido), título `Directorio de usuarios (tiempo real)`, una línea por usuario: `"- {fullName} <{email}> | id={id} | department={department} | status={status} | roles={roles separados por coma}"`.
   - Bloque de auditoría (`data.items`), título `Auditoría reciente (tiempo real)`, una línea por elemento: `"- {occurredAt} {eventType} actor={actorId} target={targetId} source={serviceSource}"`. El `payload` no se incluye.
5. Si el contexto está vacío, no se invoca al LLM y `answer` es exactamente `"No encontré información suficiente en la base de conocimiento ni en los datos disponibles para responder."`, con `sources: []` y tokens en `0`.
6. Construir el prompt: `"Contexto:\n{contexto}\n\nPregunta: {question}"` e invocar el LLM del modo activo.
7. Aplicar validación de calidad y redacción.
8. Calcular costo y `latency_ms`, y responder `200`.

`sources` se deduplica por `source` conservando el score máximo y se ordena por score descendente; ante empate, por `source` ascendente.

## Cálculo de costo

Función pura de dominio:

```text
estimated_cost_usd = round(
  prompt_tokens / 1_000_000 * GEMINI_PRICE_INPUT_PER_MTOK_USD
  + completion_tokens / 1_000_000 * GEMINI_PRICE_OUTPUT_PER_MTOK_USD,
  8
)
```

En modo `local`, `estimated_cost_usd` es `0.0`. Con `prompt_tokens = 1210` y `completion_tokens = 96` en modo `gemini`, el resultado es `0.000603`.

## Validación de calidad

| Orden | `checkId` | Pasa si |
|---:|---|---|
| 1 | `answer_not_empty` | `answer.strip()` no está vacío. |
| 2 | `sources_present` | `len(sources) >= 1`. |
| 3 | `grounded_in_context` | Al menos el 50% de los tokens normalizados de `answer` con longitud `>= 4` aparecen en el contexto. Si `answer` no tiene tokens de esa longitud, falla. |
| 4 | `no_sensitive_data` | `answer` no contiene: un JWT (`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), un hash bcrypt (`\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}`) ni la secuencia `password_hash`. |
| 5 | `within_length_limit` | `len(answer) <= 4000` antes de truncar. |

- Si falla `no_sensitive_data`, cada coincidencia se reemplaza por `[REDACTED]` antes de responder.
- Si falla `within_length_limit`, `answer` se trunca a 4 000 caracteres.
- `score = round(checks_aprobados / 5, 2)`.
- `passed = score >= 0.8 AND answer_not_empty AND no_sensitive_data`.

La normalización de tokens es la misma que la del embedding local (paso 1 y 2).

## Logging

Logger JSON de `00-system-context.spec.md` con `service: "ai-agent-service"`. Prohibido `print`.

| Evento | `level` | `context` |
|---|---|---|
| Ingesta completada | `info` | `documentsIngested`, `chunksIndexed`, `embeddingModel` |
| Pregunta respondida | `info` | `userId`, `questionLength`, `sourcesCount`, `latencyMs`, `totalTokens`, `estimatedCostUsd`, `qualityPassed`, `mode` |
| Dependencia en tiempo real omitida | `warn` | `dependency`, `status` |
| Fallo de Gemini o Qdrant | `error` | `dependency`, `errorType` |

Nunca se registran el texto de `question`, `answer`, el contenido de documentos, el JWT ni `GEMINI_API_KEY`.

## Arquitectura de capas

| Capa | Contenido |
|---|---|
| `domain/` | `KnowledgeDocument`, `Chunk`, `RetrievedChunk`, `Source`, `TokenUsage`, `AnswerMetrics`, `QualityReport`; servicios puros `chunk_text`, `estimate_cost`, `validate_quality`, `normalize_tokens`. |
| `application/` | `IngestDocumentsUseCase`, `AskQuestionUseCase`; puertos `EmbeddingProvider`, `LlmProvider`, `VectorStore`, `UserDirectory`, `AuditTrail`, `TokenValidator`, `Logger`, `Clock`. |
| `infrastructure/` | `GeminiEmbeddingProvider`, `GeminiLlmProvider`, `LocalHashEmbeddingProvider`, `LocalExtractiveLlmProvider`, `QdrantVectorStore`, `HttpUserDirectory`, `HttpAuditTrail`, `HttpTokenValidator`, `JsonLogger`, `Settings`. |
| `presentation/` | Routers FastAPI, esquemas Pydantic de request/response, dependencia de autenticación y manejadores de excepciones que producen la envoltura de error. |

`domain/` no importa `fastapi`, `pydantic`, `google.genai`, `qdrant_client` ni `httpx`.

## Supuestos pendientes de ratificar

- `00-system-context.spec.md` no define el header de propagación de `traceId`. Este servicio lee y reenvía `X-Trace-Id`; si falta, genera `trc_<ULID>`. Debe ratificarse en `00` para que todos los servicios lo usen.
- Precios por defecto de `gemini-2.5-flash` tomados como configuración; deben revisarse contra la tarifa vigente antes de producción.

## Criterios de aceptación y pruebas unitarias (`pytest`)

Las pruebas se ejecutan sin `GEMINI_API_KEY`, con `QdrantClient(":memory:")` y `respx` para simular `auth-service`, `user-service` y `audit-service`.

### Dominio

- [ ] `chunk_text` respeta 1 000 caracteres máximos, 150 de solapamiento, corte en espacio y descarte de fragmentos vacíos.
- [ ] `LocalHashEmbeddingProvider` devuelve vectores de dimensión 768, normalizados L2 y idénticos para la misma entrada.
- [ ] Textos con vocabulario compartido tienen similitud coseno mayor que textos sin vocabulario común.
- [ ] `estimate_cost` produce `0.000603` para 1 210 / 96 tokens con los precios por defecto y `0.0` en modo local.
- [ ] `validate_quality` emite exactamente 5 checks en el orden definido y con formato `<checkId>:pass|fail`.
- [ ] `validate_quality` calcula `score` y `passed` según las reglas; `passed` es `false` si falla `no_sensitive_data` aunque `score >= 0.8`.
- [ ] Un JWT o hash bcrypt en `answer` se reemplaza por `[REDACTED]`.
- [ ] Una respuesta mayor a 4 000 caracteres se trunca y marca `within_length_limit:fail`.

### Aplicación — ingesta

- [ ] `IngestDocumentsUseCase` indexa los fragmentos con el payload exacto y los IDs `uuid5` definidos.
- [ ] Reingestar el mismo `source` reemplaza los fragmentos previos sin dejar puntos huérfanos.
- [ ] La respuesta reporta `collection`, `embeddingModel`, `documentsIngested`, `chunksIndexed` y `documents[].chunks` correctos.

### Aplicación — consulta

- [ ] `AskQuestionUseCase` devuelve `data` con exactamente las claves `answer`, `sources` y `metrics`, y `metrics` con exactamente `latency_ms`, `tokens`, `estimated_cost_usd` y `quality_validation`.
- [ ] Se descartan fragmentos con `score < AI_MIN_SCORE`.
- [ ] Con `includeLiveData: true` se consulta `GET /users` y, para `ADMIN`/`AUDITOR`, `GET /audits?limit=20`, reenviando el JWT.
- [ ] Un solicitante con solo `USER` no dispara la llamada a `GET /audits`.
- [ ] Con `includeLiveData: false` no se realiza ninguna llamada a `user-service` ni `audit-service`.
- [ ] Un `500`, `403` o timeout de una dependencia en tiempo real omite su bloque, registra `warn` y la respuesta es `200`.
- [ ] Un fallo de Qdrant produce `500 VECTOR_STORE_ERROR`.
- [ ] Con contexto vacío no se invoca al LLM, `answer` es el texto literal de información insuficiente, `sources` es `[]` y los tokens son `0`.
- [ ] `sources` se deduplica por `source`, conserva el score máximo y se ordena según el contrato.
- [ ] `latency_ms` es un entero no negativo calculado con un `Clock` inyectable.
- [ ] En modo `gemini` (SDK simulado), los tokens se toman de `usage_metadata` y un error del SDK produce `500 AI_PROVIDER_ERROR`.

### Presentación

- [ ] Los errores de validación devuelven `400 VALIDATION_ERROR` con la envoltura de `00` y nunca `422`.
- [ ] Campos adicionales en `POST /ai/ingest` y `POST /ai/ask` se rechazan con `400`.
- [ ] Sin JWT o con `401` de `auth-service` se responde `401 TOKEN_INVALID_OR_REVOKED`.
- [ ] `POST /ai/ingest` con un rol distinto de `ADMIN` responde `403 FORBIDDEN`.
- [ ] El `traceId` recibido en `X-Trace-Id` se devuelve en la respuesta y se propaga a las dependencias.
- [ ] Los logs son JSON de una sola línea con los campos de `00` y no contienen pregunta, respuesta, JWT ni API key.
- [ ] La cobertura de `domain/` y `application/` es superior a 75%.
