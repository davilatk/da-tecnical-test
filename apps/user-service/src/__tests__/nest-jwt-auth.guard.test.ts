import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../presentation/http/jwt-auth.guard.js';
import { NestJwtAuthGuard } from '../presentation/http/nest-jwt-auth.guard.js';
import { UsersController } from '../presentation/users.controller.js';

describe('NestJwtAuthGuard', () => {
  it('delegates to the JwtAuthGuard configured in the module', async () => {
    const canActivate = jest.fn().mockResolvedValue(true);
    const context = {} as ExecutionContext;
    const adapter = new NestJwtAuthGuard({ canActivate } as unknown as JwtAuthGuard);
    await expect(adapter.canActivate(context)).resolves.toBe(true);
    expect(canActivate).toHaveBeenCalledWith(context);
  });

  it('resolves JwtAuthGuard through dependency injection', () => {
    expect(Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, NestJwtAuthGuard)).toEqual([{ index: 0, param: JwtAuthGuard }]);
  });

  it('protects UsersController with the DI adapter', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController)).toEqual([NestJwtAuthGuard]);
  });
});
