# 04 — Audit Service

## Stack y responsabilidades

| Área | Tecnología / contrato |
|---|---|
| Framework | NestJS |
| Persistencia | Mongoose con MongoDB, base `audit_db` |
| Consumo | Consumidor RabbitMQ de la cola durable `audit.events.queue`. |

La cola recibe todos los eventos vinculados al exchange `toka.events` con routing key `#`. El consumidor valida los eventos contra `01-contracts-events.spec.md` antes de persistirlos.

## Modelo `AuditLog`

Cada documento de la colección `audit_logs` se ajusta al siguiente contrato:

```json
{
  "eventId": "evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "eventType": "user.created",
  "occurredAt": "2026-10-21T17:24:00.000Z",
  "actorId": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "targetId": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "serviceSource": "user-service",
  "payload": {
    "email": "ana@toka.com",
    "fullName": "Ana Pérez",
    "department": "Engineering",
    "status": "ACTIVE",
    "roles": ["USER"]
  },
  "createdAt": "2026-10-21T17:24:01.000Z"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `eventId` | `string` | Requerido, único e indexado. |
| `eventType` | `string` | Requerido; uno de los cinco tipos definidos en el contrato de eventos. |
| `occurredAt` | `Date` | Requerido, fecha UTC del evento. |
| `actorId` | `string` | Requerido e indexado. |
| `targetId` | `string` | Requerido. |
| `serviceSource` | `string` | Requerido; `auth-service` o `user-service`. |
| `payload` | `Mixed` | Requerido; conserva exactamente el payload validado del evento. |
| `createdAt` | `Date` | Requerido, fecha UTC de persistencia. |

Índices obligatorios: único sobre `eventId`; compuesto descendente sobre `{ occurredAt: -1, eventId: -1 }`; e índice sobre `{ eventType: 1, occurredAt: -1 }` y `{ actorId: 1, occurredAt: -1 }`.

## Consumidor asíncrono e idempotente

1. Recibir el mensaje desde `audit.events.queue`.
2. Validar que el sobre y el `payload` satisfacen el JSON Schema de su `eventType`.
3. Buscar o insertar por `eventId`.
4. Si `eventId` ya existe, confirmar el mensaje sin crear otro `AuditLog`.
5. Si se persiste correctamente, confirmar el mensaje.
6. Si la validación o persistencia falla, no confirmar el mensaje para permitir su manejo por la política del broker.

El consumidor no modifica el evento ni genera eventos adicionales.

## Endpoints

Los endpoints requieren `Authorization: Bearer <jwt>` válido con rol `ADMIN` o `AUDITOR`.

### `GET /audits`

Consulta los logs más recientes. Todos los filtros son opcionales.

| Query parameter | Tipo | Restricción | Valor por defecto |
|---|---|---|---|
| `eventType` | `string` | Uno de los cinco tipos de evento. | Sin filtro |
| `actorId` | `string` | Identificador no vacío. | Sin filtro |
| `limit` | `integer` | Entre 1 y 100. | `50` |

**Ejemplo:** `GET /audits?eventType=user.created&actorId=usr_01&limit=20`

**200 OK**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "eventId": "evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
        "eventType": "user.created",
        "occurredAt": "2026-10-21T17:24:00.000Z",
        "actorId": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
        "targetId": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
        "serviceSource": "user-service",
        "payload": {
          "email": "ana@toka.com",
          "fullName": "Ana Pérez",
          "department": "Engineering",
          "status": "ACTIVE",
          "roles": ["USER"]
        },
        "createdAt": "2026-10-21T17:24:01.000Z"
      }
    ],
    "limit": 20
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

Los elementos se ordenan por `occurredAt` descendente y, ante empate, por `eventId` descendente. **Errores:** `400 VALIDATION_ERROR`, `401 TOKEN_INVALID_OR_REVOKED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

### `GET /audits/stats`

Entrega contadores agregados de todos los logs persistidos. No admite parámetros.

**200 OK**

```json
{
  "success": true,
  "data": {
    "total": 15,
    "byEventType": {
      "auth.user.logged_in": 4,
      "auth.role.assigned": 1,
      "user.created": 5,
      "user.updated": 3,
      "user.deleted": 2
    }
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

`total` y cada contador son enteros mayores o iguales a cero. `byEventType` siempre incluye las cinco claves, incluso con valor `0`. **Errores:** `401 TOKEN_INVALID_OR_REVOKED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

## Criterios de aceptación y pruebas unitarias

- [x] La conexión Mongoose usa la base `audit_db` y crea los índices definidos para `AuditLog`.
- [x] El consumidor está vinculado a `audit.events.queue`.
- [x] Cada uno de los cinco eventos válidos se persiste sin alterar el sobre ni el payload.
- [x] Eventos inválidos no se persisten ni se confirman.
- [x] Reentregar el mismo `eventId` no crea un segundo documento y confirma el mensaje.
- [x] `GET /audits` valida `eventType`, `actorId` y el rango de `limit`.
- [x] `GET /audits` aplica filtros y orden definidos en el contrato.
- [x] `GET /audits/stats` devuelve las cinco claves y los contadores correctos.
- [x] Ambos endpoints rechazan tokens inválidos y roles no autorizados.
- [x] Las pruebas unitarias de dominio y aplicación alcanzan cobertura superior a 75%.
