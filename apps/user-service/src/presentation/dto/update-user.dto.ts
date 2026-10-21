import { ValidateIf } from 'class-validator';
import type { UserStatus } from '@toka/shared';
import { IsContractDepartment, IsContractFullName, IsContractStatus } from './contract-validators.js';

export class UpdateUserDto {
  @ValidateIf((dto: UpdateUserDto) => dto.fullName !== undefined)
  @IsContractFullName()
  fullName?: string;

  @ValidateIf((dto: UpdateUserDto) => dto.department !== undefined)
  @IsContractDepartment()
  department?: string;

  @ValidateIf((dto: UpdateUserDto) => dto.status !== undefined)
  @IsContractStatus()
  status?: UserStatus;
}
