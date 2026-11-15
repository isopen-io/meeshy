/**
 * #10872 — le lien du DIGEST (`issueLoginTokenForUser`) n'est lié à aucun
 * appareil : il ne s'ouvre jamais sans que l'utilisateur ait vu le compte cible
 * et dit oui. Avant ce oui, le jeton n'est PAS consommé et aucune session
 * n'existe.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCreateSession = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
  createSession: (input: any) => mockCreateSession(input),
  generateSessionToken: () => 'session-token-xyz',
}));

import { MagicLinkService, type MagicLinkValidation } from '../../../services/MagicLinkService';
import type { RequestContext } from '../../../services/GeoIPService';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const user = {
  id: 'user-123',
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
  phoneNumber: null,
  displayName: 'Alice',
  bio: null,
  avatar: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  emailReleasedAt: null,
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  userPreferences: null,
};

/** Une ligne telle que `create` la laisse : AUCUNE clé `usedAt`. */
const freshTokenRow = (): MongoDocument => ({
  id: 'mlt-1',
  userId: user.id,
  tokenHash: 'hash',
  isRevoked: false,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  rememberDevice: false,
});

function makePrisma(row: MongoDocument) {
  return {
    user: {
      findUnique: jest.fn(async () => ({ emailVerifiedAt: user.emailVerifiedAt })),
      update: jest.fn(async () => ({ id: user.id })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    magicLinkToken: {
      // Chaque lecture rend un INSTANTANÉ : deux validations concurrentes lisent
      // toutes deux la ligne avant toute écriture.
      findUnique: jest.fn(async () => ({ ...row, usedAt: row.usedAt ?? null, user })),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!matchesMongoWhere(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    securityEvent: { create: jest.fn(async () => ({ id: 'ev-1' })) },
  } as any;
}

const requestContext = { ip: '203.0.113.7', userAgent: 'TestAgent/1.0', geoData: null, deviceInfo: null } as unknown as RequestContext;
const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;

function makeService(prisma: unknown) {
  return new MagicLinkService(prisma as never, cache, { sendMagicLinkEmail: jest.fn() } as any, { lookup: jest.fn() } as any);
}

describe('validateMagicLink — confirmation du compte cible (#10872)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSession.mockResolvedValue({ id: 'session-1', userId: user.id });
  });

  it('sans le oui : confirmation + identité du compte, jeton NON consommé, aucune session', async () => {
    const row = freshTokenRow();
    const validation: MagicLinkValidation = { token: 'raw-token', requestContext };

    const result = await makeService(makePrisma(row)).validateMagicLink(validation);

    expect(result).toMatchObject({
      success: false,
      requiresConfirmation: true,
      account: { id: user.id, username: 'alice', displayName: 'Alice', avatar: null },
      intent: 'sign-in',
      maskedEmail: 'al....e@e*****om',
    });
    expect(JSON.stringify(result)).not.toContain('alice@example.com');
    expect(result.token).toBeUndefined();
    expect(row.usedAt).toBeUndefined();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('un secret d’appareil ne suffit pas : le lien du digest n’est lié à aucun appareil', async () => {
    const row = freshTokenRow();
    const validation: MagicLinkValidation = {
      token: 'raw-token',
      requestContext,
      linkDeviceSecret: 'c2VjcmV0LWRlLWNldC1hcHBhcmVpbC0zMi1vY3RldHM',
    };

    const result = await makeService(makePrisma(row)).validateMagicLink(validation);

    expect(result).toMatchObject({ requiresConfirmation: true });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('avec le oui : le jeton est consommé et la session ouverte', async () => {
    const row = freshTokenRow();
    const validation: MagicLinkValidation = { token: 'raw-token', requestContext, confirmed: true };

    const result = await makeService(makePrisma(row)).validateMagicLink(validation);

    expect(result.success).toBe(true);
    expect(row.usedAt).toBeInstanceOf(Date);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('un jeton expiré reste un refus — la confirmation ne révèle aucun compte', async () => {
    const row = { ...freshTokenRow(), expiresAt: new Date(Date.now() - 1000) };

    const result = await makeService(makePrisma(row)).validateMagicLink({ token: 'raw-token', requestContext });

    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('account');
  });
});
