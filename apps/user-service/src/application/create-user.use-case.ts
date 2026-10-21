import type { Logger, UserCreatedEvent, UserRole } from '@toka/shared';
import { parseDomainEvent } from '@toka/shared';
import {
  ApplicationError,
  emailAlreadyRegistered,
  internalError,
  isApplicationError,
  validationError,
} from './application-error.js';
import { EmailAlreadyRegisteredError } from './email-already-registered.error.js';
import { invalidateUserCache } from './invalidate-user-cache.js';
import type { AuthRegistrar, CacheStore, Clock, DomainEventPublisher, IdGenerator, UserRepository } from './ports.js';
import { requireActor } from './require-actor.js';
import { parseDepartment, parseEmail, parseFullName, parsePassword, parseRoles } from '../domain/input-rules.js';
import { User, type UserView } from '../domain/user.js';

export interface CreateUserCommand {
  email: unknown;
  password: unknown;
  fullName: unknown;
  department: unknown;
  roles?: unknown;
}

export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly auth: AuthRegistrar,
    private readonly cache: CacheStore,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(command: CreateUserCommand, actorId: string, traceId: string): Promise<UserView> {
    try {
      const actor = requireActor(actorId);
      const email = parseEmail(command.email);
      const password = parsePassword(command.password);
      const fullName = parseFullName(command.fullName);
      const department = parseDepartment(command.department);
      const requestedRoles = command.roles === undefined ? undefined : parseRoles(command.roles);
      const violations = [
        ...(email.ok ? [] : [{ field: 'email', message: email.message }]),
        ...(password.ok ? [] : [{ field: 'password', message: password.message }]),
        ...(fullName.ok ? [] : [{ field: 'fullName', message: fullName.message }]),
        ...(department.ok ? [] : [{ field: 'department', message: department.message }]),
        ...(requestedRoles === undefined || requestedRoles.ok ? [] : [{ field: 'roles', message: requestedRoles.message }]),
      ];
      if (!email.ok || !password.ok || !fullName.ok || !department.ok || (requestedRoles !== undefined && !requestedRoles.ok)) {
        throw validationError(violations);
      }

      const roles: readonly UserRole[] = requestedRoles === undefined ? ['USER'] : requestedRoles.value;
      const registration = await this.auth.register({ email: email.value, password: password.value, roles }, traceId);
      if (registration.status === 'rejected') {
        this.logger.warn(traceId, 'user creation rejected', { code: registration.error.code, status: registration.error.status });
        throw new ApplicationError(
          registration.error.status,
          registration.error.code,
          registration.error.message,
          registration.error.details,
        );
      }

      const now = this.clock.now();
      const user = User.create({
        id: registration.user.id,
        email: email.value,
        fullName: fullName.value,
        department: department.value,
        status: 'ACTIVE',
        roles: registration.user.roles,
        now,
      });
      await this.users.save(user);
      const view = user.toView();
      await this.events.publish(parseDomainEvent(createdEvent(view, actor, now, this.ids.nextEventId())));
      await invalidateUserCache(this.cache, view.id);
      this.logger.info(traceId, 'user created', { userId: view.id });
      return view;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        this.logger.warn(traceId, 'user creation rejected', { code: 'EMAIL_ALREADY_REGISTERED' });
        throw emailAlreadyRegistered();
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}

function createdEvent(user: UserView, actorId: string, now: Date, eventId: string): UserCreatedEvent {
  return {
    eventId,
    eventType: 'user.created',
    occurredAt: now.toISOString(),
    actorId,
    targetId: user.id,
    serviceSource: 'user-service',
    payload: {
      email: user.email,
      fullName: user.fullName,
      department: user.department,
      status: user.status,
      roles: user.roles,
    },
  };
}
