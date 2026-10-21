import { AuthCredential } from '../domain/auth-credential.js';
import { DomainInvariantError } from '../domain/domain-invariant.error.js';
import {
  parseEmail,
  parseLoginPassword,
  parsePassword,
  parseRole,
  parseRoles,
  parseUserId,
  sortRoles,
} from '../domain/input-rules.js';
import { blacklistKey, normalizeBlacklistTtl, remainingTokenLifeSeconds } from '../domain/token-policy.js';
import { validationError } from '../application/application-error.js';
import { NOW, USER_ID } from './fakes.js';

const HASH = 'hash-1';

describe('credential input rules', () => {
  it('normalizes a valid email and rejects malformed values', () => {
    expect(parseEmail('  Ana@Toka.com ')).toEqual({ ok: true, value: 'ana@toka.com' });
    expect(parseEmail('not-an-email').ok).toBe(false);
    expect(parseEmail(12).ok).toBe(false);
    expect(parseEmail(`${'a'.repeat(250)}@toka.com`).ok).toBe(false);
    expect(parseEmail('   ').ok).toBe(false);
  });

  it('enforces the shared password policy', () => {
    expect(parsePassword('Password123!')).toEqual({ ok: true, value: 'Password123!' });
    expect(parsePassword('Admin123!').ok).toBe(true);
    expect(parsePassword(`Aa1!${'b'.repeat(124)}`).ok).toBe(true);
    for (const invalid of ['short1!', 'password123!', 'PASSWORD123!', 'Password!!!', 'Password123', 'A'.repeat(129), 8]) {
      expect(parsePassword(invalid).ok).toBe(false);
    }
  });

  it('accepts any non-empty login password without applying the registration policy', () => {
    expect(parseLoginPassword('short')).toEqual({ ok: true, value: 'short' });
    expect(parseLoginPassword('').ok).toBe(false);
    expect(parseLoginPassword(null).ok).toBe(false);
  });

  it('accepts unique contractual roles and rejects duplicates or unknown values', () => {
    expect(parseRoles(['USER', 'AUDITOR'])).toEqual({ ok: true, value: ['USER', 'AUDITOR'] });
    expect(parseRoles([]).ok).toBe(false);
    expect(parseRoles(['USER', 'USER']).ok).toBe(false);
    expect(parseRoles(['admin']).ok).toBe(false);
    expect(parseRoles('USER').ok).toBe(false);
    expect(parseRole('AUDITOR')).toEqual({ ok: true, value: 'AUDITOR' });
    expect(parseRole('ROOT').ok).toBe(false);
    expect(parseUserId('  usr  ')).toEqual({ ok: true, value: 'usr' });
    expect(parseUserId('   ').ok).toBe(false);
    expect(sortRoles(['USER', 'AUDITOR', 'ADMIN'])).toEqual(['ADMIN', 'USER', 'AUDITOR']);
  });

  it('keeps the password hash out of the public credential and assigns a role once', () => {
    const created = AuthCredential.create({
      id: USER_ID,
      email: 'ANA@toka.com',
      passwordHash: HASH,
      roles: ['USER'],
      now: NOW,
    });
    expect(created.email).toBe('ana@toka.com');
    expect(Object.keys(created.toAuthUser()).sort()).toEqual(['email', 'id', 'roles']);
    expect(JSON.stringify(created.toAuthUser())).not.toContain(HASH);

    const same = created.assignRole('USER', new Date(NOW.getTime() + 1000));
    expect(same.changed).toBe(false);
    expect(same.credential).toBe(created);

    const changed = created.assignRole('AUDITOR', new Date(NOW.getTime() + 1000));
    expect(changed.changed).toBe(true);
    expect(changed.credential.roles).toEqual(['USER', 'AUDITOR']);
    expect(changed.credential.updatedAt.toISOString()).toBe('2026-10-21T17:24:01.000Z');
    expect(created.roles).toEqual(['USER']);
  });

  it('rejects credentials that break stored invariants', () => {
    const invalid: Array<() => unknown> = [
      () => AuthCredential.create({ id: 'usr_01', email: 'ana@toka.com', passwordHash: HASH, roles: ['USER'], now: NOW }),
      () => AuthCredential.create({ id: USER_ID, email: 'bad', passwordHash: HASH, roles: ['USER'], now: NOW }),
      () => AuthCredential.create({ id: USER_ID, email: 'ana@toka.com', passwordHash: ' ', roles: ['USER'], now: NOW }),
      () => AuthCredential.create({ id: USER_ID, email: 'ana@toka.com', passwordHash: 'h'.repeat(256), roles: ['USER'], now: NOW }),
      () => AuthCredential.create({ id: USER_ID, email: 'ana@toka.com', passwordHash: HASH, roles: [], now: NOW }),
      () => AuthCredential.create({ id: USER_ID, email: 'ana@toka.com', passwordHash: HASH, roles: ['USER', 'USER'], now: NOW }),
      () =>
        AuthCredential.create({
          id: USER_ID,
          email: 'ana@toka.com',
          passwordHash: HASH,
          roles: ['USER'],
          now: new Date('invalid'),
        }),
      () =>
        AuthCredential.rehydrate({
          id: USER_ID,
          email: 'ana@toka.com',
          passwordHash: HASH,
          roles: ['ROOT'],
          createdAt: NOW,
          updatedAt: NOW,
        }),
      () => created().assignRole('ROOT', NOW),
      () => blacklistKey('   '),
      () => remainingTokenLifeSeconds(1.5, NOW),
      () => remainingTokenLifeSeconds(10, new Date('invalid')),
    ];
    for (const attempt of invalid) {
      expect(attempt).toThrow(DomainInvariantError);
    }
    expect(normalizeBlacklistTtl(0)).toBeNull();
    expect(normalizeBlacklistTtl(1.2)).toBeNull();
    expect(normalizeBlacklistTtl(3600)).toBe(3600);
    expect(validationError([])).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'request validation failed' });
  });
});

function created(): AuthCredential {
  return AuthCredential.create({
    id: USER_ID,
    email: 'ana@toka.com',
    passwordHash: HASH,
    roles: ['USER'],
    now: NOW,
  });
}
