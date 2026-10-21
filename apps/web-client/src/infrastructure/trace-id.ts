const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    const symbol = ALPHABET[byte % ALPHABET.length];
    id += symbol ?? '0';
  }
  return `trc_${id}`;
}
