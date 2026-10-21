import type { AuthRoleAssignedEvent, Logger } from '@toka/shared';
import type { AuthUser } from '../domain/auth-credential.js';
import { parseRole, parseUserId, ROLE_RULE_MESSAGE } from '../domain/input-rules.js';
import type { AuthenticatedActor } from './authenticated-actor.js';
import { authUserNotFound, internalError, isApplicationError, validationError } from './application-error.js';
import type { Clock, CredentialRepository, DomainEventPublisher, IdGenerator, RoleRepository } from './ports.js';
import { requireAdmin } from './require-admin.js';

export interface AssignRoleCommand {
  userId: string;
  role: string;
}

export class AssignRoleUseCase {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly roles: RoleRepository,
    private readonly publisher: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(actor: AuthenticatedActor | null, command: AssignRoleCommand, traceId: string): Promise<AuthUser> {
    try {
      const admin = requireAdmin(actor);
      const userId = parseUserId(command.userId);
      const role = parseRole(command.role);
      const violations = [
        ...(userId.ok ? [] : [{ field: 'userId', message: userId.message }]),
        ...(role.ok ? [] : [{ field: 'role', message: role.message }]),
      ];
      if (!userId.ok || !role.ok) {
        throw validationError(violations);
      }
      if (!(await this.roles.exists(role.value))) {
        throw validationError([{ field: 'role', message: ROLE_RULE_MESSAGE }]);
      }

      const credential = await this.credentials.findById(userId.value);
      if (!credential) {
        throw authUserNotFound();
      }

      const now = this.clock.now();
      const assignment = credential.assignRole(role.value, now);
      if (!assignment.changed) {
        this.logger.info(traceId, 'role assignment unchanged', {
          actorId: admin.id,
          targetId: credential.id,
          role: role.value,
        });
        return credential.toAuthUser();
      }

      await this.credentials.save(assignment.credential);
      await this.publisher.publish(roleAssignedEvent(admin.id, assignment.credential.id, role.value, now, this.ids.nextEventId()));
      this.logger.info(traceId, 'role assigned', {
        actorId: admin.id,
        targetId: assignment.credential.id,
        role: role.value,
      });
      return assignment.credential.toAuthUser();
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}

function roleAssignedEvent(
  actorId: string,
  targetId: string,
  role: AuthRoleAssignedEvent['payload']['role'],
  now: Date,
  eventId: string,
): AuthRoleAssignedEvent {
  return {
    eventId,
    eventType: 'auth.role.assigned',
    occurredAt: now.toISOString(),
    actorId,
    targetId,
    serviceSource: 'auth-service',
    payload: { role },
  };
}
