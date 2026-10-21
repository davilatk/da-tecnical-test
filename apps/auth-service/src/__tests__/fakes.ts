import type { DomainEvent, LogCommand, LogEntry, Logger, UserRole } from '@toka/shared';
import { ApplicationError } from '../application/application-error.js';
import type { AuthenticatedActor } from '../application/authenticated-actor.js';
import type {
  AccessTokenIssuer,
  Clock,
  CredentialRepository,
  DomainEventPublisher,
  IdGenerator,
  IssuedAccessToken,
  PasswordHasher,
  RoleRepository,
} from '../application/ports.js';
import type { AuthCredential, AuthUser } from '../domain/auth-credential.js';

export const TRACE_ID = 'trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const NOW = new Date('2026-10-21T17:24:00.000Z');
export const USER_ID = '018f3c1a-7c2b-4a11-8c3d-9e4f5a6b7c8d';
export const OTHER_ID = '018f3c1a-7c2b-4a11-8c3d-9e4f5a6b7c8e';
export const JWT_SECRET = 'test-jwt-secret';

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
      service: 'auth-service',
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

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class FixedIds implements IdGenerator {
  constructor(
    private readonly userId = USER_ID,
    private readonly eventId = 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3F',
  ) {}

  nextUserId(): string {
    return this.userId;
  }

  nextEventId(): string {
    return this.eventId;
  }
}

export class MemoryCredentials implements CredentialRepository {
  readonly saved: AuthCredential[] = [];
  failSave: unknown = null;
  failFind: unknown = null;

  async findById(id: string): Promise<AuthCredential | null> {
    if (this.failFind) {
      throw this.failFind;
    }
    return this.saved.find((credential) => credential.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<AuthCredential | null> {
    if (this.failFind) {
      throw this.failFind;
    }
    return this.saved.find((credential) => credential.email === email) ?? null;
  }

  async save(credential: AuthCredential): Promise<void> {
    if (this.failSave) {
      throw this.failSave;
    }
    const index = this.saved.findIndex((current) => current.id === credential.id);
    if (index >= 0) {
      this.saved[index] = credential;
      return;
    }
    this.saved.push(credential);
  }
}

export class MemoryRoles implements RoleRepository {
  readonly inserted: UserRole[] = [];
  readonly names = new Set<UserRole>();
  failList: unknown = null;

  async list(): Promise<UserRole[]> {
    if (this.failList) {
      throw this.failList;
    }
    return [...this.names];
  }

  async exists(role: UserRole): Promise<boolean> {
    return this.names.has(role);
  }

  async insertIfMissing(role: UserRole): Promise<void> {
    this.inserted.push(role);
    this.names.add(role);
  }

  seed(...roles: UserRole[]): void {
    for (const role of roles) {
      this.names.add(role);
    }
  }
}

export class FakeHasher implements PasswordHasher {
  failHash: unknown = null;
  private sequence = 0;
  private readonly plaintexts = new Map<string, string>();

  async hash(password: string): Promise<string> {
    if (this.failHash) {
      throw this.failHash;
    }
    this.sequence += 1;
    const passwordHash = `hash-${this.sequence}`;
    this.plaintexts.set(passwordHash, password);
    return passwordHash;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return this.plaintexts.get(passwordHash) === password;
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

export class ScriptedIssuer implements AccessTokenIssuer {
  fail: unknown = null;
  issued: IssuedAccessToken | null = null;
  lastUser: AuthUser | null = null;
  lastNow: Date | null = null;

  issue(user: AuthUser, now: Date): IssuedAccessToken {
    this.lastUser = user;
    this.lastNow = now;
    if (this.fail) {
      throw this.fail;
    }
    if (!this.issued) {
      throw new Error('issuer was not scripted');
    }
    return this.issued;
  }
}

export function adminActor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    id: OTHER_ID,
    email: 'admin@toka.com',
    roles: ['ADMIN'],
    ...overrides,
  };
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
