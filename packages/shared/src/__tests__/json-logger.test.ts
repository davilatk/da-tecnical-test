import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ContractError, JsonLogger, LOG_LEVELS } from '../index.js';

const TRACE_ID = 'trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === '__tests__' || name === 'dist' || name === 'coverage') {
      return [];
    }
    if (statSync(path).isDirectory()) {
      return walk(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('JsonLogger', () => {
  it('does not use console or print in the library source', () => {
    const files = walk(join(__dirname, '..'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/console\./);
      expect(source).not.toMatch(/\bprint\s*\(/);
    }
  });

  it('writes one JSON line with the contract fields and does not call console.log', () => {
    const lines: string[] = [];
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('auth-service', undefined, () => new Date('2026-10-21T17:24:00.000Z'));

    const entry = logger.info(TRACE_ID, 'login accepted', { userId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F' });

    expect(consoleLog).not.toHaveBeenCalled();
    expect(lines).toEqual([
      `${JSON.stringify({
        timestamp: '2026-10-21T17:24:00.000Z',
        level: 'info',
        service: 'auth-service',
        traceId: TRACE_ID,
        message: 'login accepted',
        context: { userId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F' },
      })}\n`,
    ]);
    expect(entry).toEqual(JSON.parse(lines[0] ?? '{}'));
    expect(Object.keys(entry)).toEqual(['timestamp', 'level', 'service', 'traceId', 'message', 'context']);
    stdout.mockRestore();
    consoleLog.mockRestore();
  });

  it('emits every allowed level and an empty context when omitted', () => {
    const lines: string[] = [];
    const logger = new JsonLogger('user-service', (line) => lines.push(line), () => new Date('2026-10-21T17:24:00.000Z'));

    logger.debug(TRACE_ID, 'debug');
    logger.info(TRACE_ID, 'info');
    logger.warn(TRACE_ID, 'warn');
    logger.error(TRACE_ID, 'error');

    expect(lines).toHaveLength(4);
    expect(lines.map((line) => (JSON.parse(line) as { level: string }).level)).toEqual([...LOG_LEVELS]);
    expect(lines.every((line) => (JSON.parse(line) as { context: unknown }).context !== null)).toBe(true);
    expect((JSON.parse(lines[0] ?? '{}') as { context: unknown }).context).toEqual({});
  });

  it('redacts passwords, credentials and JWT values without mutating the input', () => {
    const lines: string[] = [];
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3IifQ.signature';
    const context = {
      userId: 'usr_1',
      password: 'Admin123!',
      headers: { authorization: `Bearer ${token}` },
      notes: [`token ${token}`, { accessToken: token }],
    };
    const logger = new JsonLogger('audit-service', (line) => lines.push(line));

    logger.warn(TRACE_ID, `rejected ${token}`, context);

    const entry = JSON.parse(lines[0] ?? '{}') as {
      message: string;
      context: {
        password: string;
        headers: { authorization: string };
        notes: [string, { accessToken: string }];
      };
    };
    expect(entry.message).toBe('rejected [REDACTED]');
    expect(entry.message).not.toContain('eyJ');
    expect(entry.context.password).toBe('[REDACTED]');
    expect(entry.context.headers.authorization).toBe('[REDACTED]');
    expect(entry.context.notes[0]).toBe('token [REDACTED]');
    expect(entry.context.notes[1].accessToken).toBe('[REDACTED]');
    expect(context.password).toBe('Admin123!');
    expect(JSON.stringify(entry)).not.toContain('Admin123!');
    expect(JSON.stringify(entry)).not.toContain('eyJ');
  });

  it('rejects empty service, trace, message, level, clock and non-json context before writing', () => {
    const lines: string[] = [];
    const sink = (line: string): void => {
      lines.push(line);
    };
    expect(() => new JsonLogger('   ', sink)).toThrow(ContractError);
    const logger = new JsonLogger('auth-service', sink, () => new Date(Number.NaN));
    expect(() => logger.info('   ', 'login accepted')).toThrow(ContractError);
    expect(() => logger.info(TRACE_ID, '   ')).toThrow(ContractError);
    expect(() => logger.log({ level: 'trace' as 'info', traceId: TRACE_ID, message: 'ok' })).toThrow(ContractError);
    expect(() => logger.info(TRACE_ID, 'ok', [] as unknown as Record<string, unknown>)).toThrow(ContractError);
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => logger.info(TRACE_ID, 'ok', circular)).toThrow(ContractError);
    expect(() => logger.info(TRACE_ID, 'ok', { amount: 1n })).toThrow(ContractError);
    expect(() => logger.info(TRACE_ID, 'ok')).toThrow(ContractError);
    expect(lines).toEqual([]);
  });
});
