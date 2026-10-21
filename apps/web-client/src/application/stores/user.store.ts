import { create } from 'zustand';
import type { ApiErrorBody, CreateUserRequest, UpdateUserRequest, User } from '../../domain/contracts';
import { toApiErrorBody } from '../api-client-error';
import type { UserApiPort } from '../ports';
import type { RequestStatus } from '../request-status';

export interface UserState {
  users: User[];
  selectedUser: User | null;
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface UserActions {
  fetchUsers(): Promise<User[]>;
  fetchUserById(id: string): Promise<User>;
  createUser(req: CreateUserRequest): Promise<User>;
  updateUser(id: string, req: UpdateUserRequest): Promise<User>;
  deleteUser(id: string): Promise<void>;
  selectUser(user: User | null): void;
  reset(): void;
}

export type UserStore = UserState & UserActions;

const initialState: UserState = {
  users: [],
  selectedUser: null,
  status: 'idle',
  error: null,
};

let userPort: UserApiPort | null = null;

export function bindUserApi(port: UserApiPort): void {
  userPort = port;
}

function getUserApi(): UserApiPort {
  if (!userPort) {
    throw new Error('UserApiPort is not bound');
  }
  return userPort;
}

export const useUserStore = create<UserStore>()((set, get) => ({
  ...initialState,
  async fetchUsers() {
    set({ status: 'loading', error: null });
    try {
      const users = await getUserApi().list();
      set({ users, status: 'success', error: null });
      return users;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  async fetchUserById(id) {
    set({ status: 'loading', error: null });
    try {
      const user = await getUserApi().getById(id);
      set({ selectedUser: user, status: 'success', error: null });
      return user;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  async createUser(req) {
    set({ status: 'loading', error: null });
    try {
      const user = await getUserApi().create(req);
      set({ users: [...get().users, user], status: 'success', error: null });
      return user;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  async updateUser(id, req) {
    set({ status: 'loading', error: null });
    try {
      const user = await getUserApi().update(id, req);
      set({
        users: get().users.map((item) => (item.id === id ? user : item)),
        selectedUser: get().selectedUser?.id === id ? user : get().selectedUser,
        status: 'success',
        error: null,
      });
      return user;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  async deleteUser(id) {
    set({ status: 'loading', error: null });
    try {
      await getUserApi().remove(id);
      set({
        users: get().users.filter((item) => item.id !== id),
        selectedUser: get().selectedUser?.id === id ? null : get().selectedUser,
        status: 'success',
        error: null,
      });
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  selectUser(user) {
    set({ selectedUser: user });
  },
  reset() {
    set({ ...initialState });
  },
}));
