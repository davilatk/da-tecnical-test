import type { UserRole } from '@toka/shared';

export interface AuthenticatedActor {
  id: string;
  email: string;
  roles: readonly UserRole[];
}
