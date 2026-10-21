import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '../application/api-client-error';
import { adminUser, loginResponse, plainUser } from './fixtures';
import { installMockApis, renderAt, resetClientState, seedSession } from './test-utils';

describe('LoginPage y rutas protegidas', () => {
  beforeEach(() => {
    resetClientState();
    installMockApis();
  });

  it('muestra validación y no llama a login si el formulario es inválido', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    renderAt('/login');

    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('El correo es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument();
    expect(ports.auth.login).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await user.type(screen.getByLabelText('Contraseña'), 'Admin123!');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('Ingresa un correo válido')).toBeInTheDocument();
    expect(ports.auth.login).not.toHaveBeenCalled();
  });

  it('muestra credenciales incorrectas, otro error y navega al panel si el login es válido', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    ports.auth.login.mockRejectedValueOnce(
      new ApiClientError(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', details: [] }, 'trc_1'),
    );
    renderAt('/login');
    await user.type(screen.getByLabelText('Correo'), 'admin@toka.com');
    await user.type(screen.getByLabelText('Contraseña'), 'mala');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();

    ports.auth.login.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Servicio no disponible', details: [] }, 'trc_2'),
    );
    await user.clear(screen.getByLabelText('Contraseña'));
    await user.type(screen.getByLabelText('Contraseña'), 'Admin123!');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible');

    ports.auth.login.mockResolvedValue(loginResponse);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('heading', { name: 'Gestión de usuarios y roles' })).toBeInTheDocument();
    expect(ports.auth.login).toHaveBeenCalledWith({ email: 'admin@toka.com', password: 'Admin123!' });
  });

  it('alterna la visibilidad de la contraseña y redirige si ya hay sesión', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    const password = screen.getByLabelText('Contraseña');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');

    cleanup();
    resetClientState();
    seedSession(adminUser);
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Gestión de usuarios y roles' })).toBeInTheDocument();
  });

  it('redirige sin sesión, niega el acceso con rol insuficiente y deja pasar al auditor', async () => {
    renderAt('/dashboard');
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();

    cleanup();
    seedSession(plainUser);
    renderAt('/audit-log');
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument();
    expect(screen.getByText('user@toka.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();

    cleanup();
    resetClientState();
    seedSession(adminUser);
    renderAt('/desconocida');
    expect(await screen.findByRole('heading', { name: 'Gestión de usuarios y roles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auditoría' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument();
  });

  it('oculta la pestaña Roles a quien no es ADMIN y cierra la sesión', async () => {
    const user = userEvent.setup();
    seedSession(plainUser);
    renderAt('/dashboard');
    expect(await screen.findByRole('tab', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Roles' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });
});
