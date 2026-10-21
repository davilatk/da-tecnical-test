import { AuditLog, selectAuditLogs, sortAuditLogs } from '../domain/audit-log.js';
import {
  ACTOR_ID_RULE,
  auditStatsFromCounts,
  DEFAULT_AUDIT_LIMIT,
  EVENT_TYPE_RULE,
  LIMIT_RULE,
  parseAuditLogQuery,
} from '../domain/audit-query.js';
import { DomainInvariantError } from '../domain/domain-invariant.error.js';
import { ACTOR_ID, CREATED_AT, DOMAIN_EVENTS, OCCURRED_AT, userCreatedEvent, userDeletedEvent } from './fakes.js';

describe('AuditLog', () => {
  it('keeps the validated envelope and payload unchanged', () => {
    const event = userCreatedEvent();
    const snapshot = structuredClone(event);
    const log = AuditLog.record(event, CREATED_AT);
    event.payload.fullName = 'Changed';

    expect(event).toEqual({ ...snapshot, payload: { ...snapshot.payload, fullName: 'Changed' } });
    expect(log.toView()).toEqual({
      eventId: event.eventId,
      eventType: 'user.created',
      occurredAt: OCCURRED_AT,
      actorId: event.actorId,
      targetId: event.targetId,
      serviceSource: 'user-service',
      payload: snapshot.payload,
      createdAt: CREATED_AT.toISOString(),
    });
    expect(log.payload).not.toBe(event.payload);
    expect(log.toView().payload).not.toBe(log.payload);
  });

  it('rehydrates a stored document and rejects corrupt records', () => {
    const stored = AuditLog.record(userCreatedEvent(), CREATED_AT);
    const again = AuditLog.rehydrate({
      eventId: stored.eventId,
      eventType: stored.eventType,
      occurredAt: stored.occurredAt,
      actorId: stored.actorId,
      targetId: stored.targetId,
      serviceSource: stored.serviceSource,
      payload: stored.payload,
      createdAt: stored.createdAt,
    });
    expect(again.toView()).toEqual(stored.toView());

    expect(() =>
      AuditLog.rehydrate({
        ...stored.toView(),
        occurredAt: 'not-a-date',
        createdAt: CREATED_AT,
      }),
    ).toThrow(DomainInvariantError);
    expect(() =>
      AuditLog.rehydrate({
        ...stored.toView(),
        occurredAt: new Date(Number.NaN),
        createdAt: CREATED_AT,
      }),
    ).toThrow(DomainInvariantError);
    expect(() =>
      AuditLog.rehydrate({
        ...stored.toView(),
        occurredAt: 1 as unknown as Date,
        createdAt: CREATED_AT,
      }),
    ).toThrow(DomainInvariantError);
    expect(() => AuditLog.record(userCreatedEvent(), new Date(Number.NaN))).toThrow(DomainInvariantError);
    expect(() =>
      AuditLog.rehydrate({
        ...stored.toView(),
        occurredAt: '   ',
        createdAt: CREATED_AT,
      }),
    ).toThrow(DomainInvariantError);
  });

  it('orders by occurredAt and eventId descending and applies filters', () => {
    const older = AuditLog.record(userCreatedEvent('evt_a'), CREATED_AT);
    const sameTimeLaterId = AuditLog.record(userCreatedEvent('evt_b'), CREATED_AT);
    const newer = AuditLog.record(userDeletedEvent('evt_c'), CREATED_AT);
    const tie = sortAuditLogs([older, older]);
    expect(tie).toEqual([older, older]);

    expect(sortAuditLogs([sameTimeLaterId, older]).map((log) => log.eventId)).toEqual(['evt_b', 'evt_a']);
    expect(sortAuditLogs([older, sameTimeLaterId]).map((log) => log.eventId)).toEqual(['evt_b', 'evt_a']);

    const ordered = selectAuditLogs([older, newer, sameTimeLaterId], { limit: 2 });
    expect(ordered.map((log) => log.eventId)).toEqual(['evt_c', 'evt_b']);

    const byType = selectAuditLogs([older, newer, sameTimeLaterId], { eventType: 'user.created', limit: 10 });
    expect(byType.map((log) => log.eventId)).toEqual(['evt_b', 'evt_a']);

    const byActor = selectAuditLogs([older, newer], { actorId: 'usr_other', limit: 10 });
    expect(byActor.map((log) => log.eventId)).toEqual(['evt_c']);

    const both = selectAuditLogs([older, newer], { eventType: 'user.deleted', actorId: ACTOR_ID, limit: 10 });
    expect(both).toEqual([]);
  });
});

describe('audit query and stats', () => {
  it('accepts optional filters and defaults limit to 50', () => {
    expect(parseAuditLogQuery({})).toEqual({ ok: true, value: { limit: DEFAULT_AUDIT_LIMIT } });
    expect(parseAuditLogQuery({ eventType: 'user.created', actorId: '  usr_01  ', limit: 20 })).toEqual({
      ok: true,
      value: { eventType: 'user.created', actorId: 'usr_01', limit: 20 },
    });
    expect(parseAuditLogQuery({ limit: 1 }).ok).toBe(true);
    expect(parseAuditLogQuery({ limit: 100 }).ok).toBe(true);
  });

  it('rejects eventType, actorId and limit outside the contract', () => {
    const parsed = parseAuditLogQuery({ eventType: 'user.paused', actorId: '   ', limit: 0 });
    expect(parsed).toEqual({
      ok: false,
      details: [
        { field: 'eventType', message: EVENT_TYPE_RULE },
        { field: 'actorId', message: ACTOR_ID_RULE },
        { field: 'limit', message: LIMIT_RULE },
      ],
    });
    expect(parseAuditLogQuery({ eventType: 1, actorId: 4, limit: 1.5 })).toMatchObject({ ok: false });
    expect(parseAuditLogQuery({ limit: 101 }).ok).toBe(false);
    expect(parseAuditLogQuery({ actorId: '' }).ok).toBe(false);
  });

  it('always returns the five event counters', () => {
    expect(auditStatsFromCounts([])).toEqual({
      total: 0,
      byEventType: {
        'auth.user.logged_in': 0,
        'auth.role.assigned': 0,
        'user.created': 0,
        'user.updated': 0,
        'user.deleted': 0,
      },
    });
    const stats = auditStatsFromCounts([
      { eventType: 'user.created', count: 2 },
      { eventType: 'user.created', count: 3 },
      { eventType: 'auth.user.logged_in', count: 4 },
      { eventType: 'auth.role.assigned', count: 1 },
      { eventType: 'user.updated', count: 3 },
      { eventType: 'user.deleted', count: 2 },
    ]);
    expect(stats.total).toBe(15);
    expect(stats.byEventType['user.created']).toBe(5);
    expect(() => auditStatsFromCounts([{ eventType: 'other', count: 1 }])).toThrow(DomainInvariantError);
    expect(() => auditStatsFromCounts([{ eventType: 'user.created', count: -1 }])).toThrow(DomainInvariantError);
    expect(() => auditStatsFromCounts([{ eventType: 'user.created', count: 1.2 }])).toThrow(DomainInvariantError);
    expect(DOMAIN_EVENTS).toHaveLength(5);
  });
});
