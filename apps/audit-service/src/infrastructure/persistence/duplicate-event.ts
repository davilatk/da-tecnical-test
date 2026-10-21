export function isDuplicateEventId(error: unknown): boolean {
  return readCode(error) === 11000 || readCode(readCause(error)) === 11000;
}

function readCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return error.code;
}

function readCause(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return undefined;
  }
  return error.cause;
}
