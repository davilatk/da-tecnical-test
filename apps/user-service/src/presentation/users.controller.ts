import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createTraceId } from '@toka/shared';
import { tokenRejected } from '../application/application-error.js';
import type { AuthenticatedActor } from '../application/authenticated-actor.js';
import { CreateUserUseCase } from '../application/create-user.use-case.js';
import { DeleteUserUseCase } from '../application/delete-user.use-case.js';
import { GetUserByIdUseCase } from '../application/get-user-by-id.use-case.js';
import { GetUsersUseCase } from '../application/get-users.use-case.js';
import { UpdateUserUseCase } from '../application/update-user.use-case.js';
import type { UserView } from '../domain/user.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { NestJwtAuthGuard } from './http/nest-jwt-auth.guard.js';

export interface UserRequest {
  traceId?: string;
  actor?: AuthenticatedActor;
}

@Controller('users')
@UseGuards(NestJwtAuthGuard)
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUsers: GetUsersUseCase,
    private readonly getUserById: GetUserByIdUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  @Get()
  list(@Req() request: UserRequest): Promise<UserView[]> {
    return this.getUsers.execute(actorId(request), traceIdOf(request));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: UserRequest): Promise<UserView> {
    return this.getUserById.execute(id, actorId(request), traceIdOf(request));
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateUserDto, @Req() request: UserRequest): Promise<UserView> {
    return this.createUser.execute(
      {
        email: body.email,
        password: body.password,
        fullName: body.fullName,
        department: body.department,
        ...(body.roles !== undefined ? { roles: body.roles } : {}),
      },
      actorId(request),
      traceIdOf(request),
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserDto, @Req() request: UserRequest): Promise<UserView> {
    return this.updateUser.execute(id, plainUpdate(body), actorId(request), traceIdOf(request));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() request: UserRequest): Promise<void> {
    return this.deleteUser.execute(id, actorId(request), traceIdOf(request));
  }
}

function plainUpdate(body: UpdateUserDto): Record<string, unknown> {
  return {
    ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
    ...(body.department !== undefined ? { department: body.department } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  };
}

function actorId(request: UserRequest): string {
  if (request.actor === undefined || request.actor.id.trim().length === 0) {
    throw tokenRejected();
  }
  return request.actor.id;
}

function traceIdOf(request: UserRequest): string {
  if (request.traceId !== undefined && request.traceId.trim().length > 0) {
    return request.traceId.trim();
  }
  return createTraceId();
}
