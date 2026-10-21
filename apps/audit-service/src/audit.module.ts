import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JsonLogger, JsonWebTokenVerifier, RabbitMqClient } from '@toka/shared';
import type { Model } from 'mongoose';
import { GetAuditLogsUseCase } from './application/get-audit-logs.use-case.js';
import { GetAuditStatsUseCase } from './application/get-audit-stats.use-case.js';
import {
  ACCESS_TOKEN_VERIFIER,
  APP_LOGGER,
  AUDIT_LOG_REPOSITORY,
  AUDIT_SETTINGS,
  CLOCK,
  type AuditLogRepository,
} from './application/ports.js';
import { RecordAuditEventUseCase } from './application/record-audit-event.use-case.js';
import { AuditBootstrap } from './infrastructure/bootstrap/audit-bootstrap.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import type { AuditConfig } from './infrastructure/config/audit-config.js';
import { AuditEventsConsumer } from './infrastructure/messaging/audit-events.consumer.js';
import { AuditSchemaInitializer } from './infrastructure/persistence/audit-schema.initializer.js';
import { AuditLogDocument, AuditLogSchema } from './infrastructure/persistence/audit-log.schema.js';
import { MongooseAuditLogRepository } from './infrastructure/persistence/mongoose-audit-log.repository.js';
import { mongooseRootOptions } from './infrastructure/persistence/mongoose-options.js';
import { AuditsController } from './presentation/audits.controller.js';
import { ApiExceptionFilter } from './presentation/http/api-exception.filter.js';
import { JwtAuthGuard } from './presentation/http/jwt-auth.guard.js';
import { SuccessEnvelopeInterceptor } from './presentation/http/success-envelope.interceptor.js';

@Module({})
export class AuditModule {
  static register(config: AuditConfig): DynamicModule {
    const logger = new JsonLogger('audit-service');
    const broker = new RabbitMqClient(config.rabbitmqUrl);
    const clock = new SystemClock();
    const verifier = new JsonWebTokenVerifier();
    const mongo = mongooseRootOptions(config);

    return {
      module: AuditModule,
      imports: [
        MongooseModule.forRoot(mongo.uri ?? config.mongoUri, {
          dbName: mongo.dbName,
          autoIndex: mongo.autoIndex,
        }),
        MongooseModule.forFeature([{ name: AuditLogDocument.name, schema: AuditLogSchema }]),
      ],
      controllers: [AuditsController],
      providers: [
        Reflector,
        { provide: APP_LOGGER, useValue: logger },
        { provide: AUDIT_SETTINGS, useValue: config },
        { provide: CLOCK, useValue: clock },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: verifier },
        {
          provide: AUDIT_LOG_REPOSITORY,
          useFactory: (model: Model<AuditLogDocument>): AuditLogRepository => new MongooseAuditLogRepository(model),
          inject: [getModelToken(AuditLogDocument.name)],
        },
        {
          provide: RecordAuditEventUseCase,
          useFactory: (logs: AuditLogRepository): RecordAuditEventUseCase => new RecordAuditEventUseCase(logs, clock, logger),
          inject: [AUDIT_LOG_REPOSITORY],
        },
        {
          provide: GetAuditLogsUseCase,
          useFactory: (logs: AuditLogRepository): GetAuditLogsUseCase => new GetAuditLogsUseCase(logs, logger),
          inject: [AUDIT_LOG_REPOSITORY],
        },
        {
          provide: GetAuditStatsUseCase,
          useFactory: (logs: AuditLogRepository): GetAuditStatsUseCase => new GetAuditStatsUseCase(logs, logger),
          inject: [AUDIT_LOG_REPOSITORY],
        },
        {
          provide: AuditEventsConsumer,
          useFactory: (record: RecordAuditEventUseCase): AuditEventsConsumer => new AuditEventsConsumer(broker, record, logger),
          inject: [RecordAuditEventUseCase],
        },
        {
          provide: AuditSchemaInitializer,
          useFactory: (model: Model<AuditLogDocument>): AuditSchemaInitializer => new AuditSchemaInitializer(model),
          inject: [getModelToken(AuditLogDocument.name)],
        },
        {
          provide: AuditBootstrap,
          useFactory: (schema: AuditSchemaInitializer, consumer: AuditEventsConsumer): AuditBootstrap =>
            new AuditBootstrap(schema, consumer, logger),
          inject: [AuditSchemaInitializer, AuditEventsConsumer],
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
          useFactory: (reflector: Reflector): JwtAuthGuard => new JwtAuthGuard(reflector, verifier, config, logger),
          inject: [Reflector],
        },
      ],
    };
  }
}
