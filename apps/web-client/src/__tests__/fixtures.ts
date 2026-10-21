import type {
  AskResponseData,
  AuditLog,
  AuditStats,
  AuthUser,
  IngestResponseData,
  LoginResponseData,
  User,
} from '../domain/contracts';

export const adminUser: AuthUser = {
  id: 'usr_admin',
  email: 'admin@toka.com',
  roles: ['ADMIN'],
};

export const plainUser: AuthUser = {
  id: 'usr_user',
  email: 'user@toka.com',
  roles: ['USER'],
};

export const auditorUser: AuthUser = {
  id: 'usr_auditor',
  email: 'auditor@toka.com',
  roles: ['AUDITOR'],
};

export const anaUser: User = {
  id: 'usr_ana',
  email: 'ana@toka.com',
  fullName: 'Ana Pérez',
  department: 'Engineering',
  status: 'ACTIVE',
  roles: ['USER'],
  createdAt: '2026-10-21T17:24:00.000Z',
  updatedAt: '2026-10-21T17:24:00.000Z',
};

export const loginResponse: LoginResponseData = {
  accessToken: 'token-test',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: adminUser,
};

export const auditStats: AuditStats = {
  total: 15,
  byEventType: {
    'auth.user.logged_in': 4,
    'auth.role.assigned': 1,
    'user.created': 5,
    'user.updated': 3,
    'user.deleted': 2,
  },
};

export const auditItem: AuditLog = {
  eventId: 'evt_b',
  eventType: 'user.created',
  occurredAt: '2026-10-21T17:24:00.000Z',
  actorId: 'usr_admin',
  targetId: 'usr_ana',
  serviceSource: 'user-service',
  payload: {
    email: 'ana@toka.com',
    fullName: 'Ana Pérez',
  },
  createdAt: '2026-10-21T17:24:01.000Z',
};

export const laterAuditItem: AuditLog = {
  eventId: 'evt_a',
  eventType: 'user.updated',
  occurredAt: '2026-10-21T18:00:00.000Z',
  actorId: 'usr_admin',
  targetId: 'usr_ana',
  serviceSource: 'user-service',
  payload: { department: 'Platform' },
  createdAt: '2026-10-21T18:00:01.000Z',
};

export const askResponse: AskResponseData = {
  answer: 'Ana Pérez está activa en Engineering.',
  sources: [
    { title: 'Flujo de alta de usuarios', source: 'knowledge/user-onboarding.md', score: 0.8123 },
    { title: 'Directorio de usuarios (tiempo real)', source: 'user-service:GET /users', score: 1 },
  ],
  metrics: {
    latency_ms: 842,
    tokens: { prompt_tokens: 1210, completion_tokens: 96, total_tokens: 1306 },
    estimated_cost_usd: 0.000603,
    quality_validation: {
      passed: true,
      score: 1,
      checks: [
        'answer_not_empty:pass',
        'sources_present:pass',
        'grounded_in_context:pass',
        'no_sensitive_data:fail',
        'within_length_limit:pass',
      ],
    },
  },
};

export const ingestResponse: IngestResponseData = {
  collection: 'toka_knowledge',
  embeddingModel: 'gemini-embedding-001',
  documentsIngested: 1,
  chunksIndexed: 3,
  documents: [{ title: 'Política de roles', source: 'knowledge/roles-policy.md', chunks: 3 }],
};
