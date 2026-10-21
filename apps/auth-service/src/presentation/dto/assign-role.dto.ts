import { IsString, MinLength } from 'class-validator';
import type { UserRole } from '@toka/shared';
import { REQUIRED_STRING_MESSAGE } from '../../domain/input-rules.js';
import { IsContractRole } from './contract-validators.js';

export class AssignRoleDto {
  @IsString({ message: REQUIRED_STRING_MESSAGE })
  @MinLength(1, { message: REQUIRED_STRING_MESSAGE })
  userId!: string;

  @IsContractRole()
  role!: UserRole;
}
