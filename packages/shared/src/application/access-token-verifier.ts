import type { JwtPayload } from '../domain/jwt-payload.js';

export interface AccessTokenVerifier {
  verify(token: string, secret: string, now: Date): JwtPayload;
}
