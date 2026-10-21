import type { Clock } from '../../application/ports.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
