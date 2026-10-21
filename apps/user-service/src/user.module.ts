import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JsonLogger, JsonWebTokenVerifier, RabbitMqClient } from '@toka/shared';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CreateUserUseCase } from './application/create-user.use-case.js';
import { DeleteUserUseCase } from './application/delete-user.use-case.js';
import { GetUserByIdUseCase } from './application/get-user-by-id.use-case.js';
import { GetUsersUseCase } from './application/get-users.use-case.js';
import {
  ACCESS_TOKEN_VERIFIER,
  APP_LOGGER,
  AUTH_REGISTRAR,
  CACHE_STORE,
  CLOCK,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  REDIS_CLIENT,
  USER_REPOSITORY,
  USER_SETTINGS,
  type UserRepository,
} from './application/ports.js';
import { UpdateUserUseCase } from './application/update-user.use-case.js';
import { UserBootstrap } from './infrastructure/bootstrap/user-bootstrap.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import type { UserConfig } from './infrastructure/config/user-config.js';
import { FetchAuthRegistrar } from './infrastructure/http/fetch-auth-registrar.js';
import { RandomIdGenerator } from './infrastructure/ids/random-id-generator.js';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-domain-event-publisher.js';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm-user.repository.js';
import { UserEntity } from './infrastructure/persistence/user.entity.js';
import { UserSchemaInitializer } from './infrastructure/persistence/user-schema.initializer.js';
import { RedisUserCache, type RedisClient } from './infrastructure/redis/redis-user-cache.js';
import { ApiExceptionFilter } from './presentation/http/api-exception.filter.js';
import { JwtAuthGuard } from './presentation/http/jwt-auth.guard.js';
import { SuccessEnvelopeInterceptor } from './presentation/http/success-envelope.interceptor.js';
import { UsersController } from './presentation/users.controller.js';

@Module({})
export class UserModule {
  static register(config: UserConfig): DynamicModule {
    const logger = new JsonLogger('user-service');
    const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    const broker = new RabbitMqClient(config.rabbitmqUrl);
    const publisher = new RabbitMqEventPublisher(broker);
    const cache = new RedisUserCache(redis as RedisClient);
    const clock = new SystemClock();
    const ids = new RandomIdGenerator();
    const auth = new FetchAuthRegistrar();
    const verifier = new JsonWebTokenVerifier();

    return {
      module: UserModule,
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: config.databaseUrl,
          entities: [UserEntity],
          synchronize: false,
          logging: false,
        }),
      ],
      controllers: [UsersController],
      providers: [
        { provide: APP_LOGGER, useValue: logger },
        { provide: USER_SETTINGS, useValue: config },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: CLOCK, useValue: clock },
        { provide: ID_GENERATOR, useValue: ids },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: verifier },
        { provide: AUTH_REGISTRAR, useValue: auth },
        { provide: CACHE_STORE, useValue: cache },
        { provide: DOMAIN_EVENT_PUBLISHER, useValue: publisher },
        {
          provide: USER_REPOSITORY,
          useFactory: (dataSource: DataSource): UserRepository => new TypeOrmUserRepository(dataSource.getRepository(UserEntity)),
          inject: [DataSource],
        },
        {
          provide: CreateUserUseCase,
          useFactory: (users: UserRepository): CreateUserUseCase =>
            new CreateUserUseCase(users, auth, cache, publisher, ids, clock, logger),
          inject: [USER_REPOSITORY],
        },
        {
          provide: GetUsersUseCase,
          useFactory: (users: UserRepository): GetUsersUseCase => new GetUsersUseCase(users, cache, logger),
          inject: [USER_REPOSITORY],
        },
        {
          provide: GetUserByIdUseCase,
          useFactory: (users: UserRepository): GetUserByIdUseCase => new GetUserByIdUseCase(users, cache, logger),
          inject: [USER_REPOSITORY],
        },
        {
          provide: UpdateUserUseCase,
          useFactory: (users: UserRepository): UpdateUserUseCase => new UpdateUserUseCase(users, cache, publisher, ids, clock, logger),
          inject: [USER_REPOSITORY],
        },
        {
          provide: DeleteUserUseCase,
          useFactory: (users: UserRepository): DeleteUserUseCase => new DeleteUserUseCase(users, cache, publisher, ids, clock, logger),
          inject: [USER_REPOSITORY],
        },
        {
          provide: UserSchemaInitializer,
          useFactory: (dataSource: DataSource): UserSchemaInitializer => new UserSchemaInitializer(dataSource),
          inject: [DataSource],
        },
        {
          provide: UserBootstrap,
          useFactory: (schema: UserSchemaInitializer): UserBootstrap =>
            new UserBootstrap(schema, redis as RedisClient, publisher, logger),
          inject: [UserSchemaInitializer],
        },
        {
          provide: ApiExceptionFilter,
          useFactory: (): ApiExceptionFilter => new ApiExceptionFilter(logger),
        },
        { provide: APP_FILTER, useExisting: ApiExceptionFilter } as Provider,
        { provide: SuccessEnvelopeInterceptor, useClass: SuccessEnvelopeInterceptor },
        { provide: APP_INTERCEPTOR, useExisting: SuccessEnvelopeInterceptor } as Provider,
        {
          provide: JwtAuthGuard,
          useFactory: (): JwtAuthGuard => new JwtAuthGuard(verifier, config, logger),
        },
      ],
    };
  }
}
