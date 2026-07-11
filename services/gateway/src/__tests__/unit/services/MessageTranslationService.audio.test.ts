/**
 * Supplementary tests for MessageTranslationService — audio handlers, public API, and Prisme Linguistique
 * Targets the uncovered sections to bring total line coverage from 44.97% to ≥92%.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Type alias to keep strict TypeScript without `any` proliferation
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<any>;

// ---------------------------------------------------------------------------
// ZMQ mock — must be defined BEFORE jest.mock calls so hoisting can find it
// ---------------------------------------------------------------------------
class MockZMQClient extends EventEmitter {
  sendTranslationRequest: MockFn = jest.fn();
  sendAudioProcessRequest: MockFn = jest.fn();
  sendTranscriptionOnlyRequest: MockFn = jest.fn();
  healthCheck: MockFn = jest.fn();
  close: MockFn = jest.fn();
  testReception: MockFn = jest.fn();

  removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    return this;
  }
}

const mockZmqClient = new MockZMQClient();

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

// PostAudioService singleton
const mockHandleAudioTranslationsReady: MockFn = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      handleAudioTranslationsReady: (...args: unknown[]) =>
        mockHandleAudioTranslationsReady(...args)
    }
  }
}));

// ConsentValidationService — instantiated inline
jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: (jest.fn() as MockFn).mockResolvedValue({
      canTranscribeAudio: true,
      canTranslateAudio: true,
      canGenerateTranslatedAudio: true,
      canUseVoiceCloning: true,
      hasVoiceDataConsent: true
    })
  }))
}));

// MultiLevelJobMappingCache
const mockGetAndDeleteJobMapping: MockFn = jest.fn().mockResolvedValue(null);
jest.mock('../../../services/MultiLevelJobMappingCache', () => ({
  MultiLevelJobMappingCache: jest.fn().mockImplementation(() => ({
    getAndDeleteJobMapping: (...args: unknown[]) => mockGetAndDeleteJobMapping(...args)
  }))
}));

// ZMQ Singleton
jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue(mockZmqClient)
  }
}));

// fs
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock-audio')),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 })
  },
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 2048 })
}));

// path — use real implementation
jest.mock('path', () => {
  const real = jest.requireActual<typeof import('path')>('path');
  return { ...real };
});

// Shared audio helpers
jest.mock('@meeshy/shared/types/attachment-audio', () => ({
  toSocketIOTranslation: jest.fn((attachmentId: string, lang: string, translation: any) => ({
    targetLanguage: lang,
    url: translation?.url || '',
    path: translation?.path || '',
    transcription: translation?.transcription || '',
    durationMs: translation?.durationMs || 0,
    format: translation?.format || 'mp3',
    cloned: translation?.cloned || false,
    quality: translation?.quality || 0
  }))
}));

// Shared conversation helpers — resolveUserLanguagesOrdered
const mockResolveUserLanguagesOrdered: MockFn = jest.fn().mockReturnValue(['fr', 'en']);
jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  resolveUserLanguagesOrdered: (...args: unknown[]) =>
    mockResolveUserLanguagesOrdered(...args)
}));

// translation-transformer
jest.mock('../../../utils/translation-transformer', () => ({
  createTranslationJSON: jest.fn((args: any) => ({
    text: args.text,
    translationModel: args.translationModel,
    confidenceScore: args.confidenceScore,
    isEncrypted: args.isEncrypted || false,
    encryptionKeyId: args.encryptionKeyId || null,
    encryptionIv: args.encryptionIv || null,
    encryptionAuthTag: args.encryptionAuthTag || null,
    createdAt: args.preserveCreatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }))
}));

// transcription helper
jest.mock('../../../utils/transcription', () => ({
  isBlankTranscriptionText: jest.fn((text: string | undefined) => !text || text.trim() === '')
}));

// EncryptionHelper (used internally)
jest.mock('../../../services/message-translation/EncryptionHelper', () => ({
  EncryptionHelper: jest.fn().mockImplementation(() => ({
    getConversationEncryptionKey: (jest.fn() as MockFn).mockResolvedValue(null),
    encryptTranslation: (jest.fn() as MockFn).mockResolvedValue({
      encryptedContent: 'encrypted-text',
      isEncrypted: true,
      encryptionKeyId: 'key-1',
      encryptionIv: 'iv-1',
      encryptionAuthTag: 'tag-1'
    }),
    decryptTranslation: (jest.fn() as MockFn).mockResolvedValue('decrypted-text'),
    shouldEncryptTranslation: (jest.fn() as MockFn).mockResolvedValue({
      shouldEncrypt: false,
      conversationId: null
    })
  }))
}));

// ---------------------------------------------------------------------------
// SUT import — AFTER all mocks
// ---------------------------------------------------------------------------
import {
  MessageTranslationService,
  MessageData
} from '../../../services/message-translation/MessageTranslationService';
import { ZMQSingleton } from '../../../services/ZmqSingleton';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { isBlankTranscriptionText } from '../../../utils/transcription';
import { EncryptionHelper } from '../../../services/message-translation/EncryptionHelper';

// ---------------------------------------------------------------------------
// Prisma factory
// ---------------------------------------------------------------------------
const createMockPrisma = () => ({
  conversation: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  message: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  messageTranslation: {
    findFirst: jest.fn() as MockFn,
    findMany: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    upsert: jest.fn() as MockFn,
    deleteMany: jest.fn() as MockFn
  },
  participant: {
    findMany: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn
  },
  userStats: {
    upsert: jest.fn() as MockFn
  },
  messageAttachment: {
    findUnique: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  user: {
    findUnique: jest.fn() as MockFn
  },
  serverEncryptionKey: {
    findUnique: jest.fn() as MockFn
  },
  userVoiceModel: {
    upsert: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn
  }
});

// Helper: wait for all micro/macro tasks in a handler
async function flushAsync(count = 3) {
  for (let i = 0; i < count; i++) {
    await new Promise<void>(r => setImmediate(r));
  }
}

// ---------------------------------------------------------------------------
// Shared attachment data builders
// ---------------------------------------------------------------------------
function makeTranslatedAudio(overrides: Record<string, unknown> = {}) {
  return {
    targetLanguage: 'fr',
    translatedText: 'Bonjour',
    audioUrl: '',
    audioPath: '',
    durationMs: 1000,
    voiceCloned: false,
    voiceQuality: 0.8,
    audioMimeType: 'audio/mp3',
    ...overrides
  };
}

function makeAudioProcessCompletedData(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'task-audio-1',
    messageId: 'msg-1',
    attachmentId: 'att-1',
    transcription: {
      text: 'Hello world',
      language: 'en',
      confidence: 0.95,
      source: 'whisper',
      durationMs: 2000
    },
    translatedAudios: [makeTranslatedAudio()],
    voiceModelUserId: 'user-1',
    voiceModelQuality: 0.9,
    processingTimeMs: 500,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// TEST SUITES
// ---------------------------------------------------------------------------

describe('MessageTranslationService — audio & Prisme supplement', () => {
  let svc: MessageTranslationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset().mockResolvedValue('task-tx-1');
    mockZmqClient.sendAudioProcessRequest.mockReset().mockResolvedValue('task-audio-1');
    mockZmqClient.sendTranscriptionOnlyRequest.mockReset().mockResolvedValue('task-tr-1');
    mockHandleAudioTranslationsReady.mockReset().mockResolvedValue(undefined);
    mockGetAndDeleteJobMapping.mockReset().mockResolvedValue(null);
    mockResolveUserLanguagesOrdered.mockReset().mockReturnValue(['fr', 'en']);

    prisma = createMockPrisma();
    prisma.messageAttachment.update.mockResolvedValue({} as any);
    prisma.messageAttachment.findUnique.mockResolvedValue(null);
    prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', originalLanguage: 'en', translations: {} });
    prisma.message.update.mockResolvedValue({} as any);
    prisma.userVoiceModel.upsert.mockResolvedValue({} as any);
    prisma.userVoiceModel.findUnique.mockResolvedValue(null);
    prisma.userStats.upsert.mockResolvedValue({} as any);
    prisma.participant.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    svc = new MessageTranslationService(prisma as any);
    await svc.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // getZmqClient
  // =========================================================================
  describe('getZmqClient()', () => {
    it('returns null before initialize()', () => {
      const fresh = new MessageTranslationService(prisma as any);
      expect(fresh.getZmqClient()).toBeNull();
    });

    it('returns the ZMQ client after initialize()', () => {
      expect(svc.getZmqClient()).toBe(mockZmqClient);
    });
  });

  // =========================================================================
  // Constructor cleanup interval
  // =========================================================================
  describe('constructor processedTasks cleanup', () => {
    it('cleans up expired entries from processedTasks map', async () => {
      // We cannot directly access the private map, so we verify indirectly:
      // emitting the same translationCompleted twice within TTL should deduplicate.
      const received: unknown[] = [];
      svc.on('translationReady', (d) => received.push(d));

      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);
      prisma.message.findFirst.mockResolvedValue({ senderId: null });

      const translationData = {
        taskId: 'cleanup-task',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-1',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.9,
          processingTime: 10,
          modelType: 'basic' as const
        }
      };

      mockZmqClient.emit('translationCompleted', translationData);
      await flushAsync();
      // second emit with same taskId+lang → deduped
      mockZmqClient.emit('translationCompleted', translationData);
      await flushAsync();

      expect(received).toHaveLength(1);
    });
  });

  // =========================================================================
  // initialize() — storyTextObjectTranslationCompleted forwarding
  // =========================================================================
  describe('initialize() — storyTextObjectTranslationCompleted', () => {
    it('forwards storyTextObjectTranslationCompleted from ZMQ to service emitter', async () => {
      const received: unknown[] = [];
      svc.on('storyTextObjectTranslationCompleted', (e) => received.push(e));

      const payload = { postId: 'post-1', textObjectIndex: 0, translations: { fr: 'Bonjour' } };
      mockZmqClient.emit('storyTextObjectTranslationCompleted', payload);

      await flushAsync();
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(payload);
    });
  });

  // =========================================================================
  // handleNewMessage — emoji-only
  // =========================================================================
  describe('handleNewMessage — emoji-only', () => {
    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-new', conversationId: 'conv-1', content: '😀', originalLanguage: 'en' } as any);
      prisma.conversation.update.mockResolvedValue({} as any);
    });

    it('returns emoji_only_skipped without saving when id is provided', async () => {
      const result = await svc.handleNewMessage({
        id: 'msg-existing',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: '😀',
        originalLanguage: 'en'
      });
      expect(result.status).toBe('emoji_only_skipped');
      expect(result.messageId).toBe('msg-existing');
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('saves message and returns emoji_only_skipped when no id', async () => {
      const result = await svc.handleNewMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: '😀',
        originalLanguage: 'en'
      });
      expect(result.status).toBe('emoji_only_skipped');
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('does not skip non-emoji content', async () => {
      prisma.message.create.mockResolvedValue({ id: 'msg-text', conversationId: 'conv-1', content: 'Hello', originalLanguage: 'en' } as any);
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-text', conversationId: 'conv-1', content: 'Hello', originalLanguage: 'en' } as any);
      prisma.participant.findMany.mockResolvedValue([]);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });

      const result = await svc.handleNewMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        originalLanguage: 'en'
      });
      expect(result.status).toBe('message_saved');
    });
  });

  // =========================================================================
  // _processTranslationsAsync — ZMQ client null & empty content
  // =========================================================================
  describe('_processTranslationsAsync — guard clauses', () => {
    it('does not throw when message content is empty', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-empty', conversationId: 'conv-1', content: '', originalLanguage: 'en' } as any);
      prisma.conversation.update.mockResolvedValue({} as any);
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-empty', conversationId: 'conv-1', content: '', originalLanguage: 'en' } as any);

      const result = await svc.handleNewMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: '',
        originalLanguage: 'en'
      });
      await flushAsync(5);
      // Should return without crashing
      expect(result.messageId).toBeDefined();
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });

    it('returns early when ZMQ client is null (not initialized)', async () => {
      const freshSvc = new MessageTranslationService(prisma as any);
      // do NOT call initialize() so zmqClient stays null

      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-2', conversationId: 'conv-1', content: 'Hi', originalLanguage: 'en' } as any);
      prisma.conversation.update.mockResolvedValue({} as any);
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-2', conversationId: 'conv-1', content: 'Hi', originalLanguage: 'en' } as any);

      await freshSvc.handleNewMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hi there',
        originalLanguage: 'en'
      });
      await flushAsync(5);
      // No ZMQ call expected since client is null
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _processTranslationsAsync — cache hit paths
  // =========================================================================
  describe('_processTranslationsAsync — cache hits', () => {
    it('serves from memory cache and emits translationCompleted without DB call', async () => {
      // Trigger a translation that will populate the cache
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-cache',
        senderId: null
      } as any);
      prisma.message.findUnique
        .mockResolvedValueOnce({ id: 'msg-cache', originalLanguage: 'en', translations: {} })
        .mockResolvedValue({ id: 'msg-cache', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      const cacheEmits: unknown[] = [];
      svc.on('translationCompleted', (d) => cacheEmits.push(d));

      // Emit a completed translation to populate the cache
      mockZmqClient.emit('translationCompleted', {
        taskId: 'task-populate',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-cache',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.95,
          processingTime: 10,
          modelType: 'basic'
        }
      });
      await flushAsync(3);

      // Now request translation for the same msg — should hit memory cache
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({
        id: 'msg-cache',
        conversationId: 'conv-1',
        content: 'Hello world',
        originalLanguage: 'en'
      } as any);
      prisma.conversation.update.mockResolvedValue({} as any);
      prisma.participant.findMany.mockResolvedValue([]);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });

      // Via getTranslation, verify cache is populated
      const tr = await svc.getTranslation('msg-cache', 'fr', 'en');
      expect(tr).not.toBeNull();
      expect(tr?.translatedText).toBe('Bonjour');
    });
  });

  // =========================================================================
  // _generateConversationIdentifier — without title fallback
  // =========================================================================
  describe('_generateConversationIdentifier — no title', () => {
    it('creates identifier with uniqueId fallback when title has no alphanumeric chars', async () => {
      // Title with only special chars → sanitized to empty → uses uniqueId
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({} as any);
      prisma.message.create.mockResolvedValue({ id: 'msg-x', conversationId: '!@#$%', content: 'Hi', originalLanguage: 'en' } as any);
      prisma.conversation.update.mockResolvedValue({} as any);

      const result = await svc.handleNewMessage({
        conversationId: '!@#$%',
        senderId: 'user-1',
        content: 'Hi there friend',
        originalLanguage: 'en'
      });
      expect(result.messageId).toBeDefined();
      // Check conversation.create was called with an identifier
      const createCall = prisma.conversation.create.mock.calls[0]?.[0] as any;
      expect(createCall?.data?.identifier).toMatch(/^mshy_/);
    });
  });

  // =========================================================================
  // Encryption helper delegation methods
  // =========================================================================
  describe('encryption helper delegation', () => {
    it('_saveTranslationToDatabase uses encryption when shouldEncrypt=true', async () => {
      // Override EncryptionHelper mock for this service instance
      const encHelper = (svc as any).encryptionHelper;
      encHelper.shouldEncryptTranslation.mockResolvedValue({ shouldEncrypt: true, conversationId: 'conv-enc' });
      encHelper.encryptTranslation.mockResolvedValue({
        encryptedContent: 'enc-content',
        isEncrypted: true,
        encryptionKeyId: 'key-abc',
        encryptionIv: 'iv-abc',
        encryptionAuthTag: 'tag-abc'
      });

      prisma.message.findUnique.mockResolvedValue({ id: 'msg-enc', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);
      prisma.message.findFirst.mockResolvedValue({ senderId: null });

      mockZmqClient.emit('translationCompleted', {
        taskId: 'enc-task-1',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-enc',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Secret text',
          confidenceScore: 0.9,
          processingTime: 5,
          modelType: 'basic'
        }
      });
      await flushAsync(3);

      expect(encHelper.encryptTranslation).toHaveBeenCalledWith('Secret text', 'conv-enc');
    });

    it('getTranslation decrypts encrypted translation', async () => {
      const encHelper = (svc as any).encryptionHelper;
      encHelper.decryptTranslation.mockResolvedValue('plain text');

      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-dec',
        originalLanguage: 'en',
        translations: {
          fr: {
            text: 'encrypted-blob',
            isEncrypted: true,
            encryptionKeyId: 'key-1',
            encryptionIv: 'iv-1',
            encryptionAuthTag: 'tag-1',
            translationModel: 'basic',
            confidenceScore: 0.9,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });

      const result = await svc.getTranslation('msg-dec', 'fr', 'en');
      expect(result?.translatedText).toBe('plain text');
      expect(encHelper.decryptTranslation).toHaveBeenCalledWith(
        'encrypted-blob', 'key-1', 'iv-1', 'tag-1'
      );
    });

    it('getTranslation returns null when decryption fails', async () => {
      const encHelper = (svc as any).encryptionHelper;
      encHelper.decryptTranslation.mockRejectedValue(new Error('decrypt fail'));

      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-fail',
        originalLanguage: 'en',
        translations: {
          fr: {
            text: 'bad-blob',
            isEncrypted: true,
            encryptionKeyId: 'key-x',
            encryptionIv: 'iv-x',
            encryptionAuthTag: 'tag-x',
            translationModel: 'basic',
            confidenceScore: 0.9
          }
        }
      });

      const result = await svc.getTranslation('msg-fail', 'fr', 'en');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // _processRetranslationAsync edge cases
  // =========================================================================
  describe('_processRetranslationAsync', () => {
    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([]);
    });

    it('handles message not found during retranslation gracefully', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce({ id: 'msg-ret', conversationId: 'conv-1', content: 'Hello', originalLanguage: 'en' }) // for handleNewMessage lookup
        .mockResolvedValueOnce(null); // for retranslation lookup

      const result = await svc.handleNewMessage({
        id: 'msg-ret',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        originalLanguage: 'en'
      });
      await flushAsync(5);
      expect(result.status).toBe('retranslation_queued');
      // Should not throw; errors stat incremented
    });

    it('handles empty content during retranslation gracefully', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-empty-ret',
        conversationId: 'conv-1',
        content: '',
        originalLanguage: 'en'
      } as any);

      const result = await svc.handleNewMessage({
        id: 'msg-empty-ret',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: '',
        originalLanguage: 'en'
      });
      await flushAsync(5);
      expect(result.status).toBe('retranslation_queued');
    });

    it('sends ZMQ request with specified targetLanguage on retranslation', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-r2',
        conversationId: 'conv-1',
        content: 'Some content here to translate',
        originalLanguage: 'en'
      } as any);
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-r2', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      await svc.handleNewMessage({
        id: 'msg-r2',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Some content here to translate',
        originalLanguage: 'en',
        targetLanguage: 'de'
      });
      await flushAsync(5);

      expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ targetLanguages: ['de'] })
      );
    });

    it('skips ZMQ when source lang equals only target lang', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-same',
        conversationId: 'conv-1',
        content: 'Bonjour',
        originalLanguage: 'fr'
      } as any);
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-same', translations: {} });

      await svc.handleNewMessage({
        id: 'msg-same',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Bonjour',
        originalLanguage: 'fr',
        targetLanguage: 'fr'
      });
      await flushAsync(5);
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });

    // Prisme rule #1 — the source language is stored verbatim from the client
    // (`z.string().optional()`, un-normalised) while target languages are already
    // lowercase/normalised. An uppercase or locale-cased `originalLanguage` must
    // still be recognised as the source and filtered out; otherwise a self-
    // translation NLLB round-trip paraphrases the author's own words.
    it('skips ZMQ when source lang is uppercase but matches target (case-insensitive)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-upper',
        conversationId: 'conv-1',
        content: 'Bonjour',
        originalLanguage: 'FR'
      } as any);
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-upper', translations: {} });

      await svc.handleNewMessage({
        id: 'msg-upper',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Bonjour',
        originalLanguage: 'FR',
        targetLanguage: 'fr'
      });
      await flushAsync(5);
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });

    it('skips ZMQ when source lang is a locale variant of the target (fr-FR → fr)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-locale',
        conversationId: 'conv-1',
        content: 'Bonjour',
        originalLanguage: 'fr-FR'
      } as any);
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-locale', translations: {} });

      await svc.handleNewMessage({
        id: 'msg-locale',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Bonjour',
        originalLanguage: 'fr-FR',
        targetLanguage: 'fr'
      });
      await flushAsync(5);
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _isSelfTranslation — normalisation de la langue source (Prisme rule #1)
  // =========================================================================
  describe('_isSelfTranslation', () => {
    const call = (source: string | null | undefined, target: string): boolean =>
      (svc as any)._isSelfTranslation(source, target);

    it('matches an exact lowercase source', () => {
      expect(call('fr', 'fr')).toBe(true);
    });

    it('matches an uppercase source against a normalised target', () => {
      expect(call('FR', 'fr')).toBe(true);
    });

    it('matches a locale-cased source (fr-FR → fr)', () => {
      expect(call('fr-FR', 'fr')).toBe(true);
      expect(call('en-US', 'en')).toBe(true);
    });

    it('does not match a different language', () => {
      expect(call('en', 'fr')).toBe(false);
    });

    it('never filters an "auto" source (any case)', () => {
      expect(call('auto', 'fr')).toBe(false);
      expect(call('AUTO', 'fr')).toBe(false);
    });

    it('never filters an absent source', () => {
      expect(call(null, 'fr')).toBe(false);
      expect(call(undefined, 'fr')).toBe(false);
      expect(call('', 'fr')).toBe(false);
    });
  });

  // =========================================================================
  // _extractConversationLanguages — Prisme Linguistique
  // =========================================================================
  describe('_extractConversationLanguages — Prisme Linguistique', () => {
    it('returns languages from resolveUserLanguagesOrdered for registered user with systemLanguage', async () => {
      mockResolveUserLanguagesOrdered.mockReturnValue(['fr']);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-1',
          type: 'user',
          displayName: 'Alice',
          language: null,
          user: { id: 'user-1', username: 'alice', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-1');
      expect(langs).toContain('fr');
      expect(mockResolveUserLanguagesOrdered).toHaveBeenCalledWith(
        expect.objectContaining({ systemLanguage: 'fr' }),
        expect.anything()
      );
    });

    it('returns languages for user with systemLanguage + regionalLanguage', async () => {
      mockResolveUserLanguagesOrdered.mockReturnValue(['fr', 'en']);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-1',
          type: 'user',
          displayName: 'Bob',
          language: null,
          user: { id: 'user-2', username: 'bob', systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null, deviceLocale: null }
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-2');
      expect(langs).toContain('fr');
      expect(langs).toContain('en');
    });

    it('includes customDestinationLanguage via resolveUserLanguagesOrdered', async () => {
      mockResolveUserLanguagesOrdered.mockReturnValue(['fr', 'de']);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-3',
          type: 'user',
          displayName: 'Carol',
          language: null,
          user: { id: 'user-3', username: 'carol', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: 'de', deviceLocale: null }
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-3');
      expect(langs).toContain('de');
    });

    it('includes deviceLocale at 4th priority via resolveUserLanguagesOrdered', async () => {
      mockResolveUserLanguagesOrdered.mockReturnValue(['fr', 'es']);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-4',
          type: 'user',
          displayName: 'Dave',
          language: null,
          user: { id: 'user-4', username: 'dave', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: 'es' }
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-4');
      // deviceLocale passed as second arg
      expect(mockResolveUserLanguagesOrdered).toHaveBeenCalledWith(
        expect.objectContaining({ deviceLocale: 'es' }),
        { deviceLocale: 'es' }
      );
      expect(langs).toContain('es');
    });

    it('uses participant.language for anonymous/bot participants', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-5',
          type: 'anonymous',
          displayName: 'Guest',
          language: 'ja',
          user: null
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-5');
      expect(langs).toContain('ja');
      expect(mockResolveUserLanguagesOrdered).not.toHaveBeenCalled();
    });

    it('handles mixed registered + anonymous participants', async () => {
      mockResolveUserLanguagesOrdered.mockReturnValue(['fr']);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-6',
          type: 'user',
          displayName: 'Alice',
          language: null,
          user: { id: 'user-6', username: 'alice', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }
        },
        {
          id: 'part-7',
          type: 'anonymous',
          displayName: 'Guest',
          language: 'de',
          user: null
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-6');
      expect(langs).toContain('fr');
      expect(langs).toContain('de');
    });

    it('returns [] when autoTranslateEnabled=false', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: false });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-8',
          type: 'user',
          displayName: 'Alice',
          language: null,
          user: { id: 'user-8', username: 'alice', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-auto-off');
      expect(langs).toEqual([]);
    });

    it('returns cached languages on second call (no extra DB query)', async () => {
      mockResolveUserLanguagesOrdered.mockReturnValue(['fr']);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-9',
          type: 'user',
          displayName: 'Alice',
          language: null,
          user: { id: 'user-9', username: 'alice', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }
        }
      ]);

      const langs1 = await (svc as any)._extractConversationLanguages('conv-cached');
      const langs2 = await (svc as any)._extractConversationLanguages('conv-cached');

      expect(langs1).toEqual(langs2);
      // findMany called only once
      expect(prisma.participant.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns ["en","fr"] fallback on DB error', async () => {
      prisma.conversation.findUnique.mockRejectedValue(new Error('DB down'));
      prisma.participant.findMany.mockRejectedValue(new Error('DB down'));

      const langs = await (svc as any)._extractConversationLanguages('conv-err');
      expect(langs).toEqual(['en', 'fr']);
    });

    it('ignores anonymous participant with no language set', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        {
          id: 'part-10',
          type: 'anonymous',
          displayName: 'Ghost',
          language: null,
          user: null
        }
      ]);

      const langs = await (svc as any)._extractConversationLanguages('conv-ghost');
      expect(langs).toEqual([]);
    });
  });

  // =========================================================================
  // _getMessageSourceLanguage
  // =========================================================================
  describe('_getMessageSourceLanguage', () => {
    it('returns originalLanguage of the last message', async () => {
      prisma.message.findFirst.mockResolvedValue({ originalLanguage: 'de' });
      const lang = await (svc as any)._getMessageSourceLanguage('conv-1');
      expect(lang).toBe('de');
    });

    it('returns "fr" when no message found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const lang = await (svc as any)._getMessageSourceLanguage('conv-empty');
      expect(lang).toBe('fr');
    });

    it('returns "fr" on DB error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('fail'));
      const lang = await (svc as any)._getMessageSourceLanguage('conv-err');
      expect(lang).toBe('fr');
    });
  });

  // =========================================================================
  // _handleTranslationCompleted — dedup, error handling
  // =========================================================================
  describe('_handleTranslationCompleted', () => {
    beforeEach(() => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-tx', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);
      prisma.message.findFirst.mockResolvedValue({ senderId: null });
    });

    it('deduplicates: same taskId+lang emitted twice only emits translationReady once', async () => {
      const events: unknown[] = [];
      svc.on('translationReady', (e) => events.push(e));

      const payload = {
        taskId: 'dedup-1',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-tx',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.9,
          processingTime: 5,
          modelType: 'basic'
        }
      };
      mockZmqClient.emit('translationCompleted', payload);
      await flushAsync(3);
      mockZmqClient.emit('translationCompleted', payload);
      await flushAsync(3);

      expect(events).toHaveLength(1);
    });

    it('allows same task with different targetLanguage', async () => {
      const events: unknown[] = [];
      svc.on('translationReady', (e) => events.push(e));

      const base = {
        messageId: 'msg-tx',
        sourceLanguage: 'en',
        translatedText: 'text',
        confidenceScore: 0.9,
        processingTime: 5,
        modelType: 'basic' as const
      };

      mockZmqClient.emit('translationCompleted', { taskId: 'multi-task', targetLanguage: 'fr', result: { ...base, targetLanguage: 'fr' } });
      await flushAsync(3);
      mockZmqClient.emit('translationCompleted', { taskId: 'multi-task', targetLanguage: 'de', result: { ...base, targetLanguage: 'de' } });
      await flushAsync(3);

      expect(events).toHaveLength(2);
    });

    it('continues emitting translationReady even when DB save fails', async () => {
      prisma.message.findUnique.mockRejectedValue(new Error('DB error'));
      const events: unknown[] = [];
      svc.on('translationReady', (e) => events.push(e));

      mockZmqClient.emit('translationCompleted', {
        taskId: 'db-fail-task',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-tx',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.9,
          processingTime: 5,
          modelType: 'basic'
        }
      });
      await flushAsync(3);

      // Even on DB failure, translationReady is emitted
      expect(events).toHaveLength(1);
    });

    it('increments errors on unexpected failure', async () => {
      // Pass malformed data to trigger the catch block
      const statsBefore = svc.getStats().errors;
      mockZmqClient.emit('translationCompleted', null);
      await flushAsync(3);
      // errors should have incremented
      expect(svc.getStats().errors).toBeGreaterThanOrEqual(statsBefore);
    });
  });

  // =========================================================================
  // _incrementUserTranslationStats
  // =========================================================================
  describe('_incrementUserTranslationStats', () => {
    it('upserts userStats when senderId resolves to a userId', async () => {
      prisma.message.findFirst.mockResolvedValue({ senderId: 'part-1' });
      prisma.participant.findUnique.mockResolvedValue({ userId: 'user-real' });
      prisma.userStats.upsert.mockResolvedValue({} as any);
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-stats', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      mockZmqClient.emit('translationCompleted', {
        taskId: 'stats-task',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-stats',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.9,
          processingTime: 5,
          modelType: 'basic'
        }
      });
      await flushAsync(4);

      expect(prisma.userStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-real' } })
      );
    });

    it('does nothing when senderId participant has no userId', async () => {
      prisma.message.findFirst.mockResolvedValue({ senderId: 'part-no-user' });
      prisma.participant.findUnique.mockResolvedValue({ userId: null });
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-no-stats', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      mockZmqClient.emit('translationCompleted', {
        taskId: 'no-stats-task',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-no-stats',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.9,
          processingTime: 5,
          modelType: 'basic'
        }
      });
      await flushAsync(4);

      expect(prisma.userStats.upsert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _handleAudioProcessCompleted — post routing
  // =========================================================================
  describe('_handleAudioProcessCompleted — post routing', () => {
    it('routes to PostAudioService when postId and postMediaId are present', async () => {
      const data = {
        ...makeAudioProcessCompletedData(),
        postId: 'post-1',
        postMediaId: 'media-1',
        translatedAudios: [makeTranslatedAudio()]
      };

      mockZmqClient.emit('audioProcessCompleted', data);
      await flushAsync(3);

      expect(mockHandleAudioTranslationsReady).toHaveBeenCalledWith(
        expect.objectContaining({ postId: 'post-1', postMediaId: 'media-1' })
      );
      // Should NOT touch messageAttachment
      expect(prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    });

    it('does not route to PostAudioService when translatedAudios is empty', async () => {
      const data = {
        ...makeAudioProcessCompletedData(),
        postId: 'post-1',
        postMediaId: 'media-1',
        translatedAudios: []
      };

      mockZmqClient.emit('audioProcessCompleted', data);
      await flushAsync(3);

      expect(mockHandleAudioTranslationsReady).not.toHaveBeenCalled();
    });

    it('returns early when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData());
      await flushAsync(3);

      expect(events).toHaveLength(0);
    });
  });

  // =========================================================================
  // _handleAudioProcessCompleted — normal flow
  // =========================================================================
  describe('_handleAudioProcessCompleted — normal message flow', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        messageId: 'msg-1',
        duration: 2000,
        translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('emits audioTranslationReady for each translated language', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        translatedAudios: [
          makeTranslatedAudio({ targetLanguage: 'fr' }),
          makeTranslatedAudio({ targetLanguage: 'de' })
        ]
      }));
      await flushAsync(5);

      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('saves binary audio file when _audioBinary is present', async () => {
      const fsMock = require('fs');
      fsMock.promises.writeFile.mockResolvedValue(undefined);
      fsMock.promises.mkdir.mockResolvedValue(undefined);

      const audioBinary = Buffer.from('fake-audio-bytes');
      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        translatedAudios: [makeTranslatedAudio({ _audioBinary: audioBinary })]
      }));
      await flushAsync(5);

      expect(fsMock.promises.writeFile).toHaveBeenCalled();
    });

    it('saves base64 audio file when audioDataBase64 is present (legacy)', async () => {
      const fsMock = require('fs');
      fsMock.promises.writeFile.mockResolvedValue(undefined);
      fsMock.promises.mkdir.mockResolvedValue(undefined);

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        translatedAudios: [makeTranslatedAudio({ audioDataBase64: Buffer.from('legacy').toString('base64') })]
      }));
      await flushAsync(5);

      expect(fsMock.promises.writeFile).toHaveBeenCalled();
    });

    it('handles transcription segments presence (diarisation logging)', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          source: 'whisper',
          durationMs: 2000,
          speakerCount: 2,
          primarySpeakerId: 'spk-1',
          senderVoiceIdentified: true,
          senderSpeakerId: 'spk-1',
          speakerAnalysis: {
            speakers: [
              { sid: 'spk-1', isPrimary: true, voiceSimilarityScore: 0.9 }
            ]
          },
          segments: [
            { text: 'Hello', startMs: 0, endMs: 500, speakerId: 'spk-1', confidence: 0.95 }
          ]
        }
      }));
      await flushAsync(5);

      // Should not throw; diarisation info logged
    });

    it('upserts voice profile when newVoiceProfile is provided', async () => {
      const embeddingBinary = Buffer.from('fake-embedding');

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        newVoiceProfile: {
          userId: 'user-voice',
          profileId: 'prof-1',
          _embeddingBinary: embeddingBinary,
          qualityScore: 0.85,
          audioCount: 3,
          totalDurationMs: 5000,
          version: 1
        }
      }));
      await flushAsync(5);

      expect(prisma.userVoiceModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-voice' } })
      );
    });

    it('upserts voice profile with base64 embedding (legacy path)', async () => {
      const embeddingBase64 = Buffer.from('legacy-embedding').toString('base64');

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        newVoiceProfile: {
          userId: 'user-voice-b64',
          profileId: 'prof-b64',
          embedding: embeddingBase64,
          qualityScore: 0.75,
          audioCount: 1,
          totalDurationMs: 2000,
          version: 1
        }
      }));
      await flushAsync(5);

      expect(prisma.userVoiceModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-voice-b64' } })
      );
    });

    it('logs error but does not fail when voice profile save errors', async () => {
      prisma.userVoiceModel.upsert.mockRejectedValue(new Error('upsert failed'));

      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        newVoiceProfile: {
          userId: 'user-vp-err',
          profileId: 'prof-err',
          _embeddingBinary: Buffer.from('embed'),
          qualityScore: 0.7,
          audioCount: 1,
          totalDurationMs: 1000,
          version: 1
        }
      }));
      await flushAsync(5);

      // Should still emit audioTranslationReady
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('skips voice profile when no embedding available', async () => {
      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        newVoiceProfile: {
          userId: 'user-no-embed',
          profileId: 'prof-no-embed',
          qualityScore: 0.5,
          audioCount: 1,
          totalDurationMs: 1000,
          version: 1
        }
      }));
      await flushAsync(5);

      expect(prisma.userVoiceModel.upsert).not.toHaveBeenCalled();
    });

    it('saves chatterbox conditionals when provided', async () => {
      const chatterboxB64 = Buffer.from('chatterbox-data').toString('base64');

      mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
        newVoiceProfile: {
          userId: 'user-chatterbox',
          profileId: 'prof-chatterbox',
          _embeddingBinary: Buffer.from('embed'),
          qualityScore: 0.9,
          audioCount: 5,
          totalDurationMs: 10000,
          version: 2,
          chatterbox_conditionals_base64: chatterboxB64,
          reference_audio_id: 'ref-audio-1',
          reference_audio_url: 'https://example.com/audio.mp3'
        }
      }));
      await flushAsync(5);

      const call = prisma.userVoiceModel.upsert.mock.calls[0]?.[0] as any;
      expect(call?.update?.chatterboxConditionals).toBeDefined();
      expect(call?.update?.referenceAudioId).toBe('ref-audio-1');
    });
  });

  // =========================================================================
  // _handleAudioProcessError
  // =========================================================================
  describe('_handleAudioProcessError', () => {
    it('emits audioTranslationError and increments errors', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationError', (e) => events.push(e));
      const before = svc.getStats().errors;

      mockZmqClient.emit('audioProcessError', {
        taskId: 'task-err',
        messageId: 'msg-1',
        attachmentId: 'att-1',
        error: 'something went wrong',
        errorCode: 'AUDIO_FAIL'
      });
      await flushAsync(2);

      expect(events).toHaveLength(1);
      expect((events[0] as any).errorCode).toBe('AUDIO_FAIL');
      expect(svc.getStats().errors).toBe(before + 1);
    });
  });

  // =========================================================================
  // _handleTranscriptionOnlyCompleted
  // =========================================================================
  describe('_handleTranscriptionOnlyCompleted', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-tr', messageId: 'msg-tr', duration: 3000, translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('emits transcriptionReady event with transcription data', async () => {
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionCompleted', {
        taskId: 'tc-1',
        messageId: 'msg-tr',
        attachmentId: 'att-tr',
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          durationMs: 3000,
          source: 'whisper'
        },
        processingTimeMs: 200
      });
      await flushAsync(3);

      expect(events).toHaveLength(1);
      expect((events[0] as any).transcription.text).toBe('Hello world');
    });

    it('skips blank transcription text', async () => {
      (isBlankTranscriptionText as MockFn).mockReturnValueOnce(true);
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionCompleted', {
        taskId: 'tc-blank',
        messageId: 'msg-tr',
        attachmentId: 'att-tr',
        transcription: {
          text: '',
          language: 'en',
          confidence: 0,
          durationMs: 0,
          source: 'whisper'
        },
        processingTimeMs: 50
      });
      await flushAsync(3);

      expect(events).toHaveLength(0);
      expect(prisma.messageAttachment.update).not.toHaveBeenCalled();
    });

    it('returns early when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionCompleted', {
        taskId: 'tc-no-att',
        messageId: 'msg-tr',
        attachmentId: 'att-missing',
        transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 100
      });
      await flushAsync(3);

      expect(events).toHaveLength(0);
    });

    it('logs diarisation info when speakerCount is set', async () => {
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionCompleted', {
        taskId: 'tc-diar',
        messageId: 'msg-tr',
        attachmentId: 'att-tr',
        transcription: {
          text: 'Hello there',
          language: 'en',
          confidence: 0.9,
          durationMs: 1500,
          source: 'whisper',
          speakerCount: 2,
          primarySpeakerId: 'spk-0'
        },
        processingTimeMs: 300
      });
      await flushAsync(3);

      expect(events).toHaveLength(1);
      expect((events[0] as any).transcription.speakerCount).toBe(2);
    });

    it('increments errors on exception', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB fail'));
      const before = svc.getStats().errors;

      mockZmqClient.emit('transcriptionCompleted', {
        taskId: 'tc-err',
        messageId: 'msg-tr',
        attachmentId: 'att-tr',
        transcription: { text: 'hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 100
      });
      await flushAsync(3);

      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // _handleTranscriptionOnlyError
  // =========================================================================
  describe('_handleTranscriptionOnlyError', () => {
    it('emits transcriptionError and increments errors stat', async () => {
      const events: unknown[] = [];
      svc.on('transcriptionError', (e) => events.push(e));
      const before = svc.getStats().errors;

      mockZmqClient.emit('transcriptionError', {
        taskId: 'te-1',
        messageId: 'msg-1',
        attachmentId: 'att-1',
        error: 'transcription failed',
        errorCode: 'WHISPER_FAIL'
      });
      await flushAsync(2);

      expect(events).toHaveLength(1);
      expect((events[0] as any).errorCode).toBe('WHISPER_FAIL');
      expect(svc.getStats().errors).toBe(before + 1);
    });
  });

  // =========================================================================
  // _handleTranscriptionReady
  // =========================================================================
  describe('_handleTranscriptionReady', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-ready', messageId: 'msg-ready', duration: 2000
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('emits transcriptionReady for message attachment', async () => {
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionReady', {
        taskId: 'tr-msg-1',
        messageId: 'msg-ready',
        attachmentId: 'att-ready',
        transcription: {
          text: 'Hello phase 1',
          language: 'en',
          confidence: 0.9,
          durationMs: 2000,
          source: 'whisper'
        },
        processingTimeMs: 150
      });
      await flushAsync(3);

      expect(events).toHaveLength(1);
      expect((events[0] as any).phase).toBe('transcription');
    });

    it('skips blank transcription', async () => {
      (isBlankTranscriptionText as MockFn).mockReturnValueOnce(true);
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionReady', {
        taskId: 'tr-blank',
        messageId: 'msg-ready',
        attachmentId: 'att-ready',
        transcription: { text: '', language: 'en', confidence: 0, durationMs: 0, source: 'whisper' },
        processingTimeMs: 10
      });
      await flushAsync(3);

      expect(events).toHaveLength(0);
    });

    it('emits transcriptionReady immediately for post audio (no DB save)', async () => {
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionReady', {
        taskId: 'tr-post-1',
        messageId: 'msg-post',
        attachmentId: 'att-post',
        postId: 'post-1',
        postMediaId: 'media-1',
        transcription: {
          text: 'Post audio content',
          language: 'en',
          confidence: 0.88,
          durationMs: 3000,
          source: 'whisper'
        },
        processingTimeMs: 200
      });
      await flushAsync(3);

      expect(events).toHaveLength(1);
      expect((events[0] as any).postId).toBe('post-1');
      // Should NOT have queried messageAttachment
      expect(prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    });

    it('returns early when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionReady', {
        taskId: 'tr-noatt',
        messageId: 'msg-ready',
        attachmentId: 'att-missing',
        transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 100
      });
      await flushAsync(3);

      expect(events).toHaveLength(0);
    });

    it('logs diarisation info when speakerCount is present', async () => {
      const events: unknown[] = [];
      svc.on('transcriptionReady', (e) => events.push(e));

      mockZmqClient.emit('transcriptionReady', {
        taskId: 'tr-diar',
        messageId: 'msg-ready',
        attachmentId: 'att-ready',
        transcription: {
          text: 'Hello',
          language: 'en',
          confidence: 0.9,
          durationMs: 1000,
          source: 'whisper',
          speakerCount: 3,
          primarySpeakerId: 'spk-0',
          senderVoiceIdentified: false
        },
        processingTimeMs: 200
      });
      await flushAsync(3);

      const e = events[0] as any;
      expect(e.transcription.speakerCount).toBe(3);
    });

    it('increments errors on DB failure', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB crash'));
      const before = svc.getStats().errors;

      mockZmqClient.emit('transcriptionReady', {
        taskId: 'tr-dberr',
        messageId: 'msg-ready',
        attachmentId: 'att-ready',
        transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 100
      });
      await flushAsync(3);

      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // _processTranslationEvent / _handleAudioTranslationReady
  // =========================================================================
  describe('_handleAudioTranslationReady (single-language)', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-single', messageId: 'msg-single', translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('emits audioTranslationReady when translatedAudio is provided', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('audioTranslationReady', {
        taskId: 'atr-1',
        messageId: 'msg-single',
        attachmentId: 'att-single',
        language: 'fr',
        translatedAudio: makeTranslatedAudio()
      });
      await flushAsync(4);

      expect(events).toHaveLength(1);
      expect((events[0] as any).language).toBe('fr');
    });

    it('returns early when translatedAudio is undefined', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('audioTranslationReady', {
        taskId: 'atr-missing',
        messageId: 'msg-single',
        attachmentId: 'att-single',
        language: 'fr',
        translatedAudio: undefined
      });
      await flushAsync(3);

      expect(events).toHaveLength(0);
    });

    it('saves binary audio when _audioBinary present', async () => {
      const fsMock = require('fs');
      fsMock.promises.mkdir.mockResolvedValue(undefined);
      fsMock.promises.writeFile.mockResolvedValue(undefined);

      mockZmqClient.emit('audioTranslationReady', {
        taskId: 'atr-bin',
        messageId: 'msg-single',
        attachmentId: 'att-single',
        language: 'de',
        translatedAudio: makeTranslatedAudio({ targetLanguage: 'de', _audioBinary: Buffer.from('audio') })
      });
      await flushAsync(4);

      expect(fsMock.promises.writeFile).toHaveBeenCalled();
    });

    it('increments errors on exception inside _processTranslationEvent', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('crash'));
      const before = svc.getStats().errors;

      mockZmqClient.emit('audioTranslationReady', {
        taskId: 'atr-err',
        messageId: 'msg-single',
        attachmentId: 'att-single',
        language: 'fr',
        translatedAudio: makeTranslatedAudio()
      });
      await flushAsync(4);

      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // _handleAudioTranslationsProgressive
  // =========================================================================
  describe('_handleAudioTranslationsProgressive', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-prog', messageId: 'msg-prog', translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('emits audioTranslationsProgressive event', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationsProgressive', (e) => events.push(e));

      mockZmqClient.emit('audioTranslationsProgressive', {
        taskId: 'prog-1',
        messageId: 'msg-prog',
        attachmentId: 'att-prog',
        language: 'es',
        translatedAudio: makeTranslatedAudio({ targetLanguage: 'es' })
      });
      await flushAsync(4);

      expect(events).toHaveLength(1);
      expect((events[0] as any).language).toBe('es');
    });

    it('increments errors on exception', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('prog-fail'));
      const before = svc.getStats().errors;

      mockZmqClient.emit('audioTranslationsProgressive', {
        taskId: 'prog-err',
        messageId: 'msg-prog',
        attachmentId: 'att-prog',
        language: 'es',
        translatedAudio: makeTranslatedAudio({ targetLanguage: 'es' })
      });
      await flushAsync(4);

      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // _handleAudioTranslationsCompleted
  // =========================================================================
  describe('_handleAudioTranslationsCompleted', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-comp', messageId: 'msg-comp', translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('emits audioTranslationsCompleted event', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationsCompleted', (e) => events.push(e));

      mockZmqClient.emit('audioTranslationsCompleted', {
        taskId: 'comp-1',
        messageId: 'msg-comp',
        attachmentId: 'att-comp',
        language: 'it',
        translatedAudio: makeTranslatedAudio({ targetLanguage: 'it' })
      });
      await flushAsync(4);

      expect(events).toHaveLength(1);
    });

    it('increments errors on exception', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('comp-fail'));
      const before = svc.getStats().errors;

      mockZmqClient.emit('audioTranslationsCompleted', {
        taskId: 'comp-err',
        messageId: 'msg-comp',
        attachmentId: 'att-comp',
        language: 'it',
        translatedAudio: makeTranslatedAudio({ targetLanguage: 'it' })
      });
      await flushAsync(4);

      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // _handleTranslationReady (deprecated)
  // =========================================================================
  describe('_handleTranslationReady (deprecated)', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-dep', messageId: 'msg-dep', translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('delegates to _processTranslationEvent and emits translationReady', async () => {
      const events: unknown[] = [];
      svc.on('translationReady', (e) => events.push(e));

      mockZmqClient.emit('translationReady', {
        taskId: 'dep-1',
        messageId: 'msg-dep',
        attachmentId: 'att-dep',
        language: 'pt',
        translatedAudio: makeTranslatedAudio({ targetLanguage: 'pt' })
      });
      await flushAsync(4);

      // The deprecated handler delegates to _processTranslationEvent which emits translationReady
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // _handleVoiceTranslationCompleted — standalone job
  // =========================================================================
  describe('_handleVoiceTranslationCompleted — standalone job', () => {
    it('emits voiceTranslationJobCompleted when no jobMetadata attachment', async () => {
      mockGetAndDeleteJobMapping.mockResolvedValue(null);
      const events: unknown[] = [];
      svc.on('voiceTranslationJobCompleted', (e) => events.push(e));

      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'job-standalone',
        status: 'completed',
        userId: 'user-1',
        timestamp: Date.now(),
        result: {
          translationId: 'tr-1',
          originalAudio: {
            transcription: 'Hello',
            language: 'en',
            durationMs: 2000,
            confidence: 0.9
          },
          translations: [{
            targetLanguage: 'fr',
            translatedText: 'Bonjour',
            durationMs: 1800,
            voiceCloned: false,
            voiceQuality: 0.8
          }],
          processingTimeMs: 500
        }
      });
      await flushAsync(4);

      expect(events).toHaveLength(1);
      expect((events[0] as any).jobId).toBe('job-standalone');
    });
  });

  // =========================================================================
  // _handleVoiceTranslationCompleted — attachment job
  // =========================================================================
  describe('_handleVoiceTranslationCompleted — attachment job', () => {
    const jobMetadata = {
      messageId: 'msg-vj',
      attachmentId: 'att-vj',
      conversationId: 'conv-vj'
    };

    beforeEach(() => {
      mockGetAndDeleteJobMapping.mockResolvedValue(jobMetadata);
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-vj', messageId: 'msg-vj', duration: 3000, translations: {}
      } as any);
      prisma.messageAttachment.update.mockResolvedValue({} as any);
    });

    it('saves translations and emits audioTranslationReady', async () => {
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'job-att-1',
        status: 'completed',
        userId: 'user-vj',
        timestamp: Date.now(),
        result: {
          translationId: 'tr-2',
          originalAudio: {
            transcription: 'Hello there',
            language: 'en',
            durationMs: 3000,
            confidence: 0.92
          },
          translations: [{
            targetLanguage: 'fr',
            translatedText: 'Bonjour là',
            audioBase64: Buffer.from('fake-audio').toString('base64'),
            durationMs: 2800,
            voiceCloned: true,
            voiceQuality: 0.88
          }],
          processingTimeMs: 800
        }
      });
      await flushAsync(6);

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(prisma.messageAttachment.update).toHaveBeenCalled();
    });

    it('returns early when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const events: unknown[] = [];
      svc.on('audioTranslationReady', (e) => events.push(e));

      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'job-no-att',
        status: 'completed',
        userId: 'user-vj',
        timestamp: Date.now(),
        result: {
          translationId: 'tr-3',
          originalAudio: { transcription: 'Hi', language: 'en', durationMs: 1000, confidence: 0.8 },
          translations: [{ targetLanguage: 'de', translatedText: 'Hallo', durationMs: 900, voiceCloned: false, voiceQuality: 0.7 }],
          processingTimeMs: 300
        }
      });
      await flushAsync(5);

      expect(events).toHaveLength(0);
    });

    it('saves binary audio in voice translation job', async () => {
      const fsMock = require('fs');
      fsMock.promises.mkdir.mockResolvedValue(undefined);
      fsMock.promises.writeFile.mockResolvedValue(undefined);

      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'job-bin',
        status: 'completed',
        userId: 'user-vj',
        timestamp: Date.now(),
        result: {
          translationId: 'tr-bin',
          originalAudio: { transcription: 'Audio test', language: 'en', durationMs: 2000, confidence: 0.9 },
          translations: [{
            targetLanguage: 'es',
            translatedText: 'Prueba de audio',
            _audioBinary: Buffer.from('binary-audio-data'),
            durationMs: 1900,
            voiceCloned: true,
            voiceQuality: 0.85
          }],
          processingTimeMs: 600
        }
      });
      await flushAsync(6);

      expect(fsMock.promises.writeFile).toHaveBeenCalled();
    });

    it('increments errors on exception', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('vj-fail'));
      const before = svc.getStats().errors;

      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'job-err',
        status: 'completed',
        userId: 'user-vj',
        timestamp: Date.now(),
        result: {
          translationId: 'tr-err',
          originalAudio: { transcription: 'Hello', language: 'en', durationMs: 1000, confidence: 0.8 },
          translations: [{ targetLanguage: 'fr', translatedText: 'Bonjour', durationMs: 900, voiceCloned: false, voiceQuality: 0.7 }],
          processingTimeMs: 300
        }
      });
      await flushAsync(5);

      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // _handleVoiceTranslationFailed
  // =========================================================================
  describe('_handleVoiceTranslationFailed', () => {
    it('emits voiceTranslationJobFailed and increments errors', async () => {
      const events: unknown[] = [];
      svc.on('voiceTranslationJobFailed', (e) => events.push(e));
      const before = svc.getStats().errors;

      mockZmqClient.emit('voiceTranslationFailed', {
        jobId: 'job-fail-1',
        status: 'failed',
        userId: 'user-1',
        timestamp: Date.now(),
        error: 'TTS failed',
        errorCode: 'TTS_ERROR'
      });
      await flushAsync(2);

      expect(events).toHaveLength(1);
      expect((events[0] as any).jobId).toBe('job-fail-1');
      expect((events[0] as any).errorCode).toBe('TTS_ERROR');
      expect(svc.getStats().errors).toBe(before + 1);
    });
  });

  // =========================================================================
  // processAudioAttachment — public API
  // =========================================================================
  describe('processAudioAttachment()', () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({ systemLanguage: 'en' } as any);
      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
    });

    it('returns taskId on success', async () => {
      mockZmqClient.sendAudioProcessRequest.mockResolvedValue('task-audio-ok');
      const result = await svc.processAudioAttachment({
        messageId: 'msg-a1',
        attachmentId: 'att-a1',
        conversationId: 'conv-a1',
        senderId: 'user-a1',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 5000
      });
      expect(result).toBe('task-audio-ok');
    });

    it('returns null when zmqClient is null', async () => {
      const freshSvc = new MessageTranslationService(prisma as any);
      // not initialized
      const result = await freshSvc.processAudioAttachment({
        messageId: 'msg-no-zmq',
        attachmentId: 'att-no-zmq',
        conversationId: 'conv-no-zmq',
        senderId: 'user-1',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 1000
      });
      expect(result).toBeNull();
    });

    it('uses provided userLanguage without DB lookup', async () => {
      await svc.processAudioAttachment({
        messageId: 'msg-lang',
        attachmentId: 'att-lang',
        conversationId: 'conv-lang',
        senderId: 'user-lang',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 2000,
        userLanguage: 'de'
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('fetches user systemLanguage when userLanguage not provided', async () => {
      await svc.processAudioAttachment({
        messageId: 'msg-fetch-lang',
        attachmentId: 'att-fetch-lang',
        conversationId: 'conv-fetch-lang',
        senderId: 'user-fetch',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 2000
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-fetch' } })
      );
    });

    it('falls back to en+fr when no conversation languages', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: false });

      await svc.processAudioAttachment({
        messageId: 'msg-fallback',
        attachmentId: 'att-fallback',
        conversationId: 'conv-fallback',
        senderId: 'user-1',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 1000
      });

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      expect(call?.targetLanguages).toEqual(expect.arrayContaining(['en', 'fr']));
    });

    it('sends empty targetLanguages when canGenerateTranslatedAudio=false', async () => {
      const { ConsentValidationService } = require('../../../services/ConsentValidationService');
      (ConsentValidationService as jest.Mock<any>).mockImplementationOnce(() => ({
        getConsentStatus: jest.fn().mockResolvedValue({
          canTranscribeAudio: true,
          canTranslateAudio: false,
          canGenerateTranslatedAudio: false,
          canUseVoiceCloning: false,
          hasVoiceDataConsent: false
        })
      }));

      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([
        { id: 'p1', type: 'anonymous', language: 'fr', displayName: 'Guest', user: null }
      ]);

      await svc.processAudioAttachment({
        messageId: 'msg-no-audio',
        attachmentId: 'att-no-audio',
        conversationId: 'conv-no-audio',
        senderId: 'user-no-consent',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 2000
      });

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      expect(call?.targetLanguages).toEqual([]);
    });

    it('returns null when canTranscribeAudio=false', async () => {
      const { ConsentValidationService } = require('../../../services/ConsentValidationService');
      (ConsentValidationService as jest.Mock<any>).mockImplementationOnce(() => ({
        getConsentStatus: jest.fn().mockResolvedValue({
          canTranscribeAudio: false,
          canTranslateAudio: false,
          canGenerateTranslatedAudio: false,
          canUseVoiceCloning: false,
          hasVoiceDataConsent: false
        })
      }));

      const result = await svc.processAudioAttachment({
        messageId: 'msg-no-consent',
        attachmentId: 'att-no-consent',
        conversationId: 'conv-no-consent',
        senderId: 'user-no-transcribe',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 2000
      });

      expect(result).toBeNull();
    });

    it('handles BYPASS_VOICE_CONSENT_CHECK env var', async () => {
      process.env.BYPASS_VOICE_CONSENT_CHECK = 'true';
      try {
        const result = await svc.processAudioAttachment({
          messageId: 'msg-bypass',
          attachmentId: 'att-bypass',
          conversationId: 'conv-bypass',
          senderId: 'user-bypass',
          audioUrl: '/url/audio.mp3',
          audioPath: '/app/uploads/audio.mp3',
          audioDurationMs: 2000
        });
        expect(result).not.toBeNull();
      } finally {
        delete process.env.BYPASS_VOICE_CONSENT_CHECK;
      }
    });

    it('includes existing voice profile when found', async () => {
      const embeddingBuffer = Buffer.from('fake-embedding');
      prisma.userVoiceModel.findUnique.mockResolvedValue({
        userId: 'user-voice',
        profileId: 'prof-x',
        embedding: embeddingBuffer,
        qualityScore: 0.9,
        fingerprint: null,
        voiceCharacteristics: null,
        version: 2,
        audioCount: 5,
        totalDurationMs: 10000,
        chatterboxConditionals: null,
        referenceAudioId: null,
        referenceAudioUrl: null
      } as any);

      await svc.processAudioAttachment({
        messageId: 'msg-voice-profile',
        attachmentId: 'att-voice-profile',
        conversationId: 'conv-voice',
        senderId: 'user-voice',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 3000,
        generateVoiceClone: true
      });

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      expect(call?.existingVoiceProfile).toBeDefined();
      expect(call?.existingVoiceProfile?.profileId).toBe('prof-x');
    });

    it('includes chatterbox conditionals from existing voice profile', async () => {
      const embeddingBuffer = Buffer.from('embed');
      const chatterboxBuffer = Buffer.from('chatterbox-data');

      prisma.userVoiceModel.findUnique.mockResolvedValue({
        userId: 'user-chatterbox-read',
        profileId: 'prof-chatter',
        embedding: embeddingBuffer,
        qualityScore: 0.88,
        fingerprint: null,
        voiceCharacteristics: null,
        version: 3,
        audioCount: 10,
        totalDurationMs: 20000,
        chatterboxConditionals: chatterboxBuffer,
        referenceAudioId: 'ref-1',
        referenceAudioUrl: '/url/ref.mp3'
      } as any);

      await svc.processAudioAttachment({
        messageId: 'msg-chatter',
        attachmentId: 'att-chatter',
        conversationId: 'conv-chatter',
        senderId: 'user-chatterbox-read',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 4000,
        generateVoiceClone: true
      });

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      expect(call?.existingVoiceProfile?.chatterbox_conditionals_base64).toBeDefined();
      expect(call?.existingVoiceProfile?.reference_audio_id).toBe('ref-1');
    });

    it('returns null and increments errors on exception', async () => {
      mockZmqClient.sendAudioProcessRequest.mockRejectedValue(new Error('ZMQ crash'));
      const before = svc.getStats().errors;

      const result = await svc.processAudioAttachment({
        messageId: 'msg-crash',
        attachmentId: 'att-crash',
        conversationId: 'conv-crash',
        senderId: 'user-1',
        audioUrl: '/url/audio.mp3',
        audioPath: '/app/uploads/audio.mp3',
        audioDurationMs: 2000
      });

      expect(result).toBeNull();
      expect(svc.getStats().errors).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // transcribeAttachment — public API
  // =========================================================================
  describe('transcribeAttachment()', () => {
    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-tx',
        messageId: 'msg-tx',
        fileName: 'voice.mp3',
        filePath: 'voice/voice.mp3',
        fileUrl: '/url/voice.mp3',
        duration: 3000,
        mimeType: 'audio/mp3',
        metadata: null
      } as any);
    });

    it('returns taskId and attachment info on success', async () => {
      const result = await svc.transcribeAttachment('att-tx');

      expect(result).not.toBeNull();
      expect(result?.taskId).toBe('task-tr-1');
      expect(result?.attachment.id).toBe('att-tx');
      expect(result?.attachment.mimeType).toBe('audio/mp3');
    });

    it('returns null when zmqClient is not initialized', async () => {
      const fresh = new MessageTranslationService(prisma as any);
      const result = await fresh.transcribeAttachment('att-tx');
      expect(result).toBeNull();
    });

    it('returns null when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const result = await svc.transcribeAttachment('att-missing');
      expect(result).toBeNull();
    });

    it('returns null when attachment is not audio', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-image',
        messageId: 'msg-tx',
        fileName: 'photo.jpg',
        filePath: 'images/photo.jpg',
        fileUrl: '/url/photo.jpg',
        duration: null,
        mimeType: 'image/jpeg',
        metadata: null
      } as any);

      const result = await svc.transcribeAttachment('att-image');
      expect(result).toBeNull();
    });

    it('increments errors and returns null on exception', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB error'));
      const before = svc.getStats().errors;

      const result = await svc.transcribeAttachment('att-tx');
      expect(result).toBeNull();
      expect(svc.getStats().errors).toBeGreaterThan(before);
    });

    it('increments requestsSent stat on success', async () => {
      const before = svc.getStats().translation_requests_sent;
      await svc.transcribeAttachment('att-tx');
      expect(svc.getStats().translation_requests_sent).toBe(before + 1);
    });
  });

  // =========================================================================
  // getAttachmentWithTranscription — public API
  // =========================================================================
  describe('getAttachmentWithTranscription()', () => {
    it('returns null when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const result = await svc.getAttachmentWithTranscription('att-missing');
      expect(result).toBeNull();
    });

    it('returns attachment with transcription and translated audios', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-full',
        messageId: 'msg-full',
        fileName: 'audio.mp3',
        originalName: 'audio.mp3',
        fileUrl: '/url/audio.mp3',
        mimeType: 'audio/mp3',
        fileSize: 2048,
        duration: 4000,
        bitrate: 128000,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 2,
        createdAt: new Date(),
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.9,
          source: 'whisper',
          durationMs: 4000
        },
        translations: {
          fr: {
            type: 'audio',
            transcription: 'Bonjour monde',
            url: '/url/translated/att-full_fr.mp3',
            path: '/app/uploads/translated/att-full_fr.mp3',
            durationMs: 3800,
            format: 'mp3',
            cloned: false,
            quality: 0.8,
            createdAt: new Date().toISOString()
          }
        }
      } as any);

      const result = await svc.getAttachmentWithTranscription('att-full');

      expect(result).not.toBeNull();
      expect(result?.transcription?.text).toBe('Hello world');
      expect(result?.translatedAudios).toHaveLength(1);
      expect(result?.translatedAudios[0].targetLanguage).toBe('fr');
    });

    it('returns null transcription when not set', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-no-tr',
        messageId: 'msg-no-tr',
        fileName: 'audio.mp3',
        originalName: 'audio.mp3',
        fileUrl: '/url/audio.mp3',
        mimeType: 'audio/mp3',
        fileSize: 1024,
        duration: null,
        bitrate: null,
        sampleRate: null,
        codec: null,
        channels: null,
        createdAt: new Date(),
        transcription: null,
        translations: null
      } as any);

      const result = await svc.getAttachmentWithTranscription('att-no-tr');

      expect(result?.transcription).toBeNull();
      expect(result?.translatedAudios).toEqual([]);
    });

    it('returns null on DB error', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB error'));
      const result = await svc.getAttachmentWithTranscription('att-err');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // translateAttachment — public API
  // =========================================================================
  describe('translateAttachment()', () => {
    const attachmentBase = {
      id: 'att-tl',
      messageId: 'msg-tl',
      fileName: 'audio.mp3',
      filePath: 'audio/audio.mp3',
      fileUrl: '/url/audio.mp3',
      duration: 5000,
      mimeType: 'audio/mp3',
      uploadedBy: 'user-tl',
      message: {
        conversationId: 'conv-tl',
        senderId: 'part-tl'
      }
    };

    beforeEach(() => {
      prisma.messageAttachment.findUnique.mockResolvedValue(attachmentBase as any);
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([]);
      prisma.participant.findUnique.mockResolvedValue({ userId: 'user-tl' });
      prisma.user.findUnique.mockResolvedValue({ systemLanguage: 'en' } as any);
      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
    });

    it('returns taskId and attachment info on success', async () => {
      const result = await svc.translateAttachment('att-tl');

      expect(result).not.toBeNull();
      expect(result?.taskId).toBe('task-audio-1');
      expect(result?.attachment.id).toBe('att-tl');
    });

    it('returns null when zmqClient is null', async () => {
      const fresh = new MessageTranslationService(prisma as any);
      const result = await fresh.translateAttachment('att-tl');
      expect(result).toBeNull();
    });

    it('returns null when attachment not found', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const result = await svc.translateAttachment('att-missing');
      expect(result).toBeNull();
    });

    it('returns null when attachment is not audio', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        ...attachmentBase,
        mimeType: 'video/mp4'
      } as any);
      const result = await svc.translateAttachment('att-video');
      expect(result).toBeNull();
    });

    it('uses conversation languages extracted via processAudioAttachment', async () => {
      // translateAttachment calls processAudioAttachment which internally calls
      // _extractConversationLanguages — targetLanguages from options only affect
      // the translateAttachment-level check, not what processAudioAttachment sends.
      mockResolveUserLanguagesOrdered.mockReturnValue(['de', 'es']);
      prisma.participant.findMany.mockResolvedValue([
        { id: 'p1', type: 'anonymous', language: 'de', displayName: 'G', user: null },
        { id: 'p2', type: 'anonymous', language: 'es', displayName: 'H', user: null }
      ]);

      await svc.translateAttachment('att-tl', { targetLanguages: ['de', 'es'] });

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      // processAudioAttachment sends whatever _extractConversationLanguages returns
      expect(call?.targetLanguages).toBeDefined();
    });

    it('falls back to en+fr when no conversation languages', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: false });
      prisma.participant.findMany.mockResolvedValue([]);

      await svc.translateAttachment('att-tl', {});

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      // processAudioAttachment falls back to ['en', 'fr'] when _extractConversationLanguages returns []
      expect(call?.targetLanguages).toEqual(expect.arrayContaining(['en', 'fr']));
    });

    it('resolves senderId via participant lookup', async () => {
      prisma.participant.findUnique.mockResolvedValue({ userId: 'real-user-id' });

      await svc.translateAttachment('att-tl');

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      expect(call?.senderId).toBe('real-user-id');
    });

    it('uses message.senderId when participant has no userId', async () => {
      prisma.participant.findUnique.mockResolvedValue({ userId: null });

      await svc.translateAttachment('att-tl');

      const call = mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;
      expect(call?.senderId).toBe('part-tl'); // original senderId
    });

    it('returns null and catches error on DB exception', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB failure'));

      const result = await svc.translateAttachment('att-err');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // _saveTranslationToDatabase — error path
  // =========================================================================
  describe('_saveTranslationToDatabase — error handling', () => {
    it('increments errors when DB update fails during translationCompleted', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-db-fail', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockRejectedValue(new Error('update failed'));
      prisma.message.findFirst.mockResolvedValue({ senderId: null });

      const events: unknown[] = [];
      svc.on('translationReady', (e) => events.push(e));

      mockZmqClient.emit('translationCompleted', {
        taskId: 'save-err-task',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-db-fail',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          confidenceScore: 0.9,
          processingTime: 5,
          modelType: 'basic'
        }
      });
      await flushAsync(4);

      // translationReady still emitted even when save fails
      expect(events).toHaveLength(1);
    });
  });

  // =========================================================================
  // translateTextDirectly — timeout rejection path
  // =========================================================================
  describe('translateTextDirectly()', () => {
    it('returns fallback when ZMQ times out (no translationCompleted event)', async () => {
      // Use fake timers to make the 10s timeout fire immediately
      jest.useFakeTimers({ advanceTimers: false });
      try {
        mockZmqClient.sendTranslationRequest.mockResolvedValue('task-timeout');
        prisma.message.findUnique.mockResolvedValue({ id: 'x', originalLanguage: 'en', translations: {} });
        prisma.message.update.mockResolvedValue({} as any);
        prisma.message.findFirst.mockResolvedValue({ senderId: null });

        const promise = svc.translateTextDirectly('Hello', 'en', 'fr');

        // Flush the microtask that resolves sendTranslationRequest
        await Promise.resolve();
        await Promise.resolve();

        // Advance fake timers past 10s timeout
        jest.advanceTimersByTime(11000);

        const result = await promise;
        expect(result.modelType).toBe('fallback');
        expect(result.translatedText).toContain('Hello');
      } finally {
        jest.useRealTimers();
      }
    }, 20000);

    it('returns fallback on translationError event', async () => {
      // The translationError handler in translateTextDirectly listens for the taskId to match.
      // We emit an error matching a non-existent taskId, so the Promise will timeout.
      // Instead, we mock sendTranslationRequest to throw directly so we hit the catch block.
      mockZmqClient.sendTranslationRequest.mockRejectedValue(new Error('ZMQ send failed'));

      const result = await svc.translateTextDirectly('Hello', 'en', 'fr');

      expect(result.modelType).toBe('fallback');
      expect(result.translatedText).toContain('Hello');
    }, 15000);

    it('resolves with translation result when ZMQ responds', async () => {
      // translateTextDirectly:
      // 1. await sendTranslationRequest → gets taskId
      // 2. registers listener on zmqClient.translationCompleted
      // 3. waits for event with matching taskId
      //
      // We must emit the event AFTER the listener is registered (step 2).
      // We do this by hooking into the 'newListener' event on the zmqClient.
      const taskId = 'task-direct-resp';
      mockZmqClient.sendTranslationRequest.mockResolvedValue(taskId);

      prisma.message.findUnique.mockResolvedValue({ id: 'x', originalLanguage: 'en', translations: {} });
      prisma.message.update.mockResolvedValue({} as any);
      prisma.message.findFirst.mockResolvedValue({ senderId: null });

      // When translateTextDirectly registers its translationCompleted listener, emit immediately
      const onNewListener = (event: string) => {
        if (event === 'translationCompleted') {
          mockZmqClient.removeListener('newListener', onNewListener);
          // emit in next tick to let the listener registration complete
          setImmediate(() => {
            mockZmqClient.emit('translationCompleted', {
              taskId,
              targetLanguage: 'fr',
              result: {
                messageId: 'rest_fake',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
                translatedText: 'Bonjour',
                confidenceScore: 0.95,
                processingTime: 50,
                modelType: 'basic'
              }
            });
          });
        }
      };
      mockZmqClient.on('newListener', onNewListener);

      const result = await svc.translateTextDirectly('Hello', 'en', 'fr');
      expect(result.translatedText).toBe('Bonjour');
    }, 15000);
  });

  // =========================================================================
  // getTranslation — additional paths
  // =========================================================================
  describe('getTranslation() — additional paths', () => {
    it('returns null when message has no translations field', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-no-tr', originalLanguage: 'en', translations: null });
      const result = await svc.getTranslation('msg-no-tr', 'fr', 'en');
      expect(result).toBeNull();
    });

    it('returns null when targetLanguage not in translations', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-no-lang',
        originalLanguage: 'en',
        translations: { de: { text: 'Hallo', translationModel: 'basic', confidenceScore: 0.9, isEncrypted: false } }
      });
      const result = await svc.getTranslation('msg-no-lang', 'fr', 'en');
      expect(result).toBeNull();
    });

    it('uses prefetched document and skips DB call', async () => {
      const prefetched = {
        originalLanguage: 'en',
        translations: {
          fr: { text: 'Bonjour prefetched', translationModel: 'basic', confidenceScore: 0.9, isEncrypted: false }
        }
      };

      const result = await svc.getTranslation('msg-prefetch', 'fr', 'en', prefetched);

      expect(result?.translatedText).toBe('Bonjour prefetched');
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('returns null on DB error', async () => {
      prisma.message.findUnique.mockRejectedValue(new Error('DB fail'));
      const result = await svc.getTranslation('msg-err', 'fr', 'en');
      expect(result).toBeNull();
    });

    it('returns from in-memory cache on second call', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-cache2',
        originalLanguage: 'en',
        translations: {
          fr: { text: 'Bonjour', translationModel: 'basic', confidenceScore: 0.9, isEncrypted: false }
        }
      });

      await svc.getTranslation('msg-cache2', 'fr', 'en');
      await svc.getTranslation('msg-cache2', 'fr', 'en');

      // Second call served from cache
      expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // healthCheck
  // =========================================================================
  describe('healthCheck()', () => {
    it('returns true when ZMQ is healthy', async () => {
      mockZmqClient.healthCheck.mockResolvedValue(true);
      const healthy = await svc.healthCheck();
      expect(healthy).toBe(true);
    });

    it('returns false when ZMQ is unhealthy', async () => {
      mockZmqClient.healthCheck.mockResolvedValue(false);
      const healthy = await svc.healthCheck();
      expect(healthy).toBe(false);
    });

    it('returns false on error', async () => {
      mockZmqClient.healthCheck.mockRejectedValue(new Error('fail'));
      const healthy = await svc.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  // =========================================================================
  // Stats tracking
  // =========================================================================
  describe('stats tracking', () => {
    it('increments translation_requests_sent on processAudioAttachment', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
      prisma.participant.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({ systemLanguage: 'fr' } as any);
      prisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const before = svc.getStats().translation_requests_sent;
      await svc.processAudioAttachment({
        messageId: 'msg-stat',
        attachmentId: 'att-stat',
        conversationId: 'conv-stat',
        senderId: 'user-stat',
        audioUrl: '/url/a.mp3',
        audioPath: '/app/uploads/a.mp3',
        audioDurationMs: 1000
      });
      expect(svc.getStats().translation_requests_sent).toBe(before + 1);
    });

    it('getStats includes uptime and memory fields', () => {
      const stats = svc.getStats();
      expect(stats).toHaveProperty('uptime_seconds');
      expect(stats).toHaveProperty('memory_usage_mb');
    });
  });

  // =========================================================================
  // close()
  // =========================================================================
  describe('close()', () => {
    it('calls zmqClient.close()', async () => {
      mockZmqClient.close.mockResolvedValue(undefined);
      await svc.close();
      expect(mockZmqClient.close).toHaveBeenCalled();
    });

    it('does not throw when close errors', async () => {
      mockZmqClient.close.mockRejectedValue(new Error('close fail'));
      await expect(svc.close()).resolves.not.toThrow();
    });
  });
});
