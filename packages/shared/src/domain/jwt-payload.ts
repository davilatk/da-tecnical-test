import { ContractError } from './contract-error.js';
import { isEmail, isPlainObject } from './formats.js';

export const USER_ROLES = ['ADMIN', 'USER', 'AUDITOR'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
  iat: number;
  exp: number;
}

const JWT_PAYLOAD_KEYS = ['email', 'exp', 'iat', 'roles', 'sub'] as const;

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function assertJwtPayload(value: unknown, nowSeconds: number): JwtPayload {
  if (!isPlainObject(value)) {
    throw new ContractError('jwt payload must be an object');
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== JWT_PAYLOAD_KEYS.length ||
    keys.some((key, index) => key !== JWT_PAYLOAD_KEYS[index])
  ) {
    throw new ContractError('jwt payload must contain exactly sub, email, roles, iat and exp');
  }

  const sub = value['sub'];
  const email = value['email'];
  const roles = value['roles'];
  const iat = value['iat'];
  const exp = value['exp'];

  if (typeof sub !== 'string' || sub.trim().length === 0) {
    throw new ContractError('jwt sub must be a non-empty string');
  }
  if (!isEmail(email)) {
    throw new ContractError('jwt email must be a valid email address');
  }
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new ContractError('jwt roles must be a non-empty list');
  }

  const seen = new Set<string>();
  const normalizedRoles: UserRole[] = [];
  for (const role of roles) {
    if (typeof role !== 'string' || !isUserRole(role) || seen.has(role)) {
      throw new ContractError('jwt roles must be unique ADMIN, USER or AUDITOR values');
    }
    seen.add(role);
    normalizedRoles.push(role);
  }

  if (!isUnixSeconds(iat) || !isUnixSeconds(exp)) {
    throw new ContractError('jwt iat and exp must be unix seconds');
  }
  if (exp <= iat) {
    throw new ContractError('jwt exp must be greater than iat');
  }
  if (nowSeconds >= exp) {
    throw new ContractError('jwt is expired');
  }

  return {
    sub,
    email,
    roles: normalizedRoles,
    iat,
    exp,
  };
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function hasAnyRole(payload: JwtPayload, roles: readonly UserRole[]): boolean {
  const allowed = new Set<UserRole>(roles);
  return payload.roles.some((role) => allowed.has(role));
}
