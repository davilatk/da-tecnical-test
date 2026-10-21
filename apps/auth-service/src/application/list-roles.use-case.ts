import type { Logger, UserRole } from '@toka/shared';
import { sortRoles } from '../domain/input-rules.js';
import type { AuthenticatedActor } from './authenticated-actor.js';
import { internalError, isApplicationError } from './application-error.js';
import type { RoleRepository } from './ports.js';
import { requireAdmin } from './require-admin.js';

export class ListRolesUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly logger: Logger,
  ) {}

  async execute(actor: AuthenticatedActor | null, traceId: string): Promise<UserRole[]> {
    try {
      const admin = requireAdmin(actor);
      const listed = sortRoles(await this.roles.list());
      this.logger.info(traceId, 'roles listed', { actorId: admin.id });
      return listed;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
