import { useAuthStore } from '../../application/stores/auth.store';

export function useAuthSession() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const expiresAt = useAuthStore((state) => state.expiresAt);
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const hasRole = useAuthStore((state) => state.hasRole);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const login = useAuthStore((state) => state.login);
  const authenticated = accessToken !== null && isAuthenticated();
  return {
    accessToken,
    expiresAt,
    user,
    status,
    error,
    hasRole,
    logout,
    login,
    isAuthenticated: authenticated && expiresAt !== null,
    isAdmin: hasRole('ADMIN'),
    canAudit: hasRole('ADMIN', 'AUDITOR'),
  };
}
