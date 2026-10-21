# 06 — Web Client

## Stack y responsabilidades

| Área | Tecnología / contrato |
|---|---|
| UI | React 18 + TypeScript (modo `strict`, extiende `tsconfig.base.json`). |
| Build | Vite; puerto `5173` en desarrollo y `80` en producción (ver `00-system-context.spec.md`). |
| Estilos | Tailwind CSS + HeroUI (`@heroui/react`) con `HeroUIProvider`. |
| Estado | Zustand: `useAuthStore`, `useUserStore`, `useAuditStore`, `useAiAgentStore`. |
| HTTP | Axios. |
| Rutas | `react-router-dom` v6. |
| Pruebas | Jest + React Testing Library + `@testing-library/user-event`, entorno `jsdom`. |

El cliente es una SPA que consume exclusivamente los endpoints definidos en `02`, `03`, `04` y `05`. No define endpoints ni transforma contratos: los tipos TypeScript reproducen 1:1 los JSON de esas specs.

## Topología HTTP (same-origin)

El navegador llama siempre al mismo origen de la SPA. Un proxy enruta por prefijo de ruta sin reescribirla, de modo que no se requiere CORS y `auth-service` permanece interno.

| Prefijo de ruta | Destino |
|---|---|
| `/auth/*`, `/roles`, `/roles/*` | `http://auth-service:3001` |
| `/users`, `/users/*` | `http://user-service:3002` |
| `/audits`, `/audits/*` | `http://audit-service:3003` |
| `/ai/*` | `http://ai-agent-service:8000` |

- **Desarrollo**: `server.proxy` de Vite con los mismos prefijos hacia `localhost` y los puertos de `00`.
- **Producción**: Nginx en el puerto `80` sirve `dist/` con fallback a `index.html` y aplica las mismas reglas de proxy.

Las rutas de la SPA (`/login`, `/dashboard`, `/audit-log`, `/assistant`) no colisionan con los prefijos del proxy.

## Tipos de contrato (`src/domain/contracts.ts`)

```ts
export type UserRole = 'ADMIN' | 'USER' | 'AUDITOR';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type EventType =
  | 'auth.user.logged_in'
  | 'auth.role.assigned'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted';
export type ServiceSource = 'auth-service' | 'user-service';

// 00-system-context
export interface ApiSuccess<T> {
  success: true;
  data: T;
  traceId: string;
}
export interface ApiErrorDetail {
  field: string | null;
  message: string;
}
export interface ApiErrorBody {
  code: string;
  message: string;
  details: ApiErrorDetail[];
}
export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  traceId: string;
}

// 02-auth-service
export interface AuthUser {
  id: string;
  email: string;
  roles: UserRole[];
}
export interface RegisterRequest {
  email: string;
  password: string;
  roles?: UserRole[];
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponseData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}
export interface ValidateResponseData {
  valid: true;
  user: AuthUser;
}
export interface AssignRoleRequest {
  userId: string;
  role: UserRole;
}

// 03-user-service
export interface User {
  id: string;
  email: string;
  fullName: string;
  department: string;
  status: UserStatus;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  department: string;
  roles?: UserRole[];
}
export interface UpdateUserRequest {
  fullName?: string;
  department?: string;
  status?: UserStatus;
}

// 04-audit-service
export interface AuditLog {
  eventId: string;
  eventType: EventType;
  occurredAt: string;
  actorId: string;
  targetId: string;
  serviceSource: ServiceSource;
  payload: Record<string, unknown>;
  createdAt: string;
}
export interface AuditQuery {
  eventType?: EventType;
  actorId?: string;
  limit?: number;
}
export interface AuditListData {
  items: AuditLog[];
  limit: number;
}
export interface AuditStats {
  total: number;
  byEventType: Record<EventType, number>;
}

// 05-ai-agent-rag
export interface IngestDocument {
  title: string;
  source: string;
  content: string;
}
export interface IngestRequest {
  documents: IngestDocument[];
}
export interface IngestResponseData {
  collection: 'toka_knowledge';
  embeddingModel: 'gemini-embedding-001' | 'local-hash-768';
  documentsIngested: number;
  chunksIndexed: number;
  documents: Array<{ title: string; source: string; chunks: number }>;
}
export interface AskRequest {
  question: string;
  topK?: number;
  includeLiveData?: boolean;
}
export interface AskSource {
  title: string;
  source: string;
  score: number;
}
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
export interface QualityValidation {
  passed: boolean;
  score: number;
  checks: string[];
}
export interface AskMetrics {
  latency_ms: number;
  tokens: TokenUsage;
  estimated_cost_usd: number;
  quality_validation: QualityValidation;
}
export interface AskResponseData {
  answer: string;
  sources: AskSource[];
  metrics: AskMetrics;
}
```

Ningún tipo de contrato añade, renombra ni omite campos respecto a las specs de origen.

## Capa HTTP (`src/infrastructure/http/`)

- `httpClient`: una instancia Axios con `baseURL: ''` (same-origin) y `timeout: 20000`.
- Interceptor de request: añade `Authorization: Bearer <accessToken>` si existe sesión y `X-Trace-Id: trc_<id>` generado por solicitud.
- Interceptor de response: si el cuerpo cumple `ApiFailure`, rechaza con `ApiClientError { status: number; body: ApiErrorBody; traceId: string }`. Errores de red o timeout se normalizan a `ApiClientError` con `status: 0` y `body.code = 'NETWORK_ERROR'`.
- Un `401` en cualquier endpoint distinto de `POST /auth/login` ejecuta `useAuthStore.getState().logout()` y redirige a `/login`.
- Clientes por servicio, uno por archivo: `authApi`, `userApi`, `auditApi`, `aiAgentApi`. Cada método desenvuelve `ApiSuccess<T>` y devuelve `T`; `DELETE /users/:id` devuelve `void`.

| Cliente | Método | Endpoint |
|---|---|---|
| `authApi` | `register(req: RegisterRequest): Promise<AuthUser>` | `POST /auth/register` |
| `authApi` | `login(req: LoginRequest): Promise<LoginResponseData>` | `POST /auth/login` |
| `authApi` | `validate(): Promise<ValidateResponseData>` | `GET /auth/validate` |
| `authApi` | `listRoles(): Promise<UserRole[]>` | `GET /roles` |
| `authApi` | `assignRole(req: AssignRoleRequest): Promise<AuthUser>` | `POST /roles/assign` |
| `userApi` | `list(): Promise<User[]>` | `GET /users` |
| `userApi` | `getById(id: string): Promise<User>` | `GET /users/:id` |
| `userApi` | `create(req: CreateUserRequest): Promise<User>` | `POST /users` |
| `userApi` | `update(id: string, req: UpdateUserRequest): Promise<User>` | `PATCH /users/:id` |
| `userApi` | `remove(id: string): Promise<void>` | `DELETE /users/:id` |
| `auditApi` | `list(query?: AuditQuery): Promise<AuditListData>` | `GET /audits` |
| `auditApi` | `stats(): Promise<AuditStats>` | `GET /audits/stats` |
| `aiAgentApi` | `ingest(req: IngestRequest): Promise<IngestResponseData>` | `POST /ai/ingest` |
| `aiAgentApi` | `ask(req: AskRequest): Promise<AskResponseData>` | `POST /ai/ask` |

Los query params de `AuditQuery` con valor `undefined` o cadena vacía no se envían.

## Stores Zustand (`src/application/stores/`)

Reglas comunes:

- `RequestStatus = 'idle' | 'loading' | 'success' | 'error'`.
- Cada acción asíncrona pone `status = 'loading'` y `error = null` al iniciar; al terminar, `status = 'success'` o `status = 'error'` con `error: ApiErrorBody`.
- Las acciones asíncronas devuelven el dato del contrato y relanzan `ApiClientError` para que la vista pueda reaccionar.
- Los stores dependen de los clientes de API a través de interfaces inyectables (`AuthApiPort`, `UserApiPort`, `AuditApiPort`, `AiAgentApiPort`) para poder sustituirlos en pruebas.

```ts
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';
```

### `useAuthStore` — alineado con `02-auth-service.spec.md`

```ts
export interface AuthState {
  accessToken: string | null;
  tokenType: 'Bearer' | null;
  expiresAt: number | null; // epoch ms = Date.now() + expiresIn * 1000
  user: AuthUser | null;
  availableRoles: UserRole[];
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface AuthActions {
  login(req: LoginRequest): Promise<LoginResponseData>;
  register(req: RegisterRequest): Promise<AuthUser>;
  validateSession(): Promise<ValidateResponseData>;
  fetchRoles(): Promise<UserRole[]>;
  assignRole(req: AssignRoleRequest): Promise<AuthUser>;
  logout(): void;
  hasRole(...roles: UserRole[]): boolean;
  isAuthenticated(): boolean;
  clearError(): void;
}

export type AuthStore = AuthState & AuthActions;
```

- `login` guarda `accessToken`, `tokenType`, `expiresAt` y `user`.
- `validateSession` reemplaza `user` con `data.user`; ante error ejecuta `logout()`.
- `logout` limpia el estado de todos los stores en el cliente. `02` no define endpoint de revocación, por lo que no se realiza ninguna llamada HTTP.
- `hasRole` devuelve `true` si `user.roles` contiene al menos uno de los roles indicados.
- `isAuthenticated` exige `accessToken !== null` y `expiresAt > Date.now()`.
- Persistencia: middleware `persist` con `sessionStorage`, clave `toka.auth`, solo `accessToken`, `tokenType`, `expiresAt` y `user`.

### `useUserStore` — alineado con `03-user-service.spec.md`

```ts
export interface UserState {
  users: User[];
  selectedUser: User | null;
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface UserActions {
  fetchUsers(): Promise<User[]>;
  fetchUserById(id: string): Promise<User>;
  createUser(req: CreateUserRequest): Promise<User>;
  updateUser(id: string, req: UpdateUserRequest): Promise<User>;
  deleteUser(id: string): Promise<void>;
  selectUser(user: User | null): void;
  reset(): void;
}

export type UserStore = UserState & UserActions;
```

- `createUser` agrega el `User` retornado a `users`.
- `updateUser` reemplaza el elemento con el mismo `id` en `users` y en `selectedUser` si coincide.
- `deleteUser` elimina el elemento de `users` y limpia `selectedUser` si coincide.

### `useAuditStore` — alineado con `04-audit-service.spec.md`

```ts
export interface AuditState {
  items: AuditLog[];
  limit: number;
  query: AuditQuery;
  stats: AuditStats | null;
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface AuditActions {
  fetchAudits(query?: AuditQuery): Promise<AuditListData>;
  fetchStats(): Promise<AuditStats>;
  setQuery(query: AuditQuery): void;
  resetQuery(): void;
  reset(): void;
}

export type AuditStore = AuditState & AuditActions;
```

- Valor inicial de `query`: `{ limit: 50 }`, igual al valor por defecto de `04`.
- `fetchAudits(query)` usa `query` si se recibe (y lo guarda) o, si no, el `query` del estado; guarda `items` y `limit` de la respuesta.

### `useAiAgentStore` — alineado con `05-ai-agent-rag.spec.md`

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string; // ISO-8601
  response?: AskResponseData; // solo en mensajes 'assistant'
}

export interface AiAgentState {
  messages: ChatMessage[];
  lastResponse: AskResponseData | null;
  lastIngest: IngestResponseData | null;
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface AiAgentActions {
  ask(req: AskRequest): Promise<AskResponseData>;
  ingest(req: IngestRequest): Promise<IngestResponseData>;
  clearConversation(): void;
  reset(): void;
}

export type AiAgentStore = AiAgentState & AiAgentActions;
```

- `ask` agrega primero el mensaje `user` con `req.question`; al responder agrega el mensaje `assistant` con `content = answer` y `response` completo, y actualiza `lastResponse`.
- Si `ask` falla, el mensaje `user` permanece y no se agrega mensaje `assistant`.
- `ChatMessage` es un modelo de vista local; no se envía a ningún servicio.

## Vistas y rutas (`src/presentation/`)

| Ruta | Vista | Acceso |
|---|---|---|
| `/login` | `LoginPage` | Pública; si `isAuthenticated()`, redirige a `/dashboard`. |
| `/dashboard` | `DashboardPage` | Autenticado. |
| `/audit-log` | `AuditPage` | `ADMIN` o `AUDITOR`. |
| `/assistant` | `AssistantPage` | Autenticado. |
| `*` | Redirección | A `/dashboard` si hay sesión, si no a `/login`. |

`ProtectedRoute` redirige a `/login` sin sesión válida y muestra la vista `Acceso denegado` si falta el rol. `AppLayout` contiene la `Navbar` de HeroUI con enlaces visibles según rol, el email del usuario y el botón `Cerrar sesión`.

### `LoginPage`

- Componentes HeroUI: `Card`, `Input` (email), `Input type="password"` con botón de mostrar/ocultar, `Button`.
- Validación cliente antes de enviar:
  - `email`: requerido y formato de email válido → mensajes `"El correo es obligatorio"` / `"Ingresa un correo válido"`.
  - `password`: requerido → `"La contraseña es obligatoria"`.
- Con errores de validación no se llama a `login`; los mensajes se muestran en `errorMessage` del `Input` con `isInvalid`.
- Durante la solicitud, el botón muestra `isLoading` y queda deshabilitado.
- `401 INVALID_CREDENTIALS` muestra `"Correo o contraseña incorrectos"`; cualquier otro error muestra `error.message` del contrato.
- Éxito: navega a `/dashboard`.

### `DashboardPage`

`Tabs` de HeroUI con dos pestañas: `Usuarios` (siempre) y `Roles` (solo `ADMIN`).

**Tab `Usuarios`** (`UsersTab`)

- Al montar ejecuta `fetchUsers()`; muestra `Spinner` durante la carga y `Table` con columnas: Nombre (`fullName`), Email, Departamento, Estado (`Chip` verde `ACTIVE` / gris `INACTIVE`), Roles (`Chip` por rol), Creado (`createdAt` formateado en locale `es-MX`).
- Estado vacío: `"No hay usuarios registrados"`.
- Acciones visibles solo para `ADMIN`:
  - `Nuevo usuario` → `Modal` con formulario `CreateUserRequest`: email válido; contraseña con la política de `02` (8–128 caracteres, mayúscula, minúscula, dígito y carácter no alfanumérico); `fullName` 1–200; `department` 1–100; `roles` con `CheckboxGroup` (por defecto `USER`). `409 EMAIL_ALREADY_REGISTERED` se muestra en el campo email.
  - `Editar` → `Modal` con `UpdateUserRequest`; solo envía campos modificados y deshabilita `Guardar` si no hay cambios.
  - `Eliminar` → `Modal` de confirmación; tras `204` se retira la fila.

**Tab `Roles`** (`RolesTab`)

- Al montar ejecuta `fetchRoles()` y `fetchUsers()` si `users` está vacío.
- Formulario `AssignRoleRequest`: `Select` de usuario (opciones de `useUserStore.users`, etiqueta `fullName <email>`, valor `id`) y `Select` de rol (opciones de `availableRoles`).
- Éxito: `"Rol asignado: {email} ahora tiene {roles}"` usando el `AuthUser` retornado.
- Aviso informativo fijo: `"Los roles mostrados en la tabla de usuarios corresponden al alta; la asignación se aplica en el servicio de autenticación."` (ver `03`, proyección de roles).
- `404 AUTH_USER_NOT_FOUND` muestra `error.message`.

### `AuditPage`

- Tarjetas de estadísticas (`fetchStats()`): `total` y una tarjeta por cada una de las 5 claves de `byEventType`.
- Filtros: `Select` de `eventType` (los 5 tipos + "Todos"), `Input` de `actorId`, `Input type="number"` de `limit` validado entre 1 y 100. `Aplicar` ejecuta `fetchAudits(query)`; `Limpiar` ejecuta `resetQuery()` y recarga.
- `Table` con columnas: Fecha (`occurredAt`), Evento (`Chip` por `eventType`), Actor (`actorId`), Objetivo (`targetId`), Origen (`serviceSource`) y botón `Ver payload` que abre un `Modal` con el `payload` en JSON formateado.
- El orden mostrado es el recibido del servicio; el cliente no reordena.

### `AssistantPage`

Diseño en dos columnas: conversación (principal) y panel de métricas de la última respuesta.

- **Conversación**: lista de `ChatMessage`; los mensajes `assistant` muestran `answer` y, debajo, las `sources` como `Chip` con `title` y `score` formateado a 2 decimales (tooltip con `source`).
- **Entrada**: `Textarea` (1–2 000 caracteres, contador visible), `Switch` "Incluir datos en tiempo real" (`includeLiveData`, por defecto activo), `Input type="number"` de `topK` (1–10, por defecto 5) y `Button` `Preguntar`. `Enter` envía y `Shift+Enter` inserta salto de línea. Mientras `status === 'loading'` se muestra un indicador de "Pensando…" y el envío queda deshabilitado.
- **Panel de métricas** (`MetricsPanel`, datos de `lastResponse.metrics`):
  - Latencia: `{latency_ms} ms`.
  - Tokens: prompt, completion y total en tres valores separados.
  - Costo estimado: `US$ {estimated_cost_usd}` con 6 decimales.
  - Calidad: `Chip` `Aprobada` (verde) / `No aprobada` (rojo) según `passed`, `Progress` con `score` y lista de `checks` con ícono ✓ o ✗ según el sufijo `:pass` / `:fail`.
  - Sin respuesta previa: `"Haz una pregunta para ver las métricas"`.
- **Ingesta** (solo `ADMIN`): botón `Ingerir documentos` que abre un `Modal` con `title`, `source` y `content` para un documento; al éxito muestra `chunksIndexed` y `embeddingModel` de `lastIngest`.

## Logging

Prohibido `console.log` en todo `src/`. El único punto que escribe en consola es `src/infrastructure/logger.ts`, que emite una línea JSON por evento con el formato de `00` y `service: "web-client"`. ESLint aplica `no-console: "error"` con excepción solo para ese archivo. `context` nunca incluye contraseñas, JWT ni el contenido de preguntas o respuestas.

## Arquitectura de capas

| Capa | Contenido |
|---|---|
| `src/domain/` | `contracts.ts`, validadores puros (`isValidEmail`, `checkPasswordPolicy`, `validateAuditLimit`) y formateadores (`formatCostUsd`, `parseQualityCheck`). |
| `src/application/` | Stores Zustand y puertos `AuthApiPort`, `UserApiPort`, `AuditApiPort`, `AiAgentApiPort`. |
| `src/infrastructure/` | `httpClient`, clientes Axios por servicio, `logger`, generador de `traceId`. |
| `src/presentation/` | Rutas, layout, páginas y componentes HeroUI. |

Los componentes no llaman a Axios directamente; solo usan stores.

## Supuestos pendientes de ratificar

- Header `X-Trace-Id` para propagación de `traceId` (mismo supuesto que `05`; debe ratificarse en `00`).
- `02` no define revocación de token desde el cliente; `logout` es exclusivamente local.

## Criterios de aceptación y pruebas de componentes (Jest + RTL)

Las pruebas usan puertos de API simulados; ninguna prueba realiza HTTP real. `import.meta.env` se aísla en `src/infrastructure/env.ts` para poder simularlo en Jest.

### Infraestructura y stores

- [x] `contracts.ts` compila con `strict` y sus tipos coinciden campo a campo con `02`, `03`, `04` y `05`.
- [x] El interceptor añade `Authorization` y `X-Trace-Id`, y normaliza `ApiFailure` y errores de red a `ApiClientError`.
- [x] Un `401` fuera de `/auth/login` ejecuta `logout()`.
- [x] `useAuthStore.login` guarda token, `expiresAt` y `user`; `logout` limpia los cuatro stores y `sessionStorage`.
- [x] `useAuthStore.hasRole` e `isAuthenticated` respetan roles y expiración.
- [x] `useUserStore` agrega, reemplaza y elimina usuarios localmente según la respuesta de cada acción.
- [x] `useAuditStore` inicia con `query = { limit: 50 }` y no envía filtros vacíos.
- [x] `useAiAgentStore.ask` agrega el mensaje `user`, luego el `assistant` con `response` y actualiza `lastResponse`; ante error conserva solo el mensaje `user`.

### Vistas

- [x] `LoginPage` muestra los mensajes de validación de email y contraseña y no llama a `login` si son inválidos.
- [x] `LoginPage` muestra `"Correo o contraseña incorrectos"` ante `401 INVALID_CREDENTIALS` y navega a `/dashboard` en éxito.
- [x] `ProtectedRoute` redirige a `/login` sin sesión y muestra `Acceso denegado` con rol insuficiente.
- [x] `DashboardPage` muestra la pestaña `Roles` solo para `ADMIN`.
- [x] `UsersTab` renderiza la tabla con los campos de `User`, el estado vacío y oculta acciones a no-`ADMIN`.
- [x] El formulario de creación aplica la política de contraseña de `02` y muestra `409` en el campo email.
- [x] El formulario de edición envía solo campos modificados.
- [x] `RolesTab` envía `AssignRoleRequest` y muestra el `AuthUser` retornado.
- [x] `AuditPage` muestra `total` y las 5 claves de `byEventType`, valida `limit` entre 1 y 100 y muestra el `payload` en el modal.
- [x] `AssistantPage` envía `question`, `topK` e `includeLiveData`, y deshabilita el envío durante la carga.
- [x] `MetricsPanel` muestra `latency_ms`, los tres contadores de tokens, el costo con 6 decimales, el estado `passed`, el `score` y cada `check` con su resultado.
- [x] Las `sources` se renderizan con `title` y `score` en cada respuesta del asistente.
- [x] El panel de ingesta solo es visible para `ADMIN` y muestra `chunksIndexed` y `embeddingModel` tras el éxito.
- [x] Ningún archivo de `src/` fuera de `logger.ts` usa `console.*` (verificado por ESLint).
- [x] La cobertura global de `src/` es superior a 75%.
