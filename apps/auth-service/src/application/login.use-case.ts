import type { AuthUserLoggedInEvent, JwtPayload, Logger } from '@toka/shared';
import type { AuthUser } from '../domain/auth-credential.js';
import { parseEmail, parseLoginPassword } from '../domain/input-rules.js';
import { internalError, invalidCredentials, isApplicationError, validationError } from './application-error.js';
import type {
  AccessTokenIssuer,
  Clock,
  CredentialRepository,
  DomainEventPublisher,
  IdGenerator,
  PasswordHasher,
} from './ports.js';

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export class LoginUseCase {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly issuer: AccessTokenIssuer,
    private readonly publisher: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(command: LoginCommand, traceId: string): Promise<LoginResult> {
    try {
      const email = parseEmail(command.email);
      const password = parseLoginPassword(command.password);
      const violations = [
        ...(email.ok ? [] : [{ field: 'email', message: email.message }]),
        ...(password.ok ? [] : [{ field: 'password', message: password.message }]),
      ];
      if (!email.ok || !password.ok) {
        throw validationError(violations);
      }

      const credential = await this.credentials.findByEmail(email.value);
      const passwordMatches =
        credential !== null && (await this.hasher.verify(password.value, credential.passwordHash));
      if (!credential || !passwordMatches) {
        this.logger.warn(traceId, 'login rejected', { code: 'INVALID_CREDENTIALS' });
        throw invalidCredentials();
      }

      const user = credential.toAuthUser();
      const now = this.clock.now();
      const issued = this.issuer.issue(user, now);
      assertIssuedToken(issued.expiresIn, issued.payload);
      await this.publisher.publish(loggedInEvent(user, now, this.ids.nextEventId()));
      this.logger.info(traceId, 'login accepted', { userId: user.id });
      return {
        accessToken: issued.accessToken,
        tokenType: 'Bearer',
        expiresIn: issued.expiresIn,
        user,
      };
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}

function assertIssuedToken(expiresIn: number, payload: JwtPayload): void {
  if (expiresIn !== payload.exp - payload.iat) {
    throw new Error('TokenLifetimeMismatch');
  }
}

function loggedInEvent(user: AuthUser, now: Date, eventId: string): AuthUserLoggedInEvent {
  return {
    eventId,
    eventType: 'auth.user.logged_in',
    occurredAt: now.toISOString(),
    actorId: user.id,
    targetId: user.id,
    serviceSource: 'auth-service',
    payload: { email: user.email },
  };
}
