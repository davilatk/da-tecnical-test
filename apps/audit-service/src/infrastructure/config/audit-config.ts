import { existsSync, readFileSync } from 'node:fs';
import { ContractError } from '@toka/shared';
import type { AuditSettings } from '../../application/ports.js';

export const AUDIT_DB_NAME = 'audit_db';
export const AUDIT_SERVICE_PORT = 3003;

export interface AuditConfig extends AuditSettings {
  mongoUri: string;
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

export function readAuditConfig(env: NodeJS.ProcessEnv): AuditConfig {
  const mongoUri = env['MONGODB_URI'] ?? '';
  const rabbitmqUrl = env['RABBITMQ_URL'] ?? '';
  const jwtSecret = env['JWT_SECRET'] ?? '';
  const port = env['PORT'] === undefined || env['PORT'].trim().length === 0 ? AUDIT_SERVICE_PORT : Number(env['PORT']);
  if (mongoUri.trim().length === 0 || rabbitmqUrl.trim().length === 0 || jwtSecret.trim().length === 0) {
    throw new ContractError('audit service configuration is incomplete');
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ContractError('audit service port is invalid');
  }
  return {
    mongoUri,
    rabbitmqUrl,
    jwtSecret,
    port,
  };
}

export function serviceListenOptions(config: AuditConfig): ListenOptions {
  return {
    port: config.port,
    host: '0.0.0.0',
  };
}
