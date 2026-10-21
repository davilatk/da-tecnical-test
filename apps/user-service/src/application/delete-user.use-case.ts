import type { Logger, UserDeletedEvent } from '@toka/shared';
import { parseDomainEvent } from '@toka/shared';
import { internalError, isApplicationError, userNotFound } from './application-error.js';
import { invalidateUserCache } from './invalidate-user-cache.js';
import type { CacheStore, Clock, DomainEventPublisher, IdGenerator, UserRepository } from './ports.js';
import { requireActor } from './require-actor.js';
import { parseUserId } from '../domain/input-rules.js';

export class DeleteUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly cache: CacheStore,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(id: string, actorId: string, traceId: string): Promise<void> {
    try {
      const actor = requireActor(actorId);
      const parsedId = parseUserId(id);
      if (!parsedId.ok) {
        throw userNotFound();
      }
      const existing = await this.users.findById(parsedId.value);
      if (existing === null) {
        this.logger.warn(traceId, 'user not found', { userId: parsedId.value });
        throw userNotFound();
      }
      const removed = await this.users.deleteById(existing.id);
      if (!removed) {
        this.logger.warn(traceId, 'user not found', { userId: existing.id });
        throw userNotFound();
      }
      const now = this.clock.now();
      await this.events.publish(
        parseDomainEvent({
          eventId: this.ids.nextEventId(),
          eventType: 'user.deleted',
          occurredAt: now.toISOString(),
          actorId: actor,
          targetId: existing.id,
          serviceSource: 'user-service',
          payload: { email: existing.email },
        } satisfies UserDeletedEvent),
      );
      await invalidateUserCache(this.cache, existing.id);
      this.logger.info(traceId, 'user deleted', { userId: existing.id });
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
