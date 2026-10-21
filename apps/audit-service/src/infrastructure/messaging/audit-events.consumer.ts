import {
  AUDIT_EVENTS_BINDING_KEY,
  AUDIT_EVENTS_QUEUE,
  createTraceId,
  type DomainEventBus,
  type EventDelivery,
  type Logger,
} from '@toka/shared';
import { RecordAuditEventUseCase } from '../../application/record-audit-event.use-case.js';
import { UnconfirmedAuditEventError } from '../../application/unconfirmed-audit-event.error.js';

export class AuditEventsConsumer {
  private started = false;

  constructor(
    private readonly bus: DomainEventBus,
    private readonly record: RecordAuditEventUseCase,
    private readonly logger: Logger,
    private readonly nextTraceId: () => string = createTraceId,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    await this.bus.connect();
    await this.bus.consume(AUDIT_EVENTS_QUEUE, AUDIT_EVENTS_BINDING_KEY, (delivery) => this.onDelivery(delivery));
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    await this.bus.close();
    this.started = false;
  }

  async onDelivery(delivery: EventDelivery): Promise<void> {
    const traceId = this.nextTraceId();
    try {
      await this.record.execute(delivery.event, traceId);
      delivery.ack();
    } catch (error) {
      if (!(error instanceof UnconfirmedAuditEventError)) {
        this.logger.error(traceId, 'audit event was not confirmed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
  }
}
