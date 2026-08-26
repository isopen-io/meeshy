/**
 * ADVERSAIRE — la source d'un transfert sort ENCORE, par l'URL de sa pièce jointe.
 *
 * `withoutForwardSource` / la garde REST omettent `forwardedFrom` et
 * `forwardedFromConversation`. Mais un transfert AVEC pièce jointe recopie la
 * ligne d'origine telle quelle (`MessageProcessor.copyForwardedAttachments` :
 * `filePath: att.filePath, fileUrl: att.fileUrl` — « les deux lignes désignent
 * le MÊME blob »), et l'URL de ce blob est construite par
 * `routes/uploads/tus-handler.ts` :
 *
 *     const relPath = path.join(year, month, userId, storedName);
 *     const fileUrl = `${publicUrl}/api/v1/attachments/file/${relPath}`;
 *
 * où `userId` est le `User.id` du téléverseur d'ORIGINE (JWT `userId`, l.103).
 *
 * `attachmentMediaSelect` sert `fileUrl` et `originalName` sur CHAQUE message
 * de la liste, et `cleanAttachmentsForApi` ne les réécrit pas. Le lecteur qui a
 * refusé — ou dont l'auteur a refusé — reçoit donc, dans la MÊME réponse d'où
 * le nom a été retiré, l'identifiant de l'auteur d'origine en clair dans un
 * chemin d'URL. `GET /users/:id` (`routes/users/profile.ts:891`, monté sous
 * `getOptionalAuth` — pas même d'authentification requise) le rend en
 * `displayName` / `username` / `avatar`.
 *
 * La règle est donc, pour tout transfert porteur d'un fichier, exactement ce
 * qu'elle prétendait ne pas être : un rideau.
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
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const CONV_ID = '507f1f77bcf86cd799439011';
const FORWARDER_USER_ID = '507f1f77bcf86cd799439022';
const FORWARDER_PARTICIPANT_ID = '507f1f77bcf86cd799439023';
const READER_USER_ID = '507f1f77bcf86cd799439031';
const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439032';
const MESSAGE_ID = '507f1f77bcf86cd799439041';
const ORIGIN_MESSAGE_ID = '507f1f77bcf86cd799439042';
const ORIGIN_CONV_ID = '507f1f77bcf86cd799439043';
const ORIGIN_SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';

/**
 * Le `User.id` de l'auteur d'ORIGINE — celui que la règle promet de taire.
 * C'est LUI que `tus-handler` grave dans le chemin du fichier.
 */
const ORIGIN_SENDER_USER_ID = '507f1f77bcf86cd799439045';
const ORIGIN_ATTACHMENT_ID = '507f1f77bcf86cd799439046';

/** Exactement la forme de `tus-handler.ts` : `${year}/${month}/${userId}/${storedName}`. */
const LEAKED_FILE_URL = `https://gate.meeshy.me/api/v1/attachments/file/2026/08/${ORIGIN_SENDER_USER_ID}/photo_de_vacances_9f2c.jpg`;
const LEAKED_THUMB_URL = `https://gate.meeshy.me/api/v1/attachments/file/2026/08/${ORIGIN_SENDER_USER_ID}/thumb_photo_de_vacances_9f2c.jpg`;

const CREATED_AT = new Date('2026-08-01T10:00:00.000Z');

type Options = { readonly optedOut?: readonly string[] };

async function buildApp({ optedOut = [] }: Options): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const participants = [
    { id: FORWARDER_PARTICIPANT_ID, userId: FORWARDER_USER_ID, isActive: true },
    { id: READER_PARTICIPANT_ID, userId: READER_USER_ID, isActive: true },
  ];

  /**
   * La COPIE issue du transfert. `uploadedBy` est bien le transféreur (la copie
   * ne ment pas sur son propriétaire) — mais `fileUrl`/`thumbnailUrl` sont ceux
   * de l'original, mot pour mot, comme les écrit `copyForwardedAttachments`.
   */
  const forwardedAttachmentCopy = {
    id: '507f1f77bcf86cd799439047',
    messageId: MESSAGE_ID,
    fileName: 'photo_de_vacances_9f2c.jpg',
    originalName: 'photo_de_vacances.jpg',
    mimeType: 'image/jpeg',
    fileSize: 12345,
    fileUrl: LEAKED_FILE_URL,
    thumbnailUrl: LEAKED_THUMB_URL,
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
    uploadedBy: FORWARDER_USER_ID,
    isAnonymous: false,
    createdAt: CREATED_AT,
    transcription: null,
    translations: null,
    reactions: [],
    forwardedFromAttachmentId: ORIGIN_ATTACHMENT_ID,
    isForwarded: true,
  };

  const carrier = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: FORWARDER_PARTICIPANT_ID,
    content: 'regarde',
    originalLanguage: 'fr',
    messageType: 'image',
    messageSource: 'user',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    isEdited: false,
    deletedAt: null,
    validatedMentions: [],
    attachments: [forwardedAttachmentCopy],
    deliveredCount: 0,
    readCount: 0,
    deliveredToAllAt: null,
    readByAllAt: null,
    forwardedFromId: ORIGIN_MESSAGE_ID,
    forwardedFromConversationId: ORIGIN_CONV_ID,
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
    messageType: 'image',
    createdAt: CREATED_AT,
    metadata: null,
    sender: {
      id: ORIGIN_SENDER_PARTICIPANT_ID,
      userId: ORIGIN_SENDER_USER_ID,
      displayName: 'Auteur Origine',
      avatar: null,
      user: { username: 'auteur_origine' },
    },
    attachments: [{ id: ORIGIN_ATTACHMENT_ID, mimeType: 'image/jpeg', thumbnailUrl: LEAKED_THUMB_URL, fileUrl: LEAKED_FILE_URL }],
  };

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(participants[1]),
      findMany: jest.fn().mockResolvedValue(participants),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn((args: any) => Promise.resolve(args?.where?.id?.in ? [origin] : [carrier])),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([
        { id: ORIGIN_CONV_ID, title: 'Groupe Public Source', identifier: 'mshy_source', type: 'public', avatar: null },
      ]),
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
    userPreferences: {
      findMany: jest.fn((args: any) =>
        Promise.resolve(
          (args?.where?.userId?.in ?? [])
            .filter((id: string) => optedOut.includes(id))
            .map((userId: string) => ({ userId, privacy: { showForwardSource: false } }))
        )
      ),
    },
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

async function fetchBody(options: Options): Promise<string> {
  const app = await buildApp(options);
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    expect(res.statusCode).toBe(200);
    return res.body;
  } finally {
    await app.close();
  }
}

describe("ADVERSAIRE — la source sort par l'URL de la pièce jointe copiée", () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    clearPrivacyPreferencesCache();
    jest.clearAllMocks();
  });

  it("l'AUTEUR du transfert a désactivé : le nom part, mais l'identifiant de l'auteur d'origine reste dans le chemin du fichier", async () => {
    const body = await fetchBody({ optedOut: [FORWARDER_USER_ID] });

    // La garde fonctionne pour ce qu'elle couvre.
    expect(body).not.toContain('Auteur Origine');
    expect(body).not.toContain('auteur_origine');

    // …et la MÊME réponse porte l'identité qu'elle prétend taire.
    expect(body).not.toContain(ORIGIN_SENDER_USER_ID);
  });

  it('le LECTEUR a désactivé : même fuite, du côté du lecteur', async () => {
    const body = await fetchBody({ optedOut: [READER_USER_ID] });

    expect(body).not.toContain('Auteur Origine');
    expect(body).not.toContain(ORIGIN_SENDER_USER_ID);
  });

  it("les DEUX ont désactivé : la fuite ne dépend d'aucune préférence — elle est structurelle", async () => {
    const body = await fetchBody({ optedOut: [FORWARDER_USER_ID, READER_USER_ID] });

    expect(body).not.toContain(ORIGIN_SENDER_USER_ID);
  });
});
