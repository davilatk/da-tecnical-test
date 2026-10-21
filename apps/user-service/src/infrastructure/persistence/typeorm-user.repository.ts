import type { Repository } from 'typeorm';
import type { UserRepository } from '../../application/ports.js';
import { EmailAlreadyRegisteredError } from '../../application/email-already-registered.error.js';
import type { User } from '../../domain/user.js';
import { PersistenceError } from './persistence.error.js';
import { isUniqueEmailViolation } from './unique-violation.js';
import { toUser, toUserEntity } from './user.mapper.js';
import { UserEntity } from './user.entity.js';

export class TypeOrmUserRepository implements UserRepository {
  constructor(private readonly repository: Repository<UserEntity>) {}

  async findAll(): Promise<User[]> {
    try {
      const rows = await this.repository.find({ order: { createdAt: 'ASC', id: 'ASC' } });
      return rows.map((row) => toUser(row));
    } catch {
      throw new PersistenceError();
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const entity = await this.repository.findOne({ where: { id } });
      return entity === null ? null : toUser(entity);
    } catch {
      throw new PersistenceError();
    }
  }

  async save(user: User): Promise<void> {
    try {
      await this.repository.save(toUserEntity(user));
    } catch (error) {
      if (isUniqueEmailViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw new PersistenceError();
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      const result = await this.repository.delete({ id });
      return (result.affected ?? 0) > 0;
    } catch {
      throw new PersistenceError();
    }
  }
}
