import { AuthenticateAccessToken } from './application/authenticate-access-token.js';
import { JsonWebTokenVerifier } from './infrastructure/json-web-token-verifier.js';
import { createTraceId } from './infrastructure/trace-id.js';
import {
  createJwtMiddleware,
  type JwtMiddlewareOptions,
  type JwtAuthMiddleware,
} from './presentation/jwt-auth.middleware.js';

export { ContractError, type SchemaIssue } from './domain/contract-error.js';
export { isEmail } from './domain/formats.js';
export { LOG_LEVELS, isLogLevel, type LogCommand, type LogEntry, type LogLevel } from './domain/log-entry.js';
export {
  ERROR_HTTP_STATUSES,
  JSON_CONTENT_TYPE,
  SUCCESS_HTTP_STATUSES,
  createFailure,
  createHttpFailure,
  createHttpSuccess,
  createNoContentResponse,
  createSuccess,
  type ApiErrorBody,
  type ApiFailure,
  type ApiFieldError,
  type ApiSuccess,
  type BodySuccessStatus,
  type ErrorHttpStatus,
  type HttpErrorInput,
  type HttpFailureResponse,
  type HttpNoContentResponse,
  type HttpSuccessResponse,
  type SuccessHttpStatus,
} from './domain/http-response.js';
export {
  COMPONENT_PORTS,
  internalServiceBaseUrl,
  type ComponentPort,
  type InternalServiceName,
} from './domain/service-ports.js';
export {
  AUDIT_EVENTS_BINDING_KEY,
  AUDIT_EVENTS_QUEUE,
  AUDIT_EVENTS_QUEUE_DURABLE,
  TOKA_EVENTS_EXCHANGE,
  TOKA_EVENTS_EXCHANGE_DURABLE,
  TOKA_EVENTS_EXCHANGE_TYPE,
} from './domain/messaging.js';
export {
  USER_ROLES,
  assertJwtPayload,
  hasAnyRole,
  isUserRole,
  type JwtPayload,
  type UserRole,
} from './domain/jwt-payload.js';
export {
  AUTH_ROLE_ASSIGNED_SCHEMA,
  AUTH_USER_LOGGED_IN_SCHEMA,
  DOMAIN_EVENT_ENVELOPE_SCHEMA,
  DOMAIN_EVENT_SCHEMAS,
  USER_CREATED_SCHEMA,
  USER_DELETED_SCHEMA,
  USER_UPDATED_SCHEMA,
} from './domain/event-schemas.js';
export {
  EVENT_TYPES,
  SERVICE_SOURCES,
  USER_STATUSES,
  USER_UPDATABLE_FIELDS,
  isEventType,
  parseDomainEvent,
  type AuthRoleAssignedEvent,
  type AuthRoleAssignedPayload,
  type AuthUserLoggedInEvent,
  type AuthUserLoggedInPayload,
  type DomainEvent,
  type DomainEventEnvelope,
  type EventType,
  type ServiceSource,
  type UserCreatedEvent,
  type UserCreatedPayload,
  type UserDeletedEvent,
  type UserDeletedPayload,
  type UserStatus,
  type UserUpdatedEvent,
  type UserUpdatedPayload,
  type UserUpdatableField,
} from './domain/domain-event.js';
export type { Logger } from './application/logger.js';
export type { AccessTokenVerifier } from './application/access-token-verifier.js';
export {
  AuthenticateAccessToken,
  type AuthenticateAccessTokenInput,
  type AuthenticationResult,
} from './application/authenticate-access-token.js';
export type { ConsumeOptions, DomainEventBus, EventDelivery } from './application/event-bus.js';
export { JsonLogger, writeLogLine, type LogSink } from './infrastructure/json-logger.js';
export { createTraceId } from './infrastructure/trace-id.js';
export { JsonWebTokenVerifier, verifyAccessToken } from './infrastructure/json-web-token-verifier.js';
export { BrokerError, RabbitMqClient, type AmqpConnect } from './infrastructure/rabbitmq-client.js';
export {
  createJwtMiddleware,
  type JwtAuthMiddleware,
  type JwtAuthNext,
  type JwtHttpRequest,
  type JwtHttpResponse,
  type JwtMiddlewareOptions,
  type ResolvedJwtMiddlewareOptions,
} from './presentation/jwt-auth.middleware.js';

export function createJwtAuthMiddleware(options: JwtMiddlewareOptions): JwtAuthMiddleware {
  return createJwtMiddleware(new AuthenticateAccessToken(new JsonWebTokenVerifier()), {
    secret: options.secret,
    now: options.now ?? (() => new Date()),
    createTraceId: options.createTraceId ?? (() => createTraceId()),
    ...(options.requiredRoles !== undefined ? { requiredRoles: options.requiredRoles } : {}),
    ...(options.isRevoked !== undefined ? { isRevoked: options.isRevoked } : {}),
  });
}
