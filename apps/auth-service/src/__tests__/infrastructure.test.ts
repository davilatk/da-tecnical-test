import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContractError, JsonLogger, JsonWebTokenVerifier, parseDomainEvent, type DomainEventBus } from '@toka/shared';
import { getMetadataArgsStorage, QueryFailedError, type Repository } from 'typeorm';
import * as ports from '../application/ports.js';
import { EmailAlreadyRegisteredError } from '../application/email-already-registered.error.js';
import { AuthCredential } from '../domain/auth-credential.js';
import { DomainInvariantError } from '../domain/domain-invariant.error.js';
import { blacklistKey } from '../domain/token-policy.js';
import { AuthBootstrap } from '../infrastructure/bootstrap/auth-bootstrap.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { loadLocalEnv, readAuthConfig, serviceListenOptions } from '../infrastructure/config/auth-config.js';
import { RandomIdGenerator } from '../infrastructure/ids/random-id-generator.js';
import { NestJsonLogger } from '../infrastructure/logging/nest-json-logger.js';
import { RabbitMqEventPublisher } from '../infrastructure/messaging/rabbitmq-domain-event-publisher.js';
import { AUTH_SCHEMA_STATEMENTS } from '../infrastructure/persistence/auth-schema.js';
import { AuthSchemaInitializer } from '../infrastructure/persistence/auth-schema.initializer.js';
import { AuthCredentialEntity } from '../infrastructure/persistence/auth-credential.entity.js';
import { toAuthCredential, toCredentialEntity } from '../infrastructure/persistence/credential.mapper.js';
import { PersistenceError } from '../infrastructure/persistence/persistence.error.js';
import { RoleEntity } from '../infrastructure/persistence/role.entity.js';
import { TypeOrmCredentialRepository } from '../infrastructure/persistence/typeorm-credential.repository.js';
import { TypeOrmRoleRepository } from '../infrastructure/persistence/typeorm-role.repository.js';
import { isUniqueEmailViolation, isUniqueViolation } from '../infrastructure/persistence/unique-violation.js';
import { RedisTokenBlacklist, type RedisKeyValueStore } from '../infrastructure/redis/redis-token-blacklist.js';
import { BcryptPasswordHasher } from '../infrastructure/security/bcrypt-password-hasher.js';
import { JwtAccessTokenIssuer } from '../infrastructure/security/jwt-access-token-issuer.js';
import { JWT_SECRET, NOW, OTHER_ID, RecordingLogger, USER_ID } from './fakes.js';

describe('auth schema and persistence', () => {
  it('defines the roles and auth_credentials tables from the spec', () => {
    const sql = AUTH_SCHEMA_STATEMENTS.join('\n');
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS roles',
      'name varchar(20) PRIMARY KEY',
      'created_at timestamptz NOT NULL DEFAULT now()',
      "CHECK (name IN ('ADMIN', 'USER', 'AUDITOR'))",
      'CREATE TABLE IF NOT EXISTS auth_credentials',
      'id uuid PRIMARY KEY',
      'email varchar(254) NOT NULL',
      'password_hash varchar(255) NOT NULL',
      'roles varchar(20)[] NOT NULL',
      'updated_at timestamptz NOT NULL DEFAULT now()',
      'CONSTRAINT auth_credentials_email_unique UNIQUE (email)',
      'CHECK (email = lower(email))',
      'CHECK (cardinality(roles) >= 1)',
      'roles.name = assigned.name',
      'CREATE TRIGGER auth_credentials_roles_reference',
    ]) {
      expect(sql).toContain(fragment);
    }

    const tables = getMetadataArgsStorage().tables;
    expect(tables.find((table) => table.target === RoleEntity)?.name).toBe('roles');
    expect(tables.find((table) => table.target === AuthCredentialEntity)?.name).toBe('auth_credentials');
    expect(typeof ports.CREDENTIAL_REPOSITORY).toBe('symbol');
    for (const column of getMetadataArgsStorage().columns) {
      if (typeof column.options.default === 'function' && (column.target === AuthCredentialEntity || column.target === RoleEntity)) {
        expect(column.options.default()).toBe('now()');
      }
    }
    const credentialColumns = Object.fromEntries(
      getMetadataArgsStorage()
        .columns.filter((column) => column.target === AuthCredentialEntity)
        .map((column) => [column.propertyName, column.options]),
    );
    expect(credentialColumns['id']).toMatchObject({ type: 'uuid', primary: true });
    expect(credentialColumns['email']).toMatchObject({ type: 'varchar', length: 254, unique: true });
    expect(credentialColumns['passwordHash']).toMatchObject({ name: 'password_hash', type: 'varchar', length: 255 });
    expect(credentialColumns['roles']).toMatchObject({ type: 'varchar', array: true });
    expect(credentialColumns['createdAt']).toMatchObject({ name: 'created_at', type: 'timestamptz' });
    expect(credentialColumns['updatedAt']).toMatchObject({ name: 'updated_at', type: 'timestamptz' });
  });

  it('applies every schema statement in order', async () => {
    const queries: string[] = [];
    const initializer = new AuthSchemaInitializer({
      query: (sql) => {
        queries.push(sql);
        return Promise.resolve();
      },
    });
    await initializer.apply();
    expect(queries).toEqual([...AUTH_SCHEMA_STATEMENTS]);
  });

  it('maps credentials and translates unique email violations', async () => {
    const credential = AuthCredential.create({
      id: USER_ID,
      email: 'ana@toka.com',
      passwordHash: 'hash-1',
      roles: ['USER'],
      now: NOW,
    });
    const entity = toCredentialEntity(credential);
    expect(toAuthCredential(entity).toAuthUser()).toEqual(credential.toAuthUser());
    expect(() =>
      toAuthCredential({ ...entity, roles: ['ROOT'], createdAt: NOW, updatedAt: NOW } as AuthCredentialEntity),
    ).toThrow(DomainInvariantError);

    const emailError = new QueryFailedError('insert', [], {
      code: '23505',
      constraint: 'auth_credentials_email_unique',
      message: 'duplicate',
    });
    const otherUnique = new QueryFailedError('insert', [], { code: '23505', constraint: 'auth_credentials_pkey', message: 'duplicate' });
    expect(isUniqueEmailViolation(emailError)).toBe(true);
    expect(isUniqueViolation(otherUnique)).toBe(true);
    expect(isUniqueEmailViolation(otherUnique)).toBe(false);
    expect(isUniqueViolation(new Error('no'))).toBe(false);
    expect(isUniqueViolation(new QueryFailedError('insert', [], { code: 23505, message: 'duplicate' }))).toBe(false);

    const rows = [entity];
    const repository = new TypeOrmCredentialRepository({
      findOne: ({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(rows.find((row) => (where.id !== undefined ? row.id === where.id : row.email === where.email)) ?? null),
      save: (saved: AuthCredentialEntity) => {
        if (saved.email === 'dup@toka.com') {
          return Promise.reject(emailError);
        }
        if (saved.email === 'down@toka.com') {
          return Promise.reject(new Error('connection reset'));
        }
        return Promise.resolve(saved);
      },
    } as unknown as Repository<AuthCredentialEntity>);
    await expect(repository.findByEmail('ana@toka.com')).resolves.toMatchObject({ id: USER_ID });
    await expect(repository.findById('missing')).resolves.toBeNull();
    await expect(repository.save(credential)).resolves.toBeUndefined();
    const duplicate = AuthCredential.create({
      id: OTHER_ID,
      email: 'dup@toka.com',
      passwordHash: 'hash-1',
      roles: ['USER'],
      now: NOW,
    });
    await expect(repository.save(duplicate)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    const down = AuthCredential.create({
      id: OTHER_ID,
      email: 'down@toka.com',
      passwordHash: 'hash-1',
      roles: ['USER'],
      now: NOW,
    });
    await expect(repository.save(down)).rejects.toBeInstanceOf(PersistenceError);

    const broken = new TypeOrmCredentialRepository({
      findOne: () => Promise.reject(new Error('db down')),
      save: () => Promise.resolve(entity),
    } as unknown as Repository<AuthCredentialEntity>);
    await expect(broken.findById(USER_ID)).rejects.toBeInstanceOf(PersistenceError);
  });

  it('lists known roles and ignores an existing role insert', async () => {
    const roleRows: RoleEntity[] = [];
    const repository = new TypeOrmRoleRepository({
      find: () => Promise.resolve([{ name: 'USER' }, { name: 'ROOT' }, { name: 'ADMIN' }] as RoleEntity[]),
      findOne: ({ where }: { where: { name: string } }) => Promise.resolve(where.name === 'ADMIN' ? ({ name: 'ADMIN' } as RoleEntity) : null),
      insert: ({ name }: { name: string }) => {
        if (name === 'USER') {
          return Promise.reject(new QueryFailedError('insert', [], { code: '23505', constraint: 'roles_pkey', message: 'duplicate' }));
        }
        if (name === 'AUDITOR') {
          return Promise.reject(new Error('db down'));
        }
        roleRows.push({ name } as RoleEntity);
        return Promise.resolve(undefined);
      },
    } as unknown as Repository<RoleEntity>);
    await expect(repository.list()).resolves.toEqual(['ADMIN', 'USER']);
    await expect(repository.exists('ADMIN')).resolves.toBe(true);
    await expect(repository.exists('USER')).resolves.toBe(false);
    await expect(repository.insertIfMissing('USER')).resolves.toBeUndefined();
    await expect(repository.insertIfMissing('ADMIN')).resolves.toBeUndefined();
    await expect(repository.insertIfMissing('AUDITOR')).rejects.toBeInstanceOf(PersistenceError);

    const broken = new TypeOrmRoleRepository({
      find: () => Promise.reject(new Error('db down')),
      findOne: () => Promise.reject(new Error('db down')),
      insert: () => Promise.resolve(undefined),
    } as unknown as Repository<RoleEntity>);
    await expect(broken.list()).rejects.toBeInstanceOf(PersistenceError);
    await expect(broken.exists('ADMIN')).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe('security, redis, messaging and runtime adapters', () => {
  it('hashes passwords with bcrypt and signs the exact JWT payload', async () => {
    expect(() => new BcryptPasswordHasher(3)).toThrow(DomainInvariantError);
    const hasher = new BcryptPasswordHasher(4);
    const passwordHash = await hasher.hash('Admin123!');
    expect(passwordHash).not.toContain('Admin123!');
    expect(passwordHash.startsWith('$2')).toBe(true);
    await expect(hasher.verify('Admin123!', passwordHash)).resolves.toBe(true);
    await expect(hasher.verify('Other123!', passwordHash)).resolves.toBe(false);

    expect(() => new JwtAccessTokenIssuer('  ')).toThrow(ContractError);
    const issuer = new JwtAccessTokenIssuer(JWT_SECRET);
    const issued = issuer.issue({ id: USER_ID, email: 'admin@toka.com', roles: ['ADMIN'] }, NOW);
    expect(issued.expiresIn).toBe(3600);
    expect(new JsonWebTokenVerifier().verify(issued.accessToken, JWT_SECRET, NOW)).toEqual(issued.payload);
    expect(() => issuer.issue({ id: ' ', email: 'admin@toka.com', roles: ['ADMIN'] }, NOW)).toThrow(DomainInvariantError);
    expect(() => issuer.issue({ id: USER_ID, email: 'bad', roles: ['ADMIN'] }, NOW)).toThrow(DomainInvariantError);
    expect(() => issuer.issue({ id: USER_ID, email: 'admin@toka.com', roles: [] }, NOW)).toThrow(DomainInvariantError);
    expect(() => issuer.issue({ id: USER_ID, email: 'admin@toka.com', roles: ['ADMIN', 'ADMIN'] }, NOW)).toThrow(DomainInvariantError);
    expect(() => issuer.issue({ id: USER_ID, email: 'admin@toka.com', roles: ['ADMIN'] }, new Date('invalid'))).toThrow(
      DomainInvariantError,
    );
  });

  it('stores revoked tokens under auth:blacklist:{tokenId} with the remaining TTL', async () => {
    const redis = new MemoryRedis();
    const blacklist = new RedisTokenBlacklist(redis);
    await blacklist.revoke('token-1', 0);
    await blacklist.revoke('token-1', 1.5);
    expect(redis.values.size).toBe(0);
    await blacklist.revokeUntilExpiry('token-1', 1_000, new Date(998_000));
    expect(redis.values.get('auth:blacklist:token-1')).toEqual({ value: '1', ttl: 2 });
    await expect(blacklist.isRevoked('token-1')).resolves.toBe(true);
    await expect(blacklist.isRevoked('token-2')).resolves.toBe(false);
    expect(() => blacklistKey(' ')).toThrow(DomainInvariantError);
  });

  it('publishes contractual events through the shared broker client', async () => {
    const bus = new MemoryBus();
    const publisher = new RabbitMqEventPublisher(bus);
    await publisher.connect();
    const event = {
      eventId: 'evt_1',
      eventType: 'auth.role.assigned' as const,
      occurredAt: NOW.toISOString(),
      actorId: OTHER_ID,
      targetId: USER_ID,
      serviceSource: 'auth-service' as const,
      payload: { role: 'AUDITOR' as const },
    };
    await publisher.publish(event);
    expect(parseDomainEvent(bus.events[0]).eventType).toBe('auth.role.assigned');
    await expect(publisher.publish({ ...event, eventId: '' })).rejects.toBeInstanceOf(ContractError);
    await publisher.close();
    expect(bus.closed).toBe(true);
  });

  it('reads configuration, generates ids and writes JSON logs', () => {
    const env: NodeJS.ProcessEnv = {};
    const directory = mkdtempSync(join(tmpdir(), 'auth-env-'));
    const path = join(directory, '.env');
    writeFileSync(
      path,
      '# comment\n\nBROKEN\n=ignored\nNAME=\'toka\'\nJWT_SECRET="quoted-secret"\nPORT=3001\nAUTH_DATABASE_URL=postgres://db\nREDIS_URL=redis://cache\nRABBITMQ_URL=amqp://broker\n',
    );
    env['REDIS_URL'] = 'redis://already';
    loadLocalEnv(join(directory, 'missing.env'), env);
    loadLocalEnv(path, env);
    expect(env['JWT_SECRET']).toBe('quoted-secret');
    expect(env['NAME']).toBe('toka');
    expect(env['REDIS_URL']).toBe('redis://already');
    expect(readAuthConfig(env)).toMatchObject({ port: 3001, jwtSecret: 'quoted-secret', redisUrl: 'redis://already' });
    expect(serviceListenOptions(readAuthConfig(env))).toEqual({ port: 3001, host: '0.0.0.0' });
    expect(readAuthConfig({ ...env, PORT: undefined }).port).toBe(3001);
    expect(readAuthConfig({ ...env, PORT: '   ' }).port).toBe(3001);
    expect(() => readAuthConfig({ ...env, AUTH_DATABASE_URL: ' ' })).toThrow(ContractError);
    expect(() => readAuthConfig({ ...env, PORT: '0' })).toThrow(ContractError);
    expect(() => readAuthConfig({ ...env, PORT: 'abc' })).toThrow(ContractError);
    expect(() => readAuthConfig({ ...env, PORT: '70000' })).toThrow(ContractError);

    const ids = new RandomIdGenerator();
    expect(ids.nextUserId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids.nextEventId()).toMatch(/^evt_[0-9a-f-]{36}$/);
    expect(new SystemClock().now()).toBeInstanceOf(Date);

    const lines: string[] = [];
    const nest = new NestJsonLogger(new JsonLogger('auth-service', (line) => lines.push(line), () => NOW), 'trc_startup');
    nest.log('login accepted', { userId: USER_ID });
    nest.error('');
    nest.warn(false);
    nest.debug(7);
    nest.verbose('ready', 'AuthModule');
    const parsed = lines.map((line) => JSON.parse(line) as { message: string; level: string; service: string });
    expect(parsed.map((entry) => entry.level)).toEqual(['info', 'error', 'warn', 'debug', 'debug']);
    expect(parsed[0]).toMatchObject({ service: 'auth-service', message: 'login accepted' });
    expect(parsed[1]?.message).toBe('application log');
    expect(lines.join('\n')).not.toContain('Admin123!');
  });

  it('seeds and connects on startup, and closes adapters on shutdown', async () => {
    const logger = new RecordingLogger();
    const redis = new MemoryRedis();
    const broker = new MemoryBus();
    const bootstrap = new AuthBootstrap(
      { apply: () => Promise.resolve() },
      { execute: () => Promise.resolve() },
      redis,
      broker,
      logger,
      () => 'trc_startup',
    );
    await bootstrap.onModuleInit();
    expect(redis.connected).toBe(true);
    expect(broker.connected).toBe(true);
    await bootstrap.onModuleDestroy();
    expect(broker.closed).toBe(true);
    expect(redis.closed).toBe(true);

    const failing = new AuthBootstrap(
      { apply: () => Promise.reject('schema') },
      { execute: () => Promise.resolve() },
      redis,
      broker,
      logger,
      () => 'trc_startup',
    );
    await expect(failing.onModuleInit()).rejects.toBe('schema');
    const stopRedis = new MemoryRedis();
    stopRedis.quit = () => Promise.reject('redis');
    const stopFailing = new AuthBootstrap(
      { apply: () => Promise.resolve() },
      { execute: () => Promise.resolve() },
      stopRedis,
      broker,
      logger,
      () => 'trc_startup',
    );
    await expect(stopFailing.onModuleDestroy()).rejects.toBe('redis');
  });
});

class MemoryRedis implements RedisKeyValueStore {
  readonly values = new Map<string, { value: string; ttl: number }>();
  connected = false;
  closed = false;

  async set(key: string, value: string, expiryMode: 'EX', ttlSeconds: number): Promise<unknown> {
    this.values.set(key, { value, ttl: expiryMode === 'EX' ? ttlSeconds : 0 });
    return 'OK';
  }

  async exists(key: string): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<unknown> {
    this.closed = true;
    return 'OK';
  }
}

class MemoryBus implements DomainEventBus {
  readonly events: unknown[] = [];
  connected = false;
  closed = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async publish(event: unknown): Promise<void> {
    this.events.push(event);
  }

  async consume(): Promise<void> {
    return undefined;
  }

  async consumeAuditEvents(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
