import { assertJwtPayload, ContractError, isEmail, isUserRole, type JwtPayload } from '@toka/shared';
import jwt from 'jsonwebtoken';
import type { AccessTokenIssuer, IssuedAccessToken } from '../../application/ports.js';
import type { AuthUser } from '../../domain/auth-credential.js';
import { DomainInvariantError } from '../../domain/domain-invariant.error.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../domain/token-policy.js';

export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(private readonly secret: string) {
    if (secret.trim().length === 0) {
      throw new ContractError('jwt secret must be non-empty');
    }
  }

  issue(user: AuthUser, now: Date): IssuedAccessToken {
    if (user.id.trim().length === 0 || !isEmail(user.email) || user.roles.length === 0) {
      throw new DomainInvariantError('access token subject is invalid');
    }
    const seen = new Set<string>();
    for (const role of user.roles) {
      if (!isUserRole(role) || seen.has(role)) {
        throw new DomainInvariantError('access token subject is invalid');
      }
      seen.add(role);
    }
    if (Number.isNaN(now.getTime())) {
      throw new DomainInvariantError('access token clock is invalid');
    }
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + ACCESS_TOKEN_TTL_SECONDS;
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: [...user.roles],
      iat,
      exp,
    };
    const accessToken = jwt.sign({ ...payload, roles: [...payload.roles] }, this.secret, {
      algorithm: 'HS256',
    });
    const verified = assertJwtPayload(jwt.decode(accessToken), iat);
    return {
      accessToken,
      expiresIn: verified.exp - verified.iat,
      payload: verified,
    };
  }
}
