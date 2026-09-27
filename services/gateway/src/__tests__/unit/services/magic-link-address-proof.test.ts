/**
 * Le lien magique — et le lien du RÉSUMÉ quotidien, qui passe par la même
 * validation — PROUVE l'adresse et ACTIVE le compte (#8238, absorbe #8236).
 *
 * Avant : `validateMagicLink` ne vérifiait que `isActive` et ouvrait une
 * session sans poser `emailVerifiedAt` ; un compte « à prouver » gardait une
 * session sans jamais devenir prouvé. Désormais toute action venue d'un
 * e-mail prouve l'adresse (précision porteur 2026-09-27), y compris quand le
 * délai de grâce est passé (`blocked` ⇒ `done`).
 *
 * Horloge INJECTÉE (`MagicLinkServiceOptions.now`).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCreateSession = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
  createSession: (input: unknown) => mockCreateSession(input),
  generateSessionToken: () => 'session-token-xyz',
}));
jest.mock('jsonwebtoken', () => ({ sign: () => 'jwt-token-abc' }));

import { MagicLinkService } from '../../../services/MagicLinkService';
import { ACTIVATION_GRACE_EPOCH } from '../../../services/auth/account-activation';
import type { RequestContext } from '../../../services/GeoIPService';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date(ACTIVATION_GRACE_EPOCH.getTime() + DAY_MS);
const J40 = new Date(CREATED.getTime() + 40 * DAY_MS);

const requestContext = { ip: '203.0.113.7', userAgent: 'TestAgent/1.0', geoData: null, deviceInfo: null } as unknown as RequestContext;

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  username: 'lena',
  firstName: 'Lena',
  lastName: 'Vogel',
  email: 'lena@example.com',
  phoneNumber: null,
  displayName: 'Lena Vogel',
  bio: '',
  avatar: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isActive: true,
  createdAt: CREATED,
  updatedAt: CREATED,
  emailVerifiedAt: null,
  emailReleasedAt: null,
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  userPreferences: null,
  ...overrides,
});

const monter = (ligne: Record<string, unknown>) => {
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ emailVerifiedAt: ligne.emailVerifiedAt })),
      updateMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
      update: jest.fn(async () => ({ id: 'user-123' })),
    },
    magicLinkToken: {
      findUnique: jest.fn(async () => ({
        id: 'mlt-1',
        userId: 'user-123',
        tokenHash: 'hash',
        usedAt: null,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        rememberDevice: false,
        user: ligne,
      })),
      update: jest.fn(async () => ({ id: 'mlt-1' })),
    },
    emailVerificationWatch: { updateMany: jest.fn(async () => ({ count: 0 })) },
    securityEvent: { create: jest.fn(async () => ({ id: 'ev-1' })) },
  };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn(async (_key: string) => undefined) };
  const service = new MagicLinkService(prisma as never, cache as never, {} as never, { lookup: jest.fn() } as never, { now: () => J40 });
  return { service, prisma, cache };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSession.mockResolvedValue({ id: 'session-1', userId: 'user-123' });
});

describe('un compte à l’adresse NON prouvée ouvre le lien', () => {
  it('l’adresse est prouvée : `emailVerifiedAt` écrit, cache d’auth vidé', async () => {
    const { service, prisma, cache } = monter(compte());

    const result = await service.validateMagicLink({ token: 'raw-token', requestContext });

    expect(result.success).toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'user-123' }), data: { emailVerifiedAt: J40 } }),
    );
    expect(cache.del).toHaveBeenCalledWith('auth:user:user-123');
  });

  it('même passé le délai de grâce (`blocked`) : la session s’ouvre et la phase est `done`', async () => {
    const { service } = monter(compte());

    const result = await service.validateMagicLink({ token: 'raw-token', requestContext });

    expect(result.token).toBe('jwt-token-abc');
    expect(result.user.emailVerifiedAt).toEqual(J40);
    expect(result.user.activation).toEqual({ phase: 'done', deadline: null, missing: ['phone'] });
  });

  it('un compte à second facteur prouve aussi son adresse — le lien a été ouvert depuis la boîte', async () => {
    const { service, prisma } = monter(compte({ twoFactorEnabledAt: CREATED }));

    const result = await service.validateMagicLink({ token: 'raw-token', requestContext });

    expect(result.requires2FA).toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });
});

describe('une adresse déjà prouvée', () => {
  it('n’est pas réécrite', async () => {
    const { service, prisma } = monter(compte({ emailVerifiedAt: CREATED }));

    const result = await service.validateMagicLink({ token: 'raw-token', requestContext });

    expect(result.success).toBe(true);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(result.user.emailVerifiedAt).toEqual(CREATED);
  });
});
