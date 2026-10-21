# 00 — Contexto del sistema y contratos transversales

## Propósito

Este documento define los contratos comunes obligatorios para los servicios de Toka. Ningún servicio puede exponer un formato de respuesta, error o log distinto de los definidos aquí.

## Mapa de puertos

| Componente | Puerto | Exposición |
|---|---:|---|
| `auth-service` | `3001` | HTTP interno |
| `user-service` | `3002` | HTTP |
| `audit-service` | `3003` | HTTP |
| `ai-agent-service` | `8000` | HTTP |
| `web-client` | `5173` | Desarrollo |
| `web-client` | `80` | Producción |

Las llamadas entre contenedores utilizan el nombre del servicio y su puerto; por ejemplo, `http://auth-service:3001`.

## Logger JSON

Todo log se emite como una única línea JSON, sin prefijos ni texto adicional. No se permite `console.log` ni `print`.

### Estructura exacta

```json
{
  "timestamp": "2026-10-21T17:24:00.000Z",
  "level": "info",
  "service": "auth-service",
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "message": "login accepted",
  "context": {
    "userId": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
  }
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `timestamp` | `string` | Fecha ISO-8601 UTC. |
| `level` | `string` | Uno de: `debug`, `info`, `warn`, `error`. |
| `service` | `string` | Nombre del servicio que genera el log. |
| `traceId` | `string` | Identificador de trazabilidad no vacío propagado entre servicios. |
| `message` | `string` | Mensaje legible no vacío. |
| `context` | `object` | Datos estructurados del evento; nunca credenciales, contraseñas ni JWT. |

## Respuesta HTTP exitosa

Toda respuesta HTTP con código `200`, `201` o `204` sigue estas reglas:

- `200` y `201` devuelven `application/json` y la envoltura siguiente.
- `204` no incluye cuerpo.
- `traceId` coincide con el identificador de la solicitud o se genera uno si no se recibió.

```json
{
  "success": true,
  "data": {},
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `success` | `boolean` | Siempre `true`. |
| `data` | `object` o `array` | Payload definido por el contrato del endpoint. |
| `traceId` | `string` | Identificador no vacío de la solicitud. |

## Respuesta HTTP de error

Toda respuesta HTTP con código `400`, `401`, `403`, `404`, `409` o `500` devuelve `application/json` con esta estructura exacta:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be a valid email address",
    "details": [
      {
        "field": "email",
        "message": "must be a valid email address"
      }
    ]
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `success` | `boolean` | Siempre `false`. |
| `error.code` | `string` | Código estable definido por el endpoint. |
| `error.message` | `string` | Mensaje seguro para cliente. |
| `error.details` | `array` | Lista de errores de campo; `[]` cuando no aplique. |
| `error.details[].field` | `string` | Campo de entrada; puede ser `null` para errores no asociados a un campo. |
| `error.details[].message` | `string` | Explicación segura del error. |
| `traceId` | `string` | Identificador no vacío de la solicitud. |

Los servicios no exponen stack traces, consultas, secretos ni mensajes internos de proveedores.
