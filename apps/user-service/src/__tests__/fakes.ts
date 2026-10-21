import type { DomainEvent, LogCommand, LogEntry, Logger, UserRole } from '@toka/shared';
import { ApplicationError } from '../application/application-error.js';
import type {
  AuthRegisterCommand,
  AuthRegistrationResult,
  AuthRegistrar,
  CacheStore,
  Clock,
  DomainEventPublisher,
  IdGenerator,
  UserRepository,
} from '../application/ports.js';
import { User, type UserView } from '../domain/user.js';

export const TRACE_ID = 'trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const NOW = new Date('2026-10-21T17:24:00.000Z');
export const LATER = new Date('2026-10-21T18:24:00.000Z');
export const USER_ID = 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const ACTOR_ID = 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3A';
export const EVENT_ID = 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const JWT_SECRET = 'test-jwt-secret';

export const VIEW: UserView = {
  id: USER_ID,
  email: 'ana@toka.com',
  fullName: 'Ana Pérez',
  department: 'Engineering',
  status: 'ACTIVE',
  roles: ['USER'],
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

export function sampleUser(overrides: Partial<{ roles: readonly UserRole[]; id: string; updatedAt: Date }> = {}): User {
  return User.create({
    id: overrides.id ?? USER_ID,
    email: 'ana@toka.com',
    fullName: 'Ana Pérez',
    department: 'Engineering',
    status: 'ACTIVE',
    roles: overrides.roles ?? ['USER'],
    now: overrides.updatedAt ?? NOW,
  });
}

export class RecordingLogger implements Logger {
  readonly entries: LogCommand[] = [];

  log(command: LogCommand): LogEntry {
    this.entries.push({
      level: command.level,
      traceId: command.traceId,
      message: command.message,
      ...(command.context !== undefined ? { context: command.context } : {}),
    });
    return {
      timestamp: NOW.toISOString(),
      level: command.level,
      service: 'user-service',
      traceId: command.traceId,
      message: command.message,
      context: command.context ?? {},
    };
  }

  debug(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('debug', traceId, message, context);
  }

  info(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('info', traceId, message, context);
  }

  warn(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('warn', traceId, message, context);
  }

  error(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('error', traceId, message, context);
  }

  serialized(): string {
    return JSON.stringify(this.entries);
  }

  private write(level: LogCommand['level'], traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.log({
      level,
      traceId,
      message,
      ...(context !== undefined ? { context } : {}),
    });
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(next: Date): void {
    this.current = next;
  }
}

export class FixedIds implements IdGenerator {
  nextEventId(): string {
    return EVENT_ID;
  }
}

export class MemoryUsers implements UserRepository {
  readonly rows: User[] = [];
  failFindAll: unknown = null;
  failFindById: unknown = null;
  failSave: unknown = null;
  failDelete: unknown = null;
  deleteResult: boolean | null = null;

  async findAll(): Promise<User[]> {
    if (this.failFindAll) {
      throw this.failFindAll;
    }
    return [...this.rows];
  }

  async findById(id: string): Promise<User | null> {
    if (this.failFindById) {
      throw this.failFindById;
    }
    return this.rows.find((user) => user.id === id) ?? null;
  }

  async save(user: User): Promise<void> {
    if (this.failSave) {
      throw this.failSave;
    }
    const index = this.rows.findIndex((row) => row.id === user.id);
    if (index >= 0) {
      this.rows[index] = user;
      return;
    }
    this.rows.push(user);
  }

  async deleteById(id: string): Promise<boolean> {
    if (this.failDelete) {
      throw this.failDelete;
    }
    if (this.deleteResult !== null) {
      return this.deleteResult;
    }
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) {
      return false;
    }
    this.rows.splice(index, 1);
    return true;
  }
}

export class MemoryCache implements CacheStore {
  readonly values = new Map<string, { value: string; ttlSeconds: number }>();
  readonly reads: string[] = [];
  readonly deleted: string[] = [];
  failGet = false;
  failSet = false;
  failDelete = false;

  async get(key: string): Promise<string | null> {
    this.reads.push(key);
    if (this.failGet) {
      throw new Error('cache down');
    }
    return this.values.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.failSet) {
      throw new Error('cache down');
    }
    this.values.set(key, { value, ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete) {
      throw new Error('cache down');
    }
    this.deleted.push(key);
    this.values.delete(key);
  }
}

export class FakeAuthRegistrar implements AuthRegistrar {
  readonly calls: Array<AuthRegisterCommand & { traceId: string }> = [];
  result: AuthRegistrationResult = {
    status: 'registered',
    user: { id: USER_ID, email: 'ana@toka.com', roles: ['USER'] },
  };
  fail: unknown = null;

  async register(command: AuthRegisterCommand, traceId: string): Promise<AuthRegistrationResult> {
    this.calls.push({ email: command.email, password: command.password, roles: [...command.roles], traceId });
    if (this.fail) {
      throw this.fail;
    }
    return this.result;
  }
}

export class RecordingPublisher implements DomainEventPublisher {
  readonly events: DomainEvent[] = [];
  fail: unknown = null;

  async publish(event: DomainEvent): Promise<void> {
    if (this.fail) {
      throw this.fail;
    }
    this.events.push(event);
  }
}

export async function capture(promise: Promise<unknown>): Promise<ApplicationError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApplicationError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected an application error');
}
