import { isUserRole, type UserRole } from '@toka/shared';
import type { Repository } from 'typeorm';
import type { RoleRepository } from '../../application/ports.js';
import { sortRoles } from '../../domain/input-rules.js';
import { PersistenceError } from './persistence.error.js';
import { RoleEntity } from './role.entity.js';
import { isUniqueViolation } from './unique-violation.js';

export class TypeOrmRoleRepository implements RoleRepository {
  constructor(private readonly repository: Repository<RoleEntity>) {}

  async list(): Promise<UserRole[]> {
    try {
      const rows = await this.repository.find();
      const roles: UserRole[] = [];
      for (const row of rows) {
        if (isUserRole(row.name)) {
          roles.push(row.name);
        }
      }
      return sortRoles(roles);
    } catch {
      throw new PersistenceError();
    }
  }

  async exists(role: UserRole): Promise<boolean> {
    try {
      const found = await this.repository.findOne({ where: { name: role } });
      return found !== null;
    } catch {
      throw new PersistenceError();
    }
  }

  async insertIfMissing(role: UserRole): Promise<void> {
    try {
      await this.repository.insert({ name: role });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return;
      }
      throw new PersistenceError();
    }
  }
}
