/**
 * #4177 — `?replyToId=` sur `GET /conversations/:id/messages` filtre enfin
 * CÔTÉ SERVEUR.
 *
 * Le paramètre n'existait ni dans le schéma de la route ni dans
 * `MessagesQuery` : AJV (`removeAdditional`, option par défaut de Fastify)
 * le retirait de `request.query` AVANT que le handler ne s'exécute — il
 * était donc silencieusement ignoré, quelle que soit sa valeur.
 * `ThreadRepliesLoader.swift` l'envoie pourtant depuis toujours, en
 * expliquant dans son doc-comment que « the gateway filters server-side » :
 * FAUX jusqu'à ce correctif. Ouvrir un fil de réponses sur iOS chargeait en
 * réalité les 50 derniers messages de LA CONVERSATION ENTIÈRE, filtrés
 * après-coup côté client — le chemin le plus chaud du produit rendait la
 * mauvaise collection.
 *
 * Le témoin vérifie le CONTENU rendu (les ids retournés), pas seulement un
 * 200 : un 200 qui rend le fil entier est exactement le défaut d'aujourd'hui.
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
/** Le message PARENT du fil — celui que `ThreadRepliesLoader` ouvre. */
const PARENT_ID = '507f1f77bcf86cd799439255';
/** Une réponse à ce parent — doit apparaître dans le fil. */
const REPLY_ID = '507f1f77bcf86cd799439266';
/** Un message ORDINAIRE de la même conversation, sans lien avec le fil —
 * aujourd'hui rendu à tort faute de filtrage serveur. */
const UNRELATED_ID = '507f1f77bcf86cd799439277';

function makeMinimalMessage(id: string, replyToId: string | null) {
  return {
    id,
    conversationId: CONV_ID,
    senderId: PARTICIPANT_ID,
    content: `contenu ${id}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    replyToId,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    isEdited: false,
    deletedAt: null,
    validatedMentions: [],
    attachments: [],
    reactionSummary: null,
    reactionCount: 0,
    sender: {
      id: PARTICIPANT_ID,
      userId: USER_ID,
      displayName: 'Emetteur',
      user: { id: USER_ID, username: 'emetteur' },
    },
  };
}

function buildApp(): { app: FastifyInstance; prisma: any } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const reply = makeMinimalMessage(REPLY_ID, PARENT_ID);
  const unrelated = makeMinimalMessage(UNRELATED_ID, null);

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }]),
    },
    message: {
      count: jest.fn().mockResolvedValue(0),
      // Base « consciente du fil » : aujourd'hui, `where.replyToId` n'existe
      // jamais (le paramètre est strippé avant le handler) et la BASE rend
      // TOUT — exactement le défaut décrit ci-dessus. Une fois le filtrage
      // serveur posé, seule la réponse doit ressortir.
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.replyToId === PARENT_ID) return [reply];
        return [reply, unrelated];
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('GET /conversations/:id/messages?replyToId= — le fil de réponses existe enfin (#4177)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('ne rend QUE les réponses du message ciblé — pas le reste de la conversation', async () => {
    const { app } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages?replyToId=${PARENT_ID}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const ids = body.data.map((m: any) => m.id);
      expect(ids).toEqual([REPLY_ID]);
      expect(ids).not.toContain(UNRELATED_ID);
    } finally {
      await app.close();
    }
  });

  it('scope aussi le COUNT total au fil — sinon la pagination promet le mauvais total', async () => {
    const { app, prisma } = buildApp();
    await app.ready();
    try {
      await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages?replyToId=${PARENT_ID}`,
      });
      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ replyToId: PARENT_ID }) }),
      );
    } finally {
      await app.close();
    }
  });

  it('sans `replyToId`, le comportement historique (fil entier) est inchangé', async () => {
    const { app } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const ids = body.data.map((m: any) => m.id);
      expect(ids).toEqual(expect.arrayContaining([REPLY_ID, UNRELATED_ID]));
    } finally {
      await app.close();
    }
  });
});
