/**
 * **LA PREMIÈRE PAGE MESURE SON `hasMore`, ELLE NE LE DEVINE PAS** (#6993).
 *
 * `GET /conversations/:id/messages` posait, en première page :
 *
 *     cursorHasMore = isProbedRead ? false : messages.length === limit
 *
 * — « la page est pleine, donc il en reste ». Une DEVINETTE.
 *
 * Or ce chemin est le SEUL qui paie un `count()` (before/around/after/search
 * le sautent), et `pagination.hasMore` en dérive correctement douze lignes
 * plus bas (`buildPaginationMeta` : `offset + resultCount < total`). Une
 * seule charge portait donc DEUX `hasMore` contradictoires — et le client lit
 * celui qui ment (`apps/web/src/lib/api/messages.ts:50` → `hasOlder`, qui
 * libelle « Sur les N derniers messages » du Résumé Vivant).
 *
 * ## Le rang sur lequel ces témoins sont écrits
 *
 * Une pile de `limit` messages EXACTEMENT : le SEUL rang où la devinette et
 * la vérité divergent. À `limit − 1` comme à `limit + 1`, les deux rendent le
 * même verdict — un témoin écrit là ne pourrait pas tomber (leçon 261).
 *
 * ## Pourquoi un fichier à part
 *
 * `messages-routes.test.ts` est DÉJÀ hors budget (4330 lignes, inscrit à la
 * dette héritée de #4531). La règle du dépôt est explicite : *« Ajouter à un
 * fichier déjà hors budget est interdit : on extrait d'abord, on ajoute
 * ensuite. »* Ces témoins sont donc nés ici, comme leurs frères
 * `messages-collection-*.test.ts`.
 *
 * @jest-environment node
 */


import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn().mockResolvedValue(new Map()),
  }),
}));


// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const PARTICIPANT_ID = '507f1f77bcf86cd799439133';

/** La pile qui sépare les deux règles : la page est PLEINE et le fil ÉPUISÉ. */
const PILE = 5;

const messageRow = (index: number) => ({
  id: `507f1f77bcf86cd7994392${String(index).padStart(2, '0')}`,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: `m${index}`,
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date(`2026-09-1${index % 9}T00:00:00.000Z`),
  updatedAt: new Date(`2026-09-1${index % 9}T00:00:00.000Z`),
  translations: [],
  attachments: [],
  reactions: [],
});

function buildApp(options: { readonly rows: number; readonly total: number }): {
  app: FastifyInstance;
  prisma: any;
} {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(options.total),
      findMany: jest.fn().mockResolvedValue(Array.from({ length: options.rows }, (_, i) => messageRow(i))),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, authMiddleware, authMiddleware);
  return { app, prisma };
}

async function pagePremiere(options: { readonly rows: number; readonly total: number; readonly offset?: number }) {
  const { app } = buildApp(options);
  await app.ready();
  try {
    const offset = options.offset ?? 0;
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/messages?limit=${PILE}&offset=${offset}`,
    });
    return JSON.parse(res.body) as {
      cursorPagination: { hasMore: boolean };
      pagination?: { hasMore: boolean };
      data: readonly unknown[];
    };
  } finally {
    await app.close();
  }
}

describe('première page — `hasMore` MESURÉ, jamais deviné (#6993)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('un fil de PILE `limit` messages n’annonce PLUS d’historique — il n’en a pas', async () => {
    const body = await pagePremiere({ rows: PILE, total: PILE });

    expect(body.data).toHaveLength(PILE);
    expect(body.cursorPagination.hasMore).toBe(false);
  });

  it("les deux blocs de la MÊME réponse s'accordent — c'est leur désaccord qui était le défaut", async () => {
    const body = await pagePremiere({ rows: PILE, total: PILE });

    expect(body.cursorPagination.hasMore).toBe(body.pagination?.hasMore);
  });

  it('une page pleine SUIVIE d’historique annonce bien la suite — sans quoi le correctif nierait toute pagination', async () => {
    const body = await pagePremiere({ rows: PILE, total: PILE + 1 });

    expect(body.cursorPagination.hasMore).toBe(true);
  });

  it("une page pleine à l'OFFSET tient aussi : la borne se lit depuis le rang atteint, pas la taille de la page", async () => {
    const body = await pagePremiere({ rows: PILE, total: 2 * PILE, offset: PILE });

    expect(body.cursorPagination.hasMore).toBe(false);
  });
});
