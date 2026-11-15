/**
 * #4177 — l'oracle d'horodatage inter-conversations sur `?before=` et
 * `?cursor=`.
 *
 * `GET /conversations/:id/messages?before=` et
 * `GET /conversations/:id/messages/search?cursor=` résolvaient tous deux leur
 * curseur par `prisma.message.findFirst({ where: { id } })`, SANS scope de
 * conversation. N'importe quel `messageId` — volé, deviné, ou simplement
 * connu d'un fil auquel l'appelant n'a pas accès — était accepté comme
 * curseur, et son `createdAt` RÉEL bornait la fenêtre retournée : la route
 * révèle ainsi, indirectement, l'instant d'un message qu'elle n'a jamais
 * autorisé à lire. Le mode `around`, quelques lignes plus bas dans le même
 * fichier, scope déjà correctement sa résolution
 * (`applyHistoryFloor({ id: around, conversationId }, …)`) — les deux modes
 * de la MÊME route divergeaient sur la même question.
 *
 * Ces témoins simulent une base « consciente de la conversation » : un
 * `findFirst` scopé au bon `conversationId` ne retrouve JAMAIS un message
 * d'une AUTRE conversation. Sous cette simulation, l'oracle se referme tout
 * seul — la fenêtre retournée ne peut plus se borner sur l'instant volé,
 * parce que la requête scopée ne le retrouve pas.
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const PARTICIPANT_ID = '507f1f77bcf86cd799439133';
/** Un message appartenant à une AUTRE conversation, jamais partagée avec l'appelant. */
const FOREIGN_MESSAGE_ID = '507f1f77bcf86cd799439244';
/** Instant distinctif du message étranger — ne doit JAMAIS borner la page ci-dessous. */
const FOREIGN_CREATED_AT = new Date('2020-01-01T00:00:00.000Z');

/**
 * `findFirst` « conscient de la conversation » : ne rend le message étranger
 * que si l'appelant NE scope PAS sa requête à `CONV_ID` — exactement ce que
 * fait une vraie base MongoDB une fois le `where.conversationId` posé.
 */
function conversationAwareFindFirst() {
  return jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.id !== FOREIGN_MESSAGE_ID) return null;
    if (where.conversationId === CONV_ID) return null; // scopé : introuvable dans CETTE conversation
    return { createdAt: FOREIGN_CREATED_AT }; // non scopé : l'oracle répond
  });
}

function buildApp(): { app: FastifyInstance; prisma: any } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findFirst: conversationAwareFindFirst(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
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

describe('GET /conversations/:id/messages?before= — scope de conversation du curseur (#4177)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("ne borne PAS la page sur l'horodatage d'un message d'une AUTRE conversation", async () => {
    const { app, prisma } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages?before=${FOREIGN_MESSAGE_ID}`,
      });
      expect(res.statusCode).toBe(200);
      const pageWhere = prisma.message.findMany.mock.calls[0][0].where;
      // L'oracle fermé : la borne `lt` de l'instant étranger n'apparaît nulle
      // part dans la requête envoyée à la base pour CETTE conversation.
      expect(pageWhere.createdAt).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('scope explicitement la résolution du curseur à la conversation courante', async () => {
    const { app, prisma } = buildApp();
    await app.ready();
    try {
      await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages?before=${FOREIGN_MESSAGE_ID}`,
      });
      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: FOREIGN_MESSAGE_ID, conversationId: CONV_ID }) }),
      );
    } finally {
      await app.close();
    }
  });
});

describe('GET /conversations/:id/messages/search?cursor= — scope de conversation du curseur (#4177)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("ne borne PAS la recherche sur l'horodatage d'un message d'une AUTRE conversation", async () => {
    const { app, prisma } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages/search?q=bonjour&cursor=${FOREIGN_MESSAGE_ID}`,
      });
      expect(res.statusCode).toBe(200);
      // Les DEUX requêtes de la recherche (contenu + candidates de traduction)
      // partent de `whereClause`, qui portait la fuite : aucune des deux ne
      // doit se borner sur l'instant étranger.
      for (const call of prisma.message.findMany.mock.calls) {
        expect(call[0].where.createdAt).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });

  it('scope explicitement la résolution du curseur à la conversation courante', async () => {
    const { app, prisma } = buildApp();
    await app.ready();
    try {
      await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages/search?q=bonjour&cursor=${FOREIGN_MESSAGE_ID}`,
      });
      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: FOREIGN_MESSAGE_ID, conversationId: CONV_ID }) }),
      );
    } finally {
      await app.close();
    }
  });
});
