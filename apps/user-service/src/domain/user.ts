import type { UserRole, UserStatus } from '@toka/shared';
import { DomainInvariantError } from './domain-invariant.error.js';
import { parseDepartment, parseEmail, parseFullName, parseRoles, parseStatus, parseUserId } from './input-rules.js';

export interface UserView {
  id: string;
  email: string;
  fullName: string;
  department: string;
  status: UserStatus;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  id: string;
  email: string;
  fullName: string;
  department: string;
  status: UserStatus;
  roles: readonly UserRole[];
  now: Date;
}

export interface RehydrateUserInput {
  id: string;
  email: string;
  fullName: string;
  department: string;
  status: string;
  roles: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserUpdate {
  fullName?: string;
  department?: string;
  status?: UserStatus;
  at: Date;
}

export class User {
  private constructor(
    readonly id: string,
    readonly email: string,
    readonly fullName: string,
    readonly department: string,
    readonly status: UserStatus,
    private readonly roleList: readonly UserRole[],
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  get roles(): readonly UserRole[] {
    return [...this.roleList];
  }

  toView(): UserView {
    return {
      id: this.id,
      email: this.email,
      fullName: this.fullName,
      department: this.department,
      status: this.status,
      roles: [...this.roleList],
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  update(changes: UserUpdate): User {
    assertTimestamp(changes.at);
    const fullName = changes.fullName === undefined ? this.fullName : requireFullName(changes.fullName);
    const department = changes.department === undefined ? this.department : requireDepartment(changes.department);
    const status = changes.status === undefined ? this.status : requireStatus(changes.status);
    return new User(this.id, this.email, fullName, department, status, [...this.roleList], this.createdAt, changes.at);
  }

  static create(input: CreateUserInput): User {
    assertTimestamp(input.now);
    return new User(
      requireId(input.id),
      requireEmail(input.email),
      requireFullName(input.fullName),
      requireDepartment(input.department),
      requireStatus(input.status),
      requireRoles(input.roles),
      input.now,
      input.now,
    );
  }

  static rehydrate(input: RehydrateUserInput): User {
    assertTimestamp(input.createdAt);
    assertTimestamp(input.updatedAt);
    return new User(
      requireId(input.id),
      requireEmail(input.email),
      requireFullName(input.fullName),
      requireDepartment(input.department),
      requireStatus(input.status),
      requireRoles(input.roles),
      input.createdAt,
      input.updatedAt,
    );
  }
}

function requireId(value: string): string {
  const parsed = parseUserId(value);
  if (!parsed.ok) {
    throw new DomainInvariantError('user id is invalid');
  }
  return parsed.value;
}

function requireEmail(value: string): string {
  const parsed = parseEmail(value);
  if (!parsed.ok) {
    throw new DomainInvariantError('user email is invalid');
  }
  return parsed.value;
}

function requireFullName(value: string): string {
  const parsed = parseFullName(value);
  if (!parsed.ok) {
    throw new DomainInvariantError('user fullName is invalid');
  }
  return parsed.value;
}

function requireDepartment(value: string): string {
  const parsed = parseDepartment(value);
  if (!parsed.ok) {
    throw new DomainInvariantError('user department is invalid');
  }
  return parsed.value;
}

function requireStatus(value: string): UserStatus {
  const parsed = parseStatus(value);
  if (!parsed.ok) {
    throw new DomainInvariantError('user status is invalid');
  }
  return parsed.value;
}

function requireRoles(roles: readonly string[]): UserRole[] {
  const parsed = parseRoles(roles);
  if (!parsed.ok) {
    throw new DomainInvariantError('user roles are invalid');
  }
  return parsed.value;
}

function assertTimestamp(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainInvariantError('timestamp is invalid');
  }
}
