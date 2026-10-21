import { Tab, Tabs } from '@heroui/react';
import { RolesTab } from '../components/roles-tab';
import { UsersTab } from '../components/users-tab';
import { useAuthSession } from '../hooks/use-auth-session';

export function DashboardPage() {
  const { isAdmin } = useAuthSession();

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-toka-steel">Consola</p>
        <h1 className="text-2xl font-semibold text-toka-navy">Gestión de usuarios y roles</h1>
      </header>
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-toka-navy/10 sm:p-6">
        <Tabs aria-label="Gestión" color="primary" variant="underlined">
          <Tab key="users" title="Usuarios">
            <UsersTab />
          </Tab>
          {isAdmin ? (
            <Tab key="roles" title="Roles">
              <RolesTab />
            </Tab>
          ) : null}
        </Tabs>
      </div>
    </section>
  );
}
