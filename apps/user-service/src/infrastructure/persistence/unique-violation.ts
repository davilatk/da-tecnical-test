import { QueryFailedError } from 'typeorm';

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

export function readDriverError(error: unknown): PostgresDriverError | null {
  if (!(error instanceof QueryFailedError)) {
    return null;
  }
  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) {
    return null;
  }
  const code = 'code' in driverError && typeof driverError.code === 'string' ? driverError.code : undefined;
  const constraint =
    'constraint' in driverError && typeof driverError.constraint === 'string' ? driverError.constraint : undefined;
  return {
    ...(code !== undefined ? { code } : {}),
    ...(constraint !== undefined ? { constraint } : {}),
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return readDriverError(error)?.code === '23505';
}

export function isUniqueEmailViolation(error: unknown): boolean {
  const driverError = readDriverError(error);
  return driverError?.code === '23505' && driverError.constraint === 'users_email_unique';
}
