import {
  Button,
  Checkbox,
  CheckboxGroup,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { useEffect, useState } from 'react';
import { ApiClientError } from '../../application/api-client-error';
import { useUserStore } from '../../application/stores/user.store';
import { USER_ROLES, USER_STATUSES } from '../../domain/constants';
import type { CreateUserRequest, User, UserRole, UserStatus } from '../../domain/contracts';
import { formatDateTime } from '../../domain/formatters';
import {
  checkPasswordPolicy,
  diffUserUpdate,
  hasUserChanges,
  isUserRole,
  isUserStatus,
  isValidEmail,
  validateBoundedText,
} from '../../domain/validators';
import { useAuthSession } from '../hooks/use-auth-session';
import { selectionValue } from '../selection';

export function UsersTab() {
  const { isAdmin } = useAuthSession();
  const users = useUserStore((state) => state.users);
  const status = useUserStore((state) => state.status);
  const error = useUserStore((state) => state.error);
  const fetchUsers = useUserStore((state) => state.fetchUsers);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="flex flex-col gap-4 py-4">
      {isAdmin ? (
        <div>
          <Button color="primary" onPress={() => setCreating(true)}>
            Nuevo usuario
          </Button>
        </div>
      ) : null}
      {error !== null ? <p role="alert">{error.message}</p> : null}
      {status === 'loading' && users.length === 0 ? (
        <Spinner label="Cargando" />
      ) : (
        <Table aria-label="Usuarios">
          <TableHeader>
            <TableColumn>Nombre</TableColumn>
            <TableColumn>Email</TableColumn>
            <TableColumn>Departamento</TableColumn>
            <TableColumn>Estado</TableColumn>
            <TableColumn>Roles</TableColumn>
            <TableColumn>Creado</TableColumn>
            <TableColumn>Acciones</TableColumn>
          </TableHeader>
          <TableBody emptyContent="No hay usuarios registrados">
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.fullName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.department}</TableCell>
                <TableCell>
                  <Chip color={user.status === 'ACTIVE' ? 'success' : 'default'} variant="flat">
                    {user.status}
                  </Chip>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Chip key={role} variant="bordered">
                        {role}
                      </Chip>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="flat" onPress={() => setEditing(user)}>
                        Editar
                      </Button>
                      <Button size="sm" color="danger" variant="flat" onPress={() => setDeleting(user)}>
                        Eliminar
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CreateUserModal isOpen={creating} onClose={() => setCreating(false)} />
      <EditUserModal user={editing} onClose={() => setEditing(null)} />
      <DeleteUserModal user={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function CreateUserModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createUser = useUserStore((state) => state.createUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [roles, setRoles] = useState<UserRole[]>(['USER']);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setEmail('');
    setPassword('');
    setFullName('');
    setDepartment('');
    setRoles(['USER']);
    setEmailError(null);
    setPasswordError(null);
    setFullNameError(null);
    setDepartmentError(null);
    setRolesError(null);
    setFormError(null);
  }, [isOpen]);

  async function onSubmit(): Promise<void> {
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();
    const trimmedDepartment = department.trim();
    const nextEmailError =
      trimmedEmail.length === 0
        ? 'El correo es obligatorio'
        : !isValidEmail(trimmedEmail)
          ? 'Ingresa un correo válido'
          : null;
    const policy = checkPasswordPolicy(password);
    const nameState = validateBoundedText(trimmedName, 1, 200);
    const departmentState = validateBoundedText(trimmedDepartment, 1, 100);
    const nextNameError =
      nameState === 'empty'
        ? 'El nombre es obligatorio'
        : nameState === 'too-long'
          ? 'El nombre admite hasta 200 caracteres'
          : null;
    const nextDepartmentError =
      departmentState === 'empty'
        ? 'El departamento es obligatorio'
        : departmentState === 'too-long'
          ? 'El departamento admite hasta 100 caracteres'
          : null;
    const nextRolesError = roles.length === 0 ? 'Selecciona al menos un rol' : null;
    setEmailError(nextEmailError);
    setPasswordError(policy.message);
    setFullNameError(nextNameError);
    setDepartmentError(nextDepartmentError);
    setRolesError(nextRolesError);
    setFormError(null);
    if (
      nextEmailError !== null ||
      !policy.valid ||
      nextNameError !== null ||
      nextDepartmentError !== null ||
      nextRolesError !== null
    ) {
      return;
    }
    const payload: CreateUserRequest = {
      email: trimmedEmail,
      password,
      fullName: trimmedName,
      department: trimmedDepartment,
      roles,
    };
    setSubmitting(true);
    try {
      await createUser(payload);
      onClose();
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 409 &&
        error.body.code === 'EMAIL_ALREADY_REGISTERED'
      ) {
        setEmailError(error.body.message);
        return;
      }
      if (error instanceof ApiClientError) {
        setFormError(error.body.message);
        return;
      }
      setFormError('Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent>
        <ModalHeader>Nuevo usuario</ModalHeader>
        <ModalBody className="gap-3">
          <Input
            type="email"
            label="Correo"
            value={email}
            onValueChange={setEmail}
            isInvalid={emailError !== null}
            {...(emailError !== null ? { errorMessage: emailError } : {})}
          />
          <Input
            type="password"
            label="Contraseña"
            value={password}
            onValueChange={setPassword}
            isInvalid={passwordError !== null}
            {...(passwordError !== null ? { errorMessage: passwordError } : {})}
          />
          <Input
            label="Nombre completo"
            value={fullName}
            onValueChange={setFullName}
            isInvalid={fullNameError !== null}
            {...(fullNameError !== null ? { errorMessage: fullNameError } : {})}
          />
          <Input
            label="Departamento"
            value={department}
            onValueChange={setDepartment}
            isInvalid={departmentError !== null}
            {...(departmentError !== null ? { errorMessage: departmentError } : {})}
          />
          <CheckboxGroup
            label="Roles"
            value={roles}
            onValueChange={(value) => setRoles(value.filter(isUserRole))}
            isInvalid={rolesError !== null}
            {...(rolesError !== null ? { errorMessage: rolesError } : {})}
          >
            {USER_ROLES.map((role) => (
              <Checkbox key={role} value={role}>
                {role}
              </Checkbox>
            ))}
          </CheckboxGroup>
          {formError !== null ? <p role="alert">{formError}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button color="primary" isLoading={submitting} isDisabled={submitting} onPress={() => void onSubmit()}>
            Crear usuario
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const updateUser = useUserStore((state) => state.updateUser);
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user === null) {
      return;
    }
    setFullName(user.fullName);
    setDepartment(user.department);
    setStatus(user.status);
    setFullNameError(null);
    setDepartmentError(null);
    setFormError(null);
  }, [user]);

  const draft = user === null ? null : diffUserUpdate(user, { fullName: fullName.trim(), department: department.trim(), status });
  const changed = draft !== null && hasUserChanges(draft);

  async function onSubmit(): Promise<void> {
    if (user === null || draft === null) {
      return;
    }
    const nameState = validateBoundedText(fullName, 1, 200);
    const departmentState = validateBoundedText(department, 1, 100);
    const nextNameError =
      nameState === 'empty'
        ? 'El nombre es obligatorio'
        : nameState === 'too-long'
          ? 'El nombre admite hasta 200 caracteres'
          : null;
    const nextDepartmentError =
      departmentState === 'empty'
        ? 'El departamento es obligatorio'
        : departmentState === 'too-long'
          ? 'El departamento admite hasta 100 caracteres'
          : null;
    setFullNameError(nextNameError);
    setDepartmentError(nextDepartmentError);
    if (nextNameError !== null || nextDepartmentError !== null || !hasUserChanges(draft)) {
      return;
    }
    setSubmitting(true);
    try {
      await updateUser(user.id, draft);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.body.message);
        return;
      }
      setFormError('Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={user !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent>
        <ModalHeader>Editar usuario</ModalHeader>
        <ModalBody className="gap-3">
          <Input
            label="Nombre completo"
            value={fullName}
            onValueChange={setFullName}
            isInvalid={fullNameError !== null}
            {...(fullNameError !== null ? { errorMessage: fullNameError } : {})}
          />
          <Input
            label="Departamento"
            value={department}
            onValueChange={setDepartment}
            isInvalid={departmentError !== null}
            {...(departmentError !== null ? { errorMessage: departmentError } : {})}
          />
          <Select
            aria-label="Estado"
            label="Estado"
            selectedKeys={[status]}
            onSelectionChange={(keys) => {
              const value = selectionValue(keys);
              if (isUserStatus(value)) {
                setStatus(value);
              }
            }}
          >
            {USER_STATUSES.map((item) => (
              <SelectItem key={item}>{item}</SelectItem>
            ))}
          </Select>
          {formError !== null ? <p role="alert">{formError}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="primary"
            isDisabled={!changed || submitting}
            isLoading={submitting}
            onPress={() => void onSubmit()}
          >
            Guardar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function DeleteUserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const deleteUser = useUserStore((state) => state.deleteUser);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    if (user === null) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await deleteUser(user.id);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.body.message);
        return;
      }
      setFormError('Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={user !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent>
        <ModalHeader>Eliminar usuario</ModalHeader>
        <ModalBody>
          <p>{user === null ? '' : `¿Eliminar a ${user.fullName}?`}</p>
          {formError !== null ? <p role="alert">{formError}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button color="danger" isLoading={submitting} isDisabled={submitting} onPress={() => void onConfirm()}>
            Eliminar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
