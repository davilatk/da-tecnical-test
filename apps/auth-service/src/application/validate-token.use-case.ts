import { AuthenticateAccessToken } from '@toka/shared';
import type { AccessTokenVerifier, Logger } from '@toka/shared';
import type { AuthUser } from '../domain/auth-credential.js';
import { internalError, isApplicationError, tokenRejected } from './application-error.js';
import type { AuthSettings, Clock, TokenBlacklist } from './ports.js';

export interface ValidateTokenResult {
  valid: true;
  user: AuthUser;
}

export class ValidateTokenUseCase {
  private readonly authenticate: AuthenticateAccessToken;

  constructor(
    verifier: AccessTokenVerifier,
    private readonly blacklist: TokenBlacklist,
    private readonly settings: AuthSettings,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {
    this.authenticate = new AuthenticateAccessToken(verifier);
  }

  async execute(accessToken: string | null, traceId: string): Promise<ValidateTokenResult> {
    try {
      const decision = await this.authenticate.execute({
        token: accessToken,
        secret: this.settings.jwtSecret,
        now: this.clock.now(),
        isRevoked: async ({ token }) => this.blacklist.isRevoked(token),
      });
      if (decision.status === 'rejected') {
        if (decision.code === 'INTERNAL_ERROR') {
          throw internalError(this.logger, traceId, new Error('TokenCheckFailed'));
        }
        this.logger.warn(traceId, 'token rejected', { code: decision.code });
        throw tokenRejected();
      }
      const user: AuthUser = {
        id: decision.payload.sub,
        email: decision.payload.email,
        roles: [...decision.payload.roles],
      };
      this.logger.info(traceId, 'token validated', { userId: user.id });
      return { valid: true, user };
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
