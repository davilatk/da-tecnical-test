import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { createTraceId, type UserRole } from '@toka/shared';
import type { AuthUser } from '../domain/auth-credential.js';
import type { AuthenticatedActor } from '../application/authenticated-actor.js';
import { AssignRoleUseCase } from '../application/assign-role.use-case.js';
import { ListRolesUseCase } from '../application/list-roles.use-case.js';
import { AssignRoleDto } from './dto/assign-role.dto.js';
import { NestJwtAuthGuard } from './http/nest-jwt-auth.guard.js';
import { RequireRoles } from './http/require-roles.js';

export interface RolesRequest {
  traceId?: string;
  actor?: AuthenticatedActor | null;
}

@Controller('roles')
@UseGuards(NestJwtAuthGuard)
@RequireRoles('ADMIN')
export class RolesController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly assignRole: AssignRoleUseCase,
  ) {}

  @Get()
  list(@Req() request: RolesRequest): Promise<UserRole[]> {
    return this.listRoles.execute(request.actor ?? null, traceIdOf(request));
  }

  @Post('assign')
  assign(@Body() body: AssignRoleDto, @Req() request: RolesRequest): Promise<AuthUser> {
    return this.assignRole.execute(request.actor ?? null, { userId: body.userId, role: body.role }, traceIdOf(request));
  }
}

function traceIdOf(request: RolesRequest): string {
  if (request.traceId !== undefined && request.traceId.trim().length > 0) {
    return request.traceId.trim();
  }
  return createTraceId();
}
