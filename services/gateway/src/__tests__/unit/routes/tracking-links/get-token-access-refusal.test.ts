/**
 * @jest-environment node
 *
 * **GET /tracking-links/:token sert 403 à un visiteur SANS session (#5212).**
 *
 * Suite de #4792 (« un booléen ne peut pas dire deux choses »), site
 * explicitement laissé hors de ce lot-là : la route est montée en
 * `authOptional` — une garde qui ne refuse rien — et son gestionnaire
 * traduisait `!isRegisteredUser(request.authContext)` en un unique
 * `sendForbidden`. Cette condition est vraie à la fois pour un visiteur SANS
 * SESSION et pour un utilisateur enregistré qui n'est pas le créateur du lien
 * : les deux recevaient le même 403 « Accès non autorisé ».
 *
 * Ce témoin monte la VRAIE route par son registrar de production
 * (`registerCreationRoutes`), avec la vraie garde `authOptional` qu'elle
 * construit elle-même, et lit le corps tel qu'il sort du sérialiseur — pas un
 * double du handler.
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn(async () => null),
    set: jest.fn(async () => {}),
    del: jest.fn(async () => {}),
    isAvailable: jest.fn(() => false),
  })),
  resetCacheStore: jest.fn(),
}));

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const TOKEN = 'abc123XYZ';
const OWNER_ID = '507f1f77bcf86cd799439099';
const OTHER_USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd7994390aa';

/** Le secret que `jest.setup.js` pose — le même que lit `createRegisteredUserContext`. */
const SECRET = process.env.JWT_SECRET as string;

const jetonSigne = (userId: string, options: jwt.SignOptions): string =>
  jwt.sign({ userId, sid: SESSION_ID }, SECRET, options);

const TRACKING_LINK = {
  id: '507f1f77bcf86cd799439055',
  token: TOKEN,
  originalUrl: 'https://example.com/article',
  createdBy: OWNER_ID,
  isActive: true,
  clickCount: 0,
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
};

/** Une session VIVANTE dont le porteur n'est PAS le créateur du lien. */
const prismaAutreUtilisateur = () => ({
  userSession: { findFirst: jest.fn(async () => ({ isValid: true })) },
  user: {
    findUnique: jest.fn(async () => ({
      id: OTHER_USER_ID,
      username: 'sonde',
      email: 'sonde@meeshy.me',
      firstName: 'Sonde',
      lastName: null,
      displayName: 'Sonde',
      bio: null,
      avatar: null,
      banner: null,
      phoneNumber: null,
      role: 'USER',
      isActive: true,
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: null,
      isOnline: false,
      lastActiveAt: new Date('2026-09-01'),
      emailVerifiedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-09-01'),
      deviceLocale: null,
      profileCompletionRate: null,
    })),
  },
  trackingLink: { findUnique: jest.fn(async () => TRACKING_LINK) },
});

const prismaSansSession = () => ({
  trackingLink: { findUnique: jest.fn(async () => TRACKING_LINK) },
});

const monter = async (prisma: unknown): Promise<FastifyInstance> => {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
};

type Refus = { readonly statut: number; readonly corps: Record<string, unknown> };

const appeler = async (
  entetes: Record<string, string>,
  prisma: unknown
): Promise<Refus> => {
  const app = await monter(prisma);
  try {
    const reponse = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}`,
      headers: entetes,
    });
    return { statut: reponse.statusCode, corps: reponse.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
};

const SANS_JETON = {};
const JETON_VIVANT_AUTRE_UTILISATEUR = {
  authorization: `Bearer ${jetonSigne(OTHER_USER_ID, { expiresIn: '1h' })}`,
};

describe('GET /tracking-links/:token — un visiteur SANS session reçoit 401, pas 403 (#5212)', () => {
  it('aucun en-tête : 401 UNAUTHORIZED', async () => {
    const { statut, corps } = await appeler(SANS_JETON, prismaSansSession());

    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });

  it('sert le corps complet de l\'enveloppe d\'erreur, pas un corps amputé', async () => {
    const { corps } = await appeler(SANS_JETON, prismaSansSession());

    expect(corps.success).toBe(false);
    expect(typeof corps.error).toBe('string');
    expect(typeof corps.message).toBe('string');
    expect(corps.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /tracking-links/:token — un utilisateur AUTHENTIFIÉ mais non-créateur reste 403', () => {
  it('403 TRACKING_LINK_ACCESS_DENIED', async () => {
    const { statut, corps } = await appeler(JETON_VIVANT_AUTRE_UTILISATEUR, prismaAutreUtilisateur());

    expect(statut).toBe(403);
    expect(corps.code).toBe('TRACKING_LINK_ACCESS_DENIED');
  });
});

describe('GET /tracking-links/:token — les deux refus restent DISCERNABLES', () => {
  it('deux statuts ET deux codes différents pour les deux refus', async () => {
    const sansSession = await appeler(SANS_JETON, prismaSansSession());
    const nonCreateur = await appeler(JETON_VIVANT_AUTRE_UTILISATEUR, prismaAutreUtilisateur());

    expect(sansSession.statut).not.toBe(nonCreateur.statut);
    expect(sansSession.corps.code).not.toBe(nonCreateur.corps.code);
  });
});
