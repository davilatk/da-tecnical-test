# Toka — Plataforma de identidades con auditoría y asistente RAG

Monorepo con cuatro microservicios, un cliente web y su infraestructura, construido con **Spec-Driven Development (SDD)**: cada contrato (endpoint, DTO, evento, esquema de datos o log) se define primero en [`/specs`](specs/), y el código de [`apps/`](apps/) y [`packages/`](packages/) lo implementa sin inventar nada fuera de la spec.

| Componente | Stack | Puerto | Spec |
|---|---|---:|---|
| `auth-service` | NestJS · PostgreSQL `auth_db` · Redis · RabbitMQ | 3001 (interno) | [`02`](specs/02-auth-service.spec.md) |
| `user-service` | NestJS · PostgreSQL `user_db` · Redis · RabbitMQ | 3002 | [`03`](specs/03-user-service.spec.md) |
| `audit-service` | NestJS · MongoDB `audit_db` · RabbitMQ | 3003 | [`04`](specs/04-audit-service.spec.md) |
| `ai-agent-service` | FastAPI · Qdrant · Gemini (o modo local determinista) | 8000 | [`05`](specs/05-ai-agent-rag.spec.md) |
| `web-client` | React 18 · Vite · HeroUI · Zustand · Nginx | 80 | [`06`](specs/06-web-client.spec.md) |
| `@toka/shared` | Contratos transversales (envolturas HTTP, logger, JWT, eventos) | — | [`00`](specs/00-system-context.spec.md), [`01`](specs/01-contracts-events.spec.md) |

## Metodología SDD

El flujo de trabajo está fijado en [`.cursorrules`](.cursorrules) y aplicado en cada servicio:

1. **Spec primero.** Cada servicio tiene un archivo `specs/NN-*.spec.md` con stack, modelo de datos, endpoints con request/response exactos, códigos de error, eventos, logging y criterios de aceptación. Si un contrato no está en la spec, no se implementa: se completa primero la spec.
2. **Contratos transversales.** [`00-system-context`](specs/00-system-context.spec.md) fija puertos, la envoltura `{ success, data | error, traceId }` y el logger JSON de una línea (`timestamp`, `level`, `service`, `traceId`, `message`, `context`). [`01-contracts-events`](specs/01-contracts-events.spec.md) fija el payload JWT, el exchange `toka.events` y los JSON Schemas de los 5 eventos de dominio.
3. **Dominio y DTOs exactos**, luego **tests unitarios derivados de los criterios de aceptación** (Jest / Pytest, cobertura > 70 %) y, por último, casos de uso, infraestructura y controladores hasta que los tests pasan.
4. **Trazabilidad.** Los criterios cumplidos se marcan con `[x]` dentro de cada `.spec.md`.
5. **Clean Architecture + DDD** en 4 capas por servicio (`domain` → `application` → `infrastructure` / `presentation`), con dependencias apuntando hacia el dominio.

### Documentación

| Documento | Contenido |
|---|---|
| [`docs/01-architecture.md`](docs/01-architecture.md) | Arquitectura: componentes, flujos, decisiones y trade-offs (Ejercicio 1). |
| [`docs/04-incident-response.md`](docs/04-incident-response.md) | Respuesta a incidentes: hipótesis priorizadas, diagnóstico con el logger JSON, mitigación de latencia/costo de IA y comunicación (Ejercicio 4). |
| [`docs/05-prompt-engineering.md`](docs/05-prompt-engineering.md) | System prompt, pipeline RAG, evaluación de calidad y costo (Ejercicio 5). |

## Levantar el entorno completo

**Requisitos:** Docker Engine con Compose v2.

```bash
cp .env.example .env          # valores de desarrollo; ajustar JWT_SECRET si se desea
docker compose up --build     # añadir -d --wait para dejarlo en segundo plano
```

Compose construye las cinco imágenes de aplicación y arranca en orden según los healthchecks: primero PostgreSQL, MongoDB, Redis, RabbitMQ y Qdrant; después `auth-service`, `user-service` y `audit-service`; luego `ai-agent-service` y, al final, `web-client`. Al arrancar, `auth-service` crea su esquema y la semilla de roles y del administrador.

| URL | Servicio |
|---|---|
| <http://localhost> | Web client (SPA + proxy same-origin hacia los servicios) |
| <http://localhost:3002> | `user-service` |
| <http://localhost:3003> | `audit-service` |
| <http://localhost:8000> | `ai-agent-service` |
| <http://localhost:15672> | Consola de RabbitMQ (`toka` / `toka_dev`) |

`auth-service` no publica puerto al host (spec `00`: HTTP interno); se accede a través del proxy del web client (`/auth/*`, `/roles`).

**Puertos ocupados.** Si el 80 o el 8000 ya están en uso, sobrescríbelos al levantar el entorno:

```bash
WEB_CLIENT_PORT=8081 AI_AGENT_SERVICE_PORT=8001 docker compose up --build
```

**Base de conocimiento del asistente.** Para indexar los documentos de `apps/ai-agent-service/knowledge/` en Qdrant (spec `05`), con el entorno arriba:

```bash
docker compose exec ai-agent-service python -m app.scripts.seed_knowledge
```

**Modo del asistente.** Con `GEMINI_API_KEY` vacía, `ai-agent-service` usa el modo local determinista (`local-hash-768` + `local-extractive-v1`, costo `0.0`), sin llamadas externas. Con una clave, usa Gemini.

**Apagar:** `docker compose down` (añadir `-v` para borrar los volúmenes de datos).

## Credenciales de acceso

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@toka.com` | `Admin123!` | `ADMIN` |

Semilla definida en [`specs/02-auth-service.spec.md`](specs/02-auth-service.spec.md); la contraseña se persiste solo como hash. Desde el panel de administración se pueden crear usuarios con roles `USER` o `AUDITOR`.

Prueba rápida por API:

```bash
curl -s localhost/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@toka.com","password":"Admin123!"}'
```

## Tests y cobertura

### Servicios TypeScript (`@toka/shared`, `auth-service`, `user-service`, `audit-service`, `web-client`)

Requisitos: Node ≥ 20 y pnpm 9 (fijado en `packageManager`; `corepack enable` lo activa).

```bash
pnpm install
pnpm --filter @toka/shared build   # los servicios consumen el paquete compilado
pnpm test                          # suite completa (web-client incluye ESLint no-console)
pnpm test:cov                      # suite completa con reporte de cobertura
pnpm --filter user-service test:cov   # un solo servicio
```

Cada paquete aplica umbrales de cobertura en su `jest.config.js` y deja el reporte HTML en `<paquete>/coverage/lcov-report/index.html`.

Sin Node en el host, la misma suite corre en un contenedor:

```bash
docker run --rm -v "$PWD:/repo" -w /repo node:22-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @toka/shared build && pnpm test:cov"
```

### `ai-agent-service` (Pytest)

```bash
cd apps/ai-agent-service
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
pytest                              # pytest.ini añade --cov=domain --cov=application
```

En contenedor:

```bash
docker run --rm -v "$PWD/apps/ai-agent-service:/service" -w /service python:3.11-slim \
  sh -c "pip install -q -r requirements.txt && pytest -p no:cacheprovider"
```

Las pruebas no requieren `GEMINI_API_KEY` ni servicios externos: usan Qdrant en memoria y dobles de `auth-service`, `user-service` y `audit-service`.

## Estructura

```text
specs/        Especificaciones SDD (fuente de verdad de contratos)
docs/         Arquitectura, respuesta a incidentes, prompt engineering
packages/     @toka/shared — contratos transversales
apps/         auth-service, user-service, audit-service, ai-agent-service, web-client
infra/        Inicialización de PostgreSQL (auth_db, user_db)
docker-compose.yml
```
