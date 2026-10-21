export function selectionValue(keys: unknown): string {
  if (keys === 'all' || keys == null) {
    return '';
  }
  if (typeof keys === 'string' || typeof keys === 'number') {
    return String(keys);
  }
  if (typeof keys === 'object' && Symbol.iterator in keys) {
    const value = Array.from(keys as Iterable<unknown>)[0];
    return value === undefined ? '' : String(value);
  }
  return '';
}
