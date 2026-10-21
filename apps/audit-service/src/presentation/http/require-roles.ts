import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@toka/shared';

export const REQUIRED_ROLES = 'requiredRoles';

export const RequireRoles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_ROLES, roles);
