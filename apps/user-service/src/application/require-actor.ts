import { tokenRejected } from './application-error.js';

export function requireActor(actorId: string): string {
  const actor = actorId.trim();
  if (actor.length === 0) {
    throw tokenRejected();
  }
  return actor;
}
