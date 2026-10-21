import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../application/ports.js';

export class RandomIdGenerator implements IdGenerator {
  nextUserId(): string {
    return randomUUID();
  }

  nextEventId(): string {
    return `evt_${randomUUID()}`;
  }
}
