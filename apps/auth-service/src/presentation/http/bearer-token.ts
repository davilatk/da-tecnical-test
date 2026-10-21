export function readBearerToken(headers: Record<string, unknown> | undefined): string | null {
  if (headers === undefined) {
    return null;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization');
  if (entry === undefined) {
    return null;
  }
  const raw = entry[1];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}
