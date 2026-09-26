/**
 * @jest-environment node
 *
 * **UN LIEN DIRECT NE DIT RIEN À UN NON-MEMBRE — PAS MÊME QUE LA CONVERSATION
 * EXISTE (#8099).**
 *
 * Directive porteur 2026-09-26 : « l'accès à une conversation par le lien de la
 * conversation, sans lien de partage, ne peut pas être accessible aux
 * non-membres ». Aucune route de lecture ne servait de DONNÉES à un non-membre ;
 * mais elles lui répondaient `403 CONVERSATION_ACCESS_DENIED` quand la
 * conversation existait et `404 Conversation not found` (ou un autre 403, à la
 * prose différente) quand elle n'existait pas. Les identifiants de conversation
 * sont LISIBLES (`mee_meeshy`, `general`) : ce couple de réponses était un
 * oracle d'existence énumérable.
 *
 * Le témoin tient un seul invariant, route par route : pour un appelant
 * AUTHENTIFIÉ, « la conversation existe et je n'en suis pas » et « la
 * conversation n'existe pas » rendent le MÊME statut et le MÊME corps.
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

jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({})),
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
import {
  registerConversationDetailRoute,
  registerConversationAnalysisRoute,
} from '../../../../routes/conversations/core-detail';
import { registerStatsRoutes } from '../../../../routes/conversations/stats';
import { registerDirectConversationCardRoute } from '../../../../routes/conversations/card';
import { registerThreadsRoutes } from '../../../../routes/conversations/threads';
import { registerMessagePinRoutes } from '../../../../routes/conversations/messages-pin';
import { registerMessagesAdvancedReadRoutes } from '../../../../routes/conversations/messages-advanced-reads';
import { conversationReceiptsRoutes } from '../../../../routes/conversations/receipts';
import messageReadStatusRoutes from '../../../../routes/message-read-status';
import encryptionRoutes from '../../../../routes/conversation-encryption';
import { registerCallsConsultationRoutes } from '../../../../routes/calls-consultation';
import { registerMetadataRoutes } from '../../../../routes/attachments/metadata';
import { registerSharingRoutes } from '../../../../routes/conversations/sharing';
import { registerUserRoutes } from '../../../../routes/links/user';

const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd7994390aa';
const EXISTING_CONV_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const UNKNOWN_CONV_ID = '507f1f77bcf86cd799439099';
const MESSAGE_ID = '507f1f77bcf86cd799439055';
const EXISTANTE = 'mee_existante_8099';
const INEXISTANTE = 'mee_inexistante_8099';

const SECRET = process.env.JWT_SECRET as string;
const JETON = {
  authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: SESSION_ID }, SECRET, { expiresIn: '1h' })}`,
};

const utilisateur = () => ({
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
});

type OuConversation = { where?: { identifier?: string; id?: string; OR?: ReadonlyArray<{ identifier?: string; id?: string }> } };

const existe = (args: OuConversation): boolean => {
  const where = args.where ?? {};
  const candidats = [where, ...(where.OR ?? [])];
  return candidats.some((c) => c.identifier === EXISTANTE || c.id === EXISTING_CONV_ID);
};

/** Une conversation `EXISTANTE` dont l'appelant n'est PAS membre ; rien d'autre. */
const prismaNonMembre = () => ({
  userSession: { findFirst: jest.fn(async () => ({ isValid: true })) },
  user: { findUnique: jest.fn(async () => utilisateur()) },
  participant: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
  conversation: {
    findFirst: jest.fn(async (args: OuConversation) =>
      existe(args) ? { id: EXISTING_CONV_ID, identifier: EXISTANTE, type: 'group', participants: [] } : null
    ),
    findUnique: jest.fn(async (args: OuConversation) =>
      existe(args) ? { id: EXISTING_CONV_ID, identifier: EXISTANTE, type: 'group', participants: [] } : null
    ),
  },
});

const monter = async (prisma: unknown): Promise<FastifyInstance> => {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  const optionalAuth = createUnifiedAuthMiddleware(prisma as never, { requireAuth: false, allowAnonymous: true });
  const requiredAuth = createUnifiedAuthMiddleware(prisma as never, { requireAuth: true, allowAnonymous: false });
  registerMessagesListRoute(app, prisma as never, optionalAuth);
  registerMessageSearchRoute(app, prisma as never, optionalAuth);
  registerParticipantReadRoutes(app, prisma as never, optionalAuth);
  registerConversationDetailRoute(app, prisma as never, optionalAuth);
  registerConversationAnalysisRoute(app, prisma as never, requiredAuth);
  registerStatsRoutes(app, prisma as never, requiredAuth);
  registerDirectConversationCardRoute(app, prisma as never, optionalAuth);
  registerThreadsRoutes(app, prisma as never, requiredAuth);
  registerMessagePinRoutes(app, prisma as never, requiredAuth, null);
  registerMessagesAdvancedReadRoutes(app, prisma as never, requiredAuth);
  registerCallsConsultationRoutes(app, { prisma: prisma as never, callService: {} as never, requiredAuth });
  app.decorate('authenticate', requiredAuth as never);
  registerSharingRoutes(app, prisma as never, requiredAuth);
  await registerMetadataRoutes(app, optionalAuth, prisma as never);
  await app.register(conversationReceiptsRoutes);
  await app.register(messageReadStatusRoutes);
  await app.register(encryptionRoutes);
  await app.register(registerUserRoutes);
  await app.ready();
  return app;
};

type Reponse = { readonly statut: number; readonly corps: Record<string, unknown> };

const lire = async (url: string): Promise<Reponse> => {
  const app = await monter(prismaNonMembre());
  try {
    const reponse = await app.inject({ method: 'GET', url, headers: JETON });
    return { statut: reponse.statusCode, corps: reponse.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
};

const ROUTES: ReadonlyArray<readonly [string, (id: string) => string]> = [
  ['GET /conversations/:id', (id) => `/conversations/${id}`],
  ['GET /conversations/:id/messages', (id) => `/conversations/${id}/messages`],
  ['GET /conversations/:id/messages/search', (id) => `/conversations/${id}/messages/search?q=bonjour`],
  ['GET /conversations/:id/participants', (id) => `/conversations/${id}/participants`],
  [
    'GET /conversations/:id/participants/:participantId/profile',
    (id) => `/conversations/${id}/participants/${PARTICIPANT_ID}/profile`,
  ],
  ['GET /conversations/:id/stats', (id) => `/conversations/${id}/stats`],
  ['GET /conversations/:id/analysis', (id) => `/conversations/${id}/analysis`],
  ['GET /conversations/:id/card', (id) => `/conversations/${id}/card`],
];

/**
 * Les lectures SECONDAIRES d'une conversation (#8116) : fil, épingles, accusés,
 * réactions, statuts, chiffrement, appel actif, galerie, liens de partage.
 * Chacune rendait 403 à un non-membre — et, pour certaines, 404 à un
 * identifiant inconnu : le même oracle, une porte plus loin.
 */
const ROUTES_SECONDAIRES: ReadonlyArray<readonly [string, (id: string) => string]> = [
  ['GET /conversations/:id/threads/:messageId', (id) => `/conversations/${id}/threads/${MESSAGE_ID}`],
  ['GET /conversations/:id/pinned-messages', (id) => `/conversations/${id}/pinned-messages`],
  ['GET /conversations/:id/reactions', (id) => `/conversations/${id}/reactions`],
  ['GET /conversations/:id/status', (id) => `/conversations/${id}/status`],
  ['GET /conversations/:id/receipts', (id) => `/conversations/${id}/receipts`],
  ['GET /conversations/:id/read-statuses', (id) => `/conversations/${id}/read-statuses`],
];

/** Les routes qui n'acceptent qu'un ObjectId : l'inconnu y est un ObjectId sans ligne. */
const ROUTES_PAR_OBJECT_ID: ReadonlyArray<readonly [string, (id: string) => string]> = [
  ['GET /conversations/:id/encryption-status', (id) => `/conversations/${id}/encryption-status`],
  ['GET /conversations/:id/active-call', (id) => `/conversations/${id}/active-call`],
  ['GET /conversations/:id/attachments', (id) => `/conversations/${id}/attachments`],
  ['GET /conversations/:id/links', (id) => `/conversations/${id}/links`],
  ['GET /links?conversationId=', (id) => `/links?conversationId=${id}`],
];

const CAS: ReadonlyArray<readonly [string, (id: string) => string, string, string]> = [
  ...ROUTES.map(([nom, url]) => [nom, url, EXISTANTE, INEXISTANTE] as const),
  ...ROUTES_SECONDAIRES.map(([nom, url]) => [nom, url, EXISTANTE, INEXISTANTE] as const),
  ...ROUTES_SECONDAIRES.map(([nom, url]) => [`${nom} (ObjectId)`, url, EXISTING_CONV_ID, UNKNOWN_CONV_ID] as const),
  ...ROUTES_PAR_OBJECT_ID.map(([nom, url]) => [nom, url, EXISTING_CONV_ID, UNKNOWN_CONV_ID] as const),
];

describe('non-membre sur lien direct ≡ conversation inexistante (#8099, #8116)', () => {
  it.each(CAS)('%s — 404 « Conversation not found », identique pour un id inexistant', async (_nom, url, existante, inconnue) => {
    const nonMembre = await lire(url(existante));
    const inexistante = await lire(url(inconnue));

    expect(nonMembre.statut).toBe(404);
    expect(nonMembre.corps.error).toBe('Conversation not found');
    expect(nonMembre.corps.code).toBeUndefined();
    expect(nonMembre).toEqual(inexistante);
  });

  it.each(CAS)('%s — sans session, 401 avant toute lecture de la conversation', async (_nom, url, existante) => {
    const app = await monter(prismaNonMembre());
    try {
      const reponse = await app.inject({ method: 'GET', url: url(existante) });
      expect(reponse.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('non-membre sur lien direct ≡ conversation inexistante (#8099)', () => {
  it.each(ROUTES)('%s — même statut et même corps que pour un id inexistant', async (_nom, url) => {
    const nonMembre = await lire(url(EXISTANTE));
    const inexistante = await lire(url(INEXISTANTE));

    expect(nonMembre.statut).toBe(404);
    expect(nonMembre).toEqual(inexistante);
  });

  it.each(ROUTES)('%s — le refus ne nomme aucun code d’accès refusé', async (_nom, url) => {
    const { corps } = await lire(url(EXISTANTE));

    expect(corps.success).toBe(false);
    expect(corps.code).not.toBe('CONVERSATION_ACCESS_DENIED');
    expect(corps.data).toBeUndefined();
  });
});
