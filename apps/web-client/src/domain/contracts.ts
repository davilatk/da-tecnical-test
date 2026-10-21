export type UserRole = 'ADMIN' | 'USER' | 'AUDITOR';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type EventType =
  | 'auth.user.logged_in'
  | 'auth.role.assigned'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted';
export type ServiceSource = 'auth-service' | 'user-service';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  traceId: string;
}
export interface ApiErrorDetail {
  field: string | null;
  message: string;
}
export interface ApiErrorBody {
  code: string;
  message: string;
  details: ApiErrorDetail[];
}
export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  traceId: string;
}

export interface AuthUser {
  id: string;
  email: string;
  roles: UserRole[];
}
export interface RegisterRequest {
  email: string;
  password: string;
  roles?: UserRole[];
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponseData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}
export interface ValidateResponseData {
  valid: true;
  user: AuthUser;
}
export interface AssignRoleRequest {
  userId: string;
  role: UserRole;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  department: string;
  status: UserStatus;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  department: string;
  roles?: UserRole[];
}
export interface UpdateUserRequest {
  fullName?: string;
  department?: string;
  status?: UserStatus;
}

export interface AuditLog {
  eventId: string;
  eventType: EventType;
  occurredAt: string;
  actorId: string;
  targetId: string;
  serviceSource: ServiceSource;
  payload: Record<string, unknown>;
  createdAt: string;
}
export interface AuditQuery {
  eventType?: EventType;
  actorId?: string;
  limit?: number;
}
export interface AuditListData {
  items: AuditLog[];
  limit: number;
}
export interface AuditStats {
  total: number;
  byEventType: Record<EventType, number>;
}

export interface IngestDocument {
  title: string;
  source: string;
  content: string;
}
export interface IngestRequest {
  documents: IngestDocument[];
}
export interface IngestResponseData {
  collection: 'toka_knowledge';
  embeddingModel: 'gemini-embedding-001' | 'local-hash-768';
  documentsIngested: number;
  chunksIndexed: number;
  documents: Array<{ title: string; source: string; chunks: number }>;
}
export interface AskRequest {
  question: string;
  topK?: number;
  includeLiveData?: boolean;
}
export interface AskSource {
  title: string;
  source: string;
  score: number;
}
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
export interface QualityValidation {
  passed: boolean;
  score: number;
  checks: string[];
}
export interface AskMetrics {
  latency_ms: number;
  tokens: TokenUsage;
  estimated_cost_usd: number;
  quality_validation: QualityValidation;
}
export interface AskResponseData {
  answer: string;
  sources: AskSource[];
  metrics: AskMetrics;
}
