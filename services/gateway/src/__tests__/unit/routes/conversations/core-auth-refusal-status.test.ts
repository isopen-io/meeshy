/**
 * @jest-environment node
 *
 * **LES DEUX REFUS DE LA SURFACE `conversations/core` NE SONT PAS LE MÊME
 * REFUS (#4789).**
 *
 * `GET /conversations` et `GET /conversations/:id` répondaient `403` à une
 * session ABSENTE, avec le message « Authentication required… » — le statut
 * d'un refus de DROIT pour une absence d'IDENTITÉ. C'est la forme de #4760 sur
 * la route la plus appelée du produit, et le seul signal qui séparait les deux
 * cas était la prose anglaise du `message`.
 *
 * ## Pourquoi ce témoin monte la VRAIE route avec sa VRAIE garde
 *
 * Trois choses ne se prouvent pas autrement :
 *
 * 1. **La garde ne refuse rien**, donc c'est bien le HANDLER qui tranche.
 *    `optionalAuth` est construit `{ requireAuth: false, allowAnonymous: true }`
 *    (`routes/conversations/index.ts:26`) — régime sous lequel les deux branches
 *    de refus de `createUnifiedAuthMiddleware` sont mortes. Un témoin monté sur
 *    une route non gardée, ou qui injecterait `authContext` à la main, passerait
 *    pour la mauvaise raison : il ne verrait jamais que la garde LAISSE PASSER
 *    un appelant sans identité.
 * 2. **Le corps sort du SÉRIALISEUR.** Les deux routes déclarent
 *    `401: errorResponseSchema` ; `fast-json-stringify` supprime tout champ non
 *    déclaré, et c'est exactement ce qui avait détruit le `code` des gardes
 *    héritées (#4760, mesuré `{"success":false,"error":"[object Object]"}`).
 *    Ce témoin lit `response.json()` — le corps tel qu'il part sur le fil.
 * 3. **Les deux refus restent DISCERNABLES.** Un correctif qui ferait tout
 *    passer en 401 serait aussi faux que le défaut : `canAccessConversation`
 *    refuse un non-membre AUTHENTIFIÉ, et ce refus-là doit rester
 *    `403 CONVERSATION_ACCESS_DENIED`. Le dernier témoin exerce donc la vraie
 *    chaîne d'authentification — JWT signé, session vivante, ligne `User`
 *    active — pour atteindre cette branche.
 *
 * La « session morte » n'est pas simulée par un contexte fabriqué : le témoin
 * présente un JWT EXPIRÉ, que `createRegisteredUserContext` refuse et que
 * `unifiedAuth` rattrape en repli non authentifié (`requireAuth: false`). C'est
 * le chemin exact d'un retour après quelques jours.
 */

import { describe, it, expect, jest } from '@jest/globals';
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

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    resolveForTargets: async () => new Map(),
  }),
}));

import { AUTH_REGIME, createUnifiedAuthMiddleware, type AuthRegime } from '../../../../middleware/auth';
import { registerCoreRoutes } from '../../../../routes/conversations/core';

const CONV_ID = '507f1f77bcf86cd799439033';
const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd7994390aa';

/** Le secret que `jest.setup.js` pose — le même que lit `createRegisteredUserContext`. */
const SECRET = process.env.JWT_SECRET as string;

const jetonSigne = (options: jwt.SignOptions): string =>
  jwt.sign({ userId: USER_ID, sid: SESSION_ID }, SECRET, options);

/** Une session VIVANTE dont le porteur n'est membre d'aucune conversation. */
const PRISMA_MEMBRE_INCONNU = {
  userSession: { findFirst: jest.fn(async () => ({ isValid: true })) },
  user: {
    findUnique: jest.fn(async () => ({
      id: USER_ID,
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
  // Aucune ligne : l'appelant est authentifié et n'est PAS membre.
  participant: { findFirst: jest.fn(async () => null) },
  conversation: { findFirst: jest.fn(async () => null) },
};

/**
 * Les DEUX gardes de production, construites par la vraie fabrique avec les
 * options de `routes/conversations/index.ts`, et passées à la vraie composition
 * de routes — l'ORDRE des deux arguments fait partie de ce qui est mesuré.
 */
const monter = async (prisma: unknown): Promise<FastifyInstance> => {
  const app = Fastify();
  const optionalAuth = createUnifiedAuthMiddleware(prisma as never, {
    requireAuth: false,
    allowAnonymous: true,
  });
  const requiredAuth = createUnifiedAuthMiddleware(prisma as never, {
    requireAuth: true,
    allowAnonymous: false,
  });

  registerCoreRoutes(app, prisma as never, optionalAuth, requiredAuth);
  await app.ready();
  return app;
};

type Refus = { readonly statut: number; readonly corps: Record<string, unknown> };

const appeler = async (
  url: string,
  entetes: Record<string, string> = {},
  prisma: unknown = {}
): Promise<Refus> => {
  const app = await monter(prisma);
  try {
    const reponse = await app.inject({ method: 'GET', url, headers: entetes });
    return { statut: reponse.statusCode, corps: reponse.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
};

const SANS_JETON = {};
const JETON_EXPIRE = { authorization: `Bearer ${jetonSigne({ expiresIn: '-1h' })}` };
const JETON_VIVANT = { authorization: `Bearer ${jetonSigne({ expiresIn: '1h' })}` };

const CHEMINS = [
  ['GET /conversations', '/conversations'],
  ['GET /conversations/:id', `/conversations/${CONV_ID}`],
] as const;

describe('la garde montée sur ces routes ne refuse RIEN — c\'est le handler qui tranche', () => {
  it('déclare le régime ouvert de production (requireAuth: false, allowAnonymous: true)', () => {
    const optionalAuth = createUnifiedAuthMiddleware({} as never, {
      requireAuth: false,
      allowAnonymous: true,
    });
    const regime = (optionalAuth as unknown as Record<symbol, AuthRegime>)[AUTH_REGIME];

    expect(regime).toEqual({ requireAuth: false, allowAnonymous: true });
  });
});

describe('une session ABSENTE ou MORTE rend 401 UNAUTHORIZED (#4789)', () => {
  it.each([
    ['GET /conversations', '/conversations', 'aucun en-tête', SANS_JETON],
    ['GET /conversations', '/conversations', 'un jeton expiré', JETON_EXPIRE],
    ['GET /conversations/:id', `/conversations/${CONV_ID}`, 'aucun en-tête', SANS_JETON],
    ['GET /conversations/:id', `/conversations/${CONV_ID}`, 'un jeton expiré', JETON_EXPIRE],
  ])('%s — %s : 401, code UNAUTHORIZED', async (_route, url, _cas, entetes) => {
    const { statut, corps } = await appeler(url, entetes);

    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });

  /**
   * LE CORPS SORT ENTIER DU SÉRIALISEUR. Les quatre clés que `sendError` pose
   * sont celles que `errorResponseSchema` déclare ; en retirer une du schéma la
   * ferait disparaître du fil sans qu'aucune ligne de code ne change.
   */
  it.each(CHEMINS)('%s — sert les quatre clés de l\'enveloppe, pas un corps amputé', async (_route, url) => {
    const { corps } = await appeler(url, SANS_JETON);

    expect(corps.success).toBe(false);
    expect(typeof corps.error).toBe('string');
    expect(typeof corps.message).toBe('string');
    expect(corps.error).not.toBe('[object Object]');
    expect(corps.code).toBe('UNAUTHORIZED');
  });
});

describe('un non-membre AUTHENTIFIÉ reste refusé en 403 — l\'autre refus, l\'autre statut', () => {
  it('GET /conversations/:id — 403 CONVERSATION_ACCESS_DENIED', async () => {
    const { statut, corps } = await appeler(
      `/conversations/${CONV_ID}`,
      JETON_VIVANT,
      PRISMA_MEMBRE_INCONNU
    );

    expect(statut).toBe(403);
    expect(corps.code).toBe('CONVERSATION_ACCESS_DENIED');
  });

  /**
   * LE CODE EST LE SIGNAL, PAS LA PROSE. Les deux refus doivent être
   * discernables par une valeur MACHINE : c'est tout ce qu'un client peut
   * brancher — `APIClient.mapUnauthorized` (iOS) ne regarde QUE le statut — et
   * c'est ce qui manquait.
   */
  it('sert deux statuts ET deux codes différents pour les deux refus', async () => {
    const sansSession = await appeler(`/conversations/${CONV_ID}`, SANS_JETON);
    const nonMembre = await appeler(`/conversations/${CONV_ID}`, JETON_VIVANT, PRISMA_MEMBRE_INCONNU);

    expect(sansSession.statut).not.toBe(nonMembre.statut);
    expect(sansSession.corps.code).not.toBe(nonMembre.corps.code);
  });
});
