import { ApiClientError } from '../application/api-client-error';
import { useAiAgentStore } from '../application/stores/ai-agent.store';
import { useAuditStore } from '../application/stores/audit.store';
import { useAuthStore } from '../application/stores/auth.store';
import { useUserStore } from '../application/stores/user.store';
import { adminUser, anaUser, askResponse, auditItem, auditStats, ingestResponse, loginResponse } from './fixtures';
import { installMockApis, resetClientState } from './test-utils';

const credentialsError = new ApiClientError(
  401,
  { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', details: [] },
  'trc_login',
);

describe('stores', () => {
  beforeEach(() => {
    resetClientState();
  });

  it('guarda la sesión en login y la limpia junto con los demás stores', async () => {
    const ports = installMockApis();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    ports.auth.login.mockResolvedValue(loginResponse);
    useUserStore.setState({ users: [anaUser] });
    useAuditStore.setState({ items: [auditItem], stats: auditStats });
    useAiAgentStore.setState({ messages: [{ id: 'm1', role: 'user', content: 'hola', createdAt: '2026-10-21T17:24:00.000Z' }] });

    const data = await useAuthStore.getState().login({ email: 'admin@toka.com', password: 'Admin123!' });

    expect(data.accessToken).toBe('token-test');
    expect(useAuthStore.getState().accessToken).toBe('token-test');
    expect(useAuthStore.getState().tokenType).toBe('Bearer');
    expect(useAuthStore.getState().expiresAt).toBe(1_700_000_000_000 + 3600 * 1000);
    expect(useAuthStore.getState().user).toEqual(adminUser);
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    const persisted = sessionStorage.getItem('toka.auth');
    expect(persisted).toContain('token-test');
    expect(persisted).not.toContain('Admin123!');

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    expect(useUserStore.getState().users).toEqual([]);
    expect(useAuditStore.getState().items).toEqual([]);
    expect(useAiAgentStore.getState().messages).toEqual([]);
    expect(sessionStorage.getItem('toka.auth')).toBeNull();
  });

  it('respeta roles, expiración, registro, validación y asignación', async () => {
    const ports = installMockApis();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    useAuthStore.setState({
      accessToken: 'token-test',
      tokenType: 'Bearer',
      expiresAt: 1_700_000_000_000 + 1000,
      user: adminUser,
    });
    expect(useAuthStore.getState().hasRole('ADMIN')).toBe(true);
    expect(useAuthStore.getState().hasRole('USER', 'AUDITOR')).toBe(false);
    expect(useAuthStore.getState().hasRole('ADMIN', 'AUDITOR')).toBe(true);
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);

    useAuthStore.setState({ expiresAt: 1_700_000_000_000 - 1 });
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    useAuthStore.setState({ accessToken: null, expiresAt: 1_700_000_000_000 + 1000 });
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);

    ports.auth.register.mockResolvedValue({ id: 'usr_ana', email: 'ana@toka.com', roles: ['USER'] });
    await expect(
      useAuthStore.getState().register({ email: 'ana@toka.com', password: 'Password123!' }),
    ).resolves.toEqual({ id: 'usr_ana', email: 'ana@toka.com', roles: ['USER'] });

    ports.auth.listRoles.mockResolvedValue(['ADMIN', 'USER', 'AUDITOR']);
    await expect(useAuthStore.getState().fetchRoles()).resolves.toEqual(['ADMIN', 'USER', 'AUDITOR']);
    expect(useAuthStore.getState().availableRoles).toEqual(['ADMIN', 'USER', 'AUDITOR']);

    const assigned = { id: 'usr_ana', email: 'ana@toka.com', roles: ['USER', 'AUDITOR'] as const };
    ports.auth.assignRole.mockResolvedValue({ ...assigned, roles: ['USER', 'AUDITOR'] });
    await expect(useAuthStore.getState().assignRole({ userId: 'usr_ana', role: 'AUDITOR' })).resolves.toEqual({
      id: 'usr_ana',
      email: 'ana@toka.com',
      roles: ['USER', 'AUDITOR'],
    });

    ports.auth.validate.mockResolvedValue({
      valid: true,
      user: { id: 'usr_user', email: 'user@toka.com', roles: ['USER'] },
    });
    await useAuthStore.getState().validateSession();
    expect(useAuthStore.getState().user?.email).toBe('user@toka.com');

    ports.auth.validate.mockRejectedValue(credentialsError);
    await expect(useAuthStore.getState().validateSession()).rejects.toBe(credentialsError);
    expect(useAuthStore.getState().accessToken).toBeNull();

    ports.auth.login.mockRejectedValue(credentialsError);
    await expect(useAuthStore.getState().login({ email: 'a@b.c', password: 'x' })).rejects.toBe(credentialsError);
    expect(useAuthStore.getState().status).toBe('error');
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('agrega, reemplaza y elimina usuarios locales', async () => {
    const ports = installMockApis();
    ports.user.list.mockResolvedValue([anaUser]);
    await expect(useUserStore.getState().fetchUsers()).resolves.toEqual([anaUser]);

    const created = { ...anaUser, id: 'usr_new', email: 'new@toka.com', fullName: 'Nuevo' };
    ports.user.create.mockResolvedValue(created);
    await useUserStore.getState().createUser({
      email: 'new@toka.com',
      password: 'Password123!',
      fullName: 'Nuevo',
      department: 'Engineering',
    });
    expect(useUserStore.getState().users.map((user) => user.id)).toEqual(['usr_ana', 'usr_new']);

    ports.user.getById.mockResolvedValue(created);
    await useUserStore.getState().fetchUserById('usr_new');
    expect(useUserStore.getState().selectedUser?.id).toBe('usr_new');

    const updated = { ...created, department: 'Platform' };
    ports.user.update.mockResolvedValue(updated);
    await useUserStore.getState().updateUser('usr_new', { department: 'Platform' });
    expect(useUserStore.getState().users.find((user) => user.id === 'usr_new')?.department).toBe('Platform');
    expect(useUserStore.getState().selectedUser?.department).toBe('Platform');

    useUserStore.getState().selectUser(anaUser);
    await useUserStore.getState().deleteUser('usr_new');
    expect(useUserStore.getState().users.map((user) => user.id)).toEqual(['usr_ana']);
    expect(useUserStore.getState().selectedUser?.id).toBe('usr_ana');

    useUserStore.getState().selectUser(anaUser);
    await useUserStore.getState().deleteUser('usr_ana');
    expect(useUserStore.getState().selectedUser).toBeNull();

    ports.user.list.mockRejectedValue(new Error('boom'));
    await expect(useUserStore.getState().fetchUsers()).rejects.toThrow('boom');
    expect(useUserStore.getState().error?.code).toBe('INTERNAL_ERROR');
  });

  it('inicia la auditoría con limit 50 y no envía filtros vacíos', async () => {
    const ports = installMockApis();
    expect(useAuditStore.getState().query).toEqual({ limit: 50 });
    ports.audit.list.mockResolvedValue({ items: [auditItem, laterAuditItem()], limit: 20 });
    await useAuditStore.getState().fetchAudits({ actorId: '', eventType: 'user.created', limit: 20 });
    expect(ports.audit.list).toHaveBeenCalledWith({ eventType: 'user.created', limit: 20 });
    expect(useAuditStore.getState().items.map((item) => item.eventId)).toEqual(['evt_b', 'evt_a']);
    expect(useAuditStore.getState().limit).toBe(20);

    useAuditStore.getState().setQuery({ actorId: '', limit: 10 });
    expect(useAuditStore.getState().query).toEqual({ limit: 10 });
    ports.audit.list.mockResolvedValue({ items: [], limit: 10 });
    await useAuditStore.getState().fetchAudits();
    expect(ports.audit.list).toHaveBeenLastCalledWith({ limit: 10 });

    ports.audit.stats.mockResolvedValue(auditStats);
    await expect(useAuditStore.getState().fetchStats()).resolves.toEqual(auditStats);
    useAuditStore.getState().resetQuery();
    expect(useAuditStore.getState().query).toEqual({ limit: 50 });
    useAuditStore.getState().reset();
    expect(useAuditStore.getState().stats).toBeNull();
    expect(useAuditStore.getState().items).toEqual([]);
  });

  it('agrega el mensaje del usuario y luego el del asistente, o conserva solo el usuario si falla', async () => {
    const ports = installMockApis();
    ports.ai.ask.mockResolvedValue(askResponse);
    await useAiAgentStore.getState().ask({ question: '¿Quién está activo?', topK: 5, includeLiveData: true });
    const messages = useAiAgentStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('¿Quién está activo?');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toBe(askResponse.answer);
    expect(messages[1]?.response).toEqual(askResponse);
    expect(useAiAgentStore.getState().lastResponse).toEqual(askResponse);

    ports.ai.ask.mockRejectedValue(credentialsError);
    await expect(useAiAgentStore.getState().ask({ question: 'falla' })).rejects.toBe(credentialsError);
    expect(useAiAgentStore.getState().messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(useAiAgentStore.getState().lastResponse).toEqual(askResponse);

    ports.ai.ingest.mockResolvedValue(ingestResponse);
    await useAiAgentStore.getState().ingest({
      documents: [{ title: 'Política', source: 'knowledge/roles-policy.md', content: 'contenido' }],
    });
    expect(useAiAgentStore.getState().lastIngest).toEqual(ingestResponse);
    useAiAgentStore.getState().clearConversation();
    expect(useAiAgentStore.getState().messages).toEqual([]);
    expect(useAiAgentStore.getState().lastResponse).toBeNull();
    expect(useAiAgentStore.getState().lastIngest).toEqual(ingestResponse);
    useAiAgentStore.getState().reset();
    expect(useAiAgentStore.getState().lastIngest).toBeNull();
  });
});

function laterAuditItem() {
  return {
    ...auditItem,
    eventId: 'evt_a',
    eventType: 'user.updated' as const,
    occurredAt: '2026-10-21T18:00:00.000Z',
  };
}
