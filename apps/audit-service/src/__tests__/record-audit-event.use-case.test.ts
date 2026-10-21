import { RecordAuditEventUseCase } from '../application/record-audit-event.use-case.js';
import { UnconfirmedAuditEventError } from '../application/unconfirmed-audit-event.error.js';
import {
  CREATED_AT,
  DOMAIN_EVENTS,
  FixedClock,
  MemoryAuditLogs,
  OCCURRED_AT,
  RecordingLogger,
  TRACE_ID,
  userCreatedEvent,
} from './fakes.js';

function useCase(clock: FixedClock = new FixedClock(CREATED_AT)) {
  const logs = new MemoryAuditLogs();
  const logger = new RecordingLogger();
  return { logs, logger, record: new RecordAuditEventUseCase(logs, clock, logger) };
}

describe('RecordAuditEventUseCase', () => {
  it('persists each valid event without changing the envelope or the payload', async () => {
    const { logs, record, logger } = useCase();

    for (const event of DOMAIN_EVENTS) {
      const snapshot = structuredClone(event);
      await expect(record.execute(event, TRACE_ID)).resolves.toBe('recorded');
      expect(event).toEqual(snapshot);
      const stored = logs.rows.find((row) => row.eventId === event.eventId);
      expect(stored?.toView()).toEqual({
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: new Date(event.occurredAt).toISOString(),
        actorId: event.actorId,
        targetId: event.targetId,
        serviceSource: event.serviceSource,
        payload: snapshot.payload,
        createdAt: CREATED_AT.toISOString(),
      });
    }

    expect(logs.rows).toHaveLength(5);
    expect(logger.entries.every((entry) => entry.message === 'audit event recorded')).toBe(true);
    expect(JSON.stringify(logger.entries)).not.toContain('ana@toka.com');
    expect(new Date(OCCURRED_AT).toISOString()).toBe(OCCURRED_AT);
  });

  it('does not persist or confirm invalid events', async () => {
    const { logs, record, logger } = useCase();
    const invalid = [
      null,
      'event',
      { ...userCreatedEvent(), eventType: 'user.paused' },
      { ...userCreatedEvent(), payload: { email: 'ana@toka.com' } },
      { ...userCreatedEvent(), extra: true },
      { ...loggedInMismatch() },
      { ...userCreatedEvent(), serviceSource: 'auth-service' },
    ];

    for (const event of invalid) {
      await expect(record.execute(event, TRACE_ID)).rejects.toMatchObject({
        name: 'UnconfirmedAuditEventError',
        reason: 'invalid',
      });
    }

    expect(logs.rows).toHaveLength(0);
    expect(logger.entries.every((entry) => entry.level === 'warn' && entry.message === 'audit event rejected')).toBe(true);
  });

  it('confirms a repeated eventId without creating a second document', async () => {
    const { logs, record } = useCase();
    const event = userCreatedEvent();
    await expect(record.execute(event, TRACE_ID)).resolves.toBe('recorded');

    logs.duplicateOnInsert = true;
    await expect(record.execute({ ...event }, TRACE_ID)).resolves.toBe('duplicate');
    expect(logs.rows).toHaveLength(1);

    logs.duplicateOnInsert = false;
    logs.rows.length = 0;
    logs.failFind = null;
    const raced = useCase();
    raced.logs.duplicateOnInsert = true;
    await expect(raced.record.execute(event, TRACE_ID)).resolves.toBe('duplicate');
    expect(raced.logs.rows).toHaveLength(0);
  });

  it('does not confirm a persistence failure', async () => {
    const { logs, record, logger } = useCase();
    logs.failInsert = new Error('db down');
    await expect(record.execute(userCreatedEvent(), TRACE_ID)).rejects.toBeInstanceOf(UnconfirmedAuditEventError);
    await expect(record.execute(userCreatedEvent(), TRACE_ID)).rejects.toMatchObject({ reason: 'persistence' });
    expect(logs.rows).toHaveLength(0);
    expect(logger.entries.at(-1)?.context).toEqual({ errorName: 'Error' });

    logs.failInsert = null;
    logs.failFind = 'down';
    await expect(record.execute(userCreatedEvent(), TRACE_ID)).rejects.toMatchObject({ reason: 'persistence' });
    expect(logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });

    const brokenClock = useCase(new FixedClock(new Date(Number.NaN)));
    await expect(brokenClock.record.execute(userCreatedEvent(), TRACE_ID)).rejects.toMatchObject({ reason: 'persistence' });
    expect(brokenClock.logger.entries.at(-1)?.context).toEqual({ errorName: 'DomainInvariantError' });
  });
});

function loggedInMismatch() {
  return {
    eventId: 'evt_mismatch',
    eventType: 'auth.user.logged_in' as const,
    occurredAt: OCCURRED_AT,
    actorId: 'usr_actor',
    targetId: 'usr_other',
    serviceSource: 'auth-service' as const,
    payload: { email: 'admin@toka.com' },
  };
}
