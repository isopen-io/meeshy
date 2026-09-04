/**
 * Le filtre bandwidth `?languages=` de GET /conversations/:id/messages
 * canonicalise les codes du CLIENT avant de tailler les traductions.
 *
 * Le Prisme voyage en clair sur le fil : un client (SDK iOS surtout, dont la
 * liste est « opaque » et peut porter la locale appareil du rang 4 —
 * `Locale.current.identifier`, soit `en_US` / `pt_BR`) demande ses langues via
 * `?languages=…`. La passerelle stocke ses traductions sous des clés CANONIQUES
 * 2-lettres (`transformTranslationsToArray` lit `Message.translations` : une
 * carte `langue → {text}` dont les clés sont les cibles NLLB résolues).
 *
 * Le chemin SOCKET canonicalise déjà la langue du destinataire avant de tailler
 * (`normalizeGroupLanguage` → `normalizeLanguageCode`, `message-payload-filter.ts`).
 * Le chemin REST, jumeau bande-passante, ne faisait qu'un `.toLowerCase()` sur
 * le paramètre : `pt-BR` produisait le filtre `['pt-br']`, qui ne matche jamais
 * la clé stockée `pt`. La traduction était PRUNÉE et le lecteur retombait sur
 * l'original — violation directe du Prisme, sur le cas nominal de la règle 2
 * (la locale appareil diffère de la langue applicative).
 *
 * Le correctif canonicalise le paramètre à la frontière (`messages-list.ts`,
 * `normalizeLanguageForDedup`) — symétrique exact du chemin socket, et unique
 * source pour les TROIS surfaces qui partagent ce filtre : traductions texte,
 * message cité, et pistes audio du Prisme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

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

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439023';
const MESSAGE_ID = '507f1f77bcf86cd799439041';
const CREATED_AT = new Date('2026-08-01T10:00:00.000Z');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const translation = (text: string) => ({
    text,
    translationModel: 'nllb-200',
    confidenceScore: 0.95,
    isEncrypted: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  const message = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: PARTICIPANT_ID,
    content: 'Hello',
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    isEdited: false,
    deletedAt: null,
    validatedMentions: [],
    attachments: [],
    deliveredCount: 0,
    readCount: 0,
    deliveredToAllAt: null,
    readByAllAt: null,
    // Carte MongoDB : clés CANONIQUES 2-lettres (cibles NLLB résolues).
    translations: { pt: translation('Olá'), es: translation('Hola') },
    sender: {
      id: PARTICIPANT_ID,
      userId: USER_ID,
      displayName: 'Envoyeur',
      user: { id: USER_ID, username: 'envoyeur' },
    },
  };

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }]),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([message]),
    },
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'pt',
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
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

async function servedTargetLanguages(languagesParam: string): Promise<string[]> {
  const app = await buildApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/messages?include_translations=true&include_replies=false&languages=${encodeURIComponent(languagesParam)}`,
    });
    expect(res.statusCode).toBe(200);
    const first = res.json().data[0];
    return (first.translations ?? [])
      .map((t: { targetLanguage: string }) => t.targetLanguage)
      .sort();
  } finally {
    await app.close();
  }
}

describe('GET /conversations/:id/messages — canonicalisation du filtre ?languages=', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    jest.clearAllMocks();
  });

  it('garde la traduction pt quand le client demande une variante RÉGIONALE (pt-BR)', async () => {
    expect(await servedTargetLanguages('pt-BR')).toEqual(['pt']);
  });

  it('garde la traduction pt pour une locale appareil style Locale.current (pt_BR, underscore)', async () => {
    expect(await servedTargetLanguages('pt_BR')).toEqual(['pt']);
  });

  it('collapse les variantes en dédupliquant sur la clé canonique (pt-BR + PT → un seul pt)', async () => {
    expect(await servedTargetLanguages('pt-BR,PT')).toEqual(['pt']);
  });

  it('reste correct pour un code déjà canonique (es)', async () => {
    expect(await servedTargetLanguages('es')).toEqual(['es']);
  });

  it('sert plusieurs langues demandées ensemble (pt-BR + es-ES)', async () => {
    expect(await servedTargetLanguages('pt-BR,es-ES')).toEqual(['es', 'pt']);
  });
});
