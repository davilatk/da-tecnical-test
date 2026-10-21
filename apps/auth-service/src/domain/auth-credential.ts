import { isUserRole, type UserRole } from '@toka/shared';
import { DomainInvariantError } from './domain-invariant.error.js';
import { parseEmail } from './input-rules.js';

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthUser {
  id: string;
  email: string;
  roles: UserRole[];
}

export interface CreateAuthCredentialInput {
  id: string;
  email: string;
  passwordHash: string;
  roles: readonly UserRole[];
  now: Date;
}

export interface RehydrateAuthCredentialInput {
  id: string;
  email: string;
  passwordHash: string;
  roles: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export function assertUserId(value: string): string {
  const id = value.trim().toLowerCase();
  if (!USER_ID_PATTERN.test(id)) {
    throw new DomainInvariantError('credential id must be a uuid');
  }
  return id;
}

export class AuthCredential {
  private constructor(
    readonly id: string,
    readonly email: string,
    readonly passwordHash: string,
    private readonly roleList: readonly UserRole[],
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  get roles(): readonly UserRole[] {
    return [...this.roleList];
  }

  hasRole(role: UserRole): boolean {
    return this.roleList.includes(role);
  }

  toAuthUser(): AuthUser {
    return {
      id: this.id,
      email: this.email,
      roles: [...this.roleList],
    };
  }

  assignRole(role: string, at: Date): { credential: AuthCredential; changed: boolean } {
    if (!isUserRole(role)) {
      throw new DomainInvariantError('role is invalid');
    }
    assertTimestamp(at);
    if (this.hasRole(role)) {
      return { credential: this, changed: false };
    }
    return {
      credential: new AuthCredential(this.id, this.email, this.passwordHash, [...this.roleList, role], this.createdAt, at),
      changed: true,
    };
  }

  static create(input: CreateAuthCredentialInput): AuthCredential {
    const email = normalizeStoredEmail(input.email);
    assertPasswordHash(input.passwordHash);
    const roles = assertRoleList(input.roles);
    assertTimestamp(input.now);
    return new AuthCredential(assertUserId(input.id), email, input.passwordHash, roles, input.now, input.now);
  }

  static rehydrate(input: RehydrateAuthCredentialInput): AuthCredential {
    const email = normalizeStoredEmail(input.email);
    assertPasswordHash(input.passwordHash);
    const roles = assertRoleList(input.roles);
    assertTimestamp(input.createdAt);
    assertTimestamp(input.updatedAt);
    return new AuthCredential(assertUserId(input.id), email, input.passwordHash, roles, input.createdAt, input.updatedAt);
  }
}

function normalizeStoredEmail(email: string): string {
  const parsed = parseEmail(email);
  if (!parsed.ok) {
    throw new DomainInvariantError('credential email is invalid');
  }
  return parsed.value;
}

function assertPasswordHash(passwordHash: string): void {
  if (passwordHash.trim().length === 0 || passwordHash.length > 255) {
    throw new DomainInvariantError('password hash is invalid');
  }
}

function assertRoleList(roles: readonly string[]): UserRole[] {
  if (roles.length === 0) {
    throw new DomainInvariantError('credential roles must not be empty');
  }
  const unique = new Set<string>();
  const normalized: UserRole[] = [];
  for (const role of roles) {
    if (!isUserRole(role) || unique.has(role)) {
      throw new DomainInvariantError('credential roles are invalid');
    }
    unique.add(role);
    normalized.push(role);
  }
  return normalized;
}

function assertTimestamp(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainInvariantError('timestamp is invalid');
  }
}
