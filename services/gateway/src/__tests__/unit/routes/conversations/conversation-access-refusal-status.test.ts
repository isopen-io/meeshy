/**
 * @jest-environment node
 *
 * **UN BOOLÉEN NE PEUT PAS DIRE DEUX CHOSES (#4792).**
 *
 * `canAccessConversation` rendait `false` pour « je ne sais pas qui tu es » ET
 * pour « je sais qui tu es, et ce n'est pas pour toi ». Les cinq routes de ce
 * fichier traduisaient donc l'unique `false` en un unique `sendForbidden` :
 * **403 pour une session absente ou morte**, sur des routes montées en
 * `optionalAuth` — une garde qui ne refuse RIEN.
 *
 * ## Ce que ce témoin monte, et pourquoi il le monte comme ça
 *
 * 1. **Les VRAIES routes, par leurs registrars de production**, avec les gardes
 *    construites par la vraie fabrique aux options de production
 *    (`routes/conversations/index.ts` pour les quatre premières ;
 *    `registerCreationRoutes` construit la sienne LUI-MÊME pour la cinquième).
 *    Un témoin monté sur une route non gardée, ou qui injecterait `authContext`
 *    à la main, passerait pour la mauvaise raison : il ne verrait jamais que la
 *    garde LAISSE PASSER un appelant sans identité.
 * 2. **Le corps sort du SÉRIALISEUR.** Les quatre routes de conversations
 *    déclarent `401: errorResponseSchema` — leur 401 était déclaré sans avoir
 *    d'émetteur. `POST /tracking-links` ne déclare ni 401 ni 403 (`200 · 201 ·
 *    400 · 500`), donc Fastify sérialise ses deux refus SANS schéma : rien ne
 *    peut y être tronqué par le changement de statut (le défaut de #4689). Ce
 *    témoin lit `response.json()` — le corps tel qu'il part sur le fil.
 * 3. **Les deux refus restent DISCERNABLES.** Un correctif qui ferait tout
 *    passer en 401 serait aussi faux que le défaut : un NON-MEMBRE
 *    AUTHENTIFIÉ doit rester `403 CONVERSATION_ACCESS_DENIED`. Les cinq
 *    derniers témoins exercent donc la vraie chaîne d'authentification — JWT
 *    signé, session vivante, ligne `User` active — pour atteindre cette
 *    branche.
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

import { createUnifiedAuthMiddleware } from '../../../../middleware/auth';
import { registerMessagesListRoute } from '../../../../routes/conversations/messages-list';
import { registerMessageSearchRoute } from '../../../../routes/conversations/messages-search';
import { registerParticipantReadRoutes } from '../../../../routes/conversations/participants-reads';
import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const CONV_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd7994390aa';

/** Le secret que `jest.setup.js` pose — le même que lit `createRegisteredUserContext`. */
const SECRET = process.env.JWT_SECRET as string;

const jetonSigne = (options: jwt.SignOptions): string =>
  jwt.sign({ userId: USER_ID, sid: SESSION_ID }, SECRET, options);

/** Une session VIVANTE dont le porteur n'est membre d'aucune conversation. */
const prismaMembreInconnu = () => ({
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
  trackingLink: { findFirst: jest.fn(async () => null), create: jest.fn(async () => null) },
});

/**
 * Les gardes de production, construites par la vraie fabrique avec les options
 * de `routes/conversations/index.ts`. `registerCreationRoutes` n'en reçoit
 * aucune : il construit la sienne depuis `fastify.prisma`, aux mêmes options —
 * c'est ce montage-là qui est mesuré.
 */
const monter = async (prisma: unknown): Promise<FastifyInstance> => {
  const app = Fastify();
  app.decorate('prisma', prisma as never);

  const optionalAuth = createUnifiedAuthMiddleware(prisma as never, {
    requireAuth: false,
    allowAnonymous: true,
  });

  registerMessagesListRoute(app, prisma as never, optionalAuth);
  registerMessageSearchRoute(app, prisma as never, optionalAuth);
  registerParticipantReadRoutes(app, prisma as never, optionalAuth);
  await registerCreationRoutes(app);

  await app.ready();
  return app;
};

type Refus = { readonly statut: number; readonly corps: Record<string, unknown> };

type Appel = {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly payload?: Record<string, unknown>;
};

const appeler = async (
  appel: Appel,
  entetes: Record<string, string> = {},
  prisma: unknown = {}
): Promise<Refus> => {
  const app = await monter(prisma);
  try {
    const reponse = await app.inject({
      method: appel.method,
      url: appel.url,
      headers: entetes,
      ...(appel.payload ? { payload: appel.payload } : {}),
    });
    return { statut: reponse.statusCode, corps: reponse.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
};

const SANS_JETON = {};
const JETON_EXPIRE = { authorization: `Bearer ${jetonSigne({ expiresIn: '-1h' })}` };
const JETON_VIVANT = { authorization: `Bearer ${jetonSigne({ expiresIn: '1h' })}` };

/** Les CINQ sites du défaut, un par ligne. */
const ROUTES: ReadonlyArray<readonly [string, Appel]> = [
  ['GET /conversations/:id/messages', { method: 'GET', url: `/conversations/${CONV_ID}/messages` }],
  [
    'GET /conversations/:id/messages/search',
    { method: 'GET', url: `/conversations/${CONV_ID}/messages/search?q=bonjour` },
  ],
  ['GET /conversations/:id/participants', { method: 'GET', url: `/conversations/${CONV_ID}/participants` }],
  [
    'GET /conversations/:id/participants/:participantId/profile',
    { method: 'GET', url: `/conversations/${CONV_ID}/participants/${PARTICIPANT_ID}/profile` },
  ],
  [
    'POST /tracking-links (branche body.conversationId)',
    {
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com/article', conversationId: CONV_ID },
    },
  ],
];

describe('une session ABSENTE ou MORTE rend 401 UNAUTHORIZED (#4792)', () => {
  it.each(ROUTES)('%s — aucun en-tête : 401, code UNAUTHORIZED', async (_nom, appel) => {
    const { statut, corps } = await appeler(appel);

    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });

  it.each(ROUTES)('%s — jeton EXPIRÉ : 401, code UNAUTHORIZED', async (_nom, appel) => {
    const { statut, corps } = await appeler(appel, JETON_EXPIRE, prismaMembreInconnu());

    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });

  /**
   * LE CORPS SORT ENTIER DU SÉRIALISEUR. Les quatre clés que `sendError` pose
   * sont celles que `errorResponseSchema` déclare ; en retirer une du schéma la
   * ferait disparaître du fil sans qu'aucune ligne de code ne change. Sur
   * `POST /tracking-links`, dont le schéma ne déclare AUCUN de ces deux codes,
   * le même témoin mesure que Fastify sérialise sans rien retirer.
   */
  it.each(ROUTES)('%s — sert les quatre clés de l\'enveloppe, pas un corps amputé', async (_nom, appel) => {
    const { corps } = await appeler(appel);

    expect(corps.success).toBe(false);
    expect(typeof corps.error).toBe('string');
    expect(typeof corps.message).toBe('string');
    expect(corps.error).not.toBe('[object Object]');
    expect(corps.code).toBe('UNAUTHORIZED');
  });
});

describe('un non-membre AUTHENTIFIÉ reste refusé en 403 — l\'autre refus, l\'autre statut', () => {
  it.each(ROUTES)('%s — 403 CONVERSATION_ACCESS_DENIED', async (_nom, appel) => {
    const { statut, corps } = await appeler(appel, JETON_VIVANT, prismaMembreInconnu());

    expect(statut).toBe(403);
    expect(corps.code).toBe('CONVERSATION_ACCESS_DENIED');
  });

  /**
   * LE CODE EST LE SIGNAL, PAS LA PROSE. Sans ce témoin, le lot passerait en
   * mettant TOUT en 401 — il ne serait pas discriminant. Les deux refus doivent
   * rester séparés par une valeur MACHINE : c'est tout ce qu'un client peut
   * brancher (`APIClient.mapUnauthorized`, iOS, ne regarde QUE le statut).
   */
  it.each(ROUTES)('%s — deux statuts ET deux codes différents pour les deux refus', async (_nom, appel) => {
    const sansSession = await appeler(appel);
    const nonMembre = await appeler(appel, JETON_VIVANT, prismaMembreInconnu());

    expect(sansSession.statut).not.toBe(nonMembre.statut);
    expect(sansSession.corps.code).not.toBe(nonMembre.corps.code);
  });
});
