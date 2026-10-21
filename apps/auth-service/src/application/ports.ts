import type { DomainEvent, JwtPayload, UserRole } from '@toka/shared';
import type { AuthCredential, AuthUser } from '../domain/auth-credential.js';

export interface CredentialRepository {
  findById(id: string): Promise<AuthCredential | null>;
  findByEmail(email: string): Promise<AuthCredential | null>;
  save(credential: AuthCredential): Promise<void>;
}

export interface RoleRepository {
  list(): Promise<UserRole[]>;
  exists(role: UserRole): Promise<boolean>;
  insertIfMissing(role: UserRole): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface IssuedAccessToken {
  accessToken: string;
  expiresIn: number;
  payload: JwtPayload;
}

export interface AccessTokenIssuer {
  issue(user: AuthUser, now: Date): IssuedAccessToken;
}

export interface TokenBlacklist {
  revoke(tokenId: string, remainingTtlSeconds: number): Promise<void>;
  isRevoked(tokenId: string): Promise<boolean>;
}

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  nextUserId(): string;
  nextEventId(): string;
}

export interface AuthSettings {
  jwtSecret: string;
}

export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');
export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');
export const TOKEN_BLACKLIST = Symbol('TOKEN_BLACKLIST');
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const APP_LOGGER = Symbol('APP_LOGGER');
export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
