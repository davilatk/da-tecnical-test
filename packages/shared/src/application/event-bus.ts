import type { DomainEvent } from '../domain/domain-event.js';

export interface EventDelivery {
  event: DomainEvent;
  ack(): void;
  nack(requeue: boolean): void;
}

export interface ConsumeOptions {
  onError?: (error: unknown) => void;
}

export interface DomainEventBus {
  connect(): Promise<void>;
  publish(event: DomainEvent): Promise<void>;
  consume(
    queue: string,
    bindingKey: string,
    handler: (delivery: EventDelivery) => Promise<void>,
    options?: ConsumeOptions,
  ): Promise<void>;
  consumeAuditEvents(
    handler: (delivery: EventDelivery) => Promise<void>,
    options?: ConsumeOptions,
  ): Promise<void>;
  close(): Promise<void>;
}
