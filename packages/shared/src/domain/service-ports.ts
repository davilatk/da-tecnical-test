export interface ComponentPort {
  component: string;
  port: number;
  exposure: string;
}

export const COMPONENT_PORTS = [
  { component: 'auth-service', port: 3001, exposure: 'HTTP interno' },
  { component: 'user-service', port: 3002, exposure: 'HTTP' },
  { component: 'audit-service', port: 3003, exposure: 'HTTP' },
  { component: 'ai-agent-service', port: 8000, exposure: 'HTTP' },
  { component: 'web-client', port: 5173, exposure: 'Desarrollo' },
  { component: 'web-client', port: 80, exposure: 'Producción' },
] as const satisfies readonly ComponentPort[];

export type InternalServiceName = 'auth-service' | 'user-service' | 'audit-service' | 'ai-agent-service';

const INTERNAL_PORTS: Record<InternalServiceName, number> = {
  'auth-service': 3001,
  'user-service': 3002,
  'audit-service': 3003,
  'ai-agent-service': 8000,
};

export function internalServiceBaseUrl(service: InternalServiceName): string {
  return `http://${service}:${INTERNAL_PORTS[service]}`;
}
