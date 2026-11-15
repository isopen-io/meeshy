/**
 * #5108 — `GET /conversations/:id/messages?languages=` canonicalise ses codes
 * avant de filtrer, comme le jumeau socket (`normalizeGroupLanguage` →
 * `normalizeLanguageCode`, `socketio/utils/message-payload-filter.ts`).
 *
 * Les codes arrivent VERBATIM du client (SDK iOS : `Locale.current.identifier`
 * → `en_US`/`pt_BR` ; web : `Accept-Language` → `en-US`/`pt-BR`), pendant que
 * les traductions sont stockées sous des clés canoniques 2-lettres
 * (`Message.translations`, `MessageAttachment.translations`). Un simple
 * `.toLowerCase()` sur `?languages=pt-BR` produit le filtre `['pt-br']`, qui ne
 * matche jamais la clé stockée `'pt'` : la traduction est PRUNÉE et le lecteur
 * retombe sur l'original — violation directe du Prisme (règle 2, la locale
 * appareil, rang 4, diffère de la langue applicative).
 *
 * Ce filtre alimente TROIS surfaces qui le partagent : les traductions texte
 * (`transformTranslationsToArray`), le message cité (`servedQuotedMessage`) et
 * les pistes audio du Prisme (`cleanAttachmentsForApi`) — les trois se
 * contentent d'un `.toLowerCase()` en aval, donc canonicaliser une fois à la
 * frontière (`messages-list.ts`) répare les trois d'un coup.
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

const mockVerdict = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  verdictAccesConversation: (...args: any[]) => mockVerdict(...args),
  canAccessConversation: async (...args: any[]) => (await mockVerdict(...args)).genre === 'ok',
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

// ─── Le jeu de données ─────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const SENDER_USER_ID = '507f1f77bcf86cd799439044';
const MESSAGE_ID = '507f1f77bcf86cd799439055';
const ATTACHMENT_ID = '507f1f77bcf86cd799439066';

const CREATED_AT = new Date('2026-09-01T10:00:00.000Z');

/**
 * Un message dont les traductions texte ET audio (Prisme) ne sont stockées
 * QUE sous les clés canoniques 2-lettres — exactement la forme de
 * `Message.translations` / `MessageAttachment.translations` en base.
 */
const messageRow = {
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  senderId: SENDER_PARTICIPANT_ID,
  content: 'Bom dia',
  originalLanguage: 'pt',
  messageType: 'text',
  messageSource: 'user',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  storyReplyToId: null,
  forwardedFromId: null,
  forwardedFromConversationId: null,
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  pinnedAt: null,
  pinnedBy: null,
  reactionSummary: {},
  reactionCount: 0,
  isEncrypted: false,
  encryptionMode: null,
  validatedMentions: [],
  deliveredCount: 0,
  readCount: 0,
  deliveredToAllAt: null,
  readByAllAt: null,
  translations: {
    pt: { text: 'Bom dia', translationModel: 'premium', createdAt: CREATED_AT },
    es: { text: 'Buenos días', translationModel: 'premium', createdAt: CREATED_AT },
  },
  sender: {
    id: SENDER_PARTICIPANT_ID,
    userId: SENDER_USER_ID,
    displayName: 'Auteur',
    avatar: null,
    type: 'member',
    isOnline: false,
    lastActiveAt: null,
    user: { id: SENDER_USER_ID, username: 'auteur', displayName: 'Auteur', avatar: null, isOnline: false, lastActiveAt: null },
  },
  attachments: [
    {
      id: ATTACHMENT_ID,
      messageId: MESSAGE_ID,
      fileName: 'voice.mp3',
      mimeType: 'audio/mp3',
      fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/voice.mp3',
      transcription: null,
      translations: {
        pt: { type: 'audio', transcription: 'Bom dia', createdAt: CREATED_AT, url: 'https://gate.meeshy.me/api/v1/attachments/file/voice-pt.mp3' },
        es: { type: 'audio', transcription: 'Buenos días', createdAt: CREATED_AT, url: 'https://gate.meeshy.me/api/v1/attachments/file/voice-es.mp3' },
      },
      reactions: [],
    },
  ],
  _count: { reactions: 0, replies: 0 },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'reader-part-id',
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: { role: 'USER' },
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userConversationPreferences: { findFirst: jest.fn().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn().mockResolvedValue([]) },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([messageRow]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    conversationReadCursor: { findMany: jest.fn().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
    },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const auth = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  return app;
}

async function fetchMessage(query: string): Promise<any> {
  const app = buildApp();
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages${query}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return body.data[0];
  } finally {
    await app.close();
  }
}

const targetLanguages = (message: any): string[] =>
  (message.translations ?? []).map((t: any) => t.targetLanguage);

describe('#5108 — le filtre `?languages=` canonicalise ses codes avant de filtrer', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockVerdict.mockResolvedValue({ genre: 'ok' });
  });

  it("`?languages=pt-BR` (tiret, casse SDK iOS) sert la traduction 'pt', pas une liste vide", async () => {
    const message = await fetchMessage('?languages=pt-BR');
    expect(targetLanguages(message)).toEqual(['pt']);
  });

  it("`?languages=pt_BR` (underscore, `Locale.current.identifier`) sert la traduction 'pt'", async () => {
    const message = await fetchMessage('?languages=pt_BR');
    expect(targetLanguages(message)).toEqual(['pt']);
  });

  it("`?languages=pt-BR,es-ES` sert les DEUX traductions canoniques", async () => {
    const message = await fetchMessage('?languages=pt-BR,es-ES');
    expect(targetLanguages(message).sort()).toEqual(['es', 'pt']);
  });

  it("un code déjà canonique (`?languages=es`) continue de fonctionner — non-régression", async () => {
    const message = await fetchMessage('?languages=es');
    expect(targetLanguages(message)).toEqual(['es']);
  });

  it("`?languages=pt-BR` sert aussi la piste audio du Prisme sur la pièce jointe (jumeau `cleanAttachmentsForApi`)", async () => {
    const message = await fetchMessage('?languages=pt-BR');
    expect(Object.keys(message.attachments[0].translations)).toEqual(['pt']);
  });
});
