import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { UserRole } from '../../domain/contracts';
import { AccessDenied } from '../components/access-denied';
import { useAuthSession } from '../hooks/use-auth-session';

interface ProtectedRouteProps {
  roles?: readonly UserRole[];
  children?: ReactNode;
}

export function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { isAuthenticated, hasRole } = useAuthSession();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (roles !== undefined && !roles.some((role) => hasRole(role))) {
    return <AccessDenied />;
  }
  if (children !== undefined) {
    return <>{children}</>;
  }
  return <Outlet />;
}
