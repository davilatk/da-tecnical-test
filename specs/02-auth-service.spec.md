# 02 — Auth Service

## Stack y responsabilidades

| Área | Tecnología / contrato |
|---|---|
| Framework | NestJS |
| Persistencia | TypeORM con PostgreSQL, base `auth_db` |
| Revocación | Redis como blacklist de JWT revocados; clave `auth:blacklist:{tokenId}` con TTL igual a la vida restante del token. |
| Eventos | Publisher RabbitMQ al exchange `toka.events`, según `01-contracts-events.spec.md`. |

El servicio es la fuente de verdad de credenciales y roles. Los endpoints protegidos aceptan `Authorization: Bearer <jwt>`.

## Modelo relacional

### Tabla `roles`

| Columna | Tipo PostgreSQL | Restricciones |
|---|---|---|
| `name` | `varchar(20)` | PK; uno de `ADMIN`, `USER`, `AUDITOR`. |
| `created_at` | `timestamptz` | NOT NULL, default `now()`. |

### Tabla `auth_credentials`

| Columna | Tipo PostgreSQL | Restricciones |
|---|---|---|
| `id` | `uuid` | PK, NOT NULL. |
| `email` | `varchar(254)` | NOT NULL, UNIQUE; almacenado en minúsculas. |
| `password_hash` | `varchar(255)` | NOT NULL; nunca se expone en HTTP ni eventos. |
| `roles` | `varchar(20)[]` | NOT NULL; cada valor referencia `roles.name`; mínimo un rol. |
| `created_at` | `timestamptz` | NOT NULL, default `now()`. |
| `updated_at` | `timestamptz` | NOT NULL, default `now()`. |

### Seed obligatorio

Al inicializar la base, se insertan los roles `ADMIN`, `USER` y `AUDITOR`, y la credencial:

| Campo | Valor |
|---|---|
| `email` | `admin@toka.com` |
| Contraseña inicial | `Admin123!` |
| `roles` | `["ADMIN"]` |

La contraseña se persiste exclusivamente como hash; el literal de la semilla no se registra.

## Tipos compartidos

```json
{
  "UserRole": ["ADMIN", "USER", "AUDITOR"],
  "AuthUser": {
    "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
    "email": "admin@toka.com",
    "roles": ["ADMIN"]
  }
}
```

Todos los identificadores `id` son `string` no vacíos. Las contraseñas tienen entre 8 y 128 caracteres y deben contener al menos una mayúscula, una minúscula, un dígito y un carácter no alfanumérico.

## Endpoints

### `POST /auth/register`

Registra una credencial. No requiere autenticación.

**Request**

```json
{
  "email": "ana@toka.com",
  "password": "Password123!",
  "roles": ["USER"]
}
```

| Campo | Tipo | Obligatorio | Restricción |
|---|---|---:|---|
| `email` | `string` | Sí | Email válido; normalizado a minúsculas. |
| `password` | `string` | Sí | Política de contraseña compartida. |
| `roles` | `UserRole[]` | No | Sin duplicados; valor por defecto `["USER"]`. |

**201 Created**

```json
{
  "success": true,
  "data": {
    "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
    "email": "ana@toka.com",
    "roles": ["USER"]
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

**Errores:** `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED`, `500 INTERNAL_ERROR`.

### `POST /auth/login`

Autentica una credencial y publica `auth.user.logged_in`. No requiere autenticación.

**Request**

```json
{
  "email": "admin@toka.com",
  "password": "Admin123!"
}
```

**200 OK**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfMDEifQ.signature",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "user": {
      "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
      "email": "admin@toka.com",
      "roles": ["ADMIN"]
    }
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

`expiresIn` es `number` en segundos y debe corresponder a `exp - iat` del JWT. **Errores:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `500 INTERNAL_ERROR`.

### `GET /auth/validate`

Valida que el JWT sea verificable, no esté expirado ni figure en Redis como revocado.

**200 OK**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": {
      "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
      "email": "admin@toka.com",
      "roles": ["ADMIN"]
    }
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

**Errores:** `401 TOKEN_INVALID_OR_REVOKED`, `500 INTERNAL_ERROR`.

### `GET /roles`

Lista los roles disponibles. Requiere JWT cuyo payload incluya `ADMIN`.

**200 OK**

```json
{
  "success": true,
  "data": ["ADMIN", "USER", "AUDITOR"],
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

**Errores:** `401 TOKEN_INVALID_OR_REVOKED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

### `POST /roles/assign`

Asigna un rol a una credencial y publica `auth.role.assigned`. Requiere JWT con rol `ADMIN`.

**Request**

```json
{
  "userId": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "role": "AUDITOR"
}
```

| Campo | Tipo | Obligatorio | Restricción |
|---|---|---:|---|
| `userId` | `string` | Sí | Identificador de una credencial existente. |
| `role` | `UserRole` | Sí | Debe ser un rol existente. |

**200 OK**

```json
{
  "success": true,
  "data": {
    "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
    "email": "ana@toka.com",
    "roles": ["USER", "AUDITOR"]
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

La operación es idempotente: si el rol ya está asignado, responde `200` sin duplicarlo y no publica un evento nuevo. **Errores:** `400 VALIDATION_ERROR`, `401 TOKEN_INVALID_OR_REVOKED`, `403 FORBIDDEN`, `404 AUTH_USER_NOT_FOUND`, `500 INTERNAL_ERROR`.

## Criterios de aceptación y pruebas unitarias

- [x] Se crean las tablas, restricciones y semilla definidos.
- [x] `POST /auth/register` crea una credencial con hash, normaliza el email y aplica `USER` como rol por defecto.
- [x] El registro duplicado responde `409 EMAIL_ALREADY_REGISTERED`.
- [x] `POST /auth/login` emite un JWT con el payload exacto de `01-contracts-events.spec.md`.
- [x] El login con credenciales inválidas responde `401 INVALID_CREDENTIALS` sin revelar cuál campo falló.
- [x] El login publica `auth.user.logged_in` con el schema contractual.
- [x] `GET /auth/validate` rechaza tokens inválidos, expirados o presentes en la blacklist Redis.
- [x] `GET /roles` y `POST /roles/assign` exigen el rol `ADMIN`.
- [x] La asignación de rol es idempotente y publica un único evento cuando cambia el estado.
- [x] Las pruebas unitarias de dominio y aplicación alcanzan cobertura superior a 75%.
