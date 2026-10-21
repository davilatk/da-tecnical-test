import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContractError, parseDomainEvent, type DomainEventBus } from '@toka/shared';
import { getMetadataArgsStorage, QueryFailedError, type Repository } from 'typeorm';
import * as ports from '../application/ports.js';
import { EmailAlreadyRegisteredError } from '../application/email-already-registered.error.js';
import { DomainInvariantError } from '../domain/domain-invariant.error.js';
import { User } from '../domain/user.js';
import { UserBootstrap } from '../infrastructure/bootstrap/user-bootstrap.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { loadLocalEnv, readUserConfig, serviceListenOptions } from '../infrastructure/config/user-config.js';
import { AUTH_REGISTER_URL, FetchAuthRegistrar, type HttpResponse } from '../infrastructure/http/fetch-auth-registrar.js';
import { RandomIdGenerator } from '../infrastructure/ids/random-id-generator.js';
import { NestJsonLogger, createNestJsonLogger } from '../infrastructure/logging/nest-json-logger.js';
import { RabbitMqEventPublisher } from '../infrastructure/messaging/rabbitmq-domain-event-publisher.js';
import { PersistenceError } from '../infrastructure/persistence/persistence.error.js';
import { TypeOrmUserRepository } from '../infrastructure/persistence/typeorm-user.repository.js';
import { isUniqueEmailViolation, isUniqueViolation } from '../infrastructure/persistence/unique-violation.js';
import { USER_SCHEMA_STATEMENTS } from '../infrastructure/persistence/user-schema.js';
import { UserSchemaInitializer } from '../infrastructure/persistence/user-schema.initializer.js';
import { UserEntity } from '../infrastructure/persistence/user.entity.js';
import { toUser, toUserEntity } from '../infrastructure/persistence/user.mapper.js';
import { RedisUserCache, type RedisClient } from '../infrastructure/redis/redis-user-cache.js';
import { EVENT_ID, NOW, RecordingLogger, USER_ID, VIEW } from './fakes.js';

const user = User.create({
  id: USER_ID,
  email: 'ana@toka.com',
  fullName: 'Ana Pérez',
  department: 'Engineering',
  status: 'ACTIVE',
  roles: ['USER'],
  now: NOW,
});

describe('user schema and persistence', () => {
  it('maps the User fields onto the users table in user_db', () => {
    const sql = USER_SCHEMA_STATEMENTS.join('\n');
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS users',
      'id varchar(64) PRIMARY KEY',
      'email varchar(254) NOT NULL',
      'full_name varchar(200) NOT NULL',
      'department varchar(100) NOT NULL',
      'status varchar(8) NOT NULL',
      'roles varchar(20)[] NOT NULL',
      'created_at timestamptz NOT NULL DEFAULT now()',
      'updated_at timestamptz NOT NULL DEFAULT now()',
      'CONSTRAINT users_email_unique UNIQUE (email)',
      'CHECK (email = lower(email))',
      "CHECK (status IN ('ACTIVE', 'INACTIVE'))",
      'CHECK (cardinality(roles) >= 1)',
      "roles <@ ARRAY['ADMIN', 'USER', 'AUDITOR']::varchar(20)[])",
      'users_roles_are_unique',
      'CHECK (char_length(full_name) BETWEEN 1 AND 200)',
      'CHECK (char_length(department) BETWEEN 1 AND 100)',
      'CHECK (length(btrim(id)) > 0)',
    ]) {
      expect(sql).toContain(fragment);
    }
    expect(getMetadataArgsStorage().tables.find((table) => table.target === UserEntity)?.name).toBe('users');
    const columns = Object.fromEntries(
      getMetadataArgsStorage()
        .columns.filter((column) => column.target === UserEntity)
        .map((column) => [column.propertyName, column.options]),
    );
    expect(columns['id']).toMatchObject({ type: 'varchar', length: 64, primary: true });
    expect(columns['email']).toMatchObject({ type: 'varchar', length: 254, unique: true });
    expect(columns['fullName']).toMatchObject({ name: 'full_name', type: 'varchar', length: 200 });
    expect(columns['department']).toMatchObject({ type: 'varchar', length: 100 });
    expect(columns['status']).toMatchObject({ type: 'varchar', length: 8 });
    expect(columns['roles']).toMatchObject({ type: 'varchar', array: true });
    expect(columns['createdAt']).toMatchObject({ name: 'created_at', type: 'timestamptz' });
    expect(columns['updatedAt']).toMatchObject({ name: 'updated_at', type: 'timestamptz' });
    for (const column of getMetadataArgsStorage().columns) {
      if (typeof column.options.default === 'function' && column.target === UserEntity) {
        expect(column.options.default()).toBe('now()');
      }
    }
    expect(typeof ports.USER_REPOSITORY).toBe('symbol');
  });

  it('applies every schema statement in order', async () => {
    const queries: string[] = [];
    const initializer = new UserSchemaInitializer({
      query: (sql) => {
        queries.push(sql);
        return Promise.resolve();
      },
    });
    await initializer.apply();
    expect(queries).toEqual([...USER_SCHEMA_STATEMENTS]);
  });

  it('maps users and translates unique email violations', async () => {
    const entity = toUserEntity(user);
    expect(toUser(entity).toView()).toEqual(user.toView());
    expect(() => toUser({ ...entity, status: 'ROOT' } as UserEntity)).toThrow(DomainInvariantError);

    const emailError = new QueryFailedError('insert', [], {
      code: '23505',
      constraint: 'users_email_unique',
      message: 'duplicate',
    });
    const otherUnique = new QueryFailedError('insert', [], { code: '23505', constraint: 'users_pkey', message: 'duplicate' });
    expect(isUniqueEmailViolation(emailError)).toBe(true);
    expect(isUniqueViolation(otherUnique)).toBe(true);
    expect(isUniqueEmailViolation(otherUnique)).toBe(false);
    expect(isUniqueViolation(new Error('no'))).toBe(false);
    expect(isUniqueViolation(new QueryFailedError('insert', [], { code: 23505, message: 'duplicate' }))).toBe(false);
    expect(isUniqueViolation(new QueryFailedError('insert', [], 5))).toBe(false);

    const rows = [entity];
    const repository = new TypeOrmUserRepository({
      find: ({ order }: { order: { createdAt: string; id: string } }) => {
        expect(order).toEqual({ createdAt: 'ASC', id: 'ASC' });
        return Promise.resolve(rows);
      },
      findOne: ({ where }: { where: { id: string } }) => Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
      save: (saved: UserEntity) => {
        if (saved.email === 'dup@toka.com') {
          return Promise.reject(emailError);
        }
        if (saved.email === 'down@toka.com') {
          return Promise.reject(new Error('connection reset'));
        }
        return Promise.resolve(saved);
      },
      delete: ({ id }: { id: string }) => {
        if (id === 'down') {
          return Promise.reject(new Error('db down'));
        }
        return Promise.resolve({ affected: id === 'missing' ? 0 : id === 'unknown' ? null : 1 });
      },
    } as unknown as Repository<UserEntity>);

    await expect(repository.findAll()).resolves.toHaveLength(1);
    await expect(repository.findById(USER_ID)).resolves.toMatchObject({ id: USER_ID });
    await expect(repository.findById('missing')).resolves.toBeNull();
    await expect(repository.save(user)).resolves.toBeUndefined();
    const duplicate = User.create({
      id: 'usr_other',
      email: 'dup@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE',
      roles: ['USER'],
      now: NOW,
    });
    await expect(repository.save(duplicate)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    await expect(
      repository.save(
        User.create({
          id: 'usr_down',
          email: 'down@toka.com',
          fullName: 'Ana Pérez',
          department: 'Engineering',
          status: 'ACTIVE',
          roles: ['USER'],
          now: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(PersistenceError);
    await expect(repository.deleteById('missing')).resolves.toBe(false);
    await expect(repository.deleteById('unknown')).resolves.toBe(false);
    await expect(repository.deleteById(USER_ID)).resolves.toBe(true);
    await expect(repository.deleteById('down')).rejects.toBeInstanceOf(PersistenceError);

    const broken = new TypeOrmUserRepository({
      find: () => Promise.reject(new Error('db down')),
      findOne: () => Promise.reject(new Error('db down')),
      save: () => Promise.resolve(entity),
      delete: () => Promise.resolve({ affected: 1 }),
    } as unknown as Repository<UserEntity>);
    await expect(broken.findAll()).rejects.toBeInstanceOf(PersistenceError);
    await expect(broken.findById(USER_ID)).rejects.toBeInstanceOf(PersistenceError);

    const corrupt = new TypeOrmUserRepository({
      find: () => Promise.resolve([{ ...entity, roles: ['ROOT'] } as UserEntity]),
      findOne: () => Promise.resolve({ ...entity, status: 'ROOT' } as UserEntity),
      save: () => Promise.resolve(entity),
      delete: () => Promise.resolve({ affected: 1 }),
    } as unknown as Repository<UserEntity>);
    await expect(corrupt.findAll()).rejects.toBeInstanceOf(PersistenceError);
    await expect(corrupt.findById(USER_ID)).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe('redis cache, auth client and broker', () => {
  it('stores values with the requested TTL and treats an empty string as a miss', async () => {
    const stored = new Map<string, { value: string; ttl: number }>();
    const redis: RedisClient = {
      get: (key) => Promise.resolve(key === 'empty' ? '' : stored.get(key)?.value ?? null),
      set: (key, value, mode, ttl) => {
        expect(mode).toBe('EX');
        stored.set(key, { value, ttl });
        return Promise.resolve('OK');
      },
      del: (key) => {
        stored.delete(key);
        return Promise.resolve(1);
      },
      connect: () => Promise.resolve(),
      ping: () => Promise.resolve('PONG'),
      quit: () => Promise.resolve('OK'),
    };
    const cache = new RedisUserCache(redis);
    await cache.set('users:all', '[]', 60);
    expect(stored.get('users:all')).toEqual({ value: '[]', ttl: 60 });
    await expect(cache.get('users:all')).resolves.toBe('[]');
    await expect(cache.get('empty')).resolves.toBeNull();
    await expect(cache.get('missing')).resolves.toBeNull();
    await cache.delete('users:all');
    expect(stored.has('users:all')).toBe(false);
  });

  it('posts the register contract and propagates the auth-service error body', async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fetchImpl = (url: string, request: { body: string; headers: Record<string, string> }): Promise<HttpResponse> => {
      calls.push({ url, body: request.body, headers: request.headers });
      const payload = JSON.parse(request.body) as { email: string };
      if (payload.email === 'ana@toka.com') {
        return jsonResponse(201, { success: true, data: { id: `  ${USER_ID} `, email: 'ana@toka.com', roles: ['USER'] }, traceId: 'trc_auth' });
      }
      if (payload.email === 'dup@toka.com') {
        return jsonResponse(409, {
          success: false,
          error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'email is already registered', details: [{ field: 'email', message: 'is already registered' }] },
          traceId: 'trc_auth',
        });
      }
      if (payload.email === 'bad@toka.com') {
        return jsonResponse(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'email must be a valid email address' } });
      }
      if (payload.email === 'odd@toka.com') {
        return jsonResponse(201, { success: true, data: { id: '', email: 'odd@toka.com', roles: ['USER', 'USER'] } });
      }
      if (payload.email === 'down@toka.com') {
        return Promise.reject(new Error('socket hang up'));
      }
      return jsonResponse(500, { success: false, error: { code: ' ', message: 'internal error', details: [{ field: 1, message: ' ' }] } });
    };
    const client = new FetchAuthRegistrar(fetchImpl);
    const registered = await client.register({ email: 'ana@toka.com', password: 'Password123!', roles: ['USER'] }, 'trc_user');
    expect(calls[0]).toEqual({
      url: AUTH_REGISTER_URL,
      body: JSON.stringify({ email: 'ana@toka.com', password: 'Password123!', roles: ['USER'] }),
      headers: { 'content-type': 'application/json', 'x-trace-id': 'trc_user' },
    });
    expect(AUTH_REGISTER_URL).toBe('http://auth-service:3001/auth/register');
    expect(registered).toEqual({ status: 'registered', user: { id: USER_ID, email: 'ana@toka.com', roles: ['USER'] } });

    await expect(client.register({ email: 'dup@toka.com', password: 'Password123!', roles: ['USER'] }, 'trc_user')).resolves.toMatchObject({
      status: 'rejected',
      error: { status: 409, code: 'EMAIL_ALREADY_REGISTERED' },
    });
    await expect(client.register({ email: 'bad@toka.com', password: 'Password123!', roles: ['USER'] }, 'trc_user')).resolves.toMatchObject({
      status: 'rejected',
      error: { status: 400, code: 'VALIDATION_ERROR', details: [] },
    });
    await expect(client.register({ email: 'odd@toka.com', password: 'Password123!', roles: ['USER'] }, 'trc_user')).rejects.toThrow(
      'UnexpectedAuthResponse',
    );
    await expect(client.register({ email: 'down@toka.com', password: 'Password123!', roles: ['USER'] }, 'trc_user')).rejects.toThrow(
      'socket hang up',
    );
    await expect(client.register({ email: 'other@toka.com', password: 'Password123!', roles: ['ADMIN'] }, 'trc_user')).rejects.toThrow(
      'UnexpectedAuthResponse',
    );
    expect(JSON.stringify(calls)).toContain('Password123!');
  });

  it('publishes schema-valid events and connects the broker', async () => {
    const published: unknown[] = [];
    const bus: DomainEventBus = {
      connect: () => Promise.resolve(),
      close: () => Promise.resolve(),
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
      consume: () => Promise.resolve(),
      consumeAuditEvents: () => Promise.resolve(),
    };
    const publisher = new RabbitMqEventPublisher(bus);
    await publisher.connect();
    const event = parseDomainEvent({
      eventId: EVENT_ID,
      eventType: 'user.created',
      occurredAt: NOW.toISOString(),
      actorId: USER_ID,
      targetId: USER_ID,
      serviceSource: 'user-service',
      payload: { email: VIEW.email, fullName: VIEW.fullName, department: VIEW.department, status: VIEW.status, roles: VIEW.roles },
    });
    await publisher.publish(event);
    expect(published).toEqual([event]);
    await expect(publisher.publish({ ...event, eventType: 'user.created', payload: {} } as never)).rejects.toBeInstanceOf(ContractError);
    await publisher.close();
  });
});

describe('runtime adapters', () => {
  it('reads configuration and generates clock and event ids', () => {
    const dir = mkdtempSync(join(tmpdir(), 'user-config-'));
    const path = join(dir, '.env');
    writeFileSync(path, '# comment\n\nINVALID\nUSER_DATABASE_URL="postgresql://toka@localhost/user_db"\nQUOTED=\'value\'\nKEEP=from-file\n');
    const env: NodeJS.ProcessEnv = { KEEP: 'already' };
    loadLocalEnv(path, env);
    loadLocalEnv(join(dir, 'missing.env'), env);
    expect(env['USER_DATABASE_URL']).toBe('postgresql://toka@localhost/user_db');
    expect(env['QUOTED']).toBe('value');
    expect(env['KEEP']).toBe('already');

    expect(() => readUserConfig({})).toThrow(ContractError);
    expect(() =>
      readUserConfig({
        USER_DATABASE_URL: 'postgres',
        REDIS_URL: 'redis',
        RABBITMQ_URL: 'amqp',
        JWT_SECRET: 'secret',
        PORT: '0',
      }),
    ).toThrow(ContractError);
    const config = readUserConfig({
      USER_DATABASE_URL: 'postgresql://toka@localhost/user_db',
      REDIS_URL: 'redis://localhost:6379',
      RABBITMQ_URL: 'amqp://localhost',
      JWT_SECRET: 'secret',
    });
    expect(config.port).toBe(3002);
    expect(serviceListenOptions(config)).toEqual({ port: 3002, host: '0.0.0.0' });
    expect(readUserConfig({ ...configEnv(), PORT: '  ' }).port).toBe(3002);
    expect(readUserConfig({ ...configEnv(), PORT: '3002' }).port).toBe(3002);

    expect(new SystemClock().now()).toBeInstanceOf(Date);
    expect(new RandomIdGenerator().nextEventId()).toMatch(/^evt_/);
  });

  it('starts and stops the schema, redis and broker', async () => {
    const logger = new RecordingLogger();
    const redis = fakeRedis();
    const broker = { connect: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
    const schema = { apply: jest.fn().mockResolvedValue(undefined) };
    const bootstrap = new UserBootstrap(schema, redis, broker, logger, () => 'trc_boot');
    await bootstrap.onModuleInit();
    expect(schema.apply).toHaveBeenCalled();
    expect(redis.connected).toBe(true);
    expect(broker.connect).toHaveBeenCalled();
    expect(logger.entries.at(-1)?.message).toBe('user service ready');

    await bootstrap.onModuleDestroy();
    expect(broker.close).toHaveBeenCalled();
    expect(redis.closed).toBe(true);

    const failing = new UserBootstrap(
      { apply: () => Promise.reject('down') },
      fakeRedis(),
      broker,
      logger,
      () => 'trc_fail',
    );
    await expect(failing.onModuleInit()).rejects.toBe('down');
    expect(logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });

    const stop = new UserBootstrap(schema, { ...fakeRedis(), quit: () => Promise.reject(new Error('redis')) }, broker, logger, () => 'trc_stop');
    await expect(stop.onModuleDestroy()).rejects.toThrow('redis');
  });

  it('writes nest logs as single-line JSON context', () => {
    const logger = new RecordingLogger();
    const nest = new NestJsonLogger(logger, 'trc_log');
    nest.log('ready', { userId: USER_ID }, 'ignored');
    nest.error(12, null);
    nest.warn(false);
    nest.debug('   ', ['nope']);
    nest.verbose({ unexpected: true });
    expect(logger.entries.map((entry) => entry.message)).toEqual(['ready', '12', 'false', 'application log', 'application log']);
    expect(logger.entries[0]?.context).toEqual({ userId: USER_ID });
    expect(logger.entries[1]?.context).toEqual({});
    createNestJsonLogger('trc_live').log('user service logger ready');
  });
});

function configEnv(): NodeJS.ProcessEnv {
  return {
    USER_DATABASE_URL: 'postgresql://toka@localhost/user_db',
    REDIS_URL: 'redis://localhost:6379',
    RABBITMQ_URL: 'amqp://localhost',
    JWT_SECRET: 'secret',
  };
}

function fakeRedis(): RedisClient & { connected: boolean; closed: boolean } {
  return {
    connected: false,
    closed: false,
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1),
    connect() {
      this.connected = true;
      return Promise.resolve();
    },
    ping: () => Promise.resolve('PONG'),
    quit() {
      this.closed = true;
      return Promise.resolve('OK');
    },
  };
}

function jsonResponse(status: number, body: unknown): Promise<HttpResponse> {
  return Promise.resolve({
    status,
    json: () => Promise.resolve(body),
  });
}
