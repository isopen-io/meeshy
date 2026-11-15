/**
 * `GET /conversations/:id/messages` — l'aperçu d'un message TRANSFÉRÉ ne doit
 * jamais faire resurgir, pour LE LECTEUR, un message qu'il a personnellement
 * masqué dans SA conversation source (#3616).
 *
 * `enrichForwardedMessagesForList` relit le message source par id
 * (`where: { id: { in: … } } }`), hors du `where` de la liste principale — donc
 * hors du bénéfice de `applyPersonalHistoryHiding` que porte cette dernière.
 * Sans le correctif, un lecteur ayant effacé son historique avant une date, ou
 * supprimé-pour-lui le message source précis, le reverrait intact dans
 * l'aperçu de transfert d'un AUTRE message, dans une AUTRE conversation.
 *
 * Ces témoins couvrent les DEUX formes de masquage personnel
 * (`clearHistoryBefore`, `UserMessageDeletion`), leur bornage PAR
 * CONVERSATION source (une coupure posée sur une conversation ne doit pas
 * masquer la source d'une AUTRE), et la non-régression du cas nominal (rien
 * de masqué ⇒ l'aperçu sert toujours).
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
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';

const FORWARDER_USER_ID = '507f1f77bcf86cd799439022';
const FORWARDER_PARTICIPANT_ID = '507f1f77bcf86cd799439023';

const READER_USER_ID = '507f1f77bcf86cd799439031';
const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439032';

const MESSAGE_ID = '507f1f77bcf86cd799439041';
const ORIGIN_MESSAGE_ID = '507f1f77bcf86cd799439042';
const ORIGIN_CONV_ID = '507f1f77bcf86cd799439043';
const ORIGIN_SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const ORIGIN_SENDER_USER_ID = '507f1f77bcf86cd799439045';

/** Une AUTRE conversation source, pour prouver le bornage PAR conversation. */
const UNRELATED_CONV_ID = '507f1f77bcf86cd799439046';
/** Un AUTRE message masqué, dans la même conversation source, pour prouver le bornage PAR message. */
const UNRELATED_ORIGIN_MESSAGE_ID = '507f1f77bcf86cd799439047';

const ORIGIN_CREATED_AT = new Date('2026-08-01T10:00:00.000Z');

type PersonalHiding = {
  readonly clearHistoryBefore?: { conversationId: string; before: Date };
  readonly hiddenMessageIds?: readonly { conversationId: string; messageId: string }[];
};

async function buildApp(hiding: PersonalHiding = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const participants = [
    { id: FORWARDER_PARTICIPANT_ID, userId: FORWARDER_USER_ID, isActive: true },
    { id: READER_PARTICIPANT_ID, userId: READER_USER_ID, isActive: true },
  ];

  const carrier = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: FORWARDER_PARTICIPANT_ID,
    content: 'regarde',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    createdAt: ORIGIN_CREATED_AT,
    updatedAt: ORIGIN_CREATED_AT,
    isEdited: false,
    deletedAt: null,
    validatedMentions: [],
    attachments: [],
    deliveredCount: 0,
    readCount: 0,
    deliveredToAllAt: null,
    readByAllAt: null,
    forwardedFromId: ORIGIN_MESSAGE_ID,
    forwardedFromConversationId: null,
    sender: {
      id: FORWARDER_PARTICIPANT_ID,
      userId: FORWARDER_USER_ID,
      displayName: 'Transfereur',
      user: { id: FORWARDER_USER_ID, username: 'transfereur' },
    },
  };

  const origin = {
    id: ORIGIN_MESSAGE_ID,
    content: "Message d'origine",
    senderId: ORIGIN_SENDER_PARTICIPANT_ID,
    conversationId: ORIGIN_CONV_ID,
    messageType: 'text',
    createdAt: ORIGIN_CREATED_AT,
    metadata: null,
    sender: {
      id: ORIGIN_SENDER_PARTICIPANT_ID,
      userId: ORIGIN_SENDER_USER_ID,
      displayName: 'Auteur Origine',
      avatar: null,
      user: { username: 'auteur_origine' },
    },
    attachments: [],
  };

  const page = [carrier];

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(participants[1]),
      findMany: jest.fn().mockResolvedValue(participants),
    },
    message: {
      count: jest.fn().mockResolvedValue(page.length),
      // Deux appels distincts : la PAGE, puis l'enrichissement des transferts.
      findMany: jest.fn((args: any) =>
        Promise.resolve(args?.where?.id?.in ? [origin] : page)
      ),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    userPreferences: { findMany: jest.fn().mockResolvedValue([]) },
    userPreference: { findMany: jest.fn().mockResolvedValue([]) },

    // ── Masquage personnel — les DEUX chargeurs de `personalHistoryFilter.ts` ──
    // `loadPersonalHistoryHiding` (singulier, la conversation LUE — CONV_ID) et
    // `loadPersonalHistoryHidingByConversation` (par lot, les conversations
    // SOURCE des transferts de la page) partagent ces deux tables.
    userConversationPreferences: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn((args: any) => {
        const ids: string[] = args?.where?.conversationId?.in ?? [];
        const before = hiding.clearHistoryBefore;
        if (!before || !ids.includes(before.conversationId)) return Promise.resolve([]);
        return Promise.resolve([
          { userId: READER_USER_ID, conversationId: before.conversationId, clearHistoryBefore: before.before },
        ]);
      }),
    },
    userMessageDeletion: {
      findMany: jest.fn((args: any) => {
        const conv = args?.where?.message?.conversationId;
        const ids: string[] = typeof conv === 'string' ? [conv] : (conv?.in ?? []);
        const hidden = hiding.hiddenMessageIds ?? [];
        return Promise.resolve(
          hidden
            .filter((h) => ids.includes(h.conversationId))
            .map((h) => ({
              userId: READER_USER_ID,
              messageId: h.messageId,
              message: { conversationId: h.conversationId },
            }))
        );
      }),
    },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: READER_USER_ID,
      registeredUser: { id: READER_USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

async function fetchMessage(hiding: PersonalHiding = {}): Promise<Record<string, unknown>> {
  const app = await buildApp(hiding);
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    expect(res.statusCode).toBe(200);
    return res.json().data[0];
  } finally {
    await app.close();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/messages — masquage personnel du message SOURCE d\'un transfert (#3616)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    clearPrivacyPreferencesCache();
  });

  it("sert l'aperçu de transfert quand le lecteur n'a rien masqué — non-régression", async () => {
    const message = await fetchMessage();

    expect(message.forwardedFrom).toBeDefined();
    expect((message.forwardedFrom as any).content).toBe("Message d'origine");
  });

  it('masque l\'aperçu quand le lecteur a supprimé-pour-lui le message SOURCE', async () => {
    const message = await fetchMessage({
      hiddenMessageIds: [{ conversationId: ORIGIN_CONV_ID, messageId: ORIGIN_MESSAGE_ID }],
    });

    expect(message.forwardedFrom ?? null).toBeNull();
    expect(JSON.stringify(message)).not.toContain("Message d'origine");
  });

  it("masque l'aperçu quand le lecteur a effacé son historique de la conversation SOURCE après la date du message", async () => {
    const message = await fetchMessage({
      clearHistoryBefore: { conversationId: ORIGIN_CONV_ID, before: new Date('2026-08-15T00:00:00.000Z') },
    });

    expect(message.forwardedFrom ?? null).toBeNull();
  });

  it("sert l'aperçu quand la coupure d'historique de la conversation SOURCE est ANTÉRIEURE au message", async () => {
    const message = await fetchMessage({
      clearHistoryBefore: { conversationId: ORIGIN_CONV_ID, before: new Date('2026-07-01T00:00:00.000Z') },
    });

    expect(message.forwardedFrom).toBeDefined();
  });

  it("ne masque PAS l'aperçu quand la suppression-pour-moi vise un AUTRE message de la même conversation source", async () => {
    const message = await fetchMessage({
      hiddenMessageIds: [{ conversationId: ORIGIN_CONV_ID, messageId: UNRELATED_ORIGIN_MESSAGE_ID }],
    });

    expect(message.forwardedFrom).toBeDefined();
  });

  it("ne masque PAS l'aperçu quand la coupure d'historique vise une AUTRE conversation", async () => {
    const message = await fetchMessage({
      clearHistoryBefore: { conversationId: UNRELATED_CONV_ID, before: new Date('2026-08-15T00:00:00.000Z') },
    });

    expect(message.forwardedFrom).toBeDefined();
  });

  it('conserve `forwardedFromId` même quand le contenu est masqué — le badge générique doit survivre', async () => {
    const message = await fetchMessage({
      hiddenMessageIds: [{ conversationId: ORIGIN_CONV_ID, messageId: ORIGIN_MESSAGE_ID }],
    });

    expect(message.forwardedFromId).toBe(ORIGIN_MESSAGE_ID);
  });
});
