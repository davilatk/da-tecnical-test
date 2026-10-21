import { User } from '../../domain/user.js';
import { UserEntity } from './user.entity.js';

export function toUserEntity(user: User): UserEntity {
  const view = user.toView();
  const entity = new UserEntity();
  entity.id = view.id;
  entity.email = view.email;
  entity.fullName = view.fullName;
  entity.department = view.department;
  entity.status = view.status;
  entity.roles = [...view.roles];
  entity.createdAt = user.createdAt;
  entity.updatedAt = user.updatedAt;
  return entity;
}

export function toUser(entity: UserEntity): User {
  return User.rehydrate({
    id: entity.id,
    email: entity.email,
    fullName: entity.fullName,
    department: entity.department,
    status: entity.status,
    roles: entity.roles,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}
