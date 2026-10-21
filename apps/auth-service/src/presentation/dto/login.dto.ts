import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';
import { REQUIRED_STRING_MESSAGE } from '../../domain/input-rules.js';
import { IsContractEmail } from './contract-validators.js';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsContractEmail()
  email!: string;

  @IsString({ message: REQUIRED_STRING_MESSAGE })
  @MinLength(1, { message: REQUIRED_STRING_MESSAGE })
  password!: string;
}
