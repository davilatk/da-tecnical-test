import type { UpdateUserRequest, User, UserRole, UserStatus } from './contracts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export interface PasswordPolicyResult {
  valid: boolean;
  message: string | null;
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < 8 || password.length > 128) {
    return {
      valid: false,
      message: 'La contraseña debe tener entre 8 y 128 caracteres',
    };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos una mayúscula' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos una minúscula' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos un dígito' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return {
      valid: false,
      message: 'La contraseña debe incluir al menos un carácter no alfanumérico',
    };
  }
  return { valid: true, message: null };
}

export function validateAuditLimit(limit: number): boolean {
  return Number.isInteger(limit) && limit >= 1 && limit <= 100;
}

export function validateTopK(topK: number): boolean {
  return Number.isInteger(topK) && topK >= 1 && topK <= 10;
}

export function validateQuestion(question: string): string | null {
  const trimmed = question.trim();
  if (trimmed.length < 1) {
    return 'La pregunta es obligatoria';
  }
  if (trimmed.length > 2000) {
    return 'La pregunta admite hasta 2000 caracteres';
  }
  return null;
}

export function validateBoundedText(
  value: string,
  min: number,
  max: number,
): 'empty' | 'too-long' | null {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return 'empty';
  }
  if (trimmed.length > max) {
    return 'too-long';
  }
  return null;
}

export function isUserRole(value: string): value is UserRole {
  return value === 'ADMIN' || value === 'USER' || value === 'AUDITOR';
}

export function isUserStatus(value: string): value is UserStatus {
  return value === 'ACTIVE' || value === 'INACTIVE';
}

export interface UserDraft {
  fullName: string;
  department: string;
  status: UserStatus;
}

export function diffUserUpdate(original: User, draft: UserDraft): UpdateUserRequest {
  const payload: UpdateUserRequest = {};
  if (draft.fullName !== original.fullName) {
    payload.fullName = draft.fullName;
  }
  if (draft.department !== original.department) {
    payload.department = draft.department;
  }
  if (draft.status !== original.status) {
    payload.status = draft.status;
  }
  return payload;
}

export function hasUserChanges(payload: UpdateUserRequest): boolean {
  return (
    payload.fullName !== undefined ||
    payload.department !== undefined ||
    payload.status !== undefined
  );
}
