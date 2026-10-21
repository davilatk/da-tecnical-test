import { create } from 'zustand';
import { compactAuditQuery } from '../../domain/audit-query';
import type { ApiErrorBody, AuditListData, AuditLog, AuditQuery, AuditStats } from '../../domain/contracts';
import { toApiErrorBody } from '../api-client-error';
import type { AuditApiPort } from '../ports';
import type { RequestStatus } from '../request-status';

export interface AuditState {
  items: AuditLog[];
  limit: number;
  query: AuditQuery;
  stats: AuditStats | null;
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface AuditActions {
  fetchAudits(query?: AuditQuery): Promise<AuditListData>;
  fetchStats(): Promise<AuditStats>;
  setQuery(query: AuditQuery): void;
  resetQuery(): void;
  reset(): void;
}

export type AuditStore = AuditState & AuditActions;

const initialQuery: AuditQuery = { limit: 50 };

const initialState: AuditState = {
  items: [],
  limit: 50,
  query: initialQuery,
  stats: null,
  status: 'idle',
  error: null,
};

let auditPort: AuditApiPort | null = null;

export function bindAuditApi(port: AuditApiPort): void {
  auditPort = port;
}

function getAuditApi(): AuditApiPort {
  if (!auditPort) {
    throw new Error('AuditApiPort is not bound');
  }
  return auditPort;
}

export const useAuditStore = create<AuditStore>()((set, get) => ({
  ...initialState,
  async fetchAudits(query) {
    const requested = compactAuditQuery(query ?? get().query);
    set({ status: 'loading', error: null, query: requested });
    try {
      const data = await getAuditApi().list(requested);
      set({ items: data.items, limit: data.limit, status: 'success', error: null });
      return data;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  async fetchStats() {
    set({ status: 'loading', error: null });
    try {
      const stats = await getAuditApi().stats();
      set({ stats, status: 'success', error: null });
      return stats;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  setQuery(query) {
    set({ query: compactAuditQuery(query) });
  },
  resetQuery() {
    set({ query: { limit: 50 } });
  },
  reset() {
    set({
      items: [],
      limit: 50,
      query: { limit: 50 },
      stats: null,
      status: 'idle',
      error: null,
    });
  },
}));
