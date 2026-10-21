import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ApiErrorBody,
  AssignRoleRequest,
  AuthUser,
  LoginRequest,
  LoginResponseData,
  RegisterRequest,
  UserRole,
  ValidateResponseData,
} from '../../domain/contracts';
import { toApiErrorBody } from '../api-client-error';
import type { AuthApiPort } from '../ports';
import type { RequestStatus } from '../request-status';
import { useAiAgentStore } from './ai-agent.store';
import { useAuditStore } from './audit.store';
import { useUserStore } from './user.store';

export interface AuthState {
  accessToken: string | null;
  tokenType: 'Bearer' | null;
  expiresAt: number | null;
  user: AuthUser | null;
  availableRoles: UserRole[];
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface AuthActions {
  login(req: LoginRequest): Promise<LoginResponseData>;
  register(req: RegisterRequest): Promise<AuthUser>;
  validateSession(): Promise<ValidateResponseData>;
  fetchRoles(): Promise<UserRole[]>;
  assignRole(req: AssignRoleRequest): Promise<AuthUser>;
  logout(): void;
  hasRole(...roles: UserRole[]): boolean;
  isAuthenticated(): boolean;
  clearError(): void;
}

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  accessToken: null,
  tokenType: null,
  expiresAt: null,
  user: null,
  availableRoles: [],
  status: 'idle',
  error: null,
};

let authPort: AuthApiPort | null = null;

export function bindAuthApi(port: AuthApiPort): void {
  authPort = port;
}

function getAuthApi(): AuthApiPort {
  if (!authPort) {
    throw new Error('AuthApiPort is not bound');
  }
  return authPort;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      async login(req) {
        set({ status: 'loading', error: null });
        try {
          const data = await getAuthApi().login(req);
          set({
            accessToken: data.accessToken,
            tokenType: data.tokenType,
            expiresAt: Date.now() + data.expiresIn * 1000,
            user: data.user,
            status: 'success',
            error: null,
          });
          return data;
        } catch (error) {
          set({ status: 'error', error: toApiErrorBody(error) });
          throw error;
        }
      },
      async register(req) {
        set({ status: 'loading', error: null });
        try {
          const user = await getAuthApi().register(req);
          set({ status: 'success', error: null });
          return user;
        } catch (error) {
          set({ status: 'error', error: toApiErrorBody(error) });
          throw error;
        }
      },
      async validateSession() {
        set({ status: 'loading', error: null });
        try {
          const data = await getAuthApi().validate();
          set({ user: data.user, status: 'success', error: null });
          return data;
        } catch (error) {
          set({ status: 'error', error: toApiErrorBody(error) });
          get().logout();
          throw error;
        }
      },
      async fetchRoles() {
        set({ status: 'loading', error: null });
        try {
          const availableRoles = await getAuthApi().listRoles();
          set({ availableRoles, status: 'success', error: null });
          return availableRoles;
        } catch (error) {
          set({ status: 'error', error: toApiErrorBody(error) });
          throw error;
        }
      },
      async assignRole(req) {
        set({ status: 'loading', error: null });
        try {
          const user = await getAuthApi().assignRole(req);
          set({ status: 'success', error: null });
          return user;
        } catch (error) {
          set({ status: 'error', error: toApiErrorBody(error) });
          throw error;
        }
      },
      logout() {
        set({ ...initialState });
        useUserStore.getState().reset();
        useAuditStore.getState().reset();
        useAiAgentStore.getState().reset();
        useAuthStore.persist.clearStorage();
      },
      hasRole(...roles) {
        const current = get().user?.roles ?? [];
        return roles.some((role) => current.includes(role));
      },
      isAuthenticated() {
        const { accessToken, expiresAt } = get();
        return accessToken !== null && expiresAt !== null && expiresAt > Date.now();
      },
      clearError() {
        set({ error: null });
      },
    }),
    {
      name: 'toka.auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        tokenType: state.tokenType,
        expiresAt: state.expiresAt,
        user: state.user,
      }),
    },
  ),
);
