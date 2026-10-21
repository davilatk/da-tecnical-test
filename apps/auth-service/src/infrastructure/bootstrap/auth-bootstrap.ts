import { createTraceId, type Logger } from '@toka/shared';
import type { RedisKeyValueStore } from '../redis/redis-token-blacklist.js';

export interface SchemaApplier {
  apply(): Promise<void>;
}

export interface AuthSeeder {
  execute(traceId: string): Promise<void>;
}

export interface BrokerConnector {
  connect(): Promise<void>;
  close(): Promise<void>;
}

export class AuthBootstrap {
  constructor(
    private readonly schema: SchemaApplier,
    private readonly seed: AuthSeeder,
    private readonly redis: RedisKeyValueStore,
    private readonly broker: BrokerConnector,
    private readonly logger: Logger,
    private readonly nextTraceId: () => string = createTraceId,
  ) {}

  async onModuleInit(): Promise<void> {
    const traceId = this.nextTraceId();
    try {
      await this.schema.apply();
      await this.seed.execute(traceId);
      await this.redis.connect();
      await this.redis.ping();
      await this.broker.connect();
      this.logger.info(traceId, 'auth service ready', {});
    } catch (error) {
      this.logger.error(traceId, 'auth service failed to start', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const traceId = this.nextTraceId();
    try {
      await this.broker.close();
      await this.redis.quit();
      this.logger.info(traceId, 'auth service stopped', {});
    } catch (error) {
      this.logger.error(traceId, 'auth service failed to stop', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }
}
