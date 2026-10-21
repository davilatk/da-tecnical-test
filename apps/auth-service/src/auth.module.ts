import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JsonLogger, JsonWebTokenVerifier, RabbitMqClient } from '@toka/shared';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AssignRoleUseCase } from './application/assign-role.use-case.js';
import { ListRolesUseCase } from './application/list-roles.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import {
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_VERIFIER,
  APP_LOGGER,
  AUTH_SETTINGS,
  CLOCK,
  CREDENTIAL_REPOSITORY,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  PASSWORD_HASHER,
  REDIS_CLIENT,
  ROLE_REPOSITORY,
  TOKEN_BLACKLIST,
  type CredentialRepository,
  type RoleRepository,
} from './application/ports.js';
import { RegisterAuthUseCase } from './application/register-auth.use-case.js';
import { SeedAuthUseCase } from './application/seed-auth.use-case.js';
import { ValidateTokenUseCase } from './application/validate-token.use-case.js';
import { AuthBootstrap } from './infrastructure/bootstrap/auth-bootstrap.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import type { AuthConfig } from './infrastructure/config/auth-config.js';
import { RandomIdGenerator } from './infrastructure/ids/random-id-generator.js';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-domain-event-publisher.js';
import { AuthCredentialEntity } from './infrastructure/persistence/auth-credential.entity.js';
import { AuthSchemaInitializer } from './infrastructure/persistence/auth-schema.initializer.js';
import { RoleEntity } from './infrastructure/persistence/role.entity.js';
import { TypeOrmCredentialRepository } from './infrastructure/persistence/typeorm-credential.repository.js';
import { TypeOrmRoleRepository } from './infrastructure/persistence/typeorm-role.repository.js';
import { RedisTokenBlacklist, type RedisKeyValueStore } from './infrastructure/redis/redis-token-blacklist.js';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher.js';
import { JwtAccessTokenIssuer } from './infrastructure/security/jwt-access-token-issuer.js';
import { AuthController } from './presentation/auth.controller.js';
import { ApiExceptionFilter } from './presentation/http/api-exception.filter.js';
import { JwtAuthGuard, type RoleReflector } from './presentation/http/jwt-auth.guard.js';
import { SuccessEnvelopeInterceptor } from './presentation/http/success-envelope.interceptor.js';
import { RolesController } from './presentation/roles.controller.js';

@Module({})
export class AuthModule {
  static register(config: AuthConfig): DynamicModule {
    const logger = new JsonLogger('auth-service');
    const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    const broker = new RabbitMqClient(config.rabbitmqUrl);
    const publisher = new RabbitMqEventPublisher(broker);
    const blacklist = new RedisTokenBlacklist(redis as RedisKeyValueStore);
    const clock = new SystemClock();
    const ids = new RandomIdGenerator();
    const hasher = new BcryptPasswordHasher();
    const issuer = new JwtAccessTokenIssuer(config.jwtSecret);
    const verifier = new JsonWebTokenVerifier();

    return {
      module: AuthModule,
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: config.databaseUrl,
          entities: [AuthCredentialEntity, RoleEntity],
          synchronize: false,
          logging: false,
        }),
      ],
      controllers: [AuthController, RolesController],
      providers: [
        Reflector,
        { provide: APP_LOGGER, useValue: logger },
        { provide: AUTH_SETTINGS, useValue: config },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: CLOCK, useValue: clock },
        { provide: ID_GENERATOR, useValue: ids },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: ACCESS_TOKEN_ISSUER, useValue: issuer },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: verifier },
        { provide: TOKEN_BLACKLIST, useValue: blacklist },
        { provide: DOMAIN_EVENT_PUBLISHER, useValue: publisher },
        {
          provide: CREDENTIAL_REPOSITORY,
          useFactory: (dataSource: DataSource): CredentialRepository =>
            new TypeOrmCredentialRepository(dataSource.getRepository(AuthCredentialEntity)),
          inject: [DataSource],
        },
        {
          provide: ROLE_REPOSITORY,
          useFactory: (dataSource: DataSource): RoleRepository => new TypeOrmRoleRepository(dataSource.getRepository(RoleEntity)),
          inject: [DataSource],
        },
        {
          provide: RegisterAuthUseCase,
          useFactory: (credentials: CredentialRepository, roles: RoleRepository): RegisterAuthUseCase =>
            new RegisterAuthUseCase(credentials, roles, hasher, ids, clock, logger),
          inject: [CREDENTIAL_REPOSITORY, ROLE_REPOSITORY],
        },
        {
          provide: LoginUseCase,
          useFactory: (credentials: CredentialRepository): LoginUseCase =>
            new LoginUseCase(credentials, hasher, issuer, publisher, ids, clock, logger),
          inject: [CREDENTIAL_REPOSITORY],
        },
        {
          provide: ValidateTokenUseCase,
          useFactory: (): ValidateTokenUseCase => new ValidateTokenUseCase(verifier, blacklist, config, clock, logger),
        },
        {
          provide: ListRolesUseCase,
          useFactory: (roles: RoleRepository): ListRolesUseCase => new ListRolesUseCase(roles, logger),
          inject: [ROLE_REPOSITORY],
        },
        {
          provide: AssignRoleUseCase,
          useFactory: (credentials: CredentialRepository, roles: RoleRepository): AssignRoleUseCase =>
            new AssignRoleUseCase(credentials, roles, publisher, ids, clock, logger),
          inject: [CREDENTIAL_REPOSITORY, ROLE_REPOSITORY],
        },
        {
          provide: SeedAuthUseCase,
          useFactory: (credentials: CredentialRepository, roles: RoleRepository): SeedAuthUseCase =>
            new SeedAuthUseCase(credentials, roles, hasher, ids, clock, logger),
          inject: [CREDENTIAL_REPOSITORY, ROLE_REPOSITORY],
        },
        {
          provide: AuthSchemaInitializer,
          useFactory: (dataSource: DataSource): AuthSchemaInitializer => new AuthSchemaInitializer(dataSource),
          inject: [DataSource],
        },
        {
          provide: AuthBootstrap,
          useFactory: (schema: AuthSchemaInitializer, seed: SeedAuthUseCase): AuthBootstrap =>
            new AuthBootstrap(schema, seed, redis as RedisKeyValueStore, publisher, logger),
          inject: [AuthSchemaInitializer, SeedAuthUseCase],
        },
        {
          provide: ApiExceptionFilter,
          useFactory: (): ApiExceptionFilter => new ApiExceptionFilter(logger),
        },
        {
          provide: APP_FILTER,
          useExisting: ApiExceptionFilter,
        } as Provider,
        {
          provide: SuccessEnvelopeInterceptor,
          useClass: SuccessEnvelopeInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useExisting: SuccessEnvelopeInterceptor,
        } as Provider,
        {
          provide: JwtAuthGuard,
          useFactory: (reflector: Reflector): JwtAuthGuard =>
            new JwtAuthGuard(adaptReflector(reflector), verifier, blacklist, config, logger),
          inject: [Reflector],
        },
      ],
    };
  }
}

function adaptReflector(reflector: Reflector): RoleReflector {
  return {
    getAllAndOverride<T>(key: string, targets: unknown[]): T | undefined {
      return reflector.getAllAndOverride<T>(key, targets as never);
    },
  };
}
