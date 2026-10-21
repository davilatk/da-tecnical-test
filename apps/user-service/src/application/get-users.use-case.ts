import type { Logger } from '@toka/shared';
import { internalError, isApplicationError } from './application-error.js';
import type { CacheStore, UserRepository } from './ports.js';
import { requireActor } from './require-actor.js';
import { tryDeserializeUserList } from './user-cache.js';
import { USERS_LIST_CACHE_KEY, USER_CACHE_TTL_SECONDS } from '../domain/cache-keys.js';
import type { UserView } from '../domain/user.js';

export class GetUsersUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly cache: CacheStore,
    private readonly logger: Logger,
  ) {}

  async execute(actorId: string, traceId: string): Promise<UserView[]> {
    try {
      requireActor(actorId);
      const raw = await this.cache.get(USERS_LIST_CACHE_KEY);
      if (raw !== null) {
        const cached = tryDeserializeUserList(raw);
        if (cached !== null) {
          this.logger.info(traceId, 'users listed', { source: 'cache', count: cached.length });
          return cached;
        }
      }
      const users = (await this.users.findAll()).map((user) => user.toView());
      await this.cache.set(USERS_LIST_CACHE_KEY, JSON.stringify(users), USER_CACHE_TTL_SECONDS);
      this.logger.info(traceId, 'users listed', { source: 'database', count: users.length });
      return users;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
