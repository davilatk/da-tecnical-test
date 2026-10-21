import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '../application/api-client-error';
import { useUserStore } from '../application/stores/user.store';
import { formatDateTime } from '../domain/formatters';
import { adminUser, anaUser, plainUser } from './fixtures';
import { installMockApis, renderAt, resetClientState, seedSession } from './test-utils';

async function openUsers(role: 'admin' | 'user' = 'admin'): Promise<void> {
  seedSession(role === 'admin' ? adminUser : plainUser);
  renderAt('/dashboard');
  expect(await screen.findByRole('tab', { name: 'Usuarios' })).toBeInTheDocument();
}

describe('UsersTab', () => {
  beforeEach(() => {
    resetClientState();
  });

  it('muestra la tabla, el estado vacío y oculta acciones ajenas a ADMIN', async () => {
    const ports = installMockApis();
    ports.user.list.mockResolvedValue([anaUser]);
    await openUsers('user');
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('ana@toka.com')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('USER')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(anaUser.createdAt))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();

    cleanup();
    resetClientState();
    const empty = installMockApis();
    empty.user.list.mockResolvedValue([]);
    await openUsers('admin');
    expect(await screen.findByText('No hay usuarios registrados')).toBeInTheDocument();
  });

  it('muestra el spinner mientras carga el listado', async () => {
    const ports = installMockApis();
    let resolveList: (users: typeof anaUser[]) => void = () => undefined;
    ports.user.list.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    await openUsers('admin');
    expect(await screen.findByText('Cargando')).toBeInTheDocument();
    resolveList([anaUser]);
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  it('aplica la política de contraseña y muestra el 409 en el correo', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    ports.user.list.mockResolvedValue([]);
    await openUsers('admin');
    await screen.findByText('No hay usuarios registrados');
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Correo'), 'ana@toka.com');
    await user.type(within(dialog).getByLabelText('Contraseña'), 'password');
    await user.type(within(dialog).getByLabelText('Nombre completo'), 'Ana Pérez');
    await user.type(within(dialog).getByLabelText('Departamento'), 'Engineering');
    await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(within(dialog).getByText('La contraseña debe incluir al menos una mayúscula')).toBeInTheDocument();
    expect(ports.user.create).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText('Contraseña'));
    await user.type(within(dialog).getByLabelText('Contraseña'), 'Password123!');
    ports.user.create.mockRejectedValue(
      new ApiClientError(
        409,
        { code: 'EMAIL_ALREADY_REGISTERED', message: 'El correo ya está registrado', details: [] },
        'trc_409',
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(await within(dialog).findByText('El correo ya está registrado')).toBeInTheDocument();
    expect(ports.user.create).toHaveBeenCalledWith({
      email: 'ana@toka.com',
      password: 'Password123!',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      roles: ['USER'],
    });
  });

  it('envía solo los campos modificados y elimina la fila', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    ports.user.list.mockResolvedValue([anaUser]);
    await openUsers('admin');
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const editDialog = await screen.findByRole('dialog');
    expect(within(editDialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    const department = within(editDialog).getByLabelText('Departamento');
    await user.clear(department);
    await user.type(department, 'Platform');
    expect(within(editDialog).getByRole('button', { name: 'Guardar' })).toBeEnabled();
    const updated = { ...anaUser, department: 'Platform' };
    ports.user.update.mockResolvedValue(updated);
    await user.click(within(editDialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(ports.user.update).toHaveBeenCalledWith('usr_ana', { department: 'Platform' });
    });
    expect(await screen.findByText('Platform')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const deleteDialog = await screen.findByRole('dialog');
    ports.user.remove.mockResolvedValue(undefined);
    await user.click(within(deleteDialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => {
      expect(useUserStore.getState().users).toEqual([]);
    });
    expect(ports.user.remove).toHaveBeenCalledWith('usr_ana');
  });
});
