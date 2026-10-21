import type { ApiFieldError, DomainEvent, ErrorHttpStatus, UserRole } from '@toka/shared';
import type { User } from '../domain/user.js';

export interface RegisteredAuthUser {
  id: string;
  email: string;
  roles: UserRole[];
}

export interface PropagatedHttpError {
  status: ErrorHttpStatus;
  code: string;
  message: string;
  details: ApiFieldError[];
}

export type AuthRegistrationResult =
  | { status: 'registered'; user: RegisteredAuthUser }
  | { status: 'rejected'; error: PropagatedHttpError };

export interface AuthRegisterCommand {
  email: string;
  password: string;
  roles: readonly UserRole[];
}

export interface AuthRegistrar {
  register(command: AuthRegisterCommand, traceId: string): Promise<AuthRegistrationResult>;
}

export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  deleteById(id: string): Promise<boolean>;
}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  nextEventId(): string;
}

export interface UserSettings {
  jwtSecret: string;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const CACHE_STORE = Symbol('CACHE_STORE');
export const AUTH_REGISTRAR = Symbol('AUTH_REGISTRAR');
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const APP_LOGGER = Symbol('APP_LOGGER');
export const USER_SETTINGS = Symbol('USER_SETTINGS');
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
