import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthSession } from '../hooks/use-auth-session';
import { AppLayout } from '../layout/app-layout';
import { AssistantPage } from '../pages/assistant-page';
import { AuditPage } from '../pages/audit-page';
import { DashboardPage } from '../pages/dashboard-page';
import { LoginPage } from '../pages/login-page';
import { ProtectedRoute } from './protected-route';

function FallbackRedirect() {
  const { isAuthenticated } = useAuthSession();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route element={<ProtectedRoute roles={['ADMIN', 'AUDITOR']} />}>
            <Route path="/audit-log" element={<AuditPage />} />
          </Route>
          <Route path="/assistant" element={<AssistantPage />} />
        </Route>
      </Route>
      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  );
}
