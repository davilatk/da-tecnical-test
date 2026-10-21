# 03 — User Service

## Stack y responsabilidades

| Área | Tecnología / contrato |
|---|---|
| Framework | NestJS |
| Persistencia | TypeORM con PostgreSQL, base `user_db` |
| Caché | Redis Cache-Aside, TTL de 60 segundos. |
| Eventos | Publisher RabbitMQ al exchange `toka.events`. |

Las claves Redis son exactamente `users:all` para el listado y `users:id:{id}` para un usuario. Toda creación, actualización o eliminación invalida ambas claves afectadas.

## Entidad `User`

```json
{
  "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
  "email": "ana@toka.com",
  "fullName": "Ana Pérez",
  "department": "Engineering",
  "status": "ACTIVE",
  "roles": ["USER"],
  "createdAt": "2026-10-21T17:24:00.000Z",
  "updatedAt": "2026-10-21T17:24:00.000Z"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | `string` | PK no vacío; usa el `id` devuelto por `auth-service` durante el alta. |
| `email` | `string` | Email válido, único, en minúsculas. |
| `fullName` | `string` | No vacío, longitud máxima 200. |
| `department` | `string` | No vacío, longitud máxima 100. |
| `status` | `string` | `ACTIVE` o `INACTIVE`. |
| `roles` | `('ADMIN' \| 'USER' \| 'AUDITOR')[]` | Lista no vacía y sin duplicados; se toma de la respuesta del registro de `auth-service`. |
| `createdAt` | `string` | ISO-8601 UTC. |
| `updatedAt` | `string` | ISO-8601 UTC. |

En esta versión, `roles` es la proyección obtenida al crear el usuario. La gestión autoritativa de roles pertenece a `auth-service`; este servicio no ofrece un endpoint para reasignarlos.

## Flujo de `CreateUserUseCase`

1. Validar el request de creación.
2. Ejecutar síncronamente `POST http://auth-service:3001/auth/register` con:

```json
{
  "email": "ana@toka.com",
  "password": "Password123!",
  "roles": ["USER"]
}
```

3. Si `auth-service` devuelve error, no persistir `User` y propagar el mismo estado HTTP y cuerpo de error.
4. Crear `User` usando el `data.id` y `data.roles` de la respuesta de `auth-service`.
5. Publicar `user.created`, invalidar `users:all` y responder `201`.

## Endpoints

Los endpoints requieren `Authorization: Bearer <jwt>` válido. El `actorId` de los eventos es el `sub` del JWT autenticado.

### `GET /users`

**200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
      "email": "ana@toka.com",
      "fullName": "Ana Pérez",
      "department": "Engineering",
      "status": "ACTIVE",
      "roles": ["USER"],
      "createdAt": "2026-10-21T17:24:00.000Z",
      "updatedAt": "2026-10-21T17:24:00.000Z"
    }
  ],
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

Lee primero `users:all`; en miss, consulta PostgreSQL y guarda la lista con TTL 60 s. **Errores:** `401 TOKEN_INVALID_OR_REVOKED`, `500 INTERNAL_ERROR`.

### `GET /users/:id`

`id` debe ser un identificador no vacío.

**200 OK:** devuelve la envoltura común con un objeto `User` como `data`.

```json
{
  "success": true,
  "data": {
    "id": "usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F",
    "email": "ana@toka.com",
    "fullName": "Ana Pérez",
    "department": "Engineering",
    "status": "ACTIVE",
    "roles": ["USER"],
    "createdAt": "2026-10-21T17:24:00.000Z",
    "updatedAt": "2026-10-21T17:24:00.000Z"
  },
  "traceId": "trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F"
}
```

Lee primero `users:id:{id}`; en miss, consulta PostgreSQL y guarda el objeto durante 60 s. **Errores:** `401 TOKEN_INVALID_OR_REVOKED`, `404 USER_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `POST /users`

**Request**

```json
{
  "email": "ana@toka.com",
  "password": "Password123!",
  "fullName": "Ana Pérez",
  "department": "Engineering",
  "roles": ["USER"]
}
```

| Campo | Tipo | Obligatorio | Restricción |
|---|---|---:|---|
| `email` | `string` | Sí | Email válido. |
| `password` | `string` | Sí | Política de contraseña definida en `02-auth-service.spec.md`; nunca se persiste ni retorna aquí. |
| `fullName` | `string` | Sí | 1–200 caracteres. |
| `department` | `string` | Sí | 1–100 caracteres. |
| `roles` | `UserRole[]` | No | Sin duplicados; por defecto `["USER"]`. |

**201 Created:** devuelve la envoltura común con el `User` creado como `data`.

**Errores:** `400 VALIDATION_ERROR`, `401 TOKEN_INVALID_OR_REVOKED`, `409 EMAIL_ALREADY_REGISTERED`, `500 INTERNAL_ERROR`.

### `PATCH /users/:id`

Solo admite los campos siguientes; al menos uno debe estar presente.

**Request**

```json
{
  "fullName": "Ana María Pérez",
  "department": "Platform",
  "status": "INACTIVE"
}
```

| Campo | Tipo | Restricción |
|---|---|---|
| `fullName` | `string` | Opcional; 1–200 caracteres. |
| `department` | `string` | Opcional; 1–100 caracteres. |
| `status` | `string` | Opcional; `ACTIVE` o `INACTIVE`. |

**200 OK:** devuelve la envoltura común con el `User` actualizado como `data`; publica `user.updated` con `changedFields` y elimina `users:all` y `users:id:{id}`.

**Errores:** `400 VALIDATION_ERROR`, `401 TOKEN_INVALID_OR_REVOKED`, `404 USER_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `DELETE /users/:id`

Elimina el usuario de `user_db`; no admite cuerpo.

**204 No Content:** publica `user.deleted` e invalida `users:all` y `users:id:{id}`.

**Errores:** `401 TOKEN_INVALID_OR_REVOKED`, `404 USER_NOT_FOUND`, `500 INTERNAL_ERROR`.

## Criterios de aceptación y pruebas unitarias

- [x] La entidad persiste todos los campos definidos, incluidas fechas UTC y roles.
- [x] `GET /users` usa Cache-Aside con `users:all` y TTL de 60 segundos.
- [x] `GET /users/:id` usa Cache-Aside con `users:id:{id}` y TTL de 60 segundos.
- [x] `POST /users` llama sincrónicamente a `http://auth-service:3001/auth/register` antes de persistir.
- [x] Si el registro remoto falla, no se persiste un usuario local y se propaga el error contractual.
- [x] La creación usa el identificador y los roles que retorna `auth-service`.
- [x] Crear, actualizar y eliminar invalidan las claves Redis indicadas.
- [x] Las operaciones publican los eventos `user.created`, `user.updated` y `user.deleted` con sus JSON Schemas.
- [x] `PATCH` rechaza campos no permitidos o cuerpos vacíos.
- [x] Las pruebas unitarias de dominio y aplicación alcanzan cobertura superior a 75%.
