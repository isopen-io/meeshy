/**
 * @jest-environment node
 *
 * #19956 — un échec de pièce jointe ne laisse pas une bulle VIDE annoncée
 * « envoyée ». Trois branches, trois verdicts, observés sur la ligne
 * `Message` à travers `MessageProcessor.saveMessage` :
 *
 * - la LIAISON des pièces pré-téléversées lève  ⇒ l'envoi ÉCHOUE, la ligne est
 *   supprimée (donc le `clientMessageId` est rendu) et les pièces déjà liées
 *   sont LIBÉRÉES, pour que la reprise reconstruise un message COMPLET ;
 * - la COPIE d'une diffusion lève ⇒ même verdict, sans libération (la jumelle
 *   qui portait la règle en commentaire depuis toujours, et n'avait AUCUN
 *   témoin) ;
 * - le SCELLEMENT au repos lève APRÈS une liaison réussie ⇒ l'envoi RÉUSSIT,
 *   rien n'est supprimé, et le départ de l'audio — qui n'a aucun rattrapage —
 *   n'est pas emporté avec lui.
 *
 * Harnais repris de `MessageProcessor.copyProtection.test.ts`.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';

// ── Module-level mocks ─────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
    warn: jest.fn(),
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_name: unknown, fn: () => unknown) => fn()),
  },
}));

const mockFindExistingTrackingLink = jest.fn() as jest.Mock<any>;
const mockCreateTrackingLink = jest.fn() as jest.Mock<any>;
const mockCollectContentTrackingLinks = jest.fn(async () => []) as jest.Mock<any>;
// L'algorithme `<url>` vit dans `TrackingLinkService` et n'est
// testé QUE là (`TrackingLinkService.test.ts`). MessageProcessor en portait un
// second exemplaire complet ; il n'en garde que la délégation, donc c'est la
// délégation — pas l'algorithme — que ces tests décrivent. Identité par
// défaut : un test qui ne parle pas de liens voit son contenu ressortir intact.
const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
) as jest.Mock<any>;
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: (...a: any[]) => mockFindExistingTrackingLink(...a),
    createTrackingLink: (...a: any[]) => mockCreateTrackingLink(...a),
    collectContentTrackingLinks: (...a: any[]) => mockCollectContentTrackingLinks(...a),
    processExplicitLinksInContent: (...a: any[]) => mockProcessExplicitLinksInContent(...a),
  })),
}));

const mockExtractMentions = jest.fn() as jest.Mock<any>;
const mockExtractMentionsWithParticipants = jest.fn() as jest.Mock<any>;
const mockResolveUsernames = jest.fn() as jest.Mock<any>;
const mockValidateMentionPermissions = jest.fn() as jest.Mock<any>;
const mockCreateMentions = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...a: any[]) => mockExtractMentions(...a),
    extractMentionsWithParticipants: (...a: any[]) => mockExtractMentionsWithParticipants(...a),
    resolveUsernames: (...a: any[]) => mockResolveUsernames(...a),
    validateMentionPermissions: (...a: any[]) => mockValidateMentionPermissions(...a),
    createMentions: (...a: any[]) => mockCreateMentions(...a),
  })),
}));

const mockEncryptMessage = jest.fn() as jest.Mock<any>;
const mockEncryptHybridServerLayer = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/EncryptionService', () => ({
  EncryptionService: jest.fn().mockImplementation(() => ({
    encryptMessage: (...a: any[]) => mockEncryptMessage(...a),
    encryptHybridServerLayer: (...a: any[]) => mockEncryptHybridServerLayer(...a),
  })),
}));

const mockCreateMessageNotification = jest.fn() as jest.Mock<any>;
const mockCreateReplyNotification = jest.fn() as jest.Mock<any>;
const mockCreateMentionNotificationsBatch = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    createMessageNotification: (...a: any[]) => mockCreateMessageNotification(...a),
    createReplyNotification: (...a: any[]) => mockCreateReplyNotification(...a),
    createMentionNotificationsBatch: (...a: any[]) => mockCreateMentionNotificationsBatch(...a),
  })),
}));
jest.mock('../../../../services/notifications/notification-preview', () => ({
  ...(jest.requireActual('../../../../services/notifications/notification-preview') as object),
  protectedPreview: jest.fn().mockReturnValue(null),
  // Cycle 125 — la JUMELLE média de `protectedPreview` : elle décide si le FICHIER d'une pièce jointe a le droit de voyager sur le push. Doublée ICI (et non laissée au `requireActual` ci-dessus) pour que l'éventail reste isolé du verdict réel, comme avant #7093.
  maskedAttachment: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

const mockAssociateAttachmentsToMessage = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    associateAttachmentsToMessage: (...a: any[]) => mockAssociateAttachmentsToMessage(...a),
  })),
}));

const mockShouldProcess = jest.fn() as jest.Mock<any>;
jest.mock('../../../../utils/transcription', () => ({
  shouldProcessAudioAttachment: (...a: any[]) => mockShouldProcess(...a),
}));

const mockBuildPostReplyTo = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: (...a: any[]) => mockBuildPostReplyTo(...a),
  POST_REPLY_SNAPSHOT_SELECT: {},
  postReplyToFromMetadata: jest.fn().mockReturnValue(null),
}));

const mockCopyAttachmentsFromMessage = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/messaging/copyAttachments', () => ({
  ...(jest.requireActual('../../../../services/messaging/copyAttachments') as object),
  copyAttachmentsFromMessage: (...a: any[]) => mockCopyAttachmentsFromMessage(...a),
}));

// `jest.requireActual` + surcharge CIBLÉE : un double partiel de ce module
// retirerait `SERVER_AT_REST_FILE_SEAL_FAILED`, que la loi importe, et
// `sendCarriesFiles`, que `saveMessage` appelle (patron du cycle 93).
const mockSealAtRest = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/messaging/sealMessageAttachments', () => ({
  ...(jest.requireActual('../../../../services/messaging/sealMessageAttachments') as object),
  requireFileSealingKey: jest.fn(async () => undefined),
  gatewaySealDeps: jest.fn(() => ({})),
  sealMessageAttachmentsAtRest: (...a: any[]) => mockSealAtRest(...a),
}));

// ── Import after all mocks ─────────────────────────────────────────────────

import { MessageProcessor } from '../../../../services/messaging/MessageProcessor';

// ── Prisma helpers ─────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';

// Module-scoped prisma mock functions so they can be re-configured per test
const convFindUnique = jest.fn() as jest.Mock<any>;
const msgCreate = jest.fn() as jest.Mock<any>;
const msgFindFirst = jest.fn() as jest.Mock<any>;
const msgFindUnique = jest.fn() as jest.Mock<any>;
const msgUpdate = jest.fn() as jest.Mock<any>;
const msgDelete = jest.fn() as jest.Mock<any>;
const attFindMany = jest.fn() as jest.Mock<any>;
const attCreate = jest.fn() as jest.Mock<any>;
const attUpdateMany = jest.fn() as jest.Mock<any>;
const partFindUnique = jest.fn() as jest.Mock<any>;
const partFindFirst = jest.fn() as jest.Mock<any>;
const partFindMany = jest.fn() as jest.Mock<any>;
const tlUpdateMany = jest.fn() as jest.Mock<any>;
const userFindUnique = jest.fn() as jest.Mock<any>;
const userFindMany = jest.fn() as jest.Mock<any>;
const prefFindMany = jest.fn() as jest.Mock<any>;
const postFindUnique = jest.fn() as jest.Mock<any>;

const prisma: PrismaClient = {
  conversation: { findUnique: convFindUnique },
  message: { create: msgCreate, findFirst: msgFindFirst, findUnique: msgFindUnique, update: msgUpdate, delete: msgDelete },
  messageAttachment: { findMany: attFindMany, create: attCreate, updateMany: attUpdateMany },
  participant: { findUnique: partFindUnique, findFirst: partFindFirst, findMany: partFindMany },
  trackingLink: { updateMany: tlUpdateMany },
  user: { findUnique: userFindUnique, findMany: userFindMany },
  userConversationPreferences: { findMany: prefFindMany },
  post: { findUnique: postFindUnique },
} as unknown as PrismaClient;

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: SENDER_ID,
    content: 'Hello',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEncrypted: false,
    encryptionMode: null,
    encryptedContent: null,
    encryptionMetadata: null,
    replyToId: null,
    storyReplyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    isBlurred: false,
    expiresAt: null,
    isViewOnce: false,
    maxViewOnceCount: null,
    effectFlags: 0,
    deletedAt: null,
    clientMessageId: null,
    metadata: null,
    translations: null,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [],
    ...overrides,
  } as unknown as Message;
}

function makeProcessor(notificationService?: object): MessageProcessor {
  if (notificationService) {
    return new MessageProcessor(prisma, notificationService as never);
  }
  return new MessageProcessor(prisma);
}

function resetPrisma() {
  convFindUnique.mockReset();
  msgCreate.mockReset();
  msgFindFirst.mockReset();
  msgFindUnique.mockReset();
  msgUpdate.mockReset();
  msgDelete.mockReset();
  attFindMany.mockReset();
  attCreate.mockReset();
  attUpdateMany.mockReset();
  partFindUnique.mockReset();
  partFindFirst.mockReset();
  partFindMany.mockReset();
  tlUpdateMany.mockReset();
  userFindUnique.mockReset();
  userFindMany.mockReset();
  prefFindMany.mockReset();
  postFindUnique.mockReset();

  // Sensible defaults
  convFindUnique.mockResolvedValue({ encryptionMode: null, encryptionEnabledAt: null, serverEncryptionKeyId: null });
  msgCreate.mockResolvedValue(makeMessage());
  msgFindFirst.mockResolvedValue(null);
  msgFindUnique.mockResolvedValue(null);
  msgUpdate.mockResolvedValue(makeMessage());
  msgDelete.mockResolvedValue(makeMessage());
  attFindMany.mockResolvedValue([]);
  attCreate.mockResolvedValue({});
  attUpdateMany.mockResolvedValue({});
  partFindUnique.mockResolvedValue(null);
  partFindFirst.mockResolvedValue(null);
  partFindMany.mockResolvedValue([]);
  tlUpdateMany.mockResolvedValue({});
  userFindUnique.mockResolvedValue(null);
  userFindMany.mockResolvedValue([]);
  prefFindMany.mockResolvedValue([]);
  postFindUnique.mockResolvedValue(null);
}

const baseData = {
  conversationId: CONV_ID,
  senderId: SENDER_ID,
  content: 'Hello world',
  originalLanguage: 'fr',
} as const;

// La projection ENTIÈRE qu'exige la lecture de protection d'une source de copie (#9572).
const ORDINARY_SOURCE = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null, forwardedFromId: null, attachments: [] };

const AT_REST_REGIME = { encryptionMode: 'server', encryptionEnabledAt: new Date('2026-01-01T00:00:00Z'), serverEncryptionKeyId: 'k1' };

const flushDetached = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('MessageProcessor.saveMessage — l’échec d’une pièce jointe (#19956)', () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    resetPrisma();
    mockExtractMentions.mockReturnValue([]);
    mockExtractMentionsWithParticipants.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [] });
    mockCreateMentions.mockResolvedValue(undefined);
    mockAssociateAttachmentsToMessage.mockResolvedValue(undefined);
    mockCopyAttachmentsFromMessage.mockResolvedValue(undefined);
    mockSealAtRest.mockResolvedValue(undefined);
    mockShouldProcess.mockReturnValue(false);
    mockBuildPostReplyTo.mockReturnValue({ id: 'post-1', type: 'STATUS' });
    processor = new MessageProcessor(prisma, undefined, {} as never);
  });

  describe('la LIAISON des pièces pré-téléversées lève', () => {
    const sendWithPieces = () =>
      processor.saveMessage({ ...baseData, content: '', attachmentIds: ['att-1', 'att-2'] } as never);

    it('fait ÉCHOUER l’envoi au lieu de rendre une bulle vide « envoyée »', async () => {
      mockAssociateAttachmentsToMessage.mockRejectedValue(new Error('link failed'));

      await expect(sendWithPieces()).rejects.toThrow('link failed');
    });

    it('supprime la ligne `Message`, donc rend le `clientMessageId` à la reprise', async () => {
      mockAssociateAttachmentsToMessage.mockRejectedValue(new Error('link failed'));

      await expect(sendWithPieces()).rejects.toThrow();

      expect(msgDelete).toHaveBeenCalledWith({ where: { id: MSG_ID } });
    });

    it('LIBÈRE les pièces déjà liées — sans quoi le rejeu reconstruirait un message amputé', async () => {
      mockAssociateAttachmentsToMessage.mockRejectedValue(new Error('link failed'));

      await expect(sendWithPieces()).rejects.toThrow();

      expect(attUpdateMany).toHaveBeenCalledWith({ where: { messageId: MSG_ID }, data: { messageId: null } });
    });

    it('ne scelle rien et ne lance aucun audio sur un message qui n’existe plus', async () => {
      mockAssociateAttachmentsToMessage.mockRejectedValue(new Error('link failed'));

      await expect(sendWithPieces()).rejects.toThrow();
      await flushDetached();

      expect(mockSealAtRest).not.toHaveBeenCalled();
      expect(mockShouldProcess).not.toHaveBeenCalled();
    });

    it('ne touche à rien quand la liaison réussit', async () => {
      await processor.saveMessage({ ...baseData, content: '', attachmentIds: ['att-1'] } as never);

      expect(msgDelete).not.toHaveBeenCalled();
      expect(attUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('la COPIE d’une diffusion lève', () => {
    const SOURCE_MSG_ID = 'orig-msg-id';

    const sendCopy = () => {
      msgFindUnique.mockResolvedValue({ ...ORDINARY_SOURCE, sender: { id: SENDER_ID, userId: 'user-1' } });
      partFindUnique.mockResolvedValue({ id: SENDER_ID, userId: 'user-1' });
      return processor.saveMessage({ ...baseData, copyAttachmentsFromMessageId: SOURCE_MSG_ID } as never);
    };

    it('fait ÉCHOUER l’envoi et supprime la ligne `Message`', async () => {
      mockCopyAttachmentsFromMessage.mockRejectedValue(new Error('copy failed'));

      await expect(sendCopy()).rejects.toThrow('copy failed');

      expect(msgDelete).toHaveBeenCalledWith({ where: { id: MSG_ID } });
    });

    it('ne LIBÈRE rien : les lignes recopiées sont nées avec ce message', async () => {
      mockCopyAttachmentsFromMessage.mockRejectedValue(new Error('copy failed'));

      await expect(sendCopy()).rejects.toThrow();

      expect(attUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('le SCELLEMENT au repos lève APRÈS une liaison réussie', () => {
    const sendSealed = () => {
      convFindUnique.mockResolvedValue(AT_REST_REGIME);
      return processor.saveMessage({ ...baseData, content: '', attachmentIds: ['att-1'] } as never);
    };

    it('ne fait PAS échouer l’envoi : les pièces sont liées, le rattrapage rejoue le scellement', async () => {
      mockSealAtRest.mockRejectedValue(new Error('keyring unavailable'));

      await expect(sendSealed()).resolves.toMatchObject({ id: MSG_ID });
    });

    it('ne supprime rien et ne libère rien', async () => {
      mockSealAtRest.mockRejectedValue(new Error('keyring unavailable'));

      await sendSealed();

      expect(msgDelete).not.toHaveBeenCalled();
      expect(attUpdateMany).not.toHaveBeenCalled();
    });

    it('n’emporte PAS le départ de l’audio, qui n’a aucun rattrapage', async () => {
      mockSealAtRest.mockRejectedValue(new Error('keyring unavailable'));
      attFindMany.mockResolvedValue([{ id: 'att-1', mimeType: 'audio/m4a', fileUrl: 'u', filePath: '/p', duration: 1000, metadata: null, transcription: null }]);

      await sendSealed();
      await flushDetached();

      expect(mockShouldProcess).toHaveBeenCalled();
    });
  });
});
