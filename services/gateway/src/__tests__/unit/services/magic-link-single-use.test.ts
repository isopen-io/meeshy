/**
 * Un lien magique ne s'ouvre qu'UNE fois, même validé deux fois en même temps
 * (#10475, point 1).
 *
 * `validateMagicLink` lisait `usedAt`, puis marquait le jeton par un `update`
 * NON conditionnel : deux validations concurrentes lisaient toutes deux
 * « pas encore utilisé » et ouvraient chacune une session. Le marquage est
 * désormais une écriture CONDITIONNELLE, et seule celle qui la gagne continue.
 *
 * Le double TIENT la ligne et ÉVALUE le `where` (`matchesMongoWhere`) : un
 * jeton sorti de `create` n'a PAS de clé `usedAt` (Prisma n'écrit pas un
 * optionnel absent), et un filtre `usedAt: null` seul ne l'apparierait jamais —
 * il refuserait tout lien. Le témoin le dit sur une ligne sans la clé.
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
const validation: MagicLinkValidation = { token: 'raw-token', requestContext, confirmed: true };
const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;

function makeService(prisma: unknown) {
  return new MagicLinkService(prisma as never, cache, { sendMagicLinkEmail: jest.fn() } as any, { lookup: jest.fn() } as any);
}

describe('validateMagicLink — un lien ne s’ouvre qu’une fois (#10475)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSession.mockResolvedValue({ id: 'session-1', userId: user.id });
  });

  it('deux validations CONCURRENTES du même lien n’ouvrent qu’UNE session', async () => {
    const service = makeService(makePrisma(freshTokenRow()));

    const results = await Promise.all([service.validateMagicLink(validation), service.validateMagicLink(validation)]);

    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(results.filter(result => !result.success)).toEqual([
      expect.objectContaining({ success: false, error: 'This link has already been used. Please request a new one.' }),
    ]);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('un lien frais — sans clé `usedAt` en base — s’ouvre, et se marque par une écriture conditionnelle', async () => {
    const row = freshTokenRow();
    const prisma = makePrisma(row);

    const result = await makeService(prisma).validateMagicLink(validation);

    expect(result.success).toBe(true);
    expect(row.usedAt).toBeInstanceOf(Date);
    expect(prisma.magicLinkToken.update).not.toHaveBeenCalled();
  });

  it('la validation qui perd la course est tracée comme une tentative de réutilisation, sans session', async () => {
    const row = freshTokenRow();
    const prisma = makePrisma(row);
    prisma.magicLinkToken.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await makeService(prisma).validateMagicLink(validation);

    expect(result.success).toBe(false);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(prisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'MAGIC_LINK_REUSE_ATTEMPT' }) })
    );
  });

  it('un lien révoqué entre la lecture et l’écriture n’ouvre rien', async () => {
    const row = freshTokenRow();
    const prisma = makePrisma(row);
    prisma.magicLinkToken.findUnique.mockImplementationOnce(async () => {
      const snapshot = { ...row, usedAt: null, user };
      row.isRevoked = true;
      return snapshot;
    });

    const result = await makeService(prisma).validateMagicLink(validation);

    expect(result.success).toBe(false);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
