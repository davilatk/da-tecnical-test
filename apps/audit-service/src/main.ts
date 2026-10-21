import 'reflect-metadata';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createTraceId } from '@toka/shared';
import { AuditModule } from './audit.module.js';
import { loadLocalEnv, readAuditConfig, serviceListenOptions } from './infrastructure/config/audit-config.js';
import { createNestJsonLogger } from './infrastructure/logging/nest-json-logger.js';
import { traceMiddleware } from './presentation/http/trace.middleware.js';
import { validationExceptionFactory } from './presentation/http/validation-exception.factory.js';

async function bootstrap(): Promise<void> {
  loadLocalEnv(resolve(__dirname, '../../../.env'));
  const config = readAuditConfig(process.env);
  const app = await NestFactory.create(AuditModule.register(config), {
    logger: createNestJsonLogger(createTraceId()),
  });
  app.use(traceMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  const listen = serviceListenOptions(config);
  await app.listen(listen.port, listen.host);
}

void bootstrap().catch((error: unknown) => {
  const logger = createNestJsonLogger(createTraceId());
  logger.error(error instanceof Error ? error.name : 'startup failed');
  process.exitCode = 1;
});
