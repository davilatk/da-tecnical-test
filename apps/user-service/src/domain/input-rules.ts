import type { ApiFieldError, UserRole, UserStatus, UserUpdatableField } from '@toka/shared';
import { isEmail, isUserRole, USER_STATUSES, USER_UPDATABLE_FIELDS } from '@toka/shared';

const UPPERCASE = /[A-Z]/;
const LOWERCASE = /[a-z]/;
const DIGIT = /\d/;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]/;

export const PASSWORD_RULE_MESSAGE =
  'must contain between 8 and 128 characters, an uppercase letter, a lowercase letter, a digit and a non-alphanumeric character';

export const EMAIL_RULE_MESSAGE = 'must be a valid email address';

export const ROLES_RULE_MESSAGE = 'must be a non-empty list of unique ADMIN, USER or AUDITOR values';

export const FULL_NAME_RULE_MESSAGE = 'must contain between 1 and 200 characters';

export const DEPARTMENT_RULE_MESSAGE = 'must contain between 1 and 100 characters';

export const STATUS_RULE_MESSAGE = 'must be ACTIVE or INACTIVE';

export const EMPTY_UPDATE_MESSAGE = 'must include at least one of fullName, department or status';

export const NOT_ALLOWED_MESSAGE = 'is not allowed';

export const REQUIRED_ID_MESSAGE = 'must be a non-empty string';

export type ParseSuccess<TValue> = { ok: true; value: TValue };

export type ParseFailure = { ok: false; message: string };

export type ParseResult<TValue> = ParseSuccess<TValue> | ParseFailure;

export interface UserPatch {
  fullName?: string;
  department?: string;
  status?: UserStatus;
  changedFields: UserUpdatableField[];
}

export type UpdateParse = { ok: true; value: UserPatch } | { ok: false; violations: ApiFieldError[] };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isUserStatus(value: string): value is UserStatus {
  return (USER_STATUSES as readonly string[]).includes(value);
}

export function isUserUpdatableField(value: string): value is UserUpdatableField {
  return (USER_UPDATABLE_FIELDS as readonly string[]).includes(value);
}

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

export function parseFullName(value: unknown): ParseResult<string> {
  return parseBoundedText(value, 200, FULL_NAME_RULE_MESSAGE);
}

export function parseDepartment(value: unknown): ParseResult<string> {
  return parseBoundedText(value, 100, DEPARTMENT_RULE_MESSAGE);
}

export function parseStatus(value: unknown): ParseResult<UserStatus> {
  if (typeof value !== 'string' || !isUserStatus(value)) {
    return { ok: false, message: STATUS_RULE_MESSAGE };
  }
  return { ok: true, value };
}

export function parseUserId(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: REQUIRED_ID_MESSAGE };
  }
  return { ok: true, value: value.trim() };
}

export function parseUpdateBody(body: unknown): UpdateParse {
  if (!isPlainObject(body)) {
    return { ok: false, violations: [{ field: null, message: EMPTY_UPDATE_MESSAGE }] };
  }
  const keys = Object.keys(body);
  if (keys.length === 0) {
    return { ok: false, violations: [{ field: null, message: EMPTY_UPDATE_MESSAGE }] };
  }
  const violations: ApiFieldError[] = [];
  for (const key of keys) {
    if (!isUserUpdatableField(key)) {
      violations.push({ field: key, message: NOT_ALLOWED_MESSAGE });
    }
  }
  const fullName = readOptional(body, 'fullName', parseFullName, violations);
  const department = readOptional(body, 'department', parseDepartment, violations);
  const status = readOptional(body, 'status', parseStatus, violations);
  if (violations.length > 0 || (fullName === undefined && department === undefined && status === undefined)) {
    if (violations.length === 0) {
      violations.push({ field: null, message: EMPTY_UPDATE_MESSAGE });
    }
    return { ok: false, violations };
  }
  const changedFields: UserUpdatableField[] = [];
  if (fullName !== undefined) {
    changedFields.push('fullName');
  }
  if (department !== undefined) {
    changedFields.push('department');
  }
  if (status !== undefined) {
    changedFields.push('status');
  }
  return {
    ok: true,
    value: {
      ...(fullName !== undefined ? { fullName } : {}),
      ...(department !== undefined ? { department } : {}),
      ...(status !== undefined ? { status } : {}),
      changedFields,
    },
  };
}

function parseBoundedText(value: unknown, maxLength: number, message: string): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, message };
  }
  const text = value.trim();
  if (text.length < 1 || text.length > maxLength) {
    return { ok: false, message };
  }
  return { ok: true, value: text };
}

function readOptional<TValue>(
  body: Record<string, unknown>,
  key: UserUpdatableField,
  parse: (value: unknown) => ParseResult<TValue>,
  violations: ApiFieldError[],
): TValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return undefined;
  }
  const parsed = parse(body[key]);
  if (!parsed.ok) {
    violations.push({ field: key, message: parsed.message });
    return undefined;
  }
  return parsed.value;
}
