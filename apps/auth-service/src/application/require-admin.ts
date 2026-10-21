import { forbidden, tokenRejected } from './application-error.js';
import type { AuthenticatedActor } from './authenticated-actor.js';

export function requireAdmin(actor: AuthenticatedActor | null): AuthenticatedActor {
  if (actor === null || actor.id.trim().length === 0) {
    throw tokenRejected();
  }
  if (!actor.roles.includes('ADMIN')) {
    throw forbidden();
  }
  return actor;
}
