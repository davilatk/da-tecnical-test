import { Button, Select, SelectItem } from '@heroui/react';
import { useEffect, useState } from 'react';
import { ApiClientError } from '../../application/api-client-error';
import { useAuthStore } from '../../application/stores/auth.store';
import { useUserStore } from '../../application/stores/user.store';
import type { UserRole } from '../../domain/contracts';
import { isUserRole } from '../../domain/validators';
import { selectionValue } from '../selection';

export function RolesTab() {
  const users = useUserStore((state) => state.users);
  const fetchUsers = useUserStore((state) => state.fetchUsers);
  const availableRoles = useAuthStore((state) => state.availableRoles);
  const fetchRoles = useAuthStore((state) => state.fetchRoles);
  const assignRole = useAuthStore((state) => state.assignRole);
  const status = useAuthStore((state) => state.status);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRoles();
    if (useUserStore.getState().users.length === 0) {
      void fetchUsers();
    }
  }, [fetchRoles, fetchUsers]);

  async function onSubmit(): Promise<void> {
    if (userId === '' || role === '') {
      return;
    }
    setNotice(null);
    setFormError(null);
    try {
      const updated = await assignRole({ userId, role });
      setNotice(`Rol asignado: ${updated.email} ahora tiene ${updated.roles.join(', ')}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.body.message);
        return;
      }
      setFormError('Error inesperado');
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4 py-4">
      <p>
        Los roles mostrados en la tabla de usuarios corresponden al alta; la asignación se aplica en el
        servicio de autenticación.
      </p>
      <Select
        aria-label="Usuario"
        label="Usuario"
        selectedKeys={userId === '' ? [] : [userId]}
        onSelectionChange={(keys) => setUserId(selectionValue(keys))}
      >
        {users.map((user) => (
          <SelectItem key={user.id} textValue={`${user.fullName} <${user.email}>`}>
            {`${user.fullName} <${user.email}>`}
          </SelectItem>
        ))}
      </Select>
      <Select
        aria-label="Rol"
        label="Rol"
        selectedKeys={role === '' ? [] : [role]}
        onSelectionChange={(keys) => {
          const value = selectionValue(keys);
          if (isUserRole(value)) {
            setRole(value);
          }
        }}
      >
        {availableRoles.map((item) => (
          <SelectItem key={item}>{item}</SelectItem>
        ))}
      </Select>
      {notice !== null ? <p role="status">{notice}</p> : null}
      {formError !== null ? <p role="alert">{formError}</p> : null}
      <Button
        color="primary"
        isDisabled={userId === '' || role === '' || status === 'loading'}
        isLoading={status === 'loading'}
        onPress={() => void onSubmit()}
      >
        Asignar rol
      </Button>
    </div>
  );
}
