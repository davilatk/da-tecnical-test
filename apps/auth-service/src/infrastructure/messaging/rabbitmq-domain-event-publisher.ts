import { parseDomainEvent, type DomainEvent, type DomainEventBus } from '@toka/shared';
import type { DomainEventPublisher } from '../../application/ports.js';

export class RabbitMqEventPublisher implements DomainEventPublisher {
  constructor(private readonly bus: DomainEventBus) {}

  async connect(): Promise<void> {
    await this.bus.connect();
  }

  async close(): Promise<void> {
    await this.bus.close();
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.bus.publish(parseDomainEvent(event));
  }
}
