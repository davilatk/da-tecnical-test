import type {
  AskRequest,
  AskResponseData,
  AssignRoleRequest,
  AuditListData,
  AuditQuery,
  AuditStats,
  AuthUser,
  CreateUserRequest,
  IngestRequest,
  IngestResponseData,
  LoginRequest,
  LoginResponseData,
  RegisterRequest,
  UpdateUserRequest,
  User,
  UserRole,
  ValidateResponseData,
} from '../domain/contracts';

export interface AuthApiPort {
  register(req: RegisterRequest): Promise<AuthUser>;
  login(req: LoginRequest): Promise<LoginResponseData>;
  validate(): Promise<ValidateResponseData>;
  listRoles(): Promise<UserRole[]>;
  assignRole(req: AssignRoleRequest): Promise<AuthUser>;
}

export interface UserApiPort {
  list(): Promise<User[]>;
  getById(id: string): Promise<User>;
  create(req: CreateUserRequest): Promise<User>;
  update(id: string, req: UpdateUserRequest): Promise<User>;
  remove(id: string): Promise<void>;
}

export interface AuditApiPort {
  list(query?: AuditQuery): Promise<AuditListData>;
  stats(): Promise<AuditStats>;
}

export interface AiAgentApiPort {
  ingest(req: IngestRequest): Promise<IngestResponseData>;
  ask(req: AskRequest): Promise<AskResponseData>;
}
