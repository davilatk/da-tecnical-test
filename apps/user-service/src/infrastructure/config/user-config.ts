import { existsSync, readFileSync } from 'node:fs';
import { ContractError } from '@toka/shared';
import type { UserSettings } from '../../application/ports.js';

export interface UserConfig extends UserSettings {
  databaseUrl: string;
  redisUrl: string;
  rabbitmqUrl: string;
  port: number;
}

export interface ListenOptions {
  port: number;
  host: string;
}

export function loadLocalEnv(path: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(path)) {
    return;
  }
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

export function readUserConfig(env: NodeJS.ProcessEnv): UserConfig {
  const databaseUrl = env['USER_DATABASE_URL'] ?? '';
  const redisUrl = env['REDIS_URL'] ?? '';
  const rabbitmqUrl = env['RABBITMQ_URL'] ?? '';
  const jwtSecret = env['JWT_SECRET'] ?? '';
  const port = env['PORT'] === undefined || env['PORT'].trim().length === 0 ? 3002 : Number(env['PORT']);
  if (databaseUrl.trim().length === 0 || redisUrl.trim().length === 0 || rabbitmqUrl.trim().length === 0 || jwtSecret.trim().length === 0) {
    throw new ContractError('user service configuration is incomplete');
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ContractError('user service port is invalid');
  }
  return {
    databaseUrl,
    redisUrl,
    rabbitmqUrl,
    jwtSecret,
    port,
  };
}

export function serviceListenOptions(config: UserConfig): ListenOptions {
  return {
    port: config.port,
    host: '0.0.0.0',
  };
}
