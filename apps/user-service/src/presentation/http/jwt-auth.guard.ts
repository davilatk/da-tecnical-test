import { AuthenticateAccessToken, createTraceId, type AccessTokenVerifier, type Logger } from '@toka/shared';
import { ApplicationError, internalError } from '../../application/application-error.js';
import type { AuthenticatedActor } from '../../application/authenticated-actor.js';
import type { UserSettings } from '../../application/ports.js';
import { readBearerToken } from './bearer-token.js';

export interface GuardRequest {
  headers?: Record<string, unknown>;
  traceId?: string;
  accessToken?: string;
  actor?: AuthenticatedActor;
}

export interface GuardContext {
  switchToHttp(): { getRequest<T>(): T };
}

export class JwtAuthGuard {
  private readonly authenticate: AuthenticateAccessToken;

  constructor(
    verifier: AccessTokenVerifier,
    private readonly settings: UserSettings,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.authenticate = new AuthenticateAccessToken(verifier);
  }

  async canActivate(context: GuardContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const traceId = request.traceId !== undefined && request.traceId.trim().length > 0 ? request.traceId.trim() : createTraceId();
    let decision: Awaited<ReturnType<AuthenticateAccessToken['execute']>>;
    try {
      decision = await this.authenticate.execute({
        token: readBearerToken(request.headers),
        secret: this.settings.jwtSecret,
        now: this.now(),
      });
    } catch (error) {
      throw internalError(this.logger, traceId, error);
    }
    if (decision.status === 'rejected') {
      if (decision.code === 'INTERNAL_ERROR') {
        throw internalError(this.logger, traceId, new Error('TokenCheckFailed'));
      }
      throw new ApplicationError(decision.httpStatus, decision.code, decision.message);
    }
    request.accessToken = decision.token;
    request.actor = {
      id: decision.payload.sub,
      email: decision.payload.email,
      roles: [...decision.payload.roles],
    };
    return true;
  }
}
