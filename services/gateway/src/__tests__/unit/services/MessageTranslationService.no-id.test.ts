/**
 * Coverage for MessageTranslationService uncovered paths:
 * - emoji-only + !messageData.id → saves to DB (lines 170-172)
 * - URL-only + !messageData.id → saves to DB (lines 187-189)
 * - E2EE + !messageData.id → saves to DB (lines 202-207)
 * - Periodic cleanup interval body (lines 96-98)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// ── ZMQ mock ──────────────────────────────────────────────────────────────────

class MockZMQClient extends EventEmitter {
  sendTranslationRequest = jest.fn<any>().mockResolvedValue('task-1');
  sendAudioProcessRequest = jest.fn<any>().mockResolvedValue('task-2');
  sendTranscriptionOnlyRequest = jest.fn<any>().mockResolvedValue('task-3');
  healthCheck = jest.fn<any>();
  close = jest.fn<any>();
  testReception = jest.fn<any>();
  removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    return this;
  }
}

const mockZmqClient = new MockZMQClient();

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { handleAudioTranslationsReady: jest.fn<any>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: jest.fn<any>().mockResolvedValue({
      canTranscribeAudio: true, canTranslateAudio: true,
      canGenerateTranslatedAudio: true, canUseVoiceCloning: true, hasVoiceDataConsent: true,
    }),
  })),
}));

jest.mock('../../../services/MultiLevelJobMappingCache', () => ({
  MultiLevelJobMappingCache: jest.fn().mockImplementation(() => ({
    getAndDeleteJobMapping: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn<any>().mockResolvedValue(mockZmqClient) },
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn<any>().mockResolvedValue(undefined),
    writeFile: jest.fn<any>().mockResolvedValue(undefined),
    readFile: jest.fn<any>().mockResolvedValue(Buffer.from('audio')),
    unlink: jest.fn<any>().mockResolvedValue(undefined),
    stat: jest.fn<any>().mockResolvedValue({ size: 1024 }),
  },
  existsSync: jest.fn<any>().mockReturnValue(true),
  readFileSync: jest.fn<any>(),
  statSync: jest.fn<any>().mockReturnValue({ size: 2048 }),
}));

jest.mock('@meeshy/shared/types/attachment-audio', () => ({
  toSocketIOTranslation: jest.fn<any>((id: string, lang: string, t: any) => ({
    targetLanguage: lang, url: t?.url || '', path: t?.path || '',
    transcription: t?.transcription || '', durationMs: t?.durationMs || 0,
    format: t?.format || 'mp3', cloned: t?.cloned || false, quality: t?.quality || 0,
  })),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  resolveUserLanguagesOrdered: jest.fn<any>().mockReturnValue(['fr', 'en']),
}));

jest.mock('../../../utils/translation-transformer', () => ({
  createTranslationJSON: jest.fn<any>((args: any) => ({
    text: args.text, translationModel: args.translationModel,
    confidenceScore: args.confidenceScore, isEncrypted: args.isEncrypted || false,
    encryptionKeyId: args.encryptionKeyId || null, encryptionIv: args.encryptionIv || null,
    encryptionAuthTag: args.encryptionAuthTag || null,
    createdAt: args.preserveCreatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
}));

jest.mock('../../../utils/transcription', () => ({
  isBlankTranscriptionText: jest.fn<any>((text: string | undefined) => !text || text.trim() === ''),
}));

jest.mock('../../../services/message-translation/EncryptionHelper', () => ({
  EncryptionHelper: jest.fn().mockImplementation(() => ({
    getConversationEncryptionKey: jest.fn<any>().mockResolvedValue(null),
    encryptTranslation: jest.fn<any>().mockResolvedValue({
      encryptedContent: 'enc', isEncrypted: true, encryptionKeyId: 'k1',
      encryptionIv: 'iv', encryptionAuthTag: 'tag',
    }),
    decryptTranslation: jest.fn<any>().mockResolvedValue('decrypted'),
    shouldEncryptTranslation: jest.fn<any>().mockResolvedValue({ shouldEncrypt: false, conversationId: null }),
  })),
}));

// ── SUT import ────────────────────────────────────────────────────────────────

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

// ── Prisma factory ────────────────────────────────────────────────────────────

const createMockPrisma = () => ({
  conversation: {
    findFirst: jest.fn<any>().mockResolvedValue({ id: 'conv-1', title: 'Test' }),
    findUnique: jest.fn<any>().mockResolvedValue(null),
    create: jest.fn<any>().mockResolvedValue({ id: 'conv-1' }),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  message: {
    findFirst: jest.fn<any>().mockResolvedValue(null),
    findUnique: jest.fn<any>().mockResolvedValue(null),
    create: jest.fn<any>().mockResolvedValue({ id: 'saved-msg-1', content: 'saved', originalLanguage: 'en' }),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  messageTranslation: {
    findFirst: jest.fn<any>().mockResolvedValue(null),
    findMany: jest.fn<any>().mockResolvedValue([]),
    create: jest.fn<any>().mockResolvedValue({}),
    update: jest.fn<any>().mockResolvedValue({}),
    upsert: jest.fn<any>().mockResolvedValue({}),
    deleteMany: jest.fn<any>().mockResolvedValue({}),
  },
  participant: {
    findMany: jest.fn<any>().mockResolvedValue([]),
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
  userStats: { upsert: jest.fn<any>().mockResolvedValue({}) },
  messageAttachment: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  serverEncryptionKey: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  userVoiceModel: {
    upsert: jest.fn<any>().mockResolvedValue({}),
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
}) as any;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MessageTranslationService — handleNewMessage !messageData.id branches', () => {
  let svc: MessageTranslationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    prisma = createMockPrisma();
    svc = new MessageTranslationService(prisma);
    await svc.initialize();
  });

  afterEach(() => jest.clearAllMocks());

  it('saves to DB and returns emoji_only_skipped when content is emoji-only and id is missing (lines 170-172)', async () => {
    prisma.message.create.mockResolvedValue({ id: 'saved-emoji-1', content: '🎉' });

    const result = await svc.handleNewMessage({
      // id intentionally omitted → !messageData.id → save path
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '🎉', // emoji-only
      originalLanguage: 'en',
    });

    expect(result.status).toBe('emoji_only_skipped');
    expect(result.messageId).toBe('saved-emoji-1');
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('returns emoji_only_skipped with given id when content is emoji-only and id is provided', async () => {
    const result = await svc.handleNewMessage({
      id: 'existing-emoji-msg',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '👋🎊', // emoji-only with id
      originalLanguage: 'en',
    });

    expect(result.status).toBe('emoji_only_skipped');
    expect(result.messageId).toBe('existing-emoji-msg');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('saves to DB and returns url_only_skipped when content is URL-only and id is missing (lines 187-189)', async () => {
    prisma.message.create.mockResolvedValue({ id: 'saved-url-1', content: 'https://example.com' });

    const result = await svc.handleNewMessage({
      // id omitted → save path
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'https://example.com', // URL-only
      originalLanguage: 'en',
    });

    expect(result.status).toBe('url_only_skipped');
    expect(result.messageId).toBe('saved-url-1');
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('saves to DB and returns e2ee_skipped when encryptionMode is e2ee and id is missing (lines 202-207)', async () => {
    prisma.message.create.mockResolvedValue({ id: 'saved-e2ee-1', content: 'encrypted-blob' });

    const result = await svc.handleNewMessage({
      // id omitted → save path
      conversationId: 'conv-1',
      senderId: 'user-3',
      content: 'encrypted-blob',
      originalLanguage: 'en',
      encryptionMode: 'e2ee',
    });

    expect(result.status).toBe('e2ee_skipped');
    expect(result.messageId).toBe('saved-e2ee-1');
    expect(prisma.message.create).toHaveBeenCalled();
  });
});

// ── Cleanup interval body (lines 96-98) ───────────────────────────────────────

describe('MessageTranslationService — processedTasks cleanup interval', () => {
  afterEach(() => jest.useRealTimers());

  it('removes expired processedTasks entries when interval fires', async () => {
    jest.useFakeTimers();

    const prisma = createMockPrisma();
    const freshSvc = new MessageTranslationService(prisma);
    await freshSvc.initialize();

    const processedTasks: Map<string, number> = (freshSvc as any).processedTasks;
    const TTL: number = (freshSvc as any).PROCESSED_TASK_TTL_MS;

    // Add a stale entry (timestamp way in the past relative to current fake time)
    processedTasks.set('stale-key', 1); // timestamp = 1ms (epoch), far below TTL threshold
    processedTasks.set('fresh-key', Date.now()); // current fake time (fresh)

    expect(processedTasks.size).toBe(2);

    // Advance fake time past the 30-minute interval to trigger cleanup
    jest.advanceTimersByTime(30 * 60 * 1000 + 1);

    // After interval: stale-key (ts=1) < expiry (now - 1h) → deleted
    // fresh-key (ts=now) > expiry → kept
    expect(processedTasks.has('stale-key')).toBe(false);
    expect(processedTasks.has('fresh-key')).toBe(true);
  });
});
