import type { Logger, UserUpdatedEvent } from '@toka/shared';
import { parseDomainEvent } from '@toka/shared';
import { internalError, isApplicationError, userNotFound, validationError } from './application-error.js';
import { invalidateUserCache } from './invalidate-user-cache.js';
import type { CacheStore, Clock, DomainEventPublisher, IdGenerator, UserRepository } from './ports.js';
import { requireActor } from './require-actor.js';
import { parseUpdateBody, parseUserId } from '../domain/input-rules.js';
import type { UserView } from '../domain/user.js';

export class UpdateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly cache: CacheStore,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(id: string, body: unknown, actorId: string, traceId: string): Promise<UserView> {
    try {
      const actor = requireActor(actorId);
      const patch = parseUpdateBody(body);
      if (!patch.ok) {
        throw validationError(patch.violations);
      }
      const parsedId = parseUserId(id);
      if (!parsedId.ok) {
        throw userNotFound();
      }
      const existing = await this.users.findById(parsedId.value);
      if (existing === null) {
        this.logger.warn(traceId, 'user not found', { userId: parsedId.value });
        throw userNotFound();
      }
      const now = this.clock.now();
      const updated = existing.update({
        ...(patch.value.fullName !== undefined ? { fullName: patch.value.fullName } : {}),
        ...(patch.value.department !== undefined ? { department: patch.value.department } : {}),
        ...(patch.value.status !== undefined ? { status: patch.value.status } : {}),
        at: now,
      });
      await this.users.save(updated);
      const view = updated.toView();
      await this.events.publish(
        parseDomainEvent({
          eventId: this.ids.nextEventId(),
          eventType: 'user.updated',
          occurredAt: now.toISOString(),
          actorId: actor,
          targetId: view.id,
          serviceSource: 'user-service',
          payload: { changedFields: patch.value.changedFields },
        } satisfies UserUpdatedEvent),
      );
      await invalidateUserCache(this.cache, view.id);
      this.logger.info(traceId, 'user updated', { userId: view.id, changedFields: patch.value.changedFields });
      return view;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
