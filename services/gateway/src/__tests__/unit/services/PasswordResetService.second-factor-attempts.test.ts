/**
 * #10866 — un jeton de réinitialisation VOLÉ ne permet plus de deviner le code
 * 2FA par force brute : au cinquième code faux, le jeton est RÉVOQUÉ, l'échec
 * est journalisé, et il faut redemander un lien. Un code juste avant le seuil
 * passe ; il rend son essai.
 *
 * Le TOTP est RÉEL (`speakeasy`), le compteur aussi (magasin mémoire), et les
 * écritures sur le jeton sont ÉVALUÉES contre la ligne (`matchesMongoWhere`).
 *
 * Chaque refus porte un `code` lisible par machine : l'écran web distingue le
 * lien mort, le mot de passe refusé et le code faux.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';
import speakeasy from 'speakeasy';

const passwordWasUsed = jest.fn(async (_candidate: string, _hash: string) => false);

jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: async () => '$2b$12$hash-neuf',
  verifyPassword: (candidate: string, hash: string) => passwordWasUsed(candidate, hash),
}));

import { PasswordResetService } from '../../../services/PasswordResetService';
import {
  createResetSecondFactorAttempts,
  RESET_SECOND_FACTOR_MAX_ATTEMPTS,
  type ResetSecondFactorAttempts,
} from '../../../services/auth/reset-second-factor-attempts';
import { matchesMongoWhere } from '../../helpers/mongo-where';

type Row = Record<string, unknown>;

const SECRET = speakeasy.generateSecret({ length: 20 }).base32;
const STRONG_PASSWORD = 'Kx7#pQ2!vL9@zR4$wN6%';
const RAW_TOKEN = 'email.un-jeton-de-reinitialisation-vole';
const IP = '203.0.113.66';

const goodCode = (): string => speakeasy.totp({ secret: SECRET, encoding: 'base32' });
const wrongCode = (): string => (goodCode() === '000000' ? '111111' : '000000');

const makeAccount = (overrides: Row = {}): Row => ({
  id: '64b0000000000000000000a1',
  email: 'awa@example.com',
  firstName: 'Awa',
  lastName: 'Diallo',
  password: '$2b$12$ancien',
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  twoFactorSecret: SECRET,
  twoFactorEnabledAt: new Date('2026-02-01T00:00:00.000Z'),
  lockedUntil: null,
  lastLoginDevice: null,
  lastLoginLocation: null,
  lastActiveAt: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...overrides,
});

const conditionalWrite = (rows: Row[]) =>
  jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows.find((candidate) => matchesMongoWhere(candidate, where));
    if (!row) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });

const makeHarness = (options: { account?: Row; attempts?: ResetSecondFactorAttempts } = {}) => {
  const account = options.account ?? makeAccount();
  const token: Row = {
    id: '64b0000000000000000000t1',
    userId: account.id,
    tokenHash: crypto.createHash('sha256').update(RAW_TOKEN).digest('hex'),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    isRevoked: false,
  };
  const tokens = [token];
  const tokenWrite = conditionalWrite(tokens);
  const tx = {
    user: { update: jest.fn(async (_args: Row) => ({})) },
    passwordHistory: { create: jest.fn(async (_args: Row) => ({})) },
    passwordResetToken: { updateMany: tokenWrite },
    userSession: { updateMany: jest.fn(async (_args: Row) => ({ count: 0 })) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async (_args: Row) => account),
      update: jest.fn(async (_args: Row) => ({})),
    },
    passwordResetToken: {
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const row = tokens.find((candidate) => candidate.tokenHash === where.tokenHash);
        return row ? { ...row, usedAt: row.usedAt ?? null, revokedReason: row.revokedReason ?? null, user: account } : null;
      }),
      updateMany: tokenWrite,
    },
    passwordHistory: { findMany: jest.fn(async (_args: Row) => [{ passwordHash: '$2b$12$ancien' }]) },
    securityEvent: { create: jest.fn(async (_args: { data: Row }) => ({})) },
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const cache = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    setnx: jest.fn(async () => true),
    del: jest.fn(async () => undefined),
  };
  const email = {
    sendPasswordChangedEmail: jest.fn(async (_data: Row) => ({ success: true })),
    sendSecurityAlertEmail: jest.fn(async (_data: Row) => ({ success: true })),
  };
  const geo = { lookup: jest.fn(async (_ip: string) => null) };
  const service = new PasswordResetService(
    prisma as never,
    cache as never,
    email as never,
    geo as never,
    '',
    options.attempts ?? createResetSecondFactorAttempts()
  );
  return { service, prisma, email, token };
};

type Harness = ReturnType<typeof makeHarness>;

const submit = (harness: Harness, params: { code?: string; password?: string } = {}) =>
  harness.service.completePasswordReset({
    token: RAW_TOKEN,
    newPassword: params.password ?? STRONG_PASSWORD,
    confirmPassword: params.password ?? STRONG_PASSWORD,
    twoFactorCode: params.code,
    ipAddress: IP,
    userAgent: 'jest',
  });

const eventsOfType = (harness: Harness, eventType: string) =>
  harness.prisma.securityEvent.create.mock.calls.filter(([args]) => args.data.eventType === eventType);

describe('POST /auth/reset-password — un code 2FA faux consomme un essai du jeton (#10866)', () => {
  it(`au ${RESET_SECOND_FACTOR_MAX_ATTEMPTS}e code faux, le jeton est révoqué ; le 6e essai, même JUSTE, trouve un lien mort`, async () => {
    const harness = makeHarness();

    const refusals = [];
    for (let i = 0; i < RESET_SECOND_FACTOR_MAX_ATTEMPTS; i++) {
      refusals.push(await submit(harness, { code: wrongCode() }));
    }

    expect(refusals.slice(0, -1).map((r) => r.code)).toEqual(Array(RESET_SECOND_FACTOR_MAX_ATTEMPTS - 1).fill('TWO_FACTOR_INVALID'));
    expect(refusals.at(-1)).toMatchObject({ success: false, code: 'TWO_FACTOR_ATTEMPTS_EXHAUSTED' });
    expect(harness.token).toMatchObject({ isRevoked: true, revokedReason: 'TWO_FACTOR_FAILURES' });
    expect(eventsOfType(harness, 'PASSWORD_RESET_2FA_ATTEMPTS_EXHAUSTED')).toHaveLength(1);
    expect(harness.email.sendSecurityAlertEmail).toHaveBeenCalledTimes(1);

    const sixth = await submit(harness, { code: goodCode() });

    expect(sixth).toMatchObject({ success: false, error: 'Invalid or expired reset token', code: 'RESET_TOKEN_INVALID' });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un code JUSTE avant le seuil passe', async () => {
    const harness = makeHarness();
    for (let i = 0; i < RESET_SECOND_FACTOR_MAX_ATTEMPTS - 1; i++) {
      await submit(harness, { code: wrongCode() });
    }

    const result = await submit(harness, { code: goodCode() });

    expect(result.success).toBe(true);
    expect(harness.token.usedAt).toBeInstanceOf(Date);
  });

  it('dix codes faux EN PARALLÈLE : cinq seulement sont vérifiés, et le jeton est révoqué', async () => {
    const harness = makeHarness();

    const results = await Promise.all(Array.from({ length: 10 }, () => submit(harness, { code: wrongCode() })));

    expect(eventsOfType(harness, 'TWO_FA_FAILED')).toHaveLength(RESET_SECOND_FACTOR_MAX_ATTEMPTS);
    expect(results.every((r) => r.success === false)).toBe(true);
    expect(results.filter((r) => r.code === 'TWO_FACTOR_INVALID')).toHaveLength(RESET_SECOND_FACTOR_MAX_ATTEMPTS - 1);
    expect(harness.token.isRevoked).toBe(true);
  });

  it("un code JUSTE rend son essai : se tromper ensuite de mot de passe ne brûle pas le lien", async () => {
    passwordWasUsed.mockImplementation(async () => true);
    const harness = makeHarness();
    for (let i = 0; i < RESET_SECOND_FACTOR_MAX_ATTEMPTS + 1; i++) {
      expect(await submit(harness, { code: goodCode() })).toMatchObject({ success: false, code: 'RESET_PASSWORD_REUSED' });
    }
    passwordWasUsed.mockImplementation(async () => false);

    const result = await submit(harness, { code: goodCode() });

    expect(result.success).toBe(true);
    expect(harness.token.isRevoked).toBe(false);
  });

  it('un compteur muet refuse sans vérifier le code (fail-closed)', async () => {
    const harness = makeHarness({ attempts: { reserve: async () => null, release: async () => undefined } });

    const result = await submit(harness, { code: goodCode() });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RESET_UNAVAILABLE');
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('chaque refus de POST /auth/reset-password nomme sa raison (#10866)', () => {
  it('sans code, un compte 2FA est refusé TWO_FACTOR_REQUIRED, sans consommer d’essai', async () => {
    const harness = makeHarness();
    for (let i = 0; i < RESET_SECOND_FACTOR_MAX_ATTEMPTS + 1; i++) {
      expect(await submit(harness)).toMatchObject({ success: false, error: '2FA code required', code: 'TWO_FACTOR_REQUIRED' });
    }
    expect((await submit(harness, { code: goodCode() })).success).toBe(true);
  });

  it('un mot de passe trop faible est refusé RESET_PASSWORD_WEAK', async () => {
    const harness = makeHarness();
    expect(await submit(harness, { password: 'aaaaaaaa', code: goodCode() })).toMatchObject({ success: false, code: 'RESET_PASSWORD_WEAK' });
  });

  it('un jeton inconnu est refusé RESET_TOKEN_INVALID', async () => {
    const harness = makeHarness();
    harness.token.tokenHash = 'autre';
    expect(await submit(harness, { code: goodCode() })).toMatchObject({ success: false, code: 'RESET_TOKEN_INVALID' });
  });

  it('un compte verrouillé est refusé ACCOUNT_LOCKED', async () => {
    const harness = makeHarness({ account: makeAccount({ lockedUntil: new Date(Date.now() + 60_000) }) });
    expect(await submit(harness, { code: goodCode() })).toMatchObject({ success: false, code: 'ACCOUNT_LOCKED' });
  });
});
