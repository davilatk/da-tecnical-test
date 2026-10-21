# 01 — Contratos de autenticación y eventos

## JWT payload

Todo JWT de acceso emitido por `auth-service` contiene exactamente estas claves:

```json
{
  "sub": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "email": "admin@toka.com",
  "roles": ["ADMIN"],
  "iat": 1792603440,
  "exp": 1792607040
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `sub` | `string` | Identificador no vacío del sujeto autenticado. |
| `email` | `string` | Correo electrónico válido. |
| `roles` | `('ADMIN' \| 'USER' \| 'AUDITOR')[]` | Lista no vacía sin valores repetidos. |
| `iat` | `number` | Tiempo Unix en segundos de emisión. |
| `exp` | `number` | Tiempo Unix en segundos; debe ser mayor que `iat`. |

## RabbitMQ

| Recurso | Configuración exacta |
|---|---|
| Exchange | Nombre: `toka.events`; tipo: `topic`; durable: `true`. |
| Cola de auditoría | Nombre: `audit.events.queue`; durable: `true`; vinculada a `toka.events` con routing key `#`. |

Los productores publican cada evento en el exchange `toka.events` usando como routing key el valor de `eventType`. Los mensajes son JSON UTF-8 persistentes.

## Sobre común de evento de dominio

Cada evento publicado cumple este JSON Schema Draft 2020-12. `payload` está definido por evento en las secciones siguientes.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["eventId", "eventType", "occurredAt", "actorId", "targetId", "serviceSource", "payload"],
  "properties": {
    "eventId": { "type": "string", "minLength": 1 },
    "eventType": {
      "type": "string",
      "enum": ["auth.user.logged_in", "auth.role.assigned", "user.created", "user.updated", "user.deleted"]
    },
    "occurredAt": { "type": "string", "format": "date-time" },
    "actorId": { "type": "string", "minLength": 1 },
    "targetId": { "type": "string", "minLength": 1 },
    "serviceSource": { "type": "string", "enum": ["auth-service", "user-service"] },
    "payload": { "type": "object" }
  }
}
```

## Eventos

### `auth.user.logged_in`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "#/$defs/envelope" },
    {
      "properties": {
        "eventType": { "const": "auth.user.logged_in" },
        "serviceSource": { "const": "auth-service" },
        "payload": {
          "type": "object",
          "additionalProperties": false,
          "required": ["email"],
          "properties": { "email": { "type": "string", "format": "email" } }
        }
      }
    }
  ],
  "$defs": { "envelope": { "type": "object", "additionalProperties": false, "required": ["eventId", "eventType", "occurredAt", "actorId", "targetId", "serviceSource", "payload"], "properties": { "eventId": { "type": "string", "minLength": 1 }, "eventType": { "type": "string" }, "occurredAt": { "type": "string", "format": "date-time" }, "actorId": { "type": "string", "minLength": 1 }, "targetId": { "type": "string", "minLength": 1 }, "serviceSource": { "type": "string" }, "payload": { "type": "object" } } } }
}
```

`actorId` y `targetId` son el identificador del usuario que inició sesión.

### `auth.role.assigned`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["eventId", "eventType", "occurredAt", "actorId", "targetId", "serviceSource", "payload"],
  "properties": {
    "eventId": { "type": "string", "minLength": 1 },
    "eventType": { "const": "auth.role.assigned" },
    "occurredAt": { "type": "string", "format": "date-time" },
    "actorId": { "type": "string", "minLength": 1 },
    "targetId": { "type": "string", "minLength": 1 },
    "serviceSource": { "const": "auth-service" },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["role"],
      "properties": { "role": { "type": "string", "enum": ["ADMIN", "USER", "AUDITOR"] } }
    }
  }
}
```

### `user.created`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["eventId", "eventType", "occurredAt", "actorId", "targetId", "serviceSource", "payload"],
  "properties": {
    "eventId": { "type": "string", "minLength": 1 },
    "eventType": { "const": "user.created" },
    "occurredAt": { "type": "string", "format": "date-time" },
    "actorId": { "type": "string", "minLength": 1 },
    "targetId": { "type": "string", "minLength": 1 },
    "serviceSource": { "const": "user-service" },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["email", "fullName", "department", "status", "roles"],
      "properties": {
        "email": { "type": "string", "format": "email" },
        "fullName": { "type": "string", "minLength": 1 },
        "department": { "type": "string", "minLength": 1 },
        "status": { "type": "string", "enum": ["ACTIVE", "INACTIVE"] },
        "roles": { "type": "array", "minItems": 1, "uniqueItems": true, "items": { "type": "string", "enum": ["ADMIN", "USER", "AUDITOR"] } }
      }
    }
  }
}
```

### `user.updated`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["eventId", "eventType", "occurredAt", "actorId", "targetId", "serviceSource", "payload"],
  "properties": {
    "eventId": { "type": "string", "minLength": 1 },
    "eventType": { "const": "user.updated" },
    "occurredAt": { "type": "string", "format": "date-time" },
    "actorId": { "type": "string", "minLength": 1 },
    "targetId": { "type": "string", "minLength": 1 },
    "serviceSource": { "const": "user-service" },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["changedFields"],
      "properties": {
        "changedFields": { "type": "array", "minItems": 1, "uniqueItems": true, "items": { "type": "string", "enum": ["fullName", "department", "status"] } }
      }
    }
  }
}
```

### `user.deleted`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["eventId", "eventType", "occurredAt", "actorId", "targetId", "serviceSource", "payload"],
  "properties": {
    "eventId": { "type": "string", "minLength": 1 },
    "eventType": { "const": "user.deleted" },
    "occurredAt": { "type": "string", "format": "date-time" },
    "actorId": { "type": "string", "minLength": 1 },
    "targetId": { "type": "string", "minLength": 1 },
    "serviceSource": { "const": "user-service" },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["email"],
      "properties": { "email": { "type": "string", "format": "email" } }
    }
  }
}
```
