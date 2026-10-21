import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { createTraceId } from '@toka/shared';
import type { AuthUser } from '../domain/auth-credential.js';
import type { LoginResult } from '../application/login.use-case.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { RegisterAuthUseCase } from '../application/register-auth.use-case.js';
import type { ValidateTokenResult } from '../application/validate-token.use-case.js';
import { ValidateTokenUseCase } from '../application/validate-token.use-case.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterAuthDto } from './dto/register-auth.dto.js';
import { readBearerToken } from './http/bearer-token.js';

export interface AuthRequest {
  headers?: Record<string, unknown>;
  traceId?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAuth: RegisterAuthUseCase,
    private readonly login: LoginUseCase,
    private readonly validateToken: ValidateTokenUseCase,
  ) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() body: RegisterAuthDto, @Req() request: AuthRequest): Promise<AuthUser> {
    return this.registerAuth.execute(
      {
        email: body.email,
        password: body.password,
        ...(body.roles !== undefined ? { roles: body.roles } : {}),
      },
      traceIdOf(request),
    );
  }

  @Post('login')
  loginWithPassword(@Body() body: LoginDto, @Req() request: AuthRequest): Promise<LoginResult> {
    return this.login.execute({ email: body.email, password: body.password }, traceIdOf(request));
  }

  @Get('validate')
  validate(@Req() request: AuthRequest): Promise<ValidateTokenResult> {
    return this.validateToken.execute(readBearerToken(request.headers), traceIdOf(request));
  }
}

function traceIdOf(request: AuthRequest): string {
  if (request.traceId !== undefined && request.traceId.trim().length > 0) {
    return request.traceId.trim();
  }
  return createTraceId();
}
