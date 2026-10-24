/**
 * #12543 — **une réinitialisation du mot de passe retire les appareils
 * chiffrés de toutes les sessions qu'elle ferme.** C'est le geste de la victime
 * d'un jeton volé : les appareils que l'attaquant avait enrôlés cessent d'être
 * destinataires et rendent leurs places.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: async () => '$2b$12$hash-du-nouveau-mot-de-passe',
  verifyPassword: async () => false,
}));

import { PasswordResetService } from '../../../services/PasswordResetService';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';
import { matchesMongoWhere } from '../../helpers/mongo-where';

type Row = Record<string, unknown>;

const USER = '64b000000000000000000001';
const ADRESSE = 'awa@example.com';
const MOT_DE_PASSE = 'Kx7#pQ2!vL9@zR4$wN6%';

const account: Row = {
  id: USER, email: ADRESSE, emailVerifiedAt: new Date('2026-01-01'), password: '$2b$12$ancien', lockedUntil: null,
  passwordResetAttempts: 0, lastPasswordResetAttempt: null, firstName: 'Awa', lastName: 'Diallo',
  twoFactorSecret: null, twoFactorEnabledAt: null, systemLanguage: 'fr', regionalLanguage: null,
  customDestinationLanguage: null, deviceLocale: null,
};

function harness() {
  const store = createFakeE2EEStore();
  ['c3', 'd4'].forEach((prefix, index) => {
    store.collections.UserSession.insert({ id: prefix.repeat(12), userId: USER, isValid: true, expiresAt: new Date(Date.now() + 86_400_000) });
    store.collections.E2EEDevice.insert({ userId: USER, deviceId: index + 1, registrationId: 100 + index, sessionId: prefix.repeat(12), identityKey: 'ik', platform: 'ios' });
  });
  const tokens: Row[] = [];
  const sessions = store.collections.UserSession.rows;
  const tx = {
    user: { update: jest.fn(async (_args: Row) => ({})) },
    passwordHistory: { create: jest.fn(async (_args: Row) => ({})) },
    passwordResetToken: {
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = tokens.find((candidate) => matchesMongoWhere(candidate, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    userSession: {
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const closing = sessions.filter((row) => matchesMongoWhere(row, where));
        closing.forEach((row) => Object.assign(row, data));
        return { count: closing.length };
      }),
    },
  };
  const prisma = {
    ...store.prisma,
    user: {
      findFirst: jest.fn(async (_args: Row) => account),
      findUnique: jest.fn(async (_args: Row) => ({ lockedUntil: null, lastLoginDevice: null, lastLoginLocation: null, lastActiveAt: null })),
      update: jest.fn(async (_args: Row) => ({})),
    },
    passwordResetToken: {
      updateMany: jest.fn(async (_args: Row) => ({ count: 0 })),
      count: jest.fn(async (_args: Row) => 0),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: `reset-${tokens.length + 1}`, isRevoked: false, ...data };
        tokens.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const row = tokens.find((candidate) => candidate.tokenHash === where.tokenHash);
        return row ? { ...row, usedAt: row.usedAt ?? null, user: account } : null;
      }),
    },
    passwordHistory: { findMany: jest.fn(async (_args: Row) => []) },
    securityEvent: { create: jest.fn(async (_args: Row) => ({})) },
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const cache = {
    get: jest.fn(async (_key: string) => null),
    set: jest.fn(async () => undefined),
    setnx: jest.fn(async () => true),
    del: jest.fn(async () => undefined),
  };
  const email = {
    sendPasswordResetEmail: jest.fn(async (_data: Row) => ({ success: true })),
    sendPasswordChangedEmail: jest.fn(async (_data: Row) => ({ success: true })),
    sendSecurityAlertEmail: jest.fn(async (_data: Row) => ({ success: true })),
  };
  const service = new PasswordResetService(prisma as never, cache as never, email as never, { lookup: async () => null } as never, '');
  return { store, service, email };
}

describe('la réinitialisation du mot de passe et les appareils chiffrés', () => {
  it('retire chaque appareil des sessions fermées par la réinitialisation', async () => {
    const { store, service, email } = harness();
    await service.requestPasswordReset({ email: ADRESSE, ipAddress: '203.0.113.7', userAgent: 'jest' });
    const lien = new URL(String(email.sendPasswordResetEmail.mock.calls.at(-1)?.[0]?.resetLink), 'https://meeshy.test');
    const token = new URLSearchParams(lien.hash.slice(1)).get('token') ?? '';

    const result = await service.completePasswordReset({
      token, newPassword: MOT_DE_PASSE, confirmPassword: MOT_DE_PASSE, ipAddress: '203.0.113.7', userAgent: 'jest',
    });

    expect(result.success).toBe(true);
    expect(store.collections.E2EEDevice.rows.filter((row) => row.retiredAt === null)).toEqual([]);
  });
});
