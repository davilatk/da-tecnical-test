import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, ValidateIf } from 'class-validator';
import { USER_ROLES, type UserRole } from '@toka/shared';
import { ROLES_RULE_MESSAGE } from '../../domain/input-rules.js';
import { IsContractDepartment, IsContractEmail, IsContractFullName, IsContractPassword } from './contract-validators.js';

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsContractEmail()
  email!: string;

  @IsContractPassword()
  password!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsContractFullName()
  fullName!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsContractDepartment()
  department!: string;

  @ValidateIf((dto: CreateUserDto) => dto.roles !== undefined)
  @IsArray({ message: ROLES_RULE_MESSAGE })
  @ArrayNotEmpty({ message: ROLES_RULE_MESSAGE })
  @ArrayUnique({ message: ROLES_RULE_MESSAGE })
  @IsIn(USER_ROLES, { each: true, message: ROLES_RULE_MESSAGE })
  roles?: UserRole[];
}
