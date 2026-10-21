import { compare, hash } from 'bcryptjs';
import type { PasswordHasher } from '../../application/ports.js';
import { DomainInvariantError } from '../../domain/domain-invariant.error.js';

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds = 10) {
    if (!Number.isInteger(this.rounds) || this.rounds < 4 || this.rounds > 15) {
      throw new DomainInvariantError('bcrypt rounds are invalid');
    }
  }

  async hash(password: string): Promise<string> {
    return hash(password, this.rounds);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }
}
