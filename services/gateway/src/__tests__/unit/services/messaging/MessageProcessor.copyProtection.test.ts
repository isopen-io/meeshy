/**
 * @jest-environment node
 *
 * La copie ne sort pas moins protégée que sa source (#9572) — côté ÉCRITURE
 * (`MessageProcessor.saveMessage`) : chaque pièce transférée garde SA
 * protection, un transfert sans verdict d'admission ne s'écrit pas, une
 * diffusion hérite de la protection de sa source et refuse une source
 * introuvable avant d'écrire. Ces cas ont quitté `MessageProcessor.test.ts`,
 * hors budget de taille.
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

describe('MessageProcessor.saveMessage', () => {
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
    mockShouldProcess.mockReturnValue(false);
    mockBuildPostReplyTo.mockReturnValue({ id: 'post-1', type: 'STATUS' });
    processor = makeProcessor();
  });

  it('recopie la protection PROPRE à chaque pièce transférée (#9572)', async () => {
    const piece = {
      id: 'orig-att', fileName: 'f.jpg', originalName: 'f.jpg', mimeType: 'image/jpeg', fileSize: 10,
      filePath: '/uploads/f.jpg', fileUrl: 'https://cdn/f.jpg',
      isViewOnce: false, isBlurred: true, effectFlags: 2,
    };
    attFindMany.mockResolvedValueOnce([piece]).mockResolvedValue([]);
    attCreate.mockResolvedValue({ ...piece });

    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id', forwardImposes: null });

    expect(attCreate.mock.calls[0][0].data).toMatchObject({
      isViewOnce: false,
      isBlurred: true,
      effectFlags: 2,
      isForwarded: true,
      forwardedFromAttachmentId: 'orig-att',
    });
  });

  it('handles empty original attachments on forward gracefully', async () => {
    attFindMany.mockResolvedValueOnce([]).mockResolvedValue([]);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id', forwardImposes: null });
    expect(attCreate).not.toHaveBeenCalled();
  });

  it('refuse d’écrire un transfert sans verdict d’admission (#9572)', async () => {
    await expect(processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' })).rejects.toThrow('forward:not-admitted');
    expect(msgCreate).not.toHaveBeenCalled();
  });

  describe('diffusion via copyAttachmentsFromMessageId', () => {
    const SOURCE_MSG_ID = 'orig-msg-id';

    it('fait hériter la copie de la protection de sa source, message ET pièces (#9572)', async () => {
      msgFindUnique.mockResolvedValue({
        ...ORDINARY_SOURCE,
        attachments: [{ isViewOnce: true, isBlurred: false, effectFlags: 4 }],
        sender: { id: SENDER_ID, userId: 'user-1' },
      });
      partFindUnique.mockResolvedValue({ id: SENDER_ID, userId: 'user-1' });
      const origAtt = {
        id: 'orig-att', fileName: 'f.jpg', originalName: 'f.jpg', mimeType: 'image/jpeg', fileSize: 10,
        filePath: '/uploads/f.jpg', fileUrl: 'https://cdn/f.jpg', isViewOnce: true, isBlurred: false, effectFlags: 4,
      };
      attFindMany.mockResolvedValueOnce([origAtt]).mockResolvedValue([]);
      attCreate.mockResolvedValue({ ...origAtt });

      await processor.saveMessage({ ...baseData, copyAttachmentsFromMessageId: SOURCE_MSG_ID });

      const written = msgCreate.mock.calls[0][0].data;
      expect(written.isViewOnce).toBe(true);
      expect(written.effectFlags & 4).toBe(4);
      expect(attCreate.mock.calls[0][0].data).toMatchObject({ isViewOnce: true, effectFlags: 4 });
      expect(attCreate.mock.calls[0][0].data.isForwarded).toBeUndefined();
    });

    it('refuse une diffusion dont la source est introuvable, AVANT d’écrire le message (#9572)', async () => {
      msgFindUnique.mockResolvedValue(null);

      await expect(
        processor.saveMessage({ ...baseData, copyAttachmentsFromMessageId: SOURCE_MSG_ID })
      ).rejects.toThrow('copy-attachments:source-unavailable');

      expect(msgCreate).not.toHaveBeenCalled();
    });
  });
});
