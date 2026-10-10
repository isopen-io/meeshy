/**
 * Un compte de moins de 13 ans ne se connecte pas (#9927, revue adversariale).
 *
 * Un refus de déclaration est DÉFINITIF : la date est écrite, et tant que le
 * compte a moins de 13 ans révolus, aucune session ne naît — ni par le mot de
 * passe, ni par aucune autre porte qui passe par `createSession`. La porte se
 * rouvre seule le jour des 13 ans.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCompare = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: (...a: any[]) => mockCompare(...a),
  hashPassword: jest.fn(async () => 'hashed'),
}));

const mockCreateSession = jest.fn(async () => ({ id: 'sess-1', isTrusted: false }));
jest.mock('../../../services/SessionService', () => ({
  ...(jest.requireActual('../../../services/SessionService') as Record<string, unknown>),
  generateSessionToken: () => 'session-token',
  createSession: (...a: unknown[]) => (mockCreateSession as jest.Mock<any>)(...a),
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({ sendEmailVerification: jest.fn(async () => ({ success: true })) })),
}));

import { AuthService } from '../../../services/AuthService';
import { AgeBelowMinimumError } from '../../../errors/custom-errors';
import { assertAccountMeetsMinimumAge } from '../../../services/auth/minimum-age-gate';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const yearsAgo = (years: number, days = 0): Date =>
  new Date(Date.UTC(NOW.getUTCFullYear() - years, NOW.getUTCMonth(), NOW.getUTCDate() + days));

const account = (birthDate: Date | null) => ({
  id: '507f1f77bcf86cd799439011',
  username: 'kid',
  email: 'kid@example.com',
  password: 'hash',
  phoneNumber: '+33600000000',
  firstName: 'K',
  lastName: 'D',
  displayName: 'K D',
  avatar: null,
  bio: '',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  role: 'USER',
  isActive: true,
  isOnline: false,
  lastActiveAt: NOW,
  twoFactorEnabledAt: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  timezone: null,
  emailVerifiedAt: NOW,
  phoneVerifiedAt: NOW,
  pendingEmail: null,
  pendingPhoneNumber: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: NOW,
  failedLoginAttempts: 0,
  lockedUntil: null,
  birthDate,
});

const service = (row: ReturnType<typeof account>) => {
  const update = jest.fn(async (_args: unknown) => row);
  const prisma = { user: { findFirst: jest.fn(async () => row), findUnique: jest.fn(async () => row), update } };
  return { svc: new AuthService(prisma as never, 'secret', { now: () => NOW }), update };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCompare.mockResolvedValue(true);
});

describe('connexion par mot de passe — le refus de createSession remonte tel quel', () => {
  it('createSession refuse (moins de 13 ans) : authenticate RELAIE AgeBelowMinimumError (403 AGE_BELOW_MINIMUM), jamais un null', async () => {
    mockCreateSession.mockRejectedValueOnce(new AgeBelowMinimumError());
    const { svc } = service(account(yearsAgo(13, 1)));

    const refus = await svc.authenticate({ username: 'kid', password: 'ok' }).catch((e: unknown) => e);

    expect(refus).toBeInstanceOf(AgeBelowMinimumError);
    expect((refus as AgeBelowMinimumError).statusCode).toBe(403);
    expect((refus as AgeBelowMinimumError).code).toBe('AGE_BELOW_MINIMUM');
  });

  it('un mot de passe faux ne révèle pas l’âge : échec ordinaire', async () => {
    mockCompare.mockResolvedValue(false);
    const { svc } = service(account(yearsAgo(10)));
    await expect(svc.authenticate({ username: 'kid', password: 'faux' })).resolves.toBeNull();
  });
});

describe('assertAccountMeetsMinimumAge — la porte partagée', () => {
  const reader = (birthDate: Date | null) => ({ user: { findUnique: jest.fn(async () => ({ birthDate })) } });

  it('refuse un compte de 12 ans', async () => {
    await expect(assertAccountMeetsMinimumAge(reader(yearsAgo(12)), 'u1', NOW)).rejects.toBeInstanceOf(AgeBelowMinimumError);
  });

  it('admet l’âge inconnu et 13 ans', async () => {
    await expect(assertAccountMeetsMinimumAge(reader(null), 'u1', NOW)).resolves.toBeUndefined();
    await expect(assertAccountMeetsMinimumAge(reader(yearsAgo(13)), 'u1', NOW)).resolves.toBeUndefined();
  });
});
