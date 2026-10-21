import { DomainInvariantError } from '../domain/domain-invariant.error.js';
import { isPlainObject } from '../domain/input-rules.js';
import type { UserView } from '../domain/user.js';
import { User } from '../domain/user.js';

export function tryDeserializeUser(raw: string): UserView | null {
  try {
    return readCachedUser(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function tryDeserializeUserList(raw: string): UserView[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.map((item) => readCachedUser(item));
  } catch {
    return null;
  }
}

function readCachedUser(value: unknown): UserView {
  if (!isPlainObject(value)) {
    throw new DomainInvariantError('cached user is invalid');
  }
  const roles = value['roles'];
  return User.rehydrate({
    id: typeof value['id'] === 'string' ? value['id'] : '',
    email: typeof value['email'] === 'string' ? value['email'] : '',
    fullName: typeof value['fullName'] === 'string' ? value['fullName'] : '',
    department: typeof value['department'] === 'string' ? value['department'] : '',
    status: typeof value['status'] === 'string' ? value['status'] : '',
    roles: Array.isArray(roles) ? roles.map((role) => (typeof role === 'string' ? role : '')) : [],
    createdAt: typeof value['createdAt'] === 'string' ? new Date(value['createdAt']) : new Date(Number.NaN),
    updatedAt: typeof value['updatedAt'] === 'string' ? new Date(value['updatedAt']) : new Date(Number.NaN),
  }).toView();
}
