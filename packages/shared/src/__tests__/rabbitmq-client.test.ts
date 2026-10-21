import type { ChannelModel } from 'amqplib';
import amqp from 'amqplib';
import type { AmqpConnect } from '../infrastructure/rabbitmq-client.js';
import {
  AUDIT_EVENTS_BINDING_KEY,
  AUDIT_EVENTS_QUEUE,
  AUDIT_EVENTS_QUEUE_DURABLE,
  BrokerError,
  ContractError,
  RabbitMqClient,
  TOKA_EVENTS_EXCHANGE,
  TOKA_EVENTS_EXCHANGE_DURABLE,
  TOKA_EVENTS_EXCHANGE_TYPE,
  type DomainEvent,
} from '../index.js';
import { loggedInEvent, userCreatedEvent, userDeletedEvent } from './fixtures.js';

jest.mock('amqplib', () => {
  const connect = jest.fn();
  return {
    __esModule: true,
    connect,
    default: { connect },
  };
});

const URL = 'amqp://toka:toka_dev@localhost:5672';

interface Harness {
  published: Array<{ exchange: string; routingKey: string; content: Buffer; options: unknown }>;
  acked: unknown[];
  nacked: Array<{ message: unknown; allUpTo: boolean | undefined; requeue: boolean | undefined }>;
  channel: {
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    publish: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
    close: jest.Mock;
  };
  connection: {
    createChannel: jest.Mock;
    close: jest.Mock;
  };
  consumer: ((message: { content: Buffer } | null) => void) | undefined;
}

function createHarness(): Harness {
  const harness: Harness = {
    published: [],
    acked: [],
    nacked: [],
    consumer: undefined,
    channel: {
      assertExchange: jest.fn(async () => ({ exchange: TOKA_EVENTS_EXCHANGE })),
      assertQueue: jest.fn(async () => ({ queue: AUDIT_EVENTS_QUEUE, messageCount: 0, consumerCount: 0 })),
      bindQueue: jest.fn(async () => ({})),
      publish: jest.fn((exchange: string, routingKey: string, content: Buffer, options: unknown) => {
        harness.published.push({ exchange, routingKey, content, options });
        return true;
      }),
      consume: jest.fn(async (_queue: string, onMessage: (message: { content: Buffer } | null) => void) => {
        harness.consumer = onMessage;
        return { consumerTag: 'toka' };
      }),
      ack: jest.fn((message: unknown) => {
        harness.acked.push(message);
      }),
      nack: jest.fn((message: unknown, allUpTo?: boolean, requeue?: boolean) => {
        harness.nacked.push({ message, allUpTo, requeue });
      }),
      close: jest.fn(async () => undefined),
    },
    connection: {
      createChannel: jest.fn(),
      close: jest.fn(async () => undefined),
    },
  };
  harness.connection.createChannel.mockImplementation(async () => harness.channel);
  return harness;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe('RabbitMqClient', () => {
  const connect = amqp.connect as jest.Mock;

  beforeEach(() => {
    connect.mockReset();
  });

  it('connects with amqplib and declares the durable topic exchange', async () => {
    const harness = createHarness();
    connect.mockResolvedValue(harness.connection);
    const client = new RabbitMqClient(URL);

    await client.connect();
    await client.connect();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(URL);
    expect(harness.channel.assertExchange).toHaveBeenCalledWith(TOKA_EVENTS_EXCHANGE, TOKA_EVENTS_EXCHANGE_TYPE, {
      durable: TOKA_EVENTS_EXCHANGE_DURABLE,
    });
    expect(TOKA_EVENTS_EXCHANGE_TYPE).toBe('topic');
    expect(TOKA_EVENTS_EXCHANGE_DURABLE).toBe(true);
  });

  it('publishes persistent UTF-8 JSON using eventType as the routing key', async () => {
    const harness = createHarness();
    const connectImpl: AmqpConnect = async () => harness.connection as unknown as ChannelModel;
    const client = new RabbitMqClient(URL, connectImpl);
    await client.connect();
    const created = userCreatedEvent();

    await client.publish(created);
    await client.publish(loggedInEvent());

    expect(harness.published).toHaveLength(2);
    expect(harness.published[0]).toMatchObject({
      exchange: 'toka.events',
      routingKey: 'user.created',
      options: { persistent: true, contentType: 'application/json; charset=utf-8' },
    });
    expect(harness.published[1]?.routingKey).toBe('auth.user.logged_in');
    expect(JSON.parse(harness.published[0]?.content.toString('utf8') ?? '{}')).toEqual(created);
    expect(harness.published[0]?.content.toString('utf8')).toContain('Ana Pérez');

    harness.channel.publish.mockReturnValueOnce(false);
    await expect(client.publish(created)).rejects.toBeInstanceOf(BrokerError);
  });

  it('does not publish an event that breaks the contract', async () => {
    const harness = createHarness();
    const client = new RabbitMqClient(URL, async () => harness.connection as unknown as ChannelModel);
    await client.connect();
    const invalid = { ...loggedInEvent(), actorId: 'usr_actor', targetId: 'usr_target' };

    await expect(client.publish(invalid as DomainEvent)).rejects.toBeInstanceOf(ContractError);
    expect(harness.published).toHaveLength(0);
    const disconnected = new RabbitMqClient(URL, async () => harness.connection as unknown as ChannelModel);
    await expect(disconnected.publish(userCreatedEvent())).rejects.toBeInstanceOf(BrokerError);
  });

  it('consumes the audit queue and leaves invalid messages unacknowledged', async () => {
    const harness = createHarness();
    const client = new RabbitMqClient(URL, async () => harness.connection as unknown as ChannelModel);
    await client.connect();
    const received: unknown[] = [];
    await client.consumeAuditEvents(async (delivery) => {
      received.push(delivery.event);
      delivery.ack();
    });
    await client.consume('notifications.queue', 'user.*', async (delivery) => {
      delivery.nack(true);
    });

    expect(harness.channel.assertQueue).toHaveBeenNthCalledWith(1, AUDIT_EVENTS_QUEUE, {
      durable: AUDIT_EVENTS_QUEUE_DURABLE,
    });
    expect(harness.channel.bindQueue).toHaveBeenNthCalledWith(
      1,
      AUDIT_EVENTS_QUEUE,
      TOKA_EVENTS_EXCHANGE,
      AUDIT_EVENTS_BINDING_KEY,
    );
    expect(AUDIT_EVENTS_BINDING_KEY).toBe('#');
    expect(harness.channel.bindQueue).toHaveBeenNthCalledWith(2, 'notifications.queue', 'toka.events', 'user.*');
    expect(harness.channel.consume).toHaveBeenCalledWith(AUDIT_EVENTS_QUEUE, expect.any(Function), { noAck: false });

    const auditConsumer = harness.channel.consume.mock.calls[0]?.[1] as
      | ((message: { content: Buffer } | null) => void)
      | undefined;
    const event = userDeletedEvent();
    auditConsumer?.({ content: Buffer.from(JSON.stringify(event), 'utf8') });
    await flush();
    expect(received).toEqual([event]);
    expect(harness.acked).toHaveLength(1);

    auditConsumer?.(null);
    auditConsumer?.({ content: Buffer.from('{', 'utf8') });
    auditConsumer?.({ content: Buffer.from(JSON.stringify({ eventType: 'nope' }), 'utf8') });
    await flush();
    expect(harness.acked).toHaveLength(1);
    expect(harness.nacked).toHaveLength(0);

    const second = harness.channel.consume.mock.calls[1]?.[1] as
      | ((message: { content: Buffer } | null) => void)
      | undefined;
    second?.({ content: Buffer.from(JSON.stringify(loggedInEvent()), 'utf8') });
    await flush();
    expect(harness.nacked).toEqual([{ message: expect.any(Object), allUpTo: false, requeue: true }]);
  });

  it('reports handler failures without acknowledging and closes both channels', async () => {
    const harness = createHarness();
    const client = new RabbitMqClient(URL, async () => harness.connection as unknown as ChannelModel);
    await client.connect();
    const errors: unknown[] = [];
    await client.consumeAuditEvents(
      async () => {
        throw new Error('mongo unavailable');
      },
      { onError: (error) => errors.push(error) },
    );
    const auditConsumer = harness.channel.consume.mock.calls[0]?.[1] as
      | ((message: { content: Buffer } | null) => void)
      | undefined;
    auditConsumer?.({ content: Buffer.from(JSON.stringify(loggedInEvent()), 'utf8') });
    await flush();
    expect(errors).toHaveLength(1);
    expect(harness.acked).toHaveLength(0);

    harness.channel.close.mockRejectedValueOnce(new Error('channel closed'));
    await expect(client.close()).rejects.toBeInstanceOf(BrokerError);
    expect(harness.connection.close).toHaveBeenCalledTimes(1);
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('hides broker urls and closes a failed declaration', async () => {
    const connectImpl = jest.fn(async () => {
      throw new Error(`connect failed ${URL}`);
    });
    const client = new RabbitMqClient(URL, connectImpl);
    await expect(client.connect()).rejects.toThrow('unable to connect to the broker');
    try {
      await client.connect();
    } catch (error) {
      expect(String(error)).not.toContain('toka_dev');
      expect(String(error)).not.toContain('amqp://');
    }

    const harness = createHarness();
    harness.channel.assertExchange.mockRejectedValueOnce(new Error(`exchange ${URL}`));
    const failing = new RabbitMqClient('   amqp://localhost   ', async () => harness.connection as unknown as ChannelModel);
    await expect(new RabbitMqClient('   ', async () => harness.connection as unknown as ChannelModel).connect()).rejects.toThrow(
      'broker url must be non-empty',
    );
    await expect(failing.connect()).rejects.toThrow('unable to declare the exchange');
    expect(harness.connection.close).toHaveBeenCalledTimes(1);
    await expect(failing.publish(loggedInEvent())).rejects.toBeInstanceOf(BrokerError);
    await expect(failing.consume(' ', '#', async () => undefined)).rejects.toThrow('queue and binding key must be non-empty');
    await expect(failing.consume('audit.events.queue', '', async () => undefined)).rejects.toThrow(
      'queue and binding key must be non-empty',
    );
  });
});
