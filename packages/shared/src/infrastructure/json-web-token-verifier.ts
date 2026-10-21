import jwt from 'jsonwebtoken';
import type { AccessTokenVerifier } from '../application/access-token-verifier.js';
import { ContractError } from '../domain/contract-error.js';
import { assertJwtPayload, type JwtPayload } from '../domain/jwt-payload.js';

export class JsonWebTokenVerifier implements AccessTokenVerifier {
  verify(token: string, secret: string, now: Date): JwtPayload {
    if (secret.length === 0) {
      throw new ContractError('jwt secret must be non-empty');
    }
    if (Number.isNaN(now.getTime())) {
      throw new ContractError('jwt clock must be a valid date');
    }
    const nowSeconds = Math.floor(now.getTime() / 1000);
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        clockTimestamp: nowSeconds,
      });
    } catch {
      throw new ContractError('jwt signature is invalid');
    }
    return assertJwtPayload(decoded, nowSeconds);
  }
}

const sharedVerifier = new JsonWebTokenVerifier();

export function verifyAccessToken(token: string, secret: string, now: Date = new Date()): JwtPayload {
  return sharedVerifier.verify(token, secret, now);
}
