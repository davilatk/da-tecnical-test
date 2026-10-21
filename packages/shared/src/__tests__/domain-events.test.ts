import { ContractError } from '../domain/contract-error.js';
import { parseDomainEvent } from '../domain/domain-event.js';
import { DOMAIN_EVENT_ENVELOPE_SCHEMA, DOMAIN_EVENT_SCHEMAS } from '../domain/event-schemas.js';
import { createTraceId } from '../infrastructure/trace-id.js';
import {
  loggedInEvent,
  roleAssignedEvent,
  userCreatedEvent,
  userDeletedEvent,
  userUpdatedEvent,
} from './fixtures.js';

describe('domain events', () => {
  it('accepts the five contractual events', () => {
    expect(parseDomainEvent(loggedInEvent()).eventType).toBe('auth.user.logged_in');
    expect(parseDomainEvent(roleAssignedEvent()).payload).toEqual({ role: 'AUDITOR' });
    expect(parseDomainEvent(userCreatedEvent()).payload).toMatchObject({
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      status: 'ACTIVE',
      roles: ['USER'],
    });
    expect(parseDomainEvent(userUpdatedEvent()).payload.changedFields).toEqual(['fullName', 'department']);
    expect(parseDomainEvent(userDeletedEvent()).serviceSource).toBe('user-service');
    expect(DOMAIN_EVENT_ENVELOPE_SCHEMA.required).toEqual([
      'eventId',
      'eventType',
      'occurredAt',
      'actorId',
      'targetId',
      'serviceSource',
      'payload',
    ]);
    expect(Object.keys(DOMAIN_EVENT_SCHEMAS)).toEqual([
      'auth.user.logged_in',
      'auth.role.assigned',
      'user.created',
      'user.updated',
      'user.deleted',
    ]);
  });

  it('rejects events that break the envelope, the payload schema or the login identity rule', () => {
    const cases: unknown[] = [
      { ...loggedInEvent(), eventType: 'user.archived' },
      { ...loggedInEvent(), extra: true },
      { ...loggedInEvent(), payload: { email: 'admin@toka.com', note: 'x' } },
      { ...loggedInEvent(), actorId: 'usr_actor', targetId: 'usr_target' },
      { ...loggedInEvent(), occurredAt: '2026-10-21' },
      { ...loggedInEvent(), eventId: '' },
      { ...loggedInEvent(), payload: { email: 'not-an-email' } },
      { ...roleAssignedEvent(), serviceSource: 'user-service' as 'auth-service' },
      { ...roleAssignedEvent(), payload: { role: 'ROOT' } },
      { ...userCreatedEvent(), serviceSource: 'auth-service' as 'user-service' },
      { ...userCreatedEvent(), payload: { ...userCreatedEvent().payload, fullName: '' } },
      { ...userCreatedEvent(), payload: { ...userCreatedEvent().payload, department: '' } },
      { ...userCreatedEvent(), payload: { ...userCreatedEvent().payload, status: 'DELETED' } },
      { ...userCreatedEvent(), payload: { ...userCreatedEvent().payload, roles: [] } },
      { ...userCreatedEvent(), payload: { ...userCreatedEvent().payload, roles: ['USER', 'USER'] } },
      { ...userUpdatedEvent(), payload: { changedFields: [] } },
      { ...userUpdatedEvent(), payload: { changedFields: ['fullName', 'fullName'] } },
      { ...userUpdatedEvent(), payload: { changedFields: ['email'] } },
      { ...userDeletedEvent(), payload: {} },
      null,
      [],
    ];

    for (const candidate of cases) {
      expect(() => parseDomainEvent(candidate)).toThrow(ContractError);
    }
  });

  it('reports schema keywords without echoing payload values', () => {
    try {
      parseDomainEvent({ ...loggedInEvent(), payload: { email: 'not-an-email' } });
      throw new Error('expected a contract error');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractError);
      const contract = error as ContractError;
      expect(contract.issues.some((issue) => issue.keyword === 'format')).toBe(true);
      expect(contract.message).not.toContain('not-an-email');
    }
  });

  it('builds sortable trace ids in the contractual prefix', () => {
    const zeros = new Uint8Array(10);
    expect(createTraceId(0, zeros)).toBe(`trc_${'0'.repeat(26)}`);
    expect(createTraceId(0, zeros) < createTraceId(32, zeros)).toBe(true);
    const other = new Uint8Array(10);
    other[0] = 255;
    expect(createTraceId(10, zeros)).not.toBe(createTraceId(10, other));
    expect(createTraceId()).toMatch(/^trc_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(() => createTraceId(-1, zeros)).toThrow(ContractError);
    expect(() => createTraceId(1.5, zeros)).toThrow(ContractError);
    expect(() => createTraceId(1, new Uint8Array(9))).toThrow(ContractError);
  });
});
