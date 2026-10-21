import { createHmac } from 'node:crypto';
import type {
  AuthRoleAssignedEvent,
  AuthUserLoggedInEvent,
  UserCreatedEvent,
  UserDeletedEvent,
  UserUpdatedEvent,
} from '../domain/domain-event.js';

export const JWT_SECRET = 'local-dev-jwt-secret-change-me';
export const IAT = 1792603440;
export const EXP = 1792607040;
export const NOW = new Date('2026-10-21T17:24:10.000Z');
export const TRACE_ID = 'trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const USER_ID = 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';

export function signHs256(payload: Record<string, unknown>, secret: string = JWT_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function validJwtPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: USER_ID,
    email: 'admin@toka.com',
    roles: ['ADMIN'],
    iat: IAT,
    exp: EXP,
    ...overrides,
  };
}

const occurredAt = '2026-10-21T17:24:00.000Z';

export function loggedInEvent(
  overrides: Partial<AuthUserLoggedInEvent> = {},
): AuthUserLoggedInEvent {
  return {
    eventId: 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3F',
    eventType: 'auth.user.logged_in',
    occurredAt,
    actorId: USER_ID,
    targetId: USER_ID,
    serviceSource: 'auth-service',
    payload: { email: 'admin@toka.com' },
    ...overrides,
  };
}

export function roleAssignedEvent(
  overrides: Partial<AuthRoleAssignedEvent> = {},
): AuthRoleAssignedEvent {
  return {
    eventId: 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3G',
    eventType: 'auth.role.assigned',
    occurredAt,
    actorId: USER_ID,
    targetId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3G',
    serviceSource: 'auth-service',
    payload: { role: 'AUDITOR' },
    ...overrides,
  };
}

export function userCreatedEvent(overrides: Partial<UserCreatedEvent> = {}): UserCreatedEvent {
  return {
    eventId: 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3H',
    eventType: 'user.created',
    occurredAt,
    actorId: USER_ID,
    targetId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3H',
    serviceSource: 'user-service',
    payload: {
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE',
      roles: ['USER'],
    },
    ...overrides,
  };
}

export function userUpdatedEvent(overrides: Partial<UserUpdatedEvent> = {}): UserUpdatedEvent {
  return {
    eventId: 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3J',
    eventType: 'user.updated',
    occurredAt,
    actorId: USER_ID,
    targetId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3H',
    serviceSource: 'user-service',
    payload: { changedFields: ['fullName', 'department'] },
    ...overrides,
  };
}

export function userDeletedEvent(overrides: Partial<UserDeletedEvent> = {}): UserDeletedEvent {
  return {
    eventId: 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3K',
    eventType: 'user.deleted',
    occurredAt,
    actorId: USER_ID,
    targetId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3H',
    serviceSource: 'user-service',
    payload: { email: 'ana@toka.com' },
    ...overrides,
  };
}
