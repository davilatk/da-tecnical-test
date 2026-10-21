import { randomBytes } from 'node:crypto';
import { ContractError } from '../domain/contract-error.js';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crockford(index: number): string {
  const char = ENCODING.charAt(index);
  if (char.length !== 1) {
    throw new ContractError('trace id encoding failed');
  }
  return char;
}

function encodeTime(nowMs: number): string {
  let time = nowMs;
  let encoded = '';
  for (let index = 0; index < 10; index += 1) {
    const mod = time % 32;
    encoded = crockford(mod) + encoded;
    time = Math.floor(time / 32);
  }
  return encoded;
}

function encodeRandom(random: Uint8Array): string {
  let encoded = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of random) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += crockford((buffer >>> bits) & 31);
      buffer &= (1 << bits) - 1;
    }
  }
  return encoded;
}

export function createTraceId(nowMs: number = Date.now(), random: Uint8Array = randomBytes(10)): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new ContractError('trace id time must be a non-negative unix millisecond timestamp');
  }
  if (random.length < 10) {
    throw new ContractError('trace id randomness must contain 10 bytes');
  }
  return `trc_${encodeTime(nowMs)}${encodeRandom(random.subarray(0, 10))}`;
}
