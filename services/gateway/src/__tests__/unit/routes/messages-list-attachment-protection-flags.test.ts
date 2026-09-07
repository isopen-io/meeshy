/**
 * #5125 — la liste de messages sert enfin les trois drapeaux de protection
 * PROPRES à la pièce jointe (`isViewOnce`/`isBlurred`/`effectFlags` sur
 * `MessageAttachment`), pas seulement ceux de son message porteur.
 *
 * Les deux niveaux sont INDÉPENDANTS (voir `routes/admin/media-protection.ts`,
 * doc-comment de `attachmentProtectionSelect`) : un message ordinaire peut
 * porter une pièce jointe floutée seule, et `attachmentMediaSelect` — la forme
 * PARTAGÉE par les notifications, les listes admin et cette liste — exclut
 * délibérément les drapeaux de sécurité (voir son doc-comment dans
 * `attachmentIncludes.ts`). Cette liste doit donc composer
 * `{ ...attachmentMediaSelect, ...attachmentProtectionSelect }`, exactement
 * comme `routes/admin/content.ts` le fait déjà pour la même raison (#4333).
 *
 * Deux témoins, deux couches :
 *   1. la REQUÊTE — `buildMessageListSelect` demande bien les trois colonnes
 *      sur `attachments.select` (un témoin de rang ne peut voir que la
 *      requête ; un mock Prisma qui ignore `select` rendrait ce témoin
 *      trivialement vert sur la couche de sérialisation seule).
 *   2. la RÉPONSE SERVIE — un attachement dont les trois drapeaux DIFFÈRENT
 *      de ceux du message porteur arrive avec ses PROPRES valeurs, à travers
 *      le vrai sérialiseur (`app.inject`), jamais un statut seul.
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
import { buildMessageListSelect } from '../../../routes/conversations/messages-list-query';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

describe('buildMessageListSelect — la requête demande les drapeaux de protection PAR PIÈCE', () => {
  it('attachments.select porte isViewOnce, isBlurred et effectFlags', () => {
    const select = buildMessageListSelect({ includeTranslations: false, includeReplies: false });
    const attachmentsSelect = select.attachments.select;

    expect(attachmentsSelect).toMatchObject({
      isViewOnce: true,
      isBlurred: true,
      effectFlags: true,
    });
  });
});

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_USER_ID = '507f1f77bcf86cd799439022';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439023';
const READER_USER_ID = '507f1f77bcf86cd799439031';
const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439032';
const MESSAGE_ID = '507f1f77bcf86cd799439041';
const ATTACHMENT_ID = '507f1f77bcf86cd799439046';
const CREATED_AT = new Date('2026-08-01T10:00:00.000Z');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const participants = [
    { id: SENDER_PARTICIPANT_ID, userId: SENDER_USER_ID, isActive: true },
    { id: READER_PARTICIPANT_ID, userId: READER_USER_ID, isActive: true },
  ];

  // #5125 — la pièce jointe est floutée à VUE UNIQUE, SEULE : le message
  // porteur, lui, ne déclare aucun des trois drapeaux. C'est exactement le
  // cas que `admin/media-protection.ts` documente comme non-mirroir.
  const blurredAttachment = {
    id: ATTACHMENT_ID,
    messageId: MESSAGE_ID,
    fileName: 'photo.jpg',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 12345,
    fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/photo.jpg',
    thumbnailUrl: null,
    thumbHash: null,
    imageVariants: null,
    width: 100,
    height: 100,
    duration: null,
    bitrate: null,
    sampleRate: null,
    codec: null,
    channels: null,
    fps: null,
    videoCodec: null,
    pageCount: null,
    lineCount: null,
    metadata: null,
    uploadedBy: SENDER_USER_ID,
    isAnonymous: false,
    createdAt: CREATED_AT,
    transcription: null,
    translations: null,
    reactions: [],
    isViewOnce: true,
    isBlurred: true,
    effectFlags: 2,
  };

  const carrier = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: SENDER_PARTICIPANT_ID,
    content: 'une photo',
    originalLanguage: 'fr',
    messageType: 'image',
    messageSource: 'user',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    isEdited: false,
    deletedAt: null,
    // Le message porteur ne déclare RIEN — la preuve que les deux niveaux
    // sont indépendants, pas que l'un hérite de l'autre.
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    validatedMentions: [],
    attachments: [blurredAttachment],
    deliveredCount: 0,
    readCount: 0,
    deliveredToAllAt: null,
    readByAllAt: null,
    sender: {
      id: SENDER_PARTICIPANT_ID,
      userId: SENDER_USER_ID,
      displayName: 'Expéditeur',
      user: { id: SENDER_USER_ID, username: 'expediteur' },
    },
  };

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(participants[1]),
      findMany: jest.fn().mockResolvedValue(participants),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([carrier]),
    },
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('GET /conversations/:id/messages — sert les drapeaux de protection PAR PIÈCE', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    clearPrivacyPreferencesCache();
    jest.clearAllMocks();
  });

  it("une pièce jointe floutée/à vue unique SEULE (message porteur non protégé) sert ses PROPRES drapeaux", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const attachment = body.data[0].attachments[0];

      expect(attachment.isViewOnce).toBe(true);
      expect(attachment.isBlurred).toBe(true);
      expect(attachment.effectFlags).toBe(2);
    } finally {
      await app.close();
    }
  });
});
