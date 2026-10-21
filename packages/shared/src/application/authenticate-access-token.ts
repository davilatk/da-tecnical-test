import type { AccessTokenVerifier } from './access-token-verifier.js';
import { ContractError } from '../domain/contract-error.js';
import { hasAnyRole, type JwtPayload, type UserRole } from '../domain/jwt-payload.js';

export interface AuthenticateAccessTokenInput {
  token: string | null;
  secret: string;
  now: Date;
  requiredRoles?: readonly UserRole[];
  isRevoked?: (access: { token: string; payload: JwtPayload }) => boolean | Promise<boolean>;
}

export type AuthenticationResult =
  | { status: 'authenticated'; token: string; payload: JwtPayload }
  | {
      status: 'rejected';
      httpStatus: 401 | 403 | 500;
      code: 'TOKEN_INVALID_OR_REVOKED' | 'FORBIDDEN' | 'INTERNAL_ERROR';
      message: string;
    };

const INVALID_TOKEN: AuthenticationResult = {
  status: 'rejected',
  httpStatus: 401,
  code: 'TOKEN_INVALID_OR_REVOKED',
  message: 'token is invalid or revoked',
};

const FORBIDDEN: AuthenticationResult = {
  status: 'rejected',
  httpStatus: 403,
  code: 'FORBIDDEN',
  message: 'forbidden',
};

const INTERNAL_ERROR: AuthenticationResult = {
  status: 'rejected',
  httpStatus: 500,
  code: 'INTERNAL_ERROR',
  message: 'internal error',
};

export class AuthenticateAccessToken {
  constructor(private readonly verifier: AccessTokenVerifier) {}

  async execute(input: AuthenticateAccessTokenInput): Promise<AuthenticationResult> {
    if (input.token === null || input.token.length === 0) {
      return INVALID_TOKEN;
    }

    let payload: JwtPayload;
    try {
      payload = this.verifier.verify(input.token, input.secret, input.now);
    } catch (error) {
      if (error instanceof ContractError) {
        return INVALID_TOKEN;
      }
      return INTERNAL_ERROR;
    }

    try {
      if (input.isRevoked !== undefined && (await input.isRevoked({ token: input.token, payload }))) {
        return INVALID_TOKEN;
      }
    } catch {
      return INTERNAL_ERROR;
    }

    if (
      input.requiredRoles !== undefined &&
      input.requiredRoles.length > 0 &&
      !hasAnyRole(payload, input.requiredRoles)
    ) {
      return FORBIDDEN;
    }

    return {
      status: 'authenticated',
      token: input.token,
      payload,
    };
  }
}
