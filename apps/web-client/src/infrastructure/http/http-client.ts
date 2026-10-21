import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ApiClientError } from '../../application/api-client-error';
import { useAuthStore } from '../../application/stores/auth.store';
import type { ApiErrorBody, ApiFailure } from '../../domain/contracts';
import { logger } from '../logger';
import { browserNavigation } from '../navigation';
import { createTraceId } from '../trace-id';

export const httpClient = axios.create({
  baseURL: '',
  timeout: 20000,
});

function isApiFailure(value: unknown): value is ApiFailure {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record['success'] !== false || typeof record['traceId'] !== 'string') {
    return false;
  }
  const error = record['error'];
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const body = error as Record<string, unknown>;
  return typeof body['code'] === 'string' && typeof body['message'] === 'string' && Array.isArray(body['details']);
}

function isLoginRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  if (!config) {
    return false;
  }
  const method = (config.method ?? 'get').toLowerCase();
  const url = config.url ?? '';
  return method === 'post' && (url === '/auth/login' || url.endsWith('/auth/login'));
}

function readTraceId(config: InternalAxiosRequestConfig | undefined): string {
  const header = config?.headers.get('X-Trace-Id');
  return typeof header === 'string' && header.length > 0 ? header : createTraceId();
}

function networkError(traceId: string): ApiClientError {
  const body: ApiErrorBody = {
    code: 'NETWORK_ERROR',
    message: 'No fue posible contactar al servicio',
    details: [],
  };
  return new ApiClientError(0, body, traceId);
}

httpClient.interceptors.request.use((config) => {
  const traceId = createTraceId();
  config.headers.set('X-Trace-Id', traceId);
  if (useAuthStore.getState().isAuthenticated()) {
    const token = useAuthStore.getState().accessToken;
    if (token !== null) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => {
    if (isApiFailure(response.data)) {
      const failure = response.data;
      logger.error(failure.traceId, 'http request failed', {
        status: response.status,
        code: failure.error.code,
        path: response.config.url ?? '',
      });
      return Promise.reject(new ApiClientError(response.status, failure.error, failure.traceId));
    }
    return response;
  },
  (error: AxiosError) => {
    const traceId = readTraceId(error.config);
    const status = error.response?.status ?? 0;
    if (status === 401 && !isLoginRequest(error.config)) {
      useAuthStore.getState().logout();
      if (browserNavigation.currentPath() !== '/login') {
        browserNavigation.redirectTo('/login');
      }
    }
    if (isApiFailure(error.response?.data)) {
      const failure = error.response.data;
      logger.error(failure.traceId, 'http request failed', {
        status,
        code: failure.error.code,
        path: error.config?.url ?? '',
      });
      return Promise.reject(new ApiClientError(status, failure.error, failure.traceId));
    }
    if (!error.response) {
      logger.error(traceId, 'http request failed', {
        status: 0,
        code: 'NETWORK_ERROR',
        path: error.config?.url ?? '',
      });
      return Promise.reject(networkError(traceId));
    }
    const body: ApiErrorBody = {
      code: 'UNKNOWN_ERROR',
      message: 'Respuesta no reconocida',
      details: [],
    };
    logger.error(traceId, 'http request failed', {
      status,
      code: body.code,
      path: error.config?.url ?? '',
    });
    return Promise.reject(new ApiClientError(status, body, traceId));
  },
);
