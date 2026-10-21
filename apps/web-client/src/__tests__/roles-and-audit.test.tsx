import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '../application/api-client-error';
import { useAuthStore } from '../application/stores/auth.store';
import { useUserStore } from '../application/stores/user.store';
import { EVENT_TYPES } from '../domain/constants';
import { adminUser, anaUser, auditItem, auditStats, laterAuditItem } from './fixtures';
import { installMockApis, renderAt, resetClientState, seedSession } from './test-utils';

describe('RolesTab y AuditPage', () => {
  beforeEach(() => {
    resetClientState();
  });

  it('envía AssignRoleRequest y muestra el usuario retornado o el 404', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    useUserStore.setState({ users: [anaUser], status: 'success' });
    useAuthStore.setState({ availableRoles: ['ADMIN', 'USER', 'AUDITOR'] });
    ports.auth.listRoles.mockResolvedValue(['ADMIN', 'USER', 'AUDITOR']);
    ports.user.list.mockResolvedValue([anaUser]);
    seedSession(adminUser);
    renderAt('/dashboard');
    await user.click(await screen.findByRole('tab', { name: 'Roles' }));
    expect(
      screen.getByText(
        'Los roles mostrados en la tabla de usuarios corresponden al alta; la asignación se aplica en el servicio de autenticación.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Usuario/ }));
    await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }));
    await user.click(screen.getByRole('button', { name: /^Rol/ }));
    await user.click(await screen.findByRole('option', { name: 'AUDITOR' }));
    ports.auth.assignRole.mockResolvedValue({
      id: 'usr_ana',
      email: 'ana@toka.com',
      roles: ['USER', 'AUDITOR'],
    });
    await user.click(screen.getByRole('button', { name: 'Asignar rol' }));
    expect(ports.auth.assignRole).toHaveBeenCalledWith({ userId: 'usr_ana', role: 'AUDITOR' });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Rol asignado: ana@toka.com ahora tiene USER, AUDITOR',
    );

    ports.auth.assignRole.mockRejectedValue(
      new ApiClientError(404, { code: 'AUTH_USER_NOT_FOUND', message: 'Credencial no encontrada', details: [] }, 'trc_404'),
    );
    await user.click(screen.getByRole('button', { name: 'Asignar rol' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credencial no encontrada');
  });

  it('muestra estadísticas, valida el límite y abre el payload sin reordenar', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    ports.audit.stats.mockResolvedValue(auditStats);
    ports.audit.list.mockResolvedValue({ items: [auditItem, laterAuditItem], limit: 50 });
    seedSession(adminUser);
    renderAt('/audit-log');

    expect(await screen.findByRole('heading', { name: 'total' })).toBeInTheDocument();
    expect(screen.getByLabelText('total')).toHaveTextContent('15');
    for (const eventType of EVENT_TYPES) {
      expect(screen.getByLabelText(eventType)).toHaveTextContent(String(auditStats.byEventType[eventType]));
    }
    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toContain('user.created');
    expect(rows[2]?.textContent).toContain('user.updated');

    await user.clear(screen.getByLabelText('Límite'));
    await user.type(screen.getByLabelText('Límite'), '0');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText('El límite debe estar entre 1 y 100')).toBeInTheDocument();
    expect(ports.audit.list).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByLabelText('Límite'));
    await user.type(screen.getByLabelText('Límite'), '20');
    await user.type(screen.getByLabelText('Actor'), 'usr_admin');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(ports.audit.list).toHaveBeenLastCalledWith({ limit: 20, actorId: 'usr_admin' });

    await user.click(screen.getAllByRole('button', { name: 'Ver payload' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ana@toka.com/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ana Pérez/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(ports.audit.list).toHaveBeenLastCalledWith({ limit: 50 });
  });
});
