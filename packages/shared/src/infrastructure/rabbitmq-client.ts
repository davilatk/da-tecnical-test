import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import type { ConsumeOptions, DomainEventBus, EventDelivery } from '../application/event-bus.js';
import { parseDomainEvent, type DomainEvent } from '../domain/domain-event.js';
import {
  AUDIT_EVENTS_BINDING_KEY,
  AUDIT_EVENTS_QUEUE,
  AUDIT_EVENTS_QUEUE_DURABLE,
  TOKA_EVENTS_EXCHANGE,
  TOKA_EVENTS_EXCHANGE_DURABLE,
  TOKA_EVENTS_EXCHANGE_TYPE,
} from '../domain/messaging.js';

export class BrokerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrokerError';
  }
}

export type AmqpConnect = (url: string) => Promise<ChannelModel>;

const PERSISTENT_JSON_UTF8 = {
  persistent: true,
  contentType: 'application/json; charset=utf-8',
} as const;

export class RabbitMqClient implements DomainEventBus {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly url: string,
    private readonly connectImpl: AmqpConnect = (target) => amqp.connect(target),
  ) {}

  async connect(): Promise<void> {
    if (this.url.trim().length === 0) {
      throw new BrokerError('broker url must be non-empty');
    }
    if (this.channel !== null) {
      return;
    }
    let connection: ChannelModel;
    try {
      connection = await this.connectImpl(this.url);
    } catch {
      throw new BrokerError('unable to connect to the broker');
    }
    try {
      const channel = await connection.createChannel();
      await channel.assertExchange(TOKA_EVENTS_EXCHANGE, TOKA_EVENTS_EXCHANGE_TYPE, {
        durable: TOKA_EVENTS_EXCHANGE_DURABLE,
      });
      this.connection = connection;
      this.channel = channel;
    } catch {
      await connection.close().catch(() => undefined);
      throw new BrokerError('unable to declare the exchange');
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    const channel = this.requireChannel();
    const valid = parseDomainEvent(event);
    const body = Buffer.from(JSON.stringify(valid), 'utf8');
    const accepted = channel.publish(TOKA_EVENTS_EXCHANGE, valid.eventType, body, PERSISTENT_JSON_UTF8);
    if (!accepted) {
      throw new BrokerError('event was not accepted by the broker');
    }
  }

  async consume(
    queue: string,
    bindingKey: string,
    handler: (delivery: EventDelivery) => Promise<void>,
    options?: ConsumeOptions,
  ): Promise<void> {
    if (queue.trim().length === 0 || bindingKey.length === 0) {
      throw new BrokerError('queue and binding key must be non-empty');
    }
    const channel = this.requireChannel();
    await channel.assertQueue(queue, { durable: AUDIT_EVENTS_QUEUE_DURABLE });
    await channel.bindQueue(queue, TOKA_EVENTS_EXCHANGE, bindingKey);
    await channel.consume(
      queue,
      (message) => {
        void this.dispatch(channel, message, handler, options?.onError);
      },
      { noAck: false },
    );
  }

  async consumeAuditEvents(
    handler: (delivery: EventDelivery) => Promise<void>,
    options?: ConsumeOptions,
  ): Promise<void> {
    await this.consume(AUDIT_EVENTS_QUEUE, AUDIT_EVENTS_BINDING_KEY, handler, options);
  }

  async close(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    let failure = false;
    if (channel !== null) {
      try {
        await channel.close();
      } catch {
        failure = true;
      }
    }
    if (connection !== null) {
      try {
        await connection.close();
      } catch {
        failure = true;
      }
    }
    if (failure) {
      throw new BrokerError('unable to close the broker connection');
    }
  }

  private requireChannel(): Channel {
    if (this.channel === null) {
      throw new BrokerError('broker client is not connected');
    }
    return this.channel;
  }

  private async dispatch(
    channel: Channel,
    message: ConsumeMessage | null,
    handler: (delivery: EventDelivery) => Promise<void>,
    onError: ((error: unknown) => void) | undefined,
  ): Promise<void> {
    if (message === null) {
      return;
    }
    let event: DomainEvent;
    try {
      event = parseDomainEvent(JSON.parse(message.content.toString('utf8')) as unknown);
    } catch {
      return;
    }
    try {
      await handler({
        event,
        ack: () => {
          channel.ack(message);
        },
        nack: (requeue) => {
          channel.nack(message, false, requeue);
        },
      });
    } catch (error) {
      onError?.(error);
    }
  }
}
