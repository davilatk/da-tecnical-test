import { ContractError } from './contract-error.js';
import { DOMAIN_EVENT_ENVELOPE_SCHEMA, DOMAIN_EVENT_SCHEMAS } from './event-schemas.js';
import type { UserRole } from './jwt-payload.js';
import { compileSchema, toSchemaIssues } from './schema-engine.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';

export const EVENT_TYPES = [
  'auth.user.logged_in',
  'auth.role.assigned',
  'user.created',
  'user.updated',
  'user.deleted',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const SERVICE_SOURCES = ['auth-service', 'user-service'] as const;

export type ServiceSource = (typeof SERVICE_SOURCES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_UPDATABLE_FIELDS = ['fullName', 'department', 'status'] as const;

export type UserUpdatableField = (typeof USER_UPDATABLE_FIELDS)[number];

export interface DomainEventEnvelope<TPayload extends object = object> {
  eventId: string;
  eventType: EventType;
  occurredAt: string;
  actorId: string;
  targetId: string;
  serviceSource: ServiceSource;
  payload: TPayload;
}

export interface AuthUserLoggedInPayload {
  email: string;
}

export interface AuthUserLoggedInEvent extends DomainEventEnvelope<AuthUserLoggedInPayload> {
  eventType: 'auth.user.logged_in';
  serviceSource: 'auth-service';
}

export interface AuthRoleAssignedPayload {
  role: UserRole;
}

export interface AuthRoleAssignedEvent extends DomainEventEnvelope<AuthRoleAssignedPayload> {
  eventType: 'auth.role.assigned';
  serviceSource: 'auth-service';
}

export interface UserCreatedPayload {
  email: string;
  fullName: string;
  department: string;
  status: UserStatus;
  roles: UserRole[];
}

export interface UserCreatedEvent extends DomainEventEnvelope<UserCreatedPayload> {
  eventType: 'user.created';
  serviceSource: 'user-service';
}

export interface UserUpdatedPayload {
  changedFields: UserUpdatableField[];
}

export interface UserUpdatedEvent extends DomainEventEnvelope<UserUpdatedPayload> {
  eventType: 'user.updated';
  serviceSource: 'user-service';
}

export interface UserDeletedPayload {
  email: string;
}

export interface UserDeletedEvent extends DomainEventEnvelope<UserDeletedPayload> {
  eventType: 'user.deleted';
  serviceSource: 'user-service';
}

export type DomainEvent =
  | AuthUserLoggedInEvent
  | AuthRoleAssignedEvent
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserDeletedEvent;

const validateEnvelope = compileSchema(DOMAIN_EVENT_ENVELOPE_SCHEMA);

const validators: Record<EventType, ValidateFunction> = {
  'auth.user.logged_in': compileSchema(DOMAIN_EVENT_SCHEMAS['auth.user.logged_in']),
  'auth.role.assigned': compileSchema(DOMAIN_EVENT_SCHEMAS['auth.role.assigned']),
  'user.created': compileSchema(DOMAIN_EVENT_SCHEMAS['user.created']),
  'user.updated': compileSchema(DOMAIN_EVENT_SCHEMAS['user.updated']),
  'user.deleted': compileSchema(DOMAIN_EVENT_SCHEMAS['user.deleted']),
};

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

function assertSchema(validate: ValidateFunction, value: unknown, message: string): void {
  if (!validate(value)) {
    throw new ContractError(message, toSchemaIssues(validate.errors));
  }
}

export function parseDomainEvent(input: unknown): DomainEvent {
  assertSchema(validateEnvelope, input, 'event does not satisfy the domain event envelope');
  const eventType = (input as { eventType?: unknown }).eventType;
  if (!isEventType(eventType)) {
    throw new ContractError('eventType is not supported');
  }
  const validate = validators[eventType];
  assertSchema(validate, input, `event does not satisfy ${eventType}`);
  const event = input as DomainEvent;
  if (event.eventType === 'auth.user.logged_in' && event.actorId !== event.targetId) {
    throw new ContractError('actorId and targetId must identify the user who logged in');
  }
  return event;
}
