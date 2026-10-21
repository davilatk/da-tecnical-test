import type { UserRole } from '@toka/shared';
import { DomainInvariantError } from '../domain/domain-invariant.error.js';
import {
  EMPTY_UPDATE_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  isPlainObject,
  parseDepartment,
  parseEmail,
  parseFullName,
  parsePassword,
  parseRoles,
  parseStatus,
  parseUpdateBody,
  parseUserId,
} from '../domain/input-rules.js';
import { USERS_LIST_CACHE_KEY, USER_CACHE_TTL_SECONDS, userCacheKey } from '../domain/cache-keys.js';
import { User } from '../domain/user.js';
import { NOW, USER_ID } from './fakes.js';

describe('User entity', () => {
  it('persists every contractual field, including UTC timestamps and roles', () => {
    const user = User.create({
      id: `  ${USER_ID} `,
      email: '  Ana@Toka.com ',
      fullName: '  Ana Pérez  ',
      department: ' Engineering ',
      status: 'ACTIVE',
      roles: ['USER', 'AUDITOR'],
      now: NOW,
    });

    expect(user.toView()).toEqual({
      id: USER_ID,
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE',
      roles: ['USER', 'AUDITOR'],
      createdAt: '2026-10-21T17:24:00.000Z',
      updatedAt: '2026-10-21T17:24:00.000Z',
    });
    const roles = user.roles as UserRole[];
    roles.push('ADMIN');
    expect(user.roles).toEqual(['USER', 'AUDITOR']);
    expect(user.toView().roles).toEqual(['USER', 'AUDITOR']);
  });

  it('rehydrates a stored row and updates only the allowed profile fields', () => {
    const stored = User.rehydrate({
      id: USER_ID,
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const later = new Date('2026-10-21T18:00:00.000Z');
    const updated = stored.update({ fullName: 'Ana María Pérez', department: 'Platform', status: 'INACTIVE', at: later });

    expect(updated.toView()).toEqual({
      id: USER_ID,
      email: 'ana@toka.com',
      fullName: 'Ana María Pérez',
      department: 'Platform',
      status: 'INACTIVE',
      roles: ['ADMIN'],
      createdAt: NOW.toISOString(),
      updatedAt: later.toISOString(),
    });
    expect(stored.update({ at: later }).toView().fullName).toBe('Ana Pérez');
  });

  it('rejects values that break the entity constraints', () => {
    const valid = {
      id: USER_ID,
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE' as const,
      roles: ['USER'] as const,
      now: NOW,
    };
    expect(() => User.create({ ...valid, id: '   ' })).toThrow(DomainInvariantError);
    expect(() => User.create({ ...valid, email: 'not-an-email' })).toThrow(DomainInvariantError);
    expect(() => User.create({ ...valid, fullName: ' ' })).toThrow(DomainInvariantError);
    expect(() => User.create({ ...valid, department: '' })).toThrow(DomainInvariantError);
    expect(() => User.create({ ...valid, status: 'ACTIVE', roles: [] })).toThrow(DomainInvariantError);
    expect(() => User.create({ ...valid, roles: ['USER', 'USER'] })).toThrow(DomainInvariantError);
    expect(() => User.create({ ...valid, now: new Date(Number.NaN) })).toThrow(DomainInvariantError);
    expect(() =>
      User.rehydrate({
        id: USER_ID,
        email: 'ana@toka.com',
        fullName: 'Ana Pérez',
        department: 'Engineering',
        status: 'PAUSED',
        roles: ['USER'],
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).toThrow(DomainInvariantError);
    expect(() =>
      User.rehydrate({
        id: USER_ID,
        email: 'ana@toka.com',
        fullName: 'Ana Pérez',
        department: 'Engineering',
        status: 'ACTIVE',
        roles: ['ROOT'],
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).toThrow(DomainInvariantError);
    expect(() =>
      User.rehydrate({
        id: USER_ID,
        email: 'ana@toka.com',
        fullName: 'Ana Pérez',
        department: 'Engineering',
        status: 'ACTIVE',
        roles: ['USER'],
        createdAt: NOW,
        updatedAt: new Date(Number.NaN),
      }),
    ).toThrow(DomainInvariantError);
    const user = User.create(valid);
    expect(() => user.update({ fullName: 'x'.repeat(201), at: NOW })).toThrow(DomainInvariantError);
    expect(() => user.update({ at: new Date(Number.NaN) })).toThrow(DomainInvariantError);
  });
});

describe('user input rules', () => {
  it('normalizes email and enforces the shared password and role policy', () => {
    expect(parseEmail('  ANA@toka.com ')).toEqual({ ok: true, value: 'ana@toka.com' });
    expect(parseEmail(1).ok).toBe(false);
    expect(parseEmail('   ').ok).toBe(false);
    expect(parseEmail('not-an-email').ok).toBe(false);
    expect(parseEmail(`${'a'.repeat(246)}@toka.com`).ok).toBe(false);

    expect(parsePassword('Password123!')).toEqual({ ok: true, value: 'Password123!' });
    expect(parsePassword(`Aa1!${'a'.repeat(124)}`).ok).toBe(true);
    expect(parsePassword(null).ok).toBe(false);
    expect(parsePassword('short').ok).toBe(false);
    expect(parsePassword(`Aa1!${'a'.repeat(125)}`).ok).toBe(false);
    expect(parsePassword('password1!').ok).toBe(false);
    expect(parsePassword('PASSWORD1!').ok).toBe(false);
    expect(parsePassword('Password!').ok).toBe(false);
    expect(parsePassword('Password1').ok).toBe(false);

    expect(parseRoles(['AUDITOR', 'USER'])).toEqual({ ok: true, value: ['AUDITOR', 'USER'] });
    expect(parseRoles('USER').ok).toBe(false);
    expect(parseRoles([]).ok).toBe(false);
    expect(parseRoles(['USER', 'USER']).ok).toBe(false);
    expect(parseRoles(['ROOT']).ok).toBe(false);
    expect(parseRoles([1]).ok).toBe(false);
  });

  it('bounds profile fields and rejects empty or unknown patch bodies', () => {
    expect(parseFullName('  Ana Pérez  ')).toEqual({ ok: true, value: 'Ana Pérez' });
    expect(parseFullName(1).ok).toBe(false);
    expect(parseFullName('   ').ok).toBe(false);
    expect(parseFullName('a'.repeat(201)).ok).toBe(false);
    expect(parseDepartment(' Platform ').ok).toBe(true);
    expect(parseDepartment(false).ok).toBe(false);
    expect(parseDepartment(' ').ok).toBe(false);
    expect(parseDepartment('d'.repeat(101)).ok).toBe(false);
    expect(parseStatus('INACTIVE')).toEqual({ ok: true, value: 'INACTIVE' });
    expect(parseStatus('active').ok).toBe(false);
    expect(parseStatus(1).ok).toBe(false);
    expect(parseUserId('  usr_1 ')).toEqual({ ok: true, value: 'usr_1' });
    expect(parseUserId('   ').ok).toBe(false);
    expect(parseUserId(1).ok).toBe(false);

    expect(parseUpdateBody(null)).toEqual({ ok: false, violations: [{ field: null, message: EMPTY_UPDATE_MESSAGE }] });
    expect(parseUpdateBody([])).toMatchObject({ ok: false });
    expect(parseUpdateBody({})).toEqual({ ok: false, violations: [{ field: null, message: EMPTY_UPDATE_MESSAGE }] });
    expect(parseUpdateBody({ email: 'ana@toka.com', fullName: ' ' })).toEqual({
      ok: false,
      violations: [
        { field: 'email', message: NOT_ALLOWED_MESSAGE },
        { field: 'fullName', message: 'must contain between 1 and 200 characters' },
      ],
    });
    expect(parseUpdateBody({ status: 'ACTIVE', fullName: 'Ana María Pérez' })).toEqual({
      ok: true,
      value: { fullName: 'Ana María Pérez', status: 'ACTIVE', changedFields: ['fullName', 'status'] },
    });
    expect(parseUpdateBody({ department: 'Platform' })).toEqual({
      ok: true,
      value: { department: 'Platform', changedFields: ['department'] },
    });
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(['department'])).toBe(false);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(new Date())).toBe(false);
    expect(USERS_LIST_CACHE_KEY).toBe('users:all');
    expect(USER_CACHE_TTL_SECONDS).toBe(60);
    expect(userCacheKey(USER_ID)).toBe(`users:id:${USER_ID}`);
  });
});
