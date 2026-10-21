import { Button, Navbar, NavbarBrand, NavbarContent, NavbarItem } from '@heroui/react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthSession } from '../hooks/use-auth-session';
import { TokaLogo } from '../components/toka-logo';

interface NavItem {
  to: string;
  label: string;
}

function navClassName(isActive: boolean, mobile: boolean): string {
  const active = isActive
    ? mobile
      ? 'bg-[#E7EEF6] text-toka-navy'
      : 'text-toka-navy underline decoration-2 underline-offset-[10px]'
    : 'text-toka-ink';
  const layout = mobile ? 'block rounded-xl px-3 py-2.5 text-base' : 'text-[15px]';
  return `${layout} font-medium transition-colors hover:text-toka-navy ${active}`;
}

function AppNavLinks({ items, mobile, onNavigate }: { items: NavItem[]; mobile: boolean; onNavigate?: () => void }) {
  return (
    <>
      {items.map((item) => (
        <NavbarItem key={item.to} className={mobile ? 'w-full' : undefined}>
          <NavLink
            to={item.to}
            className={({ isActive }) => navClassName(isActive, mobile)}
            onClick={onNavigate}
          >
            {item.label}
          </NavLink>
        </NavbarItem>
      ))}
    </>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const { user, canAudit, logout } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const items: NavItem[] = [
    { to: '/dashboard', label: 'Panel' },
    ...(canAudit ? [{ to: '/audit-log', label: 'Auditoría' }] : []),
    { to: '/assistant', label: 'Asistente' },
  ];

  return (
    <div className="min-h-screen bg-toka-mist text-toka-slate">
      <Navbar
        maxWidth="xl"
        isBlurred={false}
        className="border-b border-black/5 bg-white shadow-[0_8px_24px_rgba(0,42,94,0.06)]"
        classNames={{
          wrapper: 'h-[88px] px-4 sm:px-6',
        }}
      >
        <NavbarBrand>
          <Link to="/dashboard" className="shrink-0">
            <TokaLogo className="h-12 w-auto sm:h-14" />
          </Link>
        </NavbarBrand>
        <NavbarContent className="hidden gap-6 md:flex" justify="center">
          <AppNavLinks items={items} mobile={false} />
        </NavbarContent>
        <NavbarContent justify="end" className="gap-3">
          <NavbarItem className="max-w-[16rem] truncate text-sm font-medium text-toka-slate">
            <span>{user?.email ?? ''}</span>
          </NavbarItem>
          <NavbarItem>
            <Button
              color="primary"
              radius="full"
              className="h-11 px-5 text-sm font-medium"
              onPress={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Cerrar sesión
            </Button>
          </NavbarItem>
          <NavbarItem className="md:hidden">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-toka-navy"
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </NavbarItem>
        </NavbarContent>
      </Navbar>
      {menuOpen ? (
        <nav className="border-b border-black/5 bg-white px-4 py-3 shadow-sm md:hidden">
          <ul className="flex flex-col gap-1">
            <AppNavLinks items={items} mobile onNavigate={() => setMenuOpen(false)} />
          </ul>
        </nav>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
