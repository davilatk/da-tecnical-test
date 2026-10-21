import type { Repository } from 'typeorm';
import type { CredentialRepository } from '../../application/ports.js';
import { EmailAlreadyRegisteredError } from '../../application/email-already-registered.error.js';
import type { AuthCredential } from '../../domain/auth-credential.js';
import { AuthCredentialEntity } from './auth-credential.entity.js';
import { toAuthCredential, toCredentialEntity } from './credential.mapper.js';
import { PersistenceError } from './persistence.error.js';
import { isUniqueEmailViolation } from './unique-violation.js';

export class TypeOrmCredentialRepository implements CredentialRepository {
  constructor(private readonly repository: Repository<AuthCredentialEntity>) {}

  async findById(id: string): Promise<AuthCredential | null> {
    return this.read(() => this.repository.findOne({ where: { id } }));
  }

  async findByEmail(email: string): Promise<AuthCredential | null> {
    return this.read(() => this.repository.findOne({ where: { email } }));
  }

  async save(credential: AuthCredential): Promise<void> {
    try {
      await this.repository.save(toCredentialEntity(credential));
    } catch (error) {
      if (isUniqueEmailViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw new PersistenceError();
    }
  }

  private async read(query: () => Promise<AuthCredentialEntity | null>): Promise<AuthCredential | null> {
    try {
      const entity = await query();
      return entity === null ? null : toAuthCredential(entity);
    } catch {
      throw new PersistenceError();
    }
  }
}
