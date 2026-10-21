import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUDIT_EVENTS_BINDING_KEY,
  AUDIT_EVENTS_QUEUE,
  ContractError,
  type DomainEventBus,
  type EventDelivery,
} from '@toka/shared';
import type { Model } from 'mongoose';
import { RecordAuditEventUseCase } from '../application/record-audit-event.use-case.js';
import { AUDIT_LOG_SORT, AuditLog } from '../domain/audit-log.js';
import { AuditBootstrap } from '../infrastructure/bootstrap/audit-bootstrap.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import {
  AUDIT_DB_NAME,
  loadLocalEnv,
  readAuditConfig,
  serviceListenOptions,
} from '../infrastructure/config/audit-config.js';
import { createNestJsonLogger, NestJsonLogger } from '../infrastructure/logging/nest-json-logger.js';
import { AuditEventsConsumer } from '../infrastructure/messaging/audit-events.consumer.js';
import { AuditSchemaInitializer } from '../infrastructure/persistence/audit-schema.initializer.js';
import { toAuditLog, toPersistence } from '../infrastructure/persistence/audit-log.mapper.js';
import { AUDIT_LOG_COLLECTION, AuditLogDocument, AuditLogSchema } from '../infrastructure/persistence/audit-log.schema.js';
import { isDuplicateEventId } from '../infrastructure/persistence/duplicate-event.js';
import { MongooseAuditLogRepository } from '../infrastructure/persistence/mongoose-audit-log.repository.js';
import { mongooseRootOptions } from '../infrastructure/persistence/mongoose-options.js';
import { PersistenceError } from '../infrastructure/persistence/persistence.error.js';
import * as ports from '../application/ports.js';
import {
  CREATED_AT,
  FixedClock,
  MemoryAuditLogs,
  RecordingLogger,
  TRACE_ID,
  userCreatedEvent,
  userDeletedEvent,
} from './fakes.js';

describe('audit persistence', () => {
  it('uses audit_db and the indexes defined for AuditLog', () => {
    const options = mongooseRootOptions({
      mongoUri: 'mongodb://localhost:27017/other',
      rabbitmqUrl: 'amqp://localhost',
      jwtSecret: 'secret',
      port: 3003,
    });
    expect(AUDIT_DB_NAME).toBe('audit_db');
    expect(options).toMatchObject({ dbName: 'audit_db', autoIndex: true, uri: 'mongodb://localhost:27017/other' });
    expect(AuditLogSchema.get('collection')).toBe(AUDIT_LOG_COLLECTION);
    expect(AUDIT_LOG_COLLECTION).toBe('audit_logs');

    const indexes = AuditLogSchema.indexes().map(([fields, indexOptions]) => ({
      fields,
      unique: indexOptions['unique'] === true,
    }));
    expect(indexes).toEqual(
      expect.arrayContaining([
        { fields: { eventId: 1 }, unique: true },
        { fields: { occurredAt: -1, eventId: -1 }, unique: false },
        { fields: { eventType: 1, occurredAt: -1 }, unique: false },
        { fields: { actorId: 1, occurredAt: -1 }, unique: false },
      ]),
    );
    expect(AuditLogDocument.name).toBe('AuditLogDocument');
    expect(typeof ports.AUDIT_LOG_REPOSITORY).toBe('symbol');
  });

  it('creates indexes through the schema initializer', async () => {
    const syncIndexes = jest.fn().mockResolvedValue(['eventId_1']);
    await new AuditSchemaInitializer({ syncIndexes }).apply();
    expect(syncIndexes).toHaveBeenCalledTimes(1);
  });

  it('stores the exact document and treats a repeated eventId as a duplicate', async () => {
    const log = AuditLog.record(userCreatedEvent(), CREATED_AT);
    const persisted = toPersistence(log);
    expect(toAuditLog(persisted).toView()).toEqual(log.toView());
    expect(persisted.payload).toEqual(userCreatedEvent().payload);
    expect(isDuplicateEventId({ code: 11000 })).toBe(true);
    expect(isDuplicateEventId({ cause: { code: 11000 } })).toBe(true);
    expect(isDuplicateEventId({ cause: { code: 1 } })).toBe(false);
    expect(isDuplicateEventId(null)).toBe(false);
    expect(isDuplicateEventId(new Error('no'))).toBe(false);
    expect(isDuplicateEventId({ code: '11000' })).toBe(false);

    const docs = new Map<string, ReturnType<typeof toPersistence>>();
    const captured: { filter?: unknown; sort?: unknown; limit?: number } = {};
    const model = {
      async create(doc: ReturnType<typeof toPersistence>) {
        if (doc.eventId === 'evt_down') {
          throw new Error('connection reset');
        }
        if (docs.has(doc.eventId)) {
          throw { code: 11000 };
        }
        docs.set(doc.eventId, doc);
      },
      findOne(filter: { eventId: string }) {
        return lean(docs.get(filter.eventId) ?? null);
      },
      find(filter: Record<string, string>) {
        captured.filter = filter;
        return {
          sort(order: unknown) {
            captured.sort = order;
            return {
              limit(limit: number) {
                captured.limit = limit;
                return lean([...docs.values()].filter((doc) => doc.eventType === (filter['eventType'] ?? doc.eventType)));
              },
            };
          },
        };
      },
      aggregate(pipeline: readonly object[]) {
        expect(pipeline).toEqual([{ $group: { _id: '$eventType', count: { $sum: 1 } } }]);
        return {
          exec: () => Promise.resolve([{ _id: 'user.created', count: docs.size }]),
        };
      },
    };

    const repository = new MongooseAuditLogRepository(model as unknown as Model<AuditLogDocument>);
    await expect(repository.insert(log)).resolves.toBe('inserted');
    await expect(repository.insert(log)).resolves.toBe('duplicate');
    await expect(repository.findByEventId(log.eventId)).resolves.toMatchObject({ eventId: log.eventId });
    await expect(repository.findByEventId('missing')).resolves.toBeNull();
    await expect(repository.search({ eventType: 'user.created', actorId: log.actorId, limit: 20 })).resolves.toHaveLength(1);
    expect(captured).toEqual({
      filter: { eventType: 'user.created', actorId: log.actorId },
      sort: AUDIT_LOG_SORT,
      limit: 20,
    });
    await expect(repository.search({ limit: 50 })).resolves.toHaveLength(1);
    await expect(repository.countByEventType()).resolves.toEqual([{ eventType: 'user.created', count: 1 }]);

    const failing = AuditLog.record(userDeletedEvent('evt_down'), CREATED_AT);
    await expect(repository.insert(failing)).rejects.toBeInstanceOf(PersistenceError);
    model.aggregate = () => ({ exec: () => Promise.resolve([{ _id: 1, count: 1 }]) });
    await expect(repository.countByEventType()).rejects.toBeInstanceOf(PersistenceError);
    model.aggregate = () => ({ exec: () => Promise.resolve([{ _id: 'user.created', count: 1.5 }]) });
    await expect(repository.countByEventType()).rejects.toBeInstanceOf(PersistenceError);
    model.aggregate = () => ({ exec: () => Promise.resolve([{ _id: 'user.created', count: -1 }]) });
    await expect(repository.countByEventType()).rejects.toBeInstanceOf(PersistenceError);

    const broken = new MongooseAuditLogRepository({
      ...model,
      findOne: () => lean({ ...persisted, eventType: 'user.paused', payload: {} }),
    } as unknown as Model<AuditLogDocument>);
    await expect(broken.findByEventId(log.eventId)).rejects.toBeInstanceOf(Error);
  });
});

describe('audit consumer', () => {
  it('binds audit.events.queue and confirms only persisted or duplicate events', async () => {
    const logs = new MemoryAuditLogs();
    const logger = new RecordingLogger();
    const record = new RecordAuditEventUseCase(logs, new FixedClock(CREATED_AT), logger);
    const bus = new FakeBus();
    const consumer = new AuditEventsConsumer(bus, record, logger, () => TRACE_ID);
    await consumer.start();
    await consumer.start();
    expect(bus.connect).toHaveBeenCalledTimes(1);
    expect(bus.consumeCalls).toBe(1);
    expect(bus.queue).toBe(AUDIT_EVENTS_QUEUE);
    expect(bus.queue).toBe('audit.events.queue');
    expect(bus.bindingKey).toBe(AUDIT_EVENTS_BINDING_KEY);
    expect(bus.bindingKey).toBe('#');
    expect(bus.publish).not.toHaveBeenCalled();

    const event = userCreatedEvent();
    const snapshot = structuredClone(event);
    const first = delivery(event);
    await bus.handler?.(first.delivery);
    expect(first.ack).toHaveBeenCalledTimes(1);
    expect(first.nack).not.toHaveBeenCalled();
    expect(event).toEqual(snapshot);
    expect(logs.rows).toHaveLength(1);

    const duplicate = delivery(event);
    await bus.handler?.(duplicate.delivery);
    expect(duplicate.ack).toHaveBeenCalledTimes(1);
    expect(logs.rows).toHaveLength(1);

    const invalid = delivery({ eventType: 'user.paused' });
    await bus.handler?.(invalid.delivery);
    expect(invalid.ack).not.toHaveBeenCalled();
    expect(invalid.nack).not.toHaveBeenCalled();
    expect(logs.rows).toHaveLength(1);

    logs.failInsert = new Error('db down');
    const failed = delivery(userDeletedEvent());
    await bus.handler?.(failed.delivery);
    expect(failed.ack).not.toHaveBeenCalled();
    expect(failed.nack).not.toHaveBeenCalled();

    const unexpected = new AuditEventsConsumer(
      bus,
      { execute: () => Promise.reject(new Error('boom')) } as unknown as RecordAuditEventUseCase,
      logger,
      () => 'trc_unexpected',
    );
    const broken = delivery(event);
    await unexpected.onDelivery(broken.delivery);
    expect(broken.ack).not.toHaveBeenCalled();
    expect(logger.entries.some((entry) => entry.message === 'audit event was not confirmed')).toBe(true);

    const foreign = new AuditEventsConsumer(
      bus,
      { execute: () => Promise.reject('down') } as unknown as RecordAuditEventUseCase,
      logger,
      () => 'trc_foreign',
    );
    await foreign.onDelivery(delivery(event).delivery);
    expect(logger.entries.some((entry) => entry.context?.['errorName'] === 'UnknownError')).toBe(true);

    await consumer.stop();
    await consumer.stop();
    expect(bus.close).toHaveBeenCalledTimes(1);
  });

  it('leaves the consumer stopped when startup fails before the subscription', async () => {
    const bus = new FakeBus();
    bus.connect.mockRejectedValueOnce(new Error('broker down'));
    const consumer = new AuditEventsConsumer(bus, {} as RecordAuditEventUseCase, new RecordingLogger(), () => TRACE_ID);
    await expect(consumer.start()).rejects.toThrow('broker down');
    expect(bus.consumeCalls).toBe(0);
    await expect(consumer.stop()).resolves.toBeUndefined();
    expect(bus.close).not.toHaveBeenCalled();
  });
});

describe('audit runtime', () => {
  it('reads configuration and the system clock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-config-'));
    const path = join(dir, '.env');
    writeFileSync(path, '# comment\n\nINVALID\nMONGODB_URI="mongodb://localhost/audit_db"\nQUOTED=\'value\'\nKEEP=from-file\n');
    const env: NodeJS.ProcessEnv = { KEEP: 'already' };
    loadLocalEnv(path, env);
    loadLocalEnv(join(dir, 'missing.env'), env);
    expect(env['MONGODB_URI']).toBe('mongodb://localhost/audit_db');
    expect(env['QUOTED']).toBe('value');
    expect(env['KEEP']).toBe('already');

    expect(() => readAuditConfig({})).toThrow(ContractError);
    expect(() =>
      readAuditConfig({
        MONGODB_URI: 'mongodb://localhost/audit_db',
        RABBITMQ_URL: 'amqp://localhost',
        JWT_SECRET: 'secret',
        PORT: '0',
      }),
    ).toThrow(ContractError);
    expect(() =>
      readAuditConfig({
        MONGODB_URI: 'mongodb://localhost/audit_db',
        RABBITMQ_URL: 'amqp://localhost',
        JWT_SECRET: 'secret',
        PORT: '70000',
      }),
    ).toThrow(ContractError);
    const config = readAuditConfig({
      MONGODB_URI: 'mongodb://localhost:27017/audit_db',
      RABBITMQ_URL: 'amqp://localhost',
      JWT_SECRET: 'secret',
    });
    expect(config.port).toBe(3003);
    expect(serviceListenOptions(config)).toEqual({ port: 3003, host: '0.0.0.0' });
    expect(readAuditConfig({ ...configEnv(), PORT: '  ' }).port).toBe(3003);
    expect(readAuditConfig({ ...configEnv(), PORT: '3003' }).port).toBe(3003);
    expect(new SystemClock().now()).toBeInstanceOf(Date);
  });

  it('starts indexes and the consumer, then stops the consumer', async () => {
    const logger = new RecordingLogger();
    const order: string[] = [];
    const schema = {
      apply: jest.fn(async () => {
        order.push('schema');
      }),
    };
    const consumer = {
      start: jest.fn(async () => {
        order.push('consumer');
      }),
      stop: jest.fn(async () => {
        order.push('stop');
      }),
    };
    const bootstrap = new AuditBootstrap(schema, consumer as unknown as AuditEventsConsumer, logger, () => 'trc_boot');
    await bootstrap.onModuleInit();
    expect(order).toEqual(['schema', 'consumer']);
    expect(logger.entries.at(-1)?.message).toBe('audit service ready');
    await bootstrap.onModuleDestroy();
    expect(order).toEqual(['schema', 'consumer', 'stop']);
    expect(logger.entries.at(-1)?.message).toBe('audit service stopped');

    const failing = new AuditBootstrap(
      { apply: () => Promise.reject('down') },
      consumer as unknown as AuditEventsConsumer,
      logger,
      () => 'trc_fail',
    );
    await expect(failing.onModuleInit()).rejects.toBe('down');
    expect(logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });

    const stop = new AuditBootstrap(schema, { ...consumer, stop: () => Promise.reject(new Error('broker')) } as unknown as AuditEventsConsumer, logger, () => 'trc_stop');
    await expect(stop.onModuleDestroy()).rejects.toThrow('broker');
    expect(logger.entries.at(-1)?.message).toBe('audit service failed to stop');
  });

  it('writes nest logs as single-line JSON context', () => {
    const logger = new RecordingLogger();
    const nest = new NestJsonLogger(logger, 'trc_log');
    nest.log('ready', { eventId: 'evt_01' }, 'ignored');
    nest.error(12, null);
    nest.warn(false);
    nest.debug('   ', ['nope']);
    nest.verbose({ unexpected: true });
    expect(logger.entries.map((entry) => entry.message)).toEqual(['ready', '12', 'false', 'application log', 'application log']);
    expect(logger.entries[0]?.context).toEqual({ eventId: 'evt_01' });
    expect(logger.entries[1]?.context).toEqual({});
    createNestJsonLogger('trc_live').log('audit service logger ready');
  });
});

function configEnv(): NodeJS.ProcessEnv {
  return {
    MONGODB_URI: 'mongodb://localhost:27017/audit_db',
    RABBITMQ_URL: 'amqp://localhost',
    JWT_SECRET: 'secret',
  };
}

function lean<T>(value: T) {
  return { lean: () => ({ exec: () => Promise.resolve(value) }) };
}

class FakeBus implements DomainEventBus {
  readonly connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  readonly close = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  readonly publish = jest.fn<Promise<void>, [unknown]>();
  readonly consumeAuditEvents = jest.fn<Promise<void>, unknown[]>().mockResolvedValue(undefined);
  queue = '';
  bindingKey = '';
  consumeCalls = 0;
  handler: ((delivery: EventDelivery) => Promise<void>) | null = null;

  consume(queue: string, bindingKey: string, handler: (delivery: EventDelivery) => Promise<void>): Promise<void> {
    this.consumeCalls += 1;
    this.queue = queue;
    this.bindingKey = bindingKey;
    this.handler = handler;
    return Promise.resolve();
  }
}

function delivery(event: unknown): { delivery: EventDelivery; ack: jest.Mock; nack: jest.Mock } {
  const ack = jest.fn();
  const nack = jest.fn();
  return {
    ack,
    nack,
    delivery: {
      event: event as EventDelivery['event'],
      ack,
      nack,
    },
  };
}
