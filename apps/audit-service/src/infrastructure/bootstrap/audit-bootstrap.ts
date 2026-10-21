import { createTraceId, type Logger } from '@toka/shared';
import type { AuditEventsConsumer } from '../messaging/audit-events.consumer.js';

export interface SchemaApplier {
  apply(): Promise<void>;
}

export class AuditBootstrap {
  constructor(
    private readonly schema: SchemaApplier,
    private readonly consumer: AuditEventsConsumer,
    private readonly logger: Logger,
    private readonly nextTraceId: () => string = createTraceId,
  ) {}

  async onModuleInit(): Promise<void> {
    const traceId = this.nextTraceId();
    try {
      await this.schema.apply();
      await this.consumer.start();
      this.logger.info(traceId, 'audit service ready', {});
    } catch (error) {
      this.logger.error(traceId, 'audit service failed to start', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const traceId = this.nextTraceId();
    try {
      await this.consumer.stop();
      this.logger.info(traceId, 'audit service stopped', {});
    } catch (error) {
      this.logger.error(traceId, 'audit service failed to stop', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }
}
