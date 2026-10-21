import type { Logger, UserRole } from '@toka/shared';
import { AuthCredential, type AuthUser } from '../domain/auth-credential.js';
import { parseEmail, parsePassword, parseRoles } from '../domain/input-rules.js';
import {
  emailAlreadyRegistered,
  internalError,
  isApplicationError,
  validationError,
} from './application-error.js';
import { EmailAlreadyRegisteredError } from './email-already-registered.error.js';
import type { Clock, CredentialRepository, IdGenerator, PasswordHasher, RoleRepository } from './ports.js';

export interface RegisterAuthCommand {
  email: string;
  password: string;
  roles?: readonly string[];
}

export class RegisterAuthUseCase {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(command: RegisterAuthCommand, traceId: string): Promise<AuthUser> {
    try {
      const email = parseEmail(command.email);
      const password = parsePassword(command.password);
      const requestedRoles = command.roles === undefined ? undefined : parseRoles(command.roles);
      const violations = [
        ...(email.ok ? [] : [{ field: 'email', message: email.message }]),
        ...(password.ok ? [] : [{ field: 'password', message: password.message }]),
        ...(requestedRoles === undefined || requestedRoles.ok ? [] : [{ field: 'roles', message: requestedRoles.message }]),
      ];
      if (!email.ok || !password.ok || (requestedRoles !== undefined && !requestedRoles.ok)) {
        throw validationError(violations);
      }

      const resolved: readonly UserRole[] = requestedRoles === undefined ? ['USER'] : requestedRoles.value;
      for (const role of resolved) {
        if (!(await this.roles.exists(role))) {
          if (requestedRoles === undefined) {
            throw new Error('DefaultRoleMissing');
          }
          throw validationError([{ field: 'roles', message: 'must be a non-empty list of unique ADMIN, USER or AUDITOR values' }]);
        }
      }

      const existing = await this.credentials.findByEmail(email.value);
      if (existing) {
        this.logger.warn(traceId, 'registration rejected', { code: 'EMAIL_ALREADY_REGISTERED' });
        throw emailAlreadyRegistered();
      }

      const passwordHash = await this.hasher.hash(password.value);
      const credential = AuthCredential.create({
        id: this.ids.nextUserId(),
        email: email.value,
        passwordHash,
        roles: resolved,
        now: this.clock.now(),
      });
      await this.credentials.save(credential);
      this.logger.info(traceId, 'credential registered', { userId: credential.id });
      return credential.toAuthUser();
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        this.logger.warn(traceId, 'registration rejected', { code: 'EMAIL_ALREADY_REGISTERED' });
        throw emailAlreadyRegistered();
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
