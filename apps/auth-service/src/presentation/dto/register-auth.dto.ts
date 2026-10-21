import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, ValidateIf } from 'class-validator';
import { USER_ROLES, type UserRole } from '@toka/shared';
import { ROLES_RULE_MESSAGE } from '../../domain/input-rules.js';
import { IsContractEmail, IsContractPassword } from './contract-validators.js';

export class RegisterAuthDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsContractEmail()
  email!: string;

  @IsContractPassword()
  password!: string;

  @ValidateIf((dto: RegisterAuthDto) => dto.roles !== undefined)
  @IsArray({ message: ROLES_RULE_MESSAGE })
  @ArrayNotEmpty({ message: ROLES_RULE_MESSAGE })
  @ArrayUnique({ message: ROLES_RULE_MESSAGE })
  @IsIn(USER_ROLES, { each: true, message: ROLES_RULE_MESSAGE })
  roles?: UserRole[];
}
