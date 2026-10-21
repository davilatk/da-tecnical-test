import { HeroUIProvider } from '@heroui/react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiClientError } from '../application/api-client-error';
import type { AiAgentApiPort, AuditApiPort, AuthApiPort, UserApiPort } from '../application/ports';
import { bindAiAgentApi, useAiAgentStore } from '../application/stores/ai-agent.store';
import { bindAuditApi, useAuditStore } from '../application/stores/audit.store';
import { bindAuthApi, useAuthStore } from '../application/stores/auth.store';
import { bindUserApi, useUserStore } from '../application/stores/user.store';
import type { AuthUser } from '../domain/contracts';
import { AppRouter } from '../presentation/routes/app-router';
import { askResponse, auditStats, ingestResponse } from './fixtures';

export interface MockPorts {
  auth: jest.Mocked<AuthApiPort>;
  user: jest.Mocked<UserApiPort>;
  audit: jest.Mocked<AuditApiPort>;
  ai: jest.Mocked<AiAgentApiPort>;
}

export function resetClientState(): void {
  useAuthStore.setState({
    accessToken: null,
    tokenType: null,
    expiresAt: null,
    user: null,
    availableRoles: [],
    status: 'idle',
    error: null,
  });
  useUserStore.getState().reset();
  useAuditStore.getState().reset();
  useAiAgentStore.getState().reset();
  sessionStorage.clear();
}

export function installMockApis(): MockPorts {
  const auth: jest.Mocked<AuthApiPort> = {
    register: jest.fn(),
    login: jest.fn(),
    validate: jest.fn(),
    listRoles: jest.fn().mockResolvedValue(['ADMIN', 'USER', 'AUDITOR']),
    assignRole: jest.fn(),
  };
  const user: jest.Mocked<UserApiPort> = {
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const audit: jest.Mocked<AuditApiPort> = {
    list: jest.fn().mockResolvedValue({ items: [], limit: 50 }),
    stats: jest.fn().mockResolvedValue(auditStats),
  };
  const ai: jest.Mocked<AiAgentApiPort> = {
    ask: jest.fn().mockResolvedValue(askResponse),
    ingest: jest.fn().mockResolvedValue(ingestResponse),
  };
  bindAuthApi(auth);
  bindUserApi(user);
  bindAuditApi(audit);
  bindAiAgentApi(ai);
  return { auth, user, audit, ai };
}

export function seedSession(user: AuthUser, expiresInMs = 60_000): void {
  useAuthStore.setState({
    accessToken: 'token-test',
    tokenType: 'Bearer',
    expiresAt: Date.now() + expiresInMs,
    user,
    status: 'idle',
    error: null,
  });
}

export function renderAt(path: string): RenderResult {
  return render(
    <HeroUIProvider locale="es-MX" disableAnimation>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRouter />
      </MemoryRouter>
    </HeroUIProvider>,
  );
}

export function networkFailure(): ApiClientError {
  return new ApiClientError(0, { code: 'NETWORK_ERROR', message: 'No fue posible contactar al servicio', details: [] }, 'trc_net');
}
