import { AuthCredential } from '../../domain/auth-credential.js';
import { AuthCredentialEntity } from './auth-credential.entity.js';

export function toCredentialEntity(credential: AuthCredential): AuthCredentialEntity {
  const entity = new AuthCredentialEntity();
  entity.id = credential.id;
  entity.email = credential.email;
  entity.passwordHash = credential.passwordHash;
  entity.roles = [...credential.roles];
  entity.createdAt = credential.createdAt;
  entity.updatedAt = credential.updatedAt;
  return entity;
}

export function toAuthCredential(entity: AuthCredentialEntity): AuthCredential {
  return AuthCredential.rehydrate({
    id: entity.id,
    email: entity.email,
    passwordHash: entity.passwordHash,
    roles: entity.roles,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}
