import type { EventType, UserRole, UserStatus } from './contracts';

export const USER_ROLES: readonly UserRole[] = ['ADMIN', 'USER', 'AUDITOR'];
export const USER_STATUSES: readonly UserStatus[] = ['ACTIVE', 'INACTIVE'];
export const EVENT_TYPES: readonly EventType[] = [
  'auth.user.logged_in',
  'auth.role.assigned',
  'user.created',
  'user.updated',
  'user.deleted',
];
