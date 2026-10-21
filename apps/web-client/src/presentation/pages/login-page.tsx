import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../application/api-client-error';
import { isValidEmail } from '../../domain/validators';
import { TokaLogo } from '../components/toka-logo';
import { useAuthSession } from '../hooks/use-auth-session';

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login, status } = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const nextEmailError =
      trimmedEmail.length === 0
        ? 'El correo es obligatorio'
        : !isValidEmail(trimmedEmail)
          ? 'Ingresa un correo válido'
          : null;
    const nextPasswordError = password.length === 0 ? 'La contraseña es obligatoria' : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError !== null || nextPasswordError !== null) {
      return;
    }
    try {
      await login({ email: trimmedEmail, password });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 401 &&
        error.body.code === 'INVALID_CREDENTIALS'
      ) {
        setFormError('Correo o contraseña incorrectos');
        return;
      }
      if (error instanceof ApiClientError) {
        setFormError(error.body.message);
        return;
      }
      setFormError('Error inesperado');
    }
  }

  const loading = status === 'loading';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-toka-deep px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(143,170,195,0.38),transparent_52%)]"
      />
      <Card className="relative w-full max-w-md border border-white/40 bg-white shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <CardHeader className="flex flex-col items-center gap-3 px-8 pt-8 text-center">
          <TokaLogo className="h-16 w-auto" />
          <h1 className="text-2xl font-semibold text-toka-navy">Iniciar sesión</h1>
          <p className="text-sm text-toka-slate">
            Accede a la plataforma de identidades, auditoría y asistente.
          </p>
        </CardHeader>
        <CardBody className="px-8 pb-8">
          <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void onSubmit(event)}>
            <Input
              type="email"
              label="Correo"
              value={email}
              onValueChange={setEmail}
              isInvalid={emailError !== null}
              {...(emailError !== null ? { errorMessage: emailError } : {})}
              autoComplete="username"
            />
            <Input
              type={visible ? 'text' : 'password'}
              label="Contraseña"
              value={password}
              onValueChange={setPassword}
              isInvalid={passwordError !== null}
              {...(passwordError !== null ? { errorMessage: passwordError } : {})}
              autoComplete="current-password"
              endContent={
                <button
                  type="button"
                  className="px-1 text-xs font-medium text-toka-navy"
                  aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setVisible((current) => !current)}
                >
                  {visible ? 'Ocultar' : 'Mostrar'}
                </button>
              }
            />
            {formError !== null ? <p role="alert">{formError}</p> : null}
            <Button
              type="submit"
              color="primary"
              radius="full"
              className="mt-1 h-12 text-base font-medium"
              isLoading={loading}
              isDisabled={loading}
            >
              Ingresar
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
