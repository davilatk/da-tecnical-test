import { isEmail, isUserRole, USER_ROLES, type UserRole } from '@toka/shared';

const UPPERCASE = /[A-Z]/;
const LOWERCASE = /[a-z]/;
const DIGIT = /\d/;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]/;

export const PASSWORD_RULE_MESSAGE =
  'must contain between 8 and 128 characters, an uppercase letter, a lowercase letter, a digit and a non-alphanumeric character';

export const EMAIL_RULE_MESSAGE = 'must be a valid email address';

export const ROLES_RULE_MESSAGE = 'must be a non-empty list of unique ADMIN, USER or AUDITOR values';

export const ROLE_RULE_MESSAGE = 'must be an existing ADMIN, USER or AUDITOR value';

export const REQUIRED_STRING_MESSAGE = 'must be a non-empty string';

export type ParseSuccess<TValue> = { ok: true; value: TValue };

export type ParseFailure = { ok: false; message: string };

export type ParseResult<TValue> = ParseSuccess<TValue> | ParseFailure;

export function parseEmail(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, message: EMAIL_RULE_MESSAGE };
  }
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !isEmail(email)) {
    return { ok: false, message: EMAIL_RULE_MESSAGE };
  }
  return { ok: true, value: email };
}

export function parsePassword(value: unknown): ParseResult<string> {
  if (
    typeof value !== 'string' ||
    value.length < 8 ||
    value.length > 128 ||
    !UPPERCASE.test(value) ||
    !LOWERCASE.test(value) ||
    !DIGIT.test(value) ||
    !NON_ALPHANUMERIC.test(value)
  ) {
    return { ok: false, message: PASSWORD_RULE_MESSAGE };
  }
  return { ok: true, value };
}

export function parseLoginPassword(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, message: REQUIRED_STRING_MESSAGE };
  }
  return { ok: true, value };
}

export function parseRoles(value: unknown): ParseResult<UserRole[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, message: ROLES_RULE_MESSAGE };
  }
  const roles: UserRole[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !isUserRole(item) || seen.has(item)) {
      return { ok: false, message: ROLES_RULE_MESSAGE };
    }
    seen.add(item);
    roles.push(item);
  }
  return { ok: true, value: roles };
}

export function parseRole(value: unknown): ParseResult<UserRole> {
  if (typeof value !== 'string' || !isUserRole(value)) {
    return { ok: false, message: ROLE_RULE_MESSAGE };
  }
  return { ok: true, value };
}

export function parseUserId(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: REQUIRED_STRING_MESSAGE };
  }
  return { ok: true, value: value.trim() };
}

export function sortRoles(roles: readonly UserRole[]): UserRole[] {
  const rank = new Map<UserRole, number>(USER_ROLES.map((role, index) => [role, index]));
  return [...roles].sort((left, right) => (rank.get(left) ?? 0) - (rank.get(right) ?? 0));
}
