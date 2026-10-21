import type { Logger } from '@toka/shared';
import { internalError, isApplicationError, userNotFound } from './application-error.js';
import type { CacheStore, UserRepository } from './ports.js';
import { requireActor } from './require-actor.js';
import { tryDeserializeUser } from './user-cache.js';
import { USER_CACHE_TTL_SECONDS, userCacheKey } from '../domain/cache-keys.js';
import { parseUserId } from '../domain/input-rules.js';
import type { UserView } from '../domain/user.js';

export class GetUserByIdUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly cache: CacheStore,
    private readonly logger: Logger,
  ) {}

  async execute(id: string, actorId: string, traceId: string): Promise<UserView> {
    try {
      requireActor(actorId);
      const parsedId = parseUserId(id);
      if (!parsedId.ok) {
        throw userNotFound();
      }
      const key = userCacheKey(parsedId.value);
      const raw = await this.cache.get(key);
      if (raw !== null) {
        const cached = tryDeserializeUser(raw);
        if (cached !== null) {
          this.logger.info(traceId, 'user fetched', { source: 'cache', userId: cached.id });
          return cached;
        }
      }
      const user = await this.users.findById(parsedId.value);
      if (user === null) {
        this.logger.warn(traceId, 'user not found', { userId: parsedId.value });
        throw userNotFound();
      }
      const view = user.toView();
      await this.cache.set(key, JSON.stringify(view), USER_CACHE_TTL_SECONDS);
      this.logger.info(traceId, 'user fetched', { source: 'database', userId: view.id });
      return view;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
