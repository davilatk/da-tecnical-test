import { compactAuditQuery } from '../domain/audit-query';
import { formatCostUsd, formatDateTime, formatScore, parseQualityCheck } from '../domain/formatters';
import { anaUser } from './fixtures';
import {
  checkPasswordPolicy,
  diffUserUpdate,
  hasUserChanges,
  isUserRole,
  isValidEmail,
  validateAuditLimit,
  validateBoundedText,
  validateQuestion,
  validateTopK,
} from '../domain/validators';

describe('validadores y formateadores', () => {
  it('valida emails', () => {
    expect(isValidEmail('admin@toka.com')).toBe(true);
    expect(isValidEmail('  ana@toka.com ')).toBe(true);
    expect(isValidEmail('no-es-correo')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('aplica la política de contraseña de auth-service', () => {
    expect(checkPasswordPolicy('Password123!').valid).toBe(true);
    expect(checkPasswordPolicy('short').message).toContain('8 y 128');
    expect(checkPasswordPolicy('a'.repeat(129)).message).toContain('8 y 128');
    expect(checkPasswordPolicy('password123!').message).toContain('mayúscula');
    expect(checkPasswordPolicy('PASSWORD123!').message).toContain('minúscula');
    expect(checkPasswordPolicy('Password!!!!').message).toContain('dígito');
    expect(checkPasswordPolicy('Password123').message).toContain('no alfanumérico');
  });

  it('valida limit, topK, pregunta y textos acotados', () => {
    expect(validateAuditLimit(1)).toBe(true);
    expect(validateAuditLimit(100)).toBe(true);
    expect(validateAuditLimit(0)).toBe(false);
    expect(validateAuditLimit(101)).toBe(false);
    expect(validateAuditLimit(1.5)).toBe(false);
    expect(validateTopK(5)).toBe(true);
    expect(validateTopK(0)).toBe(false);
    expect(validateTopK(11)).toBe(false);
    expect(validateQuestion('  ')).toBe('La pregunta es obligatoria');
    expect(validateQuestion('a'.repeat(2001))).toBe('La pregunta admite hasta 2000 caracteres');
    expect(validateQuestion(' ¿Hola? ')).toBeNull();
    expect(validateBoundedText('  ', 1, 10)).toBe('empty');
    expect(validateBoundedText('demasiado-largo', 1, 5)).toBe('too-long');
    expect(validateBoundedText('ok', 1, 5)).toBeNull();
    expect(isUserRole('ADMIN')).toBe(true);
    expect(isUserRole('GUEST')).toBe(false);
  });

  it('compacta filtros vacíos de auditoría', () => {
    expect(compactAuditQuery({ actorId: '', limit: 50 })).toEqual({ limit: 50 });
    expect(compactAuditQuery({ eventType: 'user.created', actorId: 'usr_01', limit: 20 })).toEqual({
      eventType: 'user.created',
      actorId: 'usr_01',
      limit: 20,
    });
  });

  it('calcula solo los campos modificados de un usuario', () => {
    const unchanged = diffUserUpdate(anaUser, {
      fullName: anaUser.fullName,
      department: anaUser.department,
      status: anaUser.status,
    });
    expect(hasUserChanges(unchanged)).toBe(false);
    const changed = diffUserUpdate(anaUser, {
      fullName: 'Ana María Pérez',
      department: 'Platform',
      status: 'INACTIVE',
    });
    expect(changed).toEqual({
      fullName: 'Ana María Pérez',
      department: 'Platform',
      status: 'INACTIVE',
    });
  });

  it('formatea costo, fecha, score y checks', () => {
    expect(formatCostUsd(0.000603)).toBe('US$ 0.000603');
    expect(formatCostUsd(1)).toBe('US$ 1.000000');
    expect(formatDateTime('2026-10-21T17:24:00.000Z')).toBe('21/10/2026, 17:24');
    expect(formatScore(0.8123)).toBe('0.81');
    expect(parseQualityCheck('no_sensitive_data:fail')).toEqual({ id: 'no_sensitive_data', passed: false });
    expect(parseQualityCheck('answer_not_empty:pass')).toEqual({ id: 'answer_not_empty', passed: true });
    expect(parseQualityCheck('sin-sufijo')).toEqual({ id: 'sin-sufijo', passed: false });
  });
});
