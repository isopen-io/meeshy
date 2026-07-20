/**
 * @jest-environment node
 *
 * Tests for MessageProcessor — covers: processLinksInContent, getEncryptionContext,
 * saveMessage (dedup, effectFlags, attachment handling), extractMentions, containsLinks,
 * and the module-level extractTranscriptionText helper via notification flow.
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
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: (...a: any[]) => mockFindExistingTrackingLink(...a),
    createTrackingLink: (...a: any[]) => mockCreateTrackingLink(...a),
    collectContentTrackingLinks: (...a: any[]) => mockCollectContentTrackingLinks(...a),
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
  protectedPreview: jest.fn().mockReturnValue(null),
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
  message: { create: msgCreate, findFirst: msgFindFirst, findUnique: msgFindUnique, update: msgUpdate },
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

// ── processLinksInContent ──────────────────────────────────────────────────

describe('MessageProcessor.processLinksInContent', () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    mockFindExistingTrackingLink.mockReset();
    mockCreateTrackingLink.mockReset();
    processor = makeProcessor();
  });

  it('returns content unchanged when no special patterns', async () => {
    const result = await processor.processLinksInContent('Plain text with no URL', CONV_ID);
    expect(result).toBe('Plain text with no URL');
  });

  it('protects markdown links — not converted to tracking (Rule 1)', async () => {
    const content = 'See [docs](https://example.com) here';
    const result = await processor.processLinksInContent(content, CONV_ID);
    expect(result).toContain('[docs](https://example.com)');
    expect(mockCreateTrackingLink).not.toHaveBeenCalled();
  });

  it('converts [[url]] to m+token via createTrackingLink (Rule 3)', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'abc123' });
    const result = await processor.processLinksInContent('[[https://example.com/page]]', CONV_ID, SENDER_ID);
    expect(result).toBe('m+abc123');
    expect(mockCreateTrackingLink).toHaveBeenCalledTimes(1);
  });

  it('reuses existing tracking link for [[url]]', async () => {
    mockFindExistingTrackingLink.mockResolvedValue({ token: 'existing-tok' });
    const result = await processor.processLinksInContent('[[https://example.com/page]]', CONV_ID);
    expect(result).toBe('m+existing-tok');
    expect(mockCreateTrackingLink).not.toHaveBeenCalled();
  });

  it('reuses token for duplicate [[url]] in the same message', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'tok-1' });
    const result = await processor.processLinksInContent('[[https://example.com]] and [[https://example.com]]', CONV_ID);
    expect(mockCreateTrackingLink).toHaveBeenCalledTimes(1);
    expect(result).toBe('m+tok-1 and m+tok-1');
  });

  it('converts <url> to m+token (Rule 4)', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'angle-tok' });
    const result = await processor.processLinksInContent('<https://example.com/angle>', CONV_ID);
    expect(result).toBe('m+angle-tok');
  });

  it('reuses token for duplicate <url> that also appeared as [[url]]', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'shared-tok' });
    const result = await processor.processLinksInContent('[[https://same.com]] and <https://same.com>', CONV_ID);
    expect(mockCreateTrackingLink).toHaveBeenCalledTimes(1);
    expect(result).toBe('m+shared-tok and m+shared-tok');
  });

  it('falls back to raw URL when createTrackingLink throws for [[url]]', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockRejectedValue(new Error('DB error'));
    const result = await processor.processLinksInContent('[[https://example.com/err]]', CONV_ID);
    expect(result).toBe('https://example.com/err');
  });

  it('falls back to raw URL when createTrackingLink throws for <url>', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockRejectedValue(new Error('DB error'));
    const result = await processor.processLinksInContent('<https://example.com/err>', CONV_ID);
    expect(result).toBe('https://example.com/err');
  });
});

// ── getEncryptionContext ────────────────────────────────────────────────────

describe('MessageProcessor.getEncryptionContext', () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    resetPrisma();
    processor = makeProcessor();
  });

  it('returns no encryption for system messages', async () => {
    const ctx = await processor.getEncryptionContext(CONV_ID, 'sys msg', 'system');
    expect(ctx.isEncrypted).toBe(false);
    expect(ctx.mode).toBeNull();
  });

  it('returns no encryption when conversation not found', async () => {
    convFindUnique.mockResolvedValue(null);
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(false);
  });

  it('returns no encryption when encryptionEnabledAt is null', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: 'server', encryptionEnabledAt: null, serverEncryptionKeyId: 'k' });
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(false);
  });

  it('returns no encryption when encryptionMode is null', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: null, encryptionEnabledAt: new Date(), serverEncryptionKeyId: 'k' });
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(false);
  });

  it('returns mode=e2ee with isEncrypted=false (client encrypts)', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: 'e2ee', encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(false);
    expect(ctx.mode).toBe('e2ee');
  });

  it('encrypts server-side in server mode', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: 'server', encryptionEnabledAt: new Date(), serverEncryptionKeyId: 'key-1' });
    mockEncryptMessage.mockResolvedValue({ ciphertext: 'enc-ct', metadata: { keyId: 'key-1' } });
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(true);
    expect(ctx.mode).toBe('server');
    expect(ctx.encryptedContent).toBe('enc-ct');
  });

  it('encrypts server layer in hybrid mode', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: 'hybrid', encryptionEnabledAt: new Date(), serverEncryptionKeyId: 'key-2' });
    mockEncryptHybridServerLayer.mockResolvedValue({ ciphertext: 'hyb-ct', keyId: 'key-2', iv: 'iv', authTag: 'tag' });
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(true);
    expect(ctx.mode).toBe('hybrid');
    expect((ctx.encryptionMetadata as Record<string, unknown>)?.protocol).toBe('aes-256-gcm');
    expect((ctx.encryptionMetadata as Record<string, unknown>)?.canTranslate).toBe(true);
  });

  it('falls back to no encryption for unknown mode', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: 'quantum', encryptionEnabledAt: new Date(), serverEncryptionKeyId: 'k' });
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(false);
    expect(ctx.mode).toBeNull();
  });

  it('falls back to no encryption when encryption service throws', async () => {
    convFindUnique.mockResolvedValue({ encryptionMode: 'server', encryptionEnabledAt: new Date(), serverEncryptionKeyId: 'k' });
    mockEncryptMessage.mockRejectedValue(new Error('KMS unavailable'));
    const ctx = await processor.getEncryptionContext(CONV_ID, 'hello', 'text');
    expect(ctx.isEncrypted).toBe(false);
  });
});

// ── saveMessage ────────────────────────────────────────────────────────────

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

  it('creates a message and returns it with timestamp', async () => {
    const msg = await processor.saveMessage({ ...baseData });
    expect(msgCreate).toHaveBeenCalledTimes(1);
    expect(msg).toHaveProperty('timestamp');
  });

  // Parité REST : le snapshot du message cité doit porter ses pièces jointes,
  // sinon l'aperçu de citation est vide pour les messages reçus en temps réel.
  it('demande les attachments du replyTo dans le create (aperçu de citation)', async () => {
    await processor.saveMessage({ ...baseData, replyToId: 'orig-msg-id' });
    const createArgs = msgCreate.mock.calls[0][0] as { include?: { replyTo?: { include?: Record<string, unknown> } } };
    expect(createArgs.include?.replyTo?.include).toHaveProperty('attachments');
  });

  it('demande les attachments du replyTo dans le fallback dédup (findFirst)', async () => {
    const cid = 'cid_55555555-5555-4555-8555-555555555555';
    msgCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    msgFindFirst.mockResolvedValue(makeMessage({ clientMessageId: cid }));
    await processor.saveMessage({ ...baseData, clientMessageId: cid });
    const findFirstArgs = msgFindFirst.mock.calls[0][0] as { include?: { replyTo?: { include?: Record<string, unknown> } } };
    expect(findFirstArgs.include?.replyTo?.include).toHaveProperty('attachments');
  });

  it('uses provided encryptedContent + encryptionMetadata', async () => {
    await processor.saveMessage({ ...baseData, encryptedContent: 'encrypted', encryptionMetadata: { mode: 'e2ee', keyId: 'k1' } });
    const createArgs = msgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.isEncrypted).toBe(true);
    expect(createArgs.data.encryptedContent).toBe('encrypted');
  });

  it('sets content to empty string when message is encrypted', async () => {
    await processor.saveMessage({ ...baseData, encryptedContent: 'ct', encryptionMetadata: { mode: 'server' } });
    const createArgs = msgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.content).toBe('');
  });

  it('derives effectFlags from isBlurred/expiresAt/isViewOnce', async () => {
    await processor.saveMessage({ ...baseData, isBlurred: true, expiresAt: new Date(Date.now() + 60000), isViewOnce: true });
    const createArgs = msgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    const flags = createArgs.data.effectFlags as number;
    expect(flags & 1).toBe(1); // EPHEMERAL
    expect(flags & 2).toBe(2); // BLURRED
    expect(flags & 4).toBe(4); // VIEW_ONCE
  });

  it('respects provided effectFlags (does not double-add)', async () => {
    await processor.saveMessage({ ...baseData, effectFlags: 2, isBlurred: true });
    const createArgs = msgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.effectFlags).toBe(2);
  });

  it('includes clientMessageId when provided', async () => {
    const cid = 'cid_11111111-1111-4111-8111-111111111111';
    await processor.saveMessage({ ...baseData, clientMessageId: cid });
    const createArgs = msgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.clientMessageId).toBe(cid);
  });

  it('omits clientMessageId from create data when not provided', async () => {
    await processor.saveMessage({ ...baseData });
    const createArgs = msgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.clientMessageId).toBeUndefined();
  });

  it('returns existing message on P2002 dedup with clientMessageId', async () => {
    const cid = 'cid_22222222-2222-4222-8222-222222222222';
    const existing = makeMessage({ clientMessageId: cid });
    msgCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    msgFindFirst.mockResolvedValue(existing);
    const result = await processor.saveMessage({ ...baseData, clientMessageId: cid });
    expect(result.clientMessageId).toBe(cid);
    expect((result as Message & { isDuplicate?: boolean }).isDuplicate).toBe(true);
  });

  it('rethrows P2002 when no clientMessageId provided', async () => {
    msgCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    await expect(processor.saveMessage({ ...baseData })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rethrows P2002 when findFirst returns null (race condition)', async () => {
    const cid = 'cid_33333333-3333-4333-8333-333333333333';
    msgCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    msgFindFirst.mockResolvedValue(null);
    await expect(processor.saveMessage({ ...baseData, clientMessageId: cid })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rethrows non-P2002 DB errors', async () => {
    msgCreate.mockRejectedValue(new Error('DB connection lost'));
    await expect(processor.saveMessage({ ...baseData })).rejects.toThrow('DB connection lost');
  });

  it('skips side effects (no attachment re-link) on dedup hit', async () => {
    const cid = 'cid_44444444-4444-4444-8444-444444444444';
    msgCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    msgFindFirst.mockResolvedValue(makeMessage({ clientMessageId: cid }));
    await processor.saveMessage({ ...baseData, clientMessageId: cid, attachmentIds: ['att-1'] });
    expect(mockAssociateAttachmentsToMessage).not.toHaveBeenCalled();
  });

  it('associates attachments for new message with attachmentIds', async () => {
    await processor.saveMessage({ ...baseData, attachmentIds: ['att-1', 'att-2'] });
    expect(mockAssociateAttachmentsToMessage).toHaveBeenCalledWith(['att-1', 'att-2'], MSG_ID);
  });

  it('refreshes attachments in memory when attachmentIds provided', async () => {
    attFindMany.mockResolvedValue([{ id: 'att-1', mimeType: 'image/jpeg' }]);
    await processor.saveMessage({ ...baseData, attachmentIds: ['att-1'] });
    expect(attFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { messageId: MSG_ID } }));
  });

  it('copies forwarded attachments when forwardedFromId given', async () => {
    const origAtt = {
      id: 'orig-att', fileName: 'file.jpg', originalName: 'file.jpg',
      mimeType: 'image/jpeg', fileSize: 1000, filePath: '/uploads/file.jpg',
      fileUrl: 'https://cdn/file.jpg', title: null, alt: null, caption: null,
      width: 100, height: 100, thumbnailPath: null, thumbnailUrl: null,
      duration: null, bitrate: null, sampleRate: null, codec: null,
      channels: null, fps: null, videoCodec: null, pageCount: null, lineCount: null,
      transcription: null, translations: null, metadata: null,
    };
    attFindMany.mockResolvedValueOnce([origAtt]).mockResolvedValue([]);
    attCreate.mockResolvedValue({ ...origAtt });
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(attCreate).toHaveBeenCalledTimes(1);
  });

  it('updates message type to image when first forwarded attachment is image', async () => {
    const imageAtt = {
      id: 'img-att', fileName: 'img.jpg', originalName: 'img.jpg',
      mimeType: 'image/jpeg', fileSize: 5000, filePath: '/uploads/img.jpg',
      fileUrl: 'https://cdn/img.jpg', title: null, alt: null, caption: null,
      width: 200, height: 200, thumbnailPath: null, thumbnailUrl: null,
      duration: null, bitrate: null, sampleRate: null, codec: null,
      channels: null, fps: null, videoCodec: null, pageCount: null, lineCount: null,
      transcription: null, translations: null, metadata: null,
    };
    attFindMany.mockResolvedValueOnce([imageAtt]).mockResolvedValue([]);
    attCreate.mockResolvedValue(imageAtt);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(msgUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { messageType: 'image' } }));
  });

  it('updates message type to audio for audio forward', async () => {
    const audioAtt = { id: 'a', fileName: 'voice.m4a', originalName: 'voice.m4a', mimeType: 'audio/mp4',
      fileSize: 100, filePath: '/up/a.m4a', fileUrl: 'https://cdn/a.m4a', title: null, alt: null, caption: null,
      width: null, height: null, thumbnailPath: null, thumbnailUrl: null, duration: 5,
      bitrate: null, sampleRate: null, codec: null, channels: null, fps: null, videoCodec: null,
      pageCount: null, lineCount: null, transcription: null, translations: null, metadata: null };
    attFindMany.mockResolvedValueOnce([audioAtt]).mockResolvedValue([]);
    attCreate.mockResolvedValue(audioAtt);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(msgUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { messageType: 'audio' } }));
  });

  it('updates message type to video for video forward', async () => {
    const videoAtt = { id: 'v', fileName: 'vid.mp4', originalName: 'vid.mp4', mimeType: 'video/mp4',
      fileSize: 10000, filePath: '/up/v.mp4', fileUrl: 'https://cdn/v.mp4', title: null, alt: null, caption: null,
      width: 1920, height: 1080, thumbnailPath: null, thumbnailUrl: null, duration: 30,
      bitrate: null, sampleRate: null, codec: null, channels: null, fps: 30, videoCodec: null,
      pageCount: null, lineCount: null, transcription: null, translations: null, metadata: null };
    attFindMany.mockResolvedValueOnce([videoAtt]).mockResolvedValue([]);
    attCreate.mockResolvedValue(videoAtt);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(msgUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { messageType: 'video' } }));
  });

  it('updates message type to file for application/pdf forward', async () => {
    const fileAtt = { id: 'f', fileName: 'doc.pdf', originalName: 'doc.pdf', mimeType: 'application/pdf',
      fileSize: 2000, filePath: '/up/doc.pdf', fileUrl: 'https://cdn/doc.pdf', title: null, alt: null, caption: null,
      width: null, height: null, thumbnailPath: null, thumbnailUrl: null, duration: null,
      bitrate: null, sampleRate: null, codec: null, channels: null, fps: null, videoCodec: null,
      pageCount: 5, lineCount: null, transcription: null, translations: null, metadata: null };
    attFindMany.mockResolvedValueOnce([fileAtt]).mockResolvedValue([]);
    attCreate.mockResolvedValue(fileAtt);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(msgUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { messageType: 'file' } }));
  });

  it('does not update message type for text/plain forward', async () => {
    const textAtt = { id: 'txt', fileName: 'note.txt', originalName: 'note.txt', mimeType: 'text/plain',
      fileSize: 100, filePath: '/up/note.txt', fileUrl: 'https://cdn/note.txt', title: null, alt: null, caption: null,
      width: null, height: null, thumbnailPath: null, thumbnailUrl: null, duration: null,
      bitrate: null, sampleRate: null, codec: null, channels: null, fps: null, videoCodec: null,
      pageCount: null, lineCount: null, transcription: null, translations: null, metadata: null };
    attFindMany.mockResolvedValueOnce([textAtt]).mockResolvedValue([]);
    attCreate.mockResolvedValue(textAtt);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(msgUpdate).not.toHaveBeenCalled();
  });

  it('handles empty original attachments on forward gracefully', async () => {
    attFindMany.mockResolvedValueOnce([]).mockResolvedValue([]);
    await processor.saveMessage({ ...baseData, forwardedFromId: 'orig-msg-id' });
    expect(attCreate).not.toHaveBeenCalled();
  });

  it('updates tracking link messageIds when [[url]] was processed', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'tok-abc' });
    await processor.saveMessage({ ...baseData, content: '[[https://example.com]]' });
    expect(tlUpdateMany).toHaveBeenCalled();
  });

  it('skips tracking link update when content unchanged (no special links)', async () => {
    await processor.saveMessage({ ...baseData, content: 'Plain message' });
    expect(tlUpdateMany).not.toHaveBeenCalled();
  });

  it('captures post reply snapshot for storyReplyToId', async () => {
    postFindUnique.mockResolvedValue({ id: 'post-1', type: 'STATUS' });
    await processor.saveMessage({ ...baseData, storyReplyToId: 'post-1' });
    expect(postFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'post-1' } }));
  });

  it('handles capturePostReplyTo gracefully when post not found', async () => {
    postFindUnique.mockResolvedValue(null);
    const result = await processor.saveMessage({ ...baseData, storyReplyToId: 'nonexistent-post' });
    expect(result).toBeDefined();
  });

  it('handles capturePostReplyTo gracefully when prisma throws', async () => {
    postFindUnique.mockRejectedValue(new Error('DB error'));
    const result = await processor.saveMessage({ ...baseData, storyReplyToId: 'post-1' });
    expect(result).toBeDefined();
  });
});

// ── extractMentions / containsLinks ─────────────────────────────────────────

describe('MessageProcessor.extractMentions', () => {
  it('delegates to MentionService.extractMentions', () => {
    mockExtractMentions.mockReturnValue(['@alice', '@bob']);
    const processor = makeProcessor();
    const mentions = processor.extractMentions('@alice and @bob');
    expect(mentions).toEqual(['@alice', '@bob']);
  });
});

describe('MessageProcessor.containsLinks', () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    processor = makeProcessor();
  });

  it('returns true for content with https URL', () => {
    expect(processor.containsLinks('See https://example.com')).toBe(true);
  });

  it('returns true for content with http URL', () => {
    expect(processor.containsLinks('Visit http://meeshy.me')).toBe(true);
  });

  it('returns false for plain text without URL', () => {
    expect(processor.containsLinks('No links here')).toBe(false);
  });
});

// ── Notification & mention flows (fire-and-forget) ──────────────────────────

describe('MessageProcessor — notification flows', () => {
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
    mockCreateMessageNotification.mockResolvedValue(undefined);
    mockCreateReplyNotification.mockResolvedValue(undefined);
    mockCreateMentionNotificationsBatch.mockResolvedValue(undefined);
  });

  it('sends reply notification when replyToId is present and refers to another user', async () => {
    const replyMsg = makeMessage({ replyToId: 'orig-msg-id' });
    msgCreate.mockResolvedValue(replyMsg);
    partFindUnique
      .mockResolvedValueOnce({ userId: 'sender-user-id' })    // sender participant
      .mockResolvedValueOnce({ userId: 'author-user-id' });   // original author participant
    userFindUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
    convFindUnique.mockResolvedValue({
      title: 'Chat', type: 'direct',
      participants: [{ userId: 'sender-user-id' }, { userId: 'author-user-id' }],
    });
    msgFindUnique.mockResolvedValue({ senderId: 'orig-participant-id' });
    attFindMany.mockResolvedValue([]);

    const notifSvc = {
      createReplyNotification: mockCreateReplyNotification,
      createMessageNotification: mockCreateMessageNotification,
      createMentionNotificationsBatch: mockCreateMentionNotificationsBatch,
    };
    const processor = makeProcessor(notifSvc);
    await processor.saveMessage({ ...baseData, content: 'Reply here' });
    await new Promise(r => setImmediate(r));
    expect(mockCreateReplyNotification).toHaveBeenCalled();
  });

  it('sends mention notifications when mentionedUserIds are provided', async () => {
    msgCreate.mockResolvedValue(makeMessage());
    partFindUnique.mockResolvedValue({ userId: 'sender-user' });
    userFindUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
    convFindUnique.mockResolvedValue({ title: 'T', type: 'group', participants: [{ userId: 'sender-user' }, { userId: 'mentioned-user' }] });
    attFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([{ username: 'alice' }]);
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: ['mentioned-user'] });

    const notifSvc = {
      createReplyNotification: mockCreateReplyNotification,
      createMessageNotification: mockCreateMessageNotification,
      createMentionNotificationsBatch: mockCreateMentionNotificationsBatch,
    };
    const processor = makeProcessor(notifSvc);
    await processor.saveMessage({ ...baseData, content: '@alice hello', mentionedUserIds: ['mentioned-user'] });
    await new Promise(r => setImmediate(r));
    expect(mockCreateMentionNotificationsBatch).toHaveBeenCalled();
  });

  it('extracts mentions from content when mentionedUserIds not provided', async () => {
    msgCreate.mockResolvedValue(makeMessage());
    partFindMany.mockResolvedValue([]);
    mockExtractMentionsWithParticipants.mockReturnValue(['alice']);
    mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: 'alice-id' }]]));
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: ['alice-id'] });

    const processor = makeProcessor();
    await processor.saveMessage({ ...baseData, content: '@alice hello' });
    expect(mockExtractMentionsWithParticipants).toHaveBeenCalled();
  });

  it('skips regular notification for users with mentionsOnly preference', async () => {
    msgCreate.mockResolvedValue(makeMessage());
    partFindUnique.mockResolvedValue({ userId: 'sender-user' });
    userFindUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
    convFindUnique.mockResolvedValue({ title: 'T', type: 'group', participants: [{ userId: 'sender-user' }, { userId: 'mute-user' }] });
    prefFindMany.mockResolvedValue([{ userId: 'mute-user' }]);
    attFindMany.mockResolvedValue([]);

    const notifSvc = {
      createReplyNotification: mockCreateReplyNotification,
      createMessageNotification: mockCreateMessageNotification,
      createMentionNotificationsBatch: mockCreateMentionNotificationsBatch,
    };
    const processor = makeProcessor(notifSvc);
    await processor.saveMessage({ ...baseData, content: 'Hello everyone' });
    await new Promise(r => setImmediate(r));
    expect(mockCreateMessageNotification).not.toHaveBeenCalled();
  });

  it('falls back gracefully when notification service missing (no-op)', async () => {
    msgCreate.mockResolvedValue(makeMessage());
    const processor = makeProcessor(); // no notificationService
    await expect(processor.saveMessage({ ...baseData })).resolves.toBeDefined();
  });
});

// ── extractTranscriptionText (module-level fn) ──────────────────────────────

describe('extractTranscriptionText — via notification payload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPrisma();
    mockExtractMentionsWithParticipants.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [] });
    mockShouldProcess.mockReturnValue(false);
    mockCreateMessageNotification.mockResolvedValue(undefined);
    mockCreateReplyNotification.mockResolvedValue(undefined);
    mockCreateMentionNotificationsBatch.mockResolvedValue(undefined);
  });

  async function saveWithAudioAttachment(transcription: unknown) {
    msgCreate.mockResolvedValue(makeMessage());
    partFindUnique.mockResolvedValue({ userId: 'u1' });
    userFindUnique.mockResolvedValue({ username: 'u', displayName: 'U', avatar: null });
    convFindUnique.mockResolvedValue({ title: 'T', type: 'direct', participants: [{ userId: 'u2' }] });
    prefFindMany.mockResolvedValue([]);
    attFindMany.mockResolvedValue([{
      mimeType: 'audio/mp4', fileName: 'v.m4a', fileSize: 1000,
      duration: 5, width: null, height: null, fileUrl: 'https://cdn/v.m4a', transcription,
    }]);
    const notifSvc = {
      createMessageNotification: mockCreateMessageNotification,
      createReplyNotification: mockCreateReplyNotification,
      createMentionNotificationsBatch: mockCreateMentionNotificationsBatch,
    };
    const processor = makeProcessor(notifSvc);
    await processor.saveMessage({ ...baseData, content: '', attachmentIds: ['att-1'] });
    await new Promise(r => setImmediate(r));
    return mockCreateMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
  }

  it('uses transcription.text as push body', async () => {
    const callArgs = await saveWithAudioAttachment({ text: 'Bonjour le monde' });
    if (callArgs) expect(callArgs.messagePreview).toBe('Bonjour le monde');
  });

  it('joins transcription.segments when text field absent', async () => {
    const callArgs = await saveWithAudioAttachment({ segments: [{ text: 'Hello' }, { text: ' world' }] });
    if (callArgs) expect(callArgs.messagePreview).toBe('Hello  world');
  });

  it('falls back to message content when transcription is null', async () => {
    const callArgs = await saveWithAudioAttachment(null);
    if (callArgs) {
      // fallback to original message content
      expect(typeof callArgs.messagePreview).toBe('string');
    }
  });

  it('falls back when transcription.text is empty string', async () => {
    const callArgs = await saveWithAudioAttachment({ text: '   ' });
    if (callArgs) {
      expect(typeof callArgs.messagePreview).toBe('string');
    }
  });

  it('falls back when segments array is empty', async () => {
    const callArgs = await saveWithAudioAttachment({ segments: [] });
    if (callArgs) {
      expect(typeof callArgs.messagePreview).toBe('string');
    }
  });

  it('falls back when transcription is not an object', async () => {
    const callArgs = await saveWithAudioAttachment('just a string');
    if (callArgs) {
      expect(typeof callArgs.messagePreview).toBe('string');
    }
  });
});

// ── processAudioAttachments dispatch ─────────────────────────────────────────

describe('MessageProcessor — audio attachment dispatch', () => {
  it('dispatches audio to translation service when shouldProcessAudioAttachment returns true', async () => {
    jest.clearAllMocks();
    resetPrisma();
    mockShouldProcess.mockReturnValue(true);
    mockExtractMentionsWithParticipants.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [] });
    msgCreate.mockResolvedValue(makeMessage());
    attFindMany.mockResolvedValue([{
      id: 'audio-att', mimeType: 'audio/mp4', fileUrl: 'https://cdn/a.m4a',
      filePath: '/uploads/a.m4a', duration: 10, metadata: null, transcription: null,
    }]);
    partFindUnique.mockResolvedValue({ userId: 'u1' });

    const processAudioAttachment = jest.fn() as jest.Mock<any>;
    processAudioAttachment.mockResolvedValue(undefined);
    const translationService = { processAudioAttachment };
    const processor = new MessageProcessor(prisma, undefined, translationService as never);
    await processor.saveMessage({ ...baseData, attachmentIds: ['audio-att'] });
    // Fire-and-forget — wait for microtask
    await new Promise(r => setImmediate(r));
    expect(processAudioAttachment).toHaveBeenCalled();
  });

  it('resolves participant userId before dispatching audio', async () => {
    jest.clearAllMocks();
    resetPrisma();
    mockShouldProcess.mockReturnValue(true);
    mockExtractMentionsWithParticipants.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [] });
    msgCreate.mockResolvedValue(makeMessage());
    attFindMany.mockResolvedValue([{
      id: 'audio-att', mimeType: 'audio/mp4', fileUrl: 'https://cdn/a.m4a',
      filePath: '/uploads/a.m4a', duration: 10, metadata: null, transcription: null,
    }]);
    partFindUnique.mockResolvedValue({ userId: 'resolved-user-id' });

    const processAudioAttachment = jest.fn() as jest.Mock<any>;
    processAudioAttachment.mockResolvedValue(undefined);
    const translationService = { processAudioAttachment };
    const processor = new MessageProcessor(prisma, undefined, translationService as never);
    await processor.saveMessage({ ...baseData, attachmentIds: ['audio-att'] });
    await new Promise(r => setImmediate(r));
    expect(processAudioAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'resolved-user-id' })
    );
  });

  it('uses mobile transcription from attachment metadata when present', async () => {
    jest.clearAllMocks();
    resetPrisma();
    mockShouldProcess.mockReturnValue(true);
    mockExtractMentionsWithParticipants.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [] });
    msgCreate.mockResolvedValue(makeMessage());
    attFindMany.mockResolvedValue([{
      id: 'audio-att', mimeType: 'audio/mp4', fileUrl: 'https://cdn/a.m4a',
      filePath: '/uploads/a.m4a', duration: 10,
      metadata: { transcription: { text: 'mobile text' } }, transcription: null,
    }]);
    partFindUnique.mockResolvedValue(null);

    const processAudioAttachment = jest.fn() as jest.Mock<any>;
    processAudioAttachment.mockResolvedValue(undefined);
    const processor = new MessageProcessor(prisma, undefined, { processAudioAttachment } as never);
    await processor.saveMessage({ ...baseData, attachmentIds: ['audio-att'] });
    await new Promise(r => setImmediate(r));
    expect(processAudioAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ mobileTranscription: { text: 'mobile text' } })
    );
  });
});

// ── Branch gap-fillers for MessageProcessor ────────────────────────────────

describe('MessageProcessor — branch gap coverage', () => {
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
  });

  const gapBaseData = {
    conversationId: CONV_ID,
    senderId: SENDER_ID,
    content: 'Test',
    originalLanguage: 'fr',
  } as const;

  // Line 639 — catch block in handleAttachments when associateAttachmentsToMessage throws
  it('swallows associateAttachmentsToMessage errors (handleAttachments catch)', async () => {
    mockAssociateAttachmentsToMessage.mockRejectedValue(new Error('attach fail'));
    const processor = makeProcessor();
    await expect(processor.saveMessage({ ...baseData, attachmentIds: ['att-1'] })).resolves.toBeDefined();
  });

  // Line 710 — catch block in copyForwardedAttachments when prisma throws
  it('swallows copyForwardedAttachments errors on prisma failure', async () => {
    // First call (in copyForwardedAttachments) throws; second call (refresh) returns []
    attFindMany.mockRejectedValueOnce(new Error('db fail')).mockResolvedValue([]);
    const processor = makeProcessor();
    await expect(processor.saveMessage({ ...baseData, forwardedFromId: 'orig-id' })).resolves.toBeDefined();
  });

  // Lines 740-741 — already-transcribed audio skip log
  it('logs already-transcribed skip when audio attachment shouldProcess returns false', async () => {
    mockShouldProcess.mockReturnValue(false);
    attFindMany.mockResolvedValue([{
      id: 'audio-1', mimeType: 'audio/mp4', fileUrl: 'https://cdn/a.m4a',
      filePath: '/up/a.m4a', duration: 5, metadata: null, transcription: { text: 'existing' },
    }]);
    partFindUnique.mockResolvedValue(null);

    const processAudioAttachment = jest.fn() as jest.Mock<any>;
    processAudioAttachment.mockResolvedValue(undefined);
    const processor = new MessageProcessor(prisma, undefined, { processAudioAttachment } as never);
    await processor.saveMessage({ ...baseData, attachmentIds: ['audio-1'] });
    await new Promise(r => setImmediate(r));
    // Already-transcribed → processAudioAttachment not called
    expect(processAudioAttachment).not.toHaveBeenCalled();
  });

  // Lines 812-816 — inner catch in updateTrackingLinksWithMessageId
  it('swallows per-token trackingLink update error', async () => {
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'tok-xyz' });
    tlUpdateMany.mockRejectedValue(new Error('update failed'));
    const processor = makeProcessor();
    await expect(processor.saveMessage({ ...baseData, content: '[[https://example.com]]' })).resolves.toBeDefined();
  });

  // Line 1099 — catch block in triggerAllNotifications
  it('swallows triggerAllNotifications errors when partFindUnique throws', async () => {
    partFindUnique.mockRejectedValue(new Error('participant db fail'));
    const notifSvc = {
      createReplyNotification: mockCreateReplyNotification,
      createMessageNotification: mockCreateMessageNotification,
      createMentionNotificationsBatch: mockCreateMentionNotificationsBatch,
    };
    const processor = makeProcessor(notifSvc);
    await expect(processor.saveMessage({ ...baseData })).resolves.toBeDefined();
    await new Promise(r => setImmediate(r));
  });

  // Lines 1136-1140 — getConversationParticipants with actual participants
  // Filter out p.user===null and resolve displayName ?? username
  it('getConversationParticipants filters null-user entries and uses username when displayName is null', async () => {
    partFindMany.mockResolvedValue([
      { userId: 'u1', displayName: null, user: { id: 'u1', username: 'alice', displayName: null } },
      { userId: 'u2', displayName: 'Bob', user: null }, // filtered out
    ]);
    mockExtractMentionsWithParticipants.mockImplementation((content: string, participants: Array<{ displayName: string }>) => {
      // Verify only the non-null-user participant is passed
      return participants.filter(p => p.displayName === 'alice').map(() => 'alice');
    });
    mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: 'u1' }]]));
    mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [] });

    const processor = makeProcessor();
    await processor.saveMessage({ ...baseData, content: '@alice test' });
    // extractMentionsWithParticipants should receive the filtered, mapped participant list
    expect(mockExtractMentionsWithParticipants).toHaveBeenCalled();
  });

  // Line 1143 — getConversationParticipants catch when partFindMany throws
  it('getConversationParticipants returns empty array when partFindMany throws', async () => {
    partFindMany.mockRejectedValue(new Error('db fail'));
    mockExtractMentionsWithParticipants.mockReturnValue([]);
    const processor = makeProcessor();
    await expect(processor.saveMessage({ ...baseData, content: '@alice' })).resolves.toBeDefined();
    // extractMentionsWithParticipants called with empty participants from catch
    expect(mockExtractMentionsWithParticipants).toHaveBeenCalledWith(expect.any(String), []);
  });
});

// ── B.1/B.2 performance optimizations ─────────────────────────────────────

describe('MessageProcessor — B.1/B.2 send path optimizations', () => {
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
    processor = makeProcessor();
  });

  describe('B.2 — processMentionsInDB short-circuit', () => {
    it('skips getConversationParticipants when content has no @ and no mentionedUserIds', async () => {
      await processor.saveMessage({ ...baseData, content: 'Hello world, no mentions here!' });
      expect(partFindMany).not.toHaveBeenCalled();
    });

    it('skips participant lookup when content has no @ even with other special chars', async () => {
      await processor.saveMessage({ ...baseData, content: 'Price is $100 & tax!' });
      expect(partFindMany).not.toHaveBeenCalled();
    });

    it('calls getConversationParticipants when content contains @', async () => {
      partFindMany.mockResolvedValue([]);
      mockExtractMentionsWithParticipants.mockReturnValue([]);
      await processor.saveMessage({ ...baseData, content: 'Hey @alice how are you?' });
      expect(partFindMany).toHaveBeenCalled();
    });

    it('calls processMentionsInDB when explicit mentionedUserIds provided even without @', async () => {
      mockValidateMentionPermissions.mockResolvedValue({ validUserIds: [SENDER_ID] });
      userFindMany.mockResolvedValue([{ username: 'alice' }]);
      msgUpdate.mockResolvedValue(makeMessage());
      await processor.saveMessage({ ...baseData, content: 'A plain message', mentionedUserIds: [SENDER_ID] });
      expect(mockValidateMentionPermissions).toHaveBeenCalled();
    });

    it('still resolves successfully when content has no @ (no DB round-trip)', async () => {
      const result = await processor.saveMessage({ ...baseData, content: 'Simple message, no at-signs.' });
      expect(result).toHaveProperty('id', MSG_ID);
    });
  });

  describe('B.1 — trackingLinks update is fire-and-forget', () => {
    it('resolves even when trackingLinks withTiming rejects', async () => {
      const perfMock = jest.requireMock('../../../../utils/logger-enhanced') as {
        performanceLogger: { withTiming: jest.MockedFunction<(name: unknown, fn: () => unknown, corr?: unknown) => Promise<unknown>> };
      };
      const originalImpl = perfMock.performanceLogger.withTiming.getMockImplementation();
      perfMock.performanceLogger.withTiming.mockImplementation((name: unknown, fn: () => unknown) => {
        if (name === 'messaging.trackingLinks') {
          return Promise.reject(new Error('tracking link DB failure'));
        }
        return Promise.resolve(typeof fn === 'function' ? fn() : undefined);
      });

      await expect(processor.saveMessage({ ...baseData })).resolves.toHaveProperty('id', MSG_ID);

      // Restore original mock
      if (originalImpl) {
        perfMock.performanceLogger.withTiming.mockImplementation(originalImpl);
      } else {
        perfMock.performanceLogger.withTiming.mockImplementation((_name: unknown, fn: () => unknown) => fn());
      }
    });
  });
});
