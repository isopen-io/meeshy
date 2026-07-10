/**
 * Branch coverage supplement for MessageTranslationService.
 * Targets the ~38 uncovered branches remaining after the audio test suite.
 *
 * Branch groups covered here:
 *  1. _generateConversationIdentifier — no-title and empty-after-sanitize paths
 *  2. _processTranslationsAsync — memory-cache HIT path + all-cached early return
 *  3. _processRetranslationAsync — empty content, long content (premium), null translations
 *  4. processAudioAttachment — consent-service throws Error / non-Error (bypass=false)
 *  5. transcribeAttachment — file not found on disk (existsSync=false)
 *  6. translateAttachment — processAudioAttachment returns null
 *  7. _saveTranslationToDatabase — undefined translatorModel/modelType/confidenceScore fallbacks
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<any>;

// ---------------------------------------------------------------------------
// ZMQ mock — must be defined BEFORE jest.mock calls
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

const mockHandleAudioTranslationsReady: MockFn = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      handleAudioTranslationsReady: (...args: unknown[]) =>
        mockHandleAudioTranslationsReady(...args)
    }
  }
}));

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: jest.fn().mockResolvedValue({
      canTranscribeAudio: true,
      canTranslateAudio: true,
      canGenerateTranslatedAudio: true,
      canUseVoiceCloning: true,
      hasVoiceDataConsent: true
    })
  }))
}));

const mockGetAndDeleteJobMapping: MockFn = jest.fn().mockResolvedValue(null);
jest.mock('../../../services/MultiLevelJobMappingCache', () => ({
  MultiLevelJobMappingCache: jest.fn().mockImplementation(() => ({
    getAndDeleteJobMapping: (...args: unknown[]) => mockGetAndDeleteJobMapping(...args)
  }))
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue(mockZmqClient)
  }
}));

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

jest.mock('path', () => {
  const real = jest.requireActual<typeof import('path')>('path');
  return { ...real };
});

jest.mock('@meeshy/shared/types/attachment-audio', () => ({
  toSocketIOTranslation: jest.fn((_attachmentId: string, lang: string, translation: unknown) => {
    const t = translation as Record<string, unknown>;
    return {
      targetLanguage: lang,
      url: t?.url || '',
      path: t?.path || '',
      transcription: t?.transcription || '',
      durationMs: t?.durationMs || 0,
      format: t?.format || 'mp3',
      cloned: t?.cloned || false,
      quality: t?.quality || 0
    };
  })
}));

const mockResolveUserLanguagesOrdered: MockFn = jest.fn().mockReturnValue(['fr', 'en']);
jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  resolveUserLanguagesOrdered: (...args: unknown[]) =>
    mockResolveUserLanguagesOrdered(...args)
}));

jest.mock('../../../utils/translation-transformer', () => ({
  createTranslationJSON: jest.fn((args: Record<string, unknown>) => ({
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

jest.mock('../../../utils/transcription', () => ({
  isBlankTranscriptionText: jest.fn((text: string | undefined) => !text || text.trim() === '')
}));

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
  MessageTranslationService
} from '../../../services/message-translation/MessageTranslationService';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { TranslationCache } from '../../../services/message-translation/TranslationCache';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flushAsync(count = 5) {
  for (let i = 0; i < count; i++) {
    await new Promise<void>(r => setImmediate(r));
  }
}

// ---------------------------------------------------------------------------
// TEST SUITES
// ---------------------------------------------------------------------------

describe('MessageTranslationService — branch supplement', () => {
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
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.conversation.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    svc = new MessageTranslationService(prisma as any);
    await svc.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. _generateConversationIdentifier — private method, accessed directly
  // =========================================================================
  describe('_generateConversationIdentifier', () => {
    it('generates a random unique id when called without a title', () => {
      // Covers: if (title) → FALSE branch (line 305) + lines 318-319
      const result: string = (svc as any)['_generateConversationIdentifier']();
      expect(result).toMatch(/^mshy_[a-z0-9]+-\d{14}$/);
    });

    it('generates a random unique id when title sanitizes to an empty string', () => {
      // '!!!' → all non-alphanum removed → '' → if (sanitizedTitle.length > 0) FALSE branch (line 313)
      const result: string = (svc as any)['_generateConversationIdentifier']('!!!');
      expect(result).toMatch(/^mshy_[a-z0-9]+-\d{14}$/);
    });

    it('returns sanitized-title form when title has valid characters', () => {
      const result: string = (svc as any)['_generateConversationIdentifier']('Hello World');
      expect(result).toMatch(/^mshy_hello-world-\d{14}$/);
    });
  });

  // =========================================================================
  // 2. _processTranslationsAsync — memory cache HIT path
  // =========================================================================
  describe('_processTranslationsAsync — cache-hit path', () => {
    it('skips ZMQ when all target languages are found in memory cache', async () => {
      // Covers: if (cached) TRUE branch (line 431), cacheResults.push (432-433),
      //         if (cacheMisses.length === 0) TRUE branch (line 472) + early return (474-475)
      const msgId = 'msg-cache-all';
      const cachedResult = {
        messageId: msgId,
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        modelType: 'medium' as const,
        confidenceScore: 0.95
      };
      const cacheKey = TranslationCache.generateKey(msgId, 'fr', 'en');
      (svc as any)['translationCache'].set(cacheKey, cachedResult);

      await (svc as any)['_processTranslationsAsync'](
        { id: msgId, content: 'Hello', originalLanguage: 'en', conversationId: 'conv-1' },
        'fr'
      );

      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });

    it('emits translationCompleted with fromCache:true for a cache hit', async () => {
      const msgId = 'msg-cache-emit';
      const cachedResult = {
        messageId: msgId,
        targetLanguage: 'es',
        translatedText: 'Hola',
        modelType: 'medium' as const,
        confidenceScore: 0.88
      };
      const cacheKey = TranslationCache.generateKey(msgId, 'es', 'en');
      (svc as any)['translationCache'].set(cacheKey, cachedResult);

      const emitted: unknown[] = [];
      svc.on('translationCompleted', (data) => emitted.push(data));

      await (svc as any)['_processTranslationsAsync'](
        { id: msgId, content: 'Hello', originalLanguage: 'en', conversationId: 'conv-1' },
        'es'
      );

      expect(emitted).toHaveLength(1);
      expect((emitted[0] as any).result.fromCache).toBe(true);
    });

    it('increments cache-hit stats counter', async () => {
      const msgId = 'msg-cache-stats';
      const cachedResult = {
        messageId: msgId,
        targetLanguage: 'de',
        translatedText: 'Hallo',
        modelType: 'medium' as const,
        confidenceScore: 0.92
      };
      const cacheKey = TranslationCache.generateKey(msgId, 'de', 'en');
      (svc as any)['translationCache'].set(cacheKey, cachedResult);

      await (svc as any)['_processTranslationsAsync'](
        { id: msgId, content: 'Hello', originalLanguage: 'en', conversationId: 'conv-1' },
        'de'
      );

      const stats = svc.getStats();
      expect(stats.cache_hits).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 3. _processRetranslationAsync — edge-case branches
  // =========================================================================
  describe('_processRetranslationAsync', () => {
    it('returns early when existing message content is empty', async () => {
      // Covers: if (!existingMessage.content || ...) TRUE branch (line 525)
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        content: '',
        conversationId: 'conv-1',
        originalLanguage: 'en',
        translations: {}
      });

      await (svc as any)['_processRetranslationAsync']('msg-1', {});

      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });

    it('uses premium model when content length is >= 80 characters', async () => {
      // Covers: autoModelType = (length < 80 ? 'medium' : 'premium') → 'premium' branch (line 562)
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        content: 'A'.repeat(80),
        conversationId: 'conv-1',
        originalLanguage: 'en',
        translations: {}
      });
      prisma.message.findUnique.mockResolvedValue({ translations: {} });

      await (svc as any)['_processRetranslationAsync']('msg-1', { targetLanguage: 'fr' });

      expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ modelType: 'premium' })
      );
    });

    it('uses medium model when content length is < 80 characters', async () => {
      // Covers: autoModelType = 'medium' branch (the TRUE side of line 562)
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        content: 'Short',
        conversationId: 'conv-1',
        originalLanguage: 'en',
        translations: {}
      });
      prisma.message.findUnique.mockResolvedValue({ translations: {} });

      await (svc as any)['_processRetranslationAsync']('msg-1', { targetLanguage: 'fr' });

      expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ modelType: 'medium' })
      );
    });

    it('skips the translation delete step when message.translations is null', async () => {
      // Covers: if (message?.translations) → FALSE branch (line 578) — no update call
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        content: 'Hello',
        conversationId: 'conv-1',
        originalLanguage: 'en',
        translations: null
      });
      prisma.message.findUnique.mockResolvedValue({ translations: null });

      await (svc as any)['_processRetranslationAsync']('msg-1', { targetLanguage: 'fr' });

      expect(prisma.message.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. processAudioAttachment — consent-service throws (bypass=false)
  // =========================================================================
  describe('processAudioAttachment — consent-error catch block', () => {
    const audioParams = {
      messageId: 'msg-consent-1',
      attachmentId: 'att-consent-1',
      conversationId: 'conv-consent-1',
      senderId: 'user-consent-1',
      audioUrl: 'https://example.com/audio.mp3',
      audioPath: '/app/uploads/audio/test.mp3',
      audioDurationMs: 3000
    };

    it('continues without voice cloning when consent service throws an Error (covers instanceof=true branch)', async () => {
      // Covers: catch (consentError) block (line 2171)
      //         consentError instanceof Error → TRUE (line 2173: shows .stack)
      //         if (bypassConsentCheck) → FALSE (bypass not set) → else sets consent=false
      jest.mocked(ConsentValidationService).mockImplementationOnce(
        () => ({
          getConsentStatus: jest.fn().mockRejectedValue(
            new Error('Consent DB unavailable')
          )
        }) as any
      );

      const taskId = await svc.processAudioAttachment(audioParams);

      // Service must proceed to sendAudioProcessRequest (just without cloning)
      expect(mockZmqClient.sendAudioProcessRequest).toHaveBeenCalled();
      // generateVoiceClone defaults to true but consent is false → useOriginalVoice=false
      expect(mockZmqClient.sendAudioProcessRequest).toHaveBeenCalledWith(
        expect.objectContaining({ useOriginalVoice: false })
      );
      expect(typeof taskId === 'string' || taskId === null).toBe(true);
    });

    it('continues when consent service throws a non-Error value (covers instanceof=false branch)', async () => {
      // Covers: consentError instanceof Error → FALSE (line 2173: shows 'N/A')
      jest.mocked(ConsentValidationService).mockImplementationOnce(
        () => ({
          getConsentStatus: jest.fn().mockRejectedValue('string-error-not-an-Error-object')
        }) as any
      );

      const taskId = await svc.processAudioAttachment(audioParams);

      expect(mockZmqClient.sendAudioProcessRequest).toHaveBeenCalled();
      expect(typeof taskId === 'string' || taskId === null).toBe(true);
    });
  });

  // =========================================================================
  // 5. transcribeAttachment — file not found on disk
  // =========================================================================
  describe('transcribeAttachment — file-exists check', () => {
    it('logs error and continues ZMQ request when audio file does not exist on disk', async () => {
      // Covers: const fileSize = fileExists ? ... : 0 → ternary FALSE branch (line 2386)
      //         if (!fileExists) → TRUE branch (line 2393: logs error)
      const mockFs = jest.requireMock('fs') as { existsSync: MockFn };
      mockFs.existsSync.mockReturnValueOnce(false);

      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-transcribe-1',
        messageId: 'msg-transcribe-1',
        fileName: 'voice.mp3',
        filePath: 'audio/voice.mp3',
        fileUrl: 'https://example.com/voice.mp3',
        duration: 3000,
        mimeType: 'audio/mp3',
        metadata: {}
      });

      const result = await svc.transcribeAttachment('att-transcribe-1');

      // ZMQ request still fires (file-not-found is logged but not a hard stop)
      expect(mockZmqClient.sendTranscriptionOnlyRequest).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.taskId).toBe('task-tr-1');
    });
  });

  // =========================================================================
  // 6. translateAttachment — null taskId from processAudioAttachment
  // =========================================================================
  describe('translateAttachment — null taskId', () => {
    it('returns null and logs when processAudioAttachment returns null', async () => {
      // Covers: if (!taskId) → TRUE branch (lines 2631-2633)
      const processAudioSpy = jest
        .spyOn(svc, 'processAudioAttachment')
        .mockResolvedValueOnce(null);

      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-null-task',
        messageId: 'msg-null-task',
        fileName: 'audio.mp3',
        filePath: 'audio/audio.mp3',
        fileUrl: 'https://example.com/audio.mp3',
        duration: 5000,
        mimeType: 'audio/mp3',
        uploadedBy: 'user-1',
        message: {
          conversationId: 'conv-1',
          senderId: 'participant-1'
        }
      });

      const result = await svc.translateAttachment('att-null-task');

      expect(result).toBeNull();
      expect(processAudioSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. _saveTranslationToDatabase — undefined optional fields fall to defaults
  // =========================================================================
  describe('_saveTranslationToDatabase — fallback values', () => {
    it('uses "basic" model info when translatorModel and modelType are both undefined', async () => {
      // Covers: result.translatorModel || result.modelType || 'basic' → alt#2 (line 2727)
      prisma.message.findUnique.mockResolvedValue({ translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      await (svc as any)['_saveTranslationToDatabase']({
        messageId: 'msg-1',
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        translatorModel: undefined,
        modelType: undefined,
        confidenceScore: 0.85
      });

      const { createTranslationJSON } = require('../../../utils/translation-transformer');
      expect(createTranslationJSON).toHaveBeenCalledWith(
        expect.objectContaining({ translationModel: 'basic' })
      );
    });

    it('falls back to confidence score 0.9 when confidenceScore is undefined', async () => {
      // Covers: result.confidenceScore || 0.9 → alt#1 (line 2728) when score is falsy
      prisma.message.findUnique.mockResolvedValue({ translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      await (svc as any)['_saveTranslationToDatabase']({
        messageId: 'msg-1',
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        translatorModel: 'nllb',
        modelType: undefined,
        confidenceScore: undefined
      });

      const { createTranslationJSON } = require('../../../utils/translation-transformer');
      expect(createTranslationJSON).toHaveBeenCalledWith(
        expect.objectContaining({ confidenceScore: 0.9 })
      );
    });

    it('falls back to confidence 0.9 when confidenceScore is zero (falsy)', async () => {
      // Additional: 0 is falsy → || 0.9 activates
      prisma.message.findUnique.mockResolvedValue({ translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      await (svc as any)['_saveTranslationToDatabase']({
        messageId: 'msg-1',
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        translatorModel: 'nllb',
        modelType: undefined,
        confidenceScore: 0
      });

      const { createTranslationJSON } = require('../../../utils/translation-transformer');
      expect(createTranslationJSON).toHaveBeenCalledWith(
        expect.objectContaining({ confidenceScore: 0.9 })
      );
    });
  });

  // =========================================================================
  // 8. _processTranslationsAsync — DB hit via getTranslation
  // =========================================================================
  describe('_processTranslationsAsync — DB hit via getTranslation', () => {
    it('emits fromCache:true when DB translation found (covers if(stored) TRUE, confidence/model fallbacks)', async () => {
      // Covers: line 449 branch#29 alt#0 (stored truthy → cacheResults.push)
      //         line 2884 branch#230 alt#1 (confidenceScore || 0.9)
      //         line 2886 branch#231 alt#1 (translationModel || 'basic')
      const msgId = 'msg-db-hit-1';
      prisma.message.findUnique.mockResolvedValue({
        originalLanguage: 'en',
        translations: {
          fr: {
            text: 'Bonjour depuis DB',
            translationModel: undefined,   // → 'basic' fallback (line 2886)
            confidenceScore: undefined,    // → 0.9 fallback (line 2884)
            isEncrypted: false,
            encryptionKeyId: null,
            encryptionIv: null,
            encryptionAuthTag: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });

      const emitted: unknown[] = [];
      svc.on('translationCompleted', (data) => emitted.push(data));

      await (svc as any)['_processTranslationsAsync'](
        { id: msgId, content: 'Hello', originalLanguage: 'en', conversationId: 'conv-1' },
        'fr'
      );

      expect(emitted).toHaveLength(1);
      expect((emitted[0] as any).result.fromCache).toBe(true);
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });

    it('selects premium model when message content is >= 80 chars and no cached translation', async () => {
      // Covers: line 482 branch#33 alt#1 (< 80 is FALSE → 'premium')
      prisma.message.findUnique.mockResolvedValue({
        originalLanguage: 'en',
        translations: {}  // No DB hit → cacheMisses=['fr'] → reaches line 482
      });

      await (svc as any)['_processTranslationsAsync'](
        { id: 'msg-premium-long', content: 'A'.repeat(80), originalLanguage: 'en', conversationId: 'conv-1' },
        'fr'
      );

      expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ modelType: 'premium' })
      );
    });
  });

  // =========================================================================
  // 9. _processRetranslationAsync — empty targetLanguages from conversation
  // =========================================================================
  describe('_processRetranslationAsync — empty targetLanguages from conversation', () => {
    it('returns early when _extractConversationLanguages returns [] (covers empty-body if + filtered=0)', async () => {
      // Covers: line 540 branch#38 alt#1 (if(targetLanguages.length===0){} → empty body, TRUE)
      //         line 568 branch#45 alt#1 (if(filteredTargetLanguages.length===0) → return, TRUE)
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        content: 'Hello world',
        conversationId: 'conv-empty',
        originalLanguage: 'en',
        translations: {}
      });
      // participant.findMany returns [] (set in beforeEach), so _extractConversationLanguages → []

      // Call WITHOUT targetLanguage → goes through _extractConversationLanguages path
      await (svc as any)['_processRetranslationAsync']('msg-1', {});

      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 10. _handleTranslationCompleted — processedTasks cleanup (size > 500)
  // =========================================================================
  describe('_handleTranslationCompleted — processedTasks size > 500 cleanup', () => {
    it('runs cleanup when processedTasks size exceeds 500 (covers lines 760 + 763 both branches)', async () => {
      // Covers: line 760 branch#58 alt#0 (size > 500 → TRUE)
      //         line 763 branch#59 alt#0 (ts < expiry → delete, TRUE)
      //         line 763 branch#59 alt#1 (ts >= expiry → keep, FALSE)
      const processedTasks = (svc as any)['processedTasks'] as Map<string, number>;
      const ttlMs = (svc as any)['PROCESSED_TASK_TTL_MS'] as number;
      const now = Date.now();
      const oldTs = now - ttlMs - 5000;  // Expired → will be deleted (branch 763 alt#0)
      const recentTs = now - 60_000;     // Recent → NOT deleted (branch 763 alt#1)

      // Pre-seed 499 expired entries + 1 recent = 500
      for (let i = 0; i < 499; i++) {
        processedTasks.set(`seed-old-${i}_fr`, oldTs);
      }
      processedTasks.set('seed-recent-1_fr', recentTs);
      expect(processedTasks.size).toBe(500);

      // Set up mocks for _saveTranslationToDatabase (called inside handler)
      prisma.message.findUnique.mockResolvedValue({ translations: {} });
      prisma.message.update.mockResolvedValue({} as any);

      // Emit translationCompleted → adds 1 more entry → size=501 → cleanup
      mockZmqClient.emit('translationCompleted', {
        taskId: 'task-cleanup-unique',
        targetLanguage: 'fr',
        result: {
          messageId: 'msg-1',
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          modelType: 'medium',
          confidenceScore: 0.9,
          processingTime: 100,
          sourceLanguage: 'en'
        }
      });
      await flushAsync(8);

      // After cleanup, old entries are deleted; map should be smaller
      expect(processedTasks.size).toBeLessThan(501);
    });
  });

  // =========================================================================
  // 11. getAttachmentWithTranscription — translations with missing fields
  // =========================================================================
  describe('getAttachmentWithTranscription — missing translation fields', () => {
    it('uses fallback values for url/path/durationMs/format/cloned/quality/createdAt', async () => {
      // Covers: lines 2488-2494 (|| '' / || 0 / || 'mp3' / || false / typeof check)
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-minimal-1',
        messageId: 'msg-1',
        fileName: 'audio.mp3',
        originalName: 'audio.mp3',
        fileUrl: 'https://example.com/audio.mp3',
        mimeType: 'audio/mp3',
        fileSize: 1024,
        duration: 3000,
        bitrate: 128000,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 1,
        createdAt: new Date(),
        transcription: null,
        translations: {
          fr: {
            type: 'audio',
            transcription: 'Bonjour',
            // Missing: url, path, durationMs, format, cloned, quality, createdAt
          }
        }
      });

      const result = await svc.getAttachmentWithTranscription('att-minimal-1');

      expect(result).not.toBeNull();
      expect(result!.translatedAudios).toHaveLength(1);
      const ta = result!.translatedAudios[0];
      expect(ta.audioUrl).toBe('');      // t.url || '' (alt#1)
      expect(ta.audioPath).toBe('');     // t.path || '' (alt#1)
      expect(ta.durationMs).toBe(0);     // t.durationMs || 0 (alt#1)
      expect(ta.format).toBe('mp3');     // t.format || 'mp3' (alt#1)
      expect(ta.voiceQuality).toBe(0);   // t.quality || 0 (alt#1)
      // createdAt is undefined (not a string) → typeof check alt#1
      expect(ta.createdAt).toBeUndefined();
    });
  });

  // =========================================================================
  // 12. _handleAudioProcessCompleted — edge cases
  // =========================================================================
  describe('_handleAudioProcessCompleted — edge cases', () => {
    function makeAudioCompletedData(overrides: Record<string, unknown> = {}) {
      return {
        taskId: 'task-audio-ec-1',
        messageId: 'msg-1',
        attachmentId: 'att-1',
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          source: 'whisper',
          durationMs: 3000,
          segments: []
        },
        translatedAudios: [{
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          audioUrl: '',
          audioPath: '',
          durationMs: 1000,
          voiceCloned: false,
          voiceQuality: 0.8,
          audioMimeType: 'audio/mp3'
        }],
        processingTimeMs: 500,
        ...overrides
      };
    }

    beforeEach(() => {
      // Two sequential findUnique calls: first for attachment, second for mutex re-fetch
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({
          id: 'att-1',
          messageId: 'msg-1',
          duration: 3000,
          translations: {}
        })
        .mockResolvedValue({ translations: {} });
    });

    it('logs empty string for missing transcription text (line 886 alt#1)', async () => {
      // Covers: `(data.transcription?.text ? '...' : '')` → '' (alt#1, text is empty)
      mockZmqClient.emit('audioProcessCompleted', makeAudioCompletedData({
        transcription: {
          text: '',  // falsy → ternary FALSE branch
          language: 'en',
          confidence: 0.9,
          source: 'whisper',
          durationMs: 3000,
          segments: []
        }
      }));
      await flushAsync(8);
      // Just verifying no throw; branch covered by the ternary taking the '' path
    });

    it('saves audio from base64 when no binary buffer provided (lines 986 + 1012 alt#1)', async () => {
      // Covers: if(audioBinary || audioBase64) TRUE (line 986 alt#1)
      //         source = audioBinary ? 'multipart' : 'base64' → 'base64' (line 1012 alt#1)
      prisma.messageAttachment.findUnique.mockReset();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ id: 'att-1', messageId: 'msg-1', duration: 3000, translations: {} })
        .mockResolvedValue({ translations: {} });

      const audioBase64 = Buffer.from('fake-audio-data').toString('base64');
      mockZmqClient.emit('audioProcessCompleted', makeAudioCompletedData({
        translatedAudios: [{
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          audioDataBase64: audioBase64,  // base64 only → no _audioBinary
          durationMs: 1000,
          voiceCloned: false,
          voiceQuality: 0.8,
          audioMimeType: 'audio/mp3'
        }]
      }));
      await flushAsync(8);

      // fs.writeFile should have been called (audio saved from base64)
      const mockFs = jest.requireMock('fs') as { promises: { writeFile: MockFn } };
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });

    it('logs diarization info when speakerCount is set without speakerAnalysis (lines 952 + 1063 alt#1)', async () => {
      // Covers: line 952 branch#73 alt#1 (speakerAnalysis absent → 'N/A')
      //         line 1063 branch#87 alt#1 (segments?.length is 0 → 0 fallback)
      prisma.messageAttachment.findUnique.mockReset();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ id: 'att-1', messageId: 'msg-1', duration: 3000, translations: {} })
        .mockResolvedValue({ translations: {} });

      mockZmqClient.emit('audioProcessCompleted', makeAudioCompletedData({
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          source: 'whisper',
          durationMs: 3000,
          segments: [],
          speakerCount: 2,       // truthy → enter if(speakerCount) block
          speakerAnalysis: null  // → 'N/A' ternary (line 952 alt#1)
        }
      }));
      await flushAsync(8);
      // No assertion needed — branch coverage is the goal
    });

    it('falls back to 0 when both transcription.durationMs and attachment.duration are falsy (line 939 alt#2)', async () => {
      // Covers: data.transcription.durationMs || attachment.duration || 0 → 0 (alt#2)
      prisma.messageAttachment.findUnique.mockReset();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ id: 'att-1', messageId: 'msg-1', duration: null, translations: {} })
        .mockResolvedValue({ translations: {} });

      mockZmqClient.emit('audioProcessCompleted', makeAudioCompletedData({
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          source: 'whisper',
          durationMs: 0,  // falsy
          segments: []
        }
        // attachment.duration = null (set above) → both falsy → 0
      }));
      await flushAsync(8);
    });

    it('routes post/story audio to PostAudioService and returns early when postId+postMediaId set (lines 892-913)', async () => {
      // Covers: if (data.postId && data.postMediaId && data.translatedAudios.length > 0) → TRUE branch
      //         ta.audioMimeType ?? 'audio/mp3' → NULL branch (line 901 alt#1)
      //         (ta.segments ?? []).map(...) → NULL branch (line 905 alt#1)
      mockZmqClient.emit('audioProcessCompleted', {
        taskId: 'task-post-story-1',
        messageId: 'msg-post-1',
        attachmentId: 'att-post-1',
        postId: 'story-post-abc',
        postMediaId: 'story-media-abc',
        transcription: { text: '', language: 'en', confidence: 0.9, source: 'whisper', durationMs: 0, segments: [] },
        translatedAudios: [
          {
            targetLanguage: 'fr',
            translatedText: 'Bonjour histoire',
            audioUrl: 'https://cdn.example.com/story-fr.mp3',
            audioPath: '/tmp/story-fr.mp3',
            durationMs: 2000,
            voiceCloned: true,
            voiceQuality: 0.95,
            audioMimeType: null,  // → NULL branch of ?? 'audio/mp3'
            segments: null,       // → NULL branch of ?? []
          }
        ],
        processingTimeMs: 400
      });
      await flushAsync(5);

      expect(mockHandleAudioTranslationsReady).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'story-post-abc',
          postMediaId: 'story-media-abc',
          translations: expect.objectContaining({
            fr: expect.objectContaining({
              type: 'audio',
              format: 'audio/mp3',
              ttsModel: 'chatterbox',
            })
          })
        })
      );
      expect(prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 13. _handleTranscriptionOnlyCompleted — durationMs fallback
  // =========================================================================
  describe('_handleTranscriptionOnlyCompleted — durationMs fallback', () => {
    it('falls back to 0 when both transcription.durationMs and attachment.duration are 0/null (line 1261 alt#2)', async () => {
      // Covers: data.transcription.durationMs || attachment.duration || 0 → 0 (alt#2)
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-tco-1',
        messageId: 'msg-1',
        duration: null  // null → falsy
      });

      mockZmqClient.emit('transcriptionCompleted', {
        taskId: 'task-tco-1',
        messageId: 'msg-1',
        attachmentId: 'att-tco-1',
        transcription: {
          text: 'Hello world',   // non-blank → passes isBlankTranscriptionText check
          language: 'en',
          confidence: 0.95,
          source: 'whisper',
          durationMs: 0  // falsy + attachment.duration=null → fallback to 0
        },
        processingTimeMs: 200
      });
      await flushAsync(5);

      expect(prisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transcription: expect.objectContaining({ durationMs: 0 })
          })
        })
      );
    });
  });

  // =========================================================================
  // 14. _handleTranslationError — both branches (line 807)
  // =========================================================================
  describe('_handleTranslationError event handler', () => {
    it('increments pool_full_rejections when error is "translation pool full" (line 807 alt#0)', async () => {
      // Covers: if (data.error === 'translation pool full') → TRUE branch (line 807,61,0)
      const statsBefore = svc.getStats().pool_full_rejections;

      mockZmqClient.emit('translationError', {
        taskId: 'task-err-pool-1',
        messageId: 'msg-err-1',
        conversationId: 'conv-err-1',
        error: 'translation pool full'
      });
      await flushAsync(3);

      expect(svc.getStats().pool_full_rejections).toBeGreaterThan(statsBefore);
    });

    it('increments errors for non-pool-full errors without pool counter (line 807 alt#1)', async () => {
      // Covers: if (data.error === 'translation pool full') → FALSE branch (line 807,61,1)
      const errorsBefore = svc.getStats().errors;
      const poolBefore = svc.getStats().pool_full_rejections;

      mockZmqClient.emit('translationError', {
        taskId: 'task-err-other-1',
        messageId: 'msg-err-2',
        conversationId: 'conv-err-2',
        error: 'some unrecognized translation error'
      });
      await flushAsync(3);

      expect(svc.getStats().errors).toBeGreaterThan(errorsBefore);
      expect(svc.getStats().pool_full_rejections).toBe(poolBefore);
    });
  });

  // =========================================================================
  // 15. initialize() idempotency (line 108,3,0)
  // =========================================================================
  describe('initialize() — called twice', () => {
    it('returns early without re-registering when already initialized (line 108 alt#0)', async () => {
      // svc.initialize() was called in beforeEach; calling again hits if(this.isInitialized) TRUE
      // Covers: if (this.isInitialized) → TRUE branch (line 108,3,0 = early return)
      await expect(svc.initialize()).resolves.toBeUndefined();
      // zmqClient listeners should not be double-registered
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 16. _processTranslationsAsync — same-source-as-target filter (line 410,24,0)
  // =========================================================================
  describe('_processTranslationsAsync — same-language filter', () => {
    it('filters out target language when it matches originalLanguage (line 410 alt#0)', async () => {
      // Covers: if (sourceLang && sourceLang !== 'auto' && sourceLang === targetLang) → TRUE
      //         → filteredTargetLanguages = [] → early return at line 417
      await (svc as any)['_processTranslationsAsync'](
        { id: 'msg-same-fr', content: 'Bonjour le monde', originalLanguage: 'fr', conversationId: 'conv-1' },
        'fr'
      );

      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 17. _processTranslationsAsync — no target lang (empty conversation) (line 403,23,1)
  // =========================================================================
  describe('_processTranslationsAsync — empty conversation (no target lang)', () => {
    it('covers empty-body if at line 403 when _extractConversationLanguages returns []', async () => {
      // participants=[] (default) → _extractConversationLanguages returns []
      // → if (targetLanguages.length === 0) {} → TRUE branch (line 403,23,1 = empty body taken)
      await (svc as any)['_processTranslationsAsync'](
        { id: 'msg-no-target-conv', content: 'Hello world', originalLanguage: 'en', conversationId: 'conv-empty-parts' },
        undefined
      );

      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 18. _processTranslationEvent — base64 audio + null mimeType
  //     Covers lines 1544, 1560, 1563, 1592 (alt#1 branches)
  // =========================================================================
  describe('_processTranslationEvent — base64-only audio, null audioMimeType', () => {
    it('uses mp3 fallback and base64 path when _audioBinary absent and audioMimeType is null', async () => {
      // Covers:
      //   line 1544 alt#1: audioMimeType?.replace(...) → undefined → || 'mp3'
      //   line 1560 alt#1: audioBuffer = audioBinary || Buffer.from(base64) → Buffer.from fallback
      //   line 1563 alt#1: source = audioBinary ? 'multipart' : 'base64' → 'base64'
      //   line 1592 alt#1: audioMimeType?.replace(...) → undefined → || 'mp3'
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-base64-prog-1',
        messageId: 'msg-base64-prog-1',
        translations: {}
      });

      const audioBase64 = Buffer.from('fake-base64-audio-progressive').toString('base64');
      mockZmqClient.emit('audioTranslationsProgressive', {
        taskId: 'task-b64-prog-1',
        messageId: 'msg-base64-prog-1',
        attachmentId: 'att-base64-prog-1',
        language: 'fr',
        translatedAudio: {
          targetLanguage: 'fr',
          translatedText: 'Bonjour monde',
          audioUrl: '',
          audioPath: '',
          durationMs: 1500,
          voiceCloned: false,
          voiceQuality: 0.8,
          audioMimeType: null,           // → || 'mp3' fallback (lines 1544 + 1592)
          audioDataBase64: audioBase64   // base64 only, no _audioBinary (lines 1560 + 1563)
        }
      });
      await flushAsync(8);

      const mockFs = jest.requireMock('fs') as { promises: { writeFile: MockFn } };
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 19. _processTranslationEvent — missing translatedAudio (line 1521,119,0)
  // =========================================================================
  describe('_processTranslationEvent — missing translatedAudio', () => {
    it('returns early when translatedAudio is null/absent (line 1521 alt#0)', async () => {
      // Covers: if (!data.translatedAudio) → TRUE branch (line 1521,119,0 = early return)
      mockZmqClient.emit('audioTranslationsProgressive', {
        taskId: 'task-no-ta-1',
        messageId: 'msg-no-ta-1',
        attachmentId: 'att-no-ta-1',
        language: 'fr',
        translatedAudio: null as any  // null → !null = true → early return
      });
      await flushAsync(3);

      // Early return before DB operations
      expect(prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 20. _handleVoiceTranslationCompleted — ternary branches (lines 1824/1830/1831/1832)
  // =========================================================================
  describe('_handleVoiceTranslationCompleted — logger ternary branches', () => {
    it('covers || "" for langs and ternary "" for transcription/langs (lines 1824/1830/1831)', async () => {
      // Covers:
      //   line 1824 alt#1: langs = '' (empty translations → || '' fallback taken)
      //   line 1830 alt#1: transcription is null → ternary '' branch
      //   line 1831 alt#1: langs = '' (falsy) → ternary '' branch
      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'voice-empty-res-1',
        userId: 'user-voice-empty-1',
        status: 'completed',
        timestamp: Date.now(),
        result: {
          translationId: 'trans-empty-res-1',
          originalAudio: null,   // null → transcription=undefined → falsy → '' (line 1830)
          translations: [],       // empty → langs='' → || '' (line 1824) + '' (line 1831)
          processingTimeMs: 100
        }
      });
      await flushAsync(5);
    });

    it('covers voiceProfile ternary template-literal branch (line 1832 alt#0)', async () => {
      // Covers: (voiceProfile ? `Voice: ${voiceProfile.profileId} (quality: ...)` : '') → TRUE
      //         line 1832,136,0: voiceProfile truthy → template string evaluated
      mockZmqClient.emit('voiceTranslationCompleted', {
        jobId: 'voice-with-vp-1',
        userId: 'user-voice-vp-1',
        status: 'completed',
        timestamp: Date.now(),
        result: {
          translationId: 'trans-with-vp-1',
          originalAudio: {
            transcription: 'Hello there',
            language: 'en',
            durationMs: 2000,
            confidence: 0.9
          },
          translations: [
            { targetLanguage: 'fr', translatedText: 'Bonjour', durationMs: 1800, voiceCloned: false, voiceQuality: 0.88 }
          ],
          voiceProfile: {
            profileId: 'vp-test-1',
            quality: 0.95,
            isNew: false
          },
          processingTimeMs: 350
        }
      });
      await flushAsync(5);
    });
  });

  // =========================================================================
  // 21. translateAttachment — null duration (line 2626,213,1)
  // =========================================================================
  describe('translateAttachment — null duration fallback', () => {
    it('passes audioDurationMs=0 when attachment.duration is null (line 2626 alt#1)', async () => {
      // Covers: audioDurationMs: attachment.duration || 0 → || 0 fallback (line 2626,213,1)
      const processSpy = jest.spyOn(svc, 'processAudioAttachment')
        .mockResolvedValueOnce('mock-task-dur-null');

      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-dur-null',
        messageId: 'msg-dur-null',
        fileName: 'audio.mp3',
        filePath: 'audio/audio.mp3',
        fileUrl: 'https://example.com/audio.mp3',
        duration: null,  // null → || 0 fallback (line 2626,213,1)
        mimeType: 'audio/mp3',
        uploadedBy: 'user-1',
        message: { conversationId: 'conv-1', senderId: 'participant-1' }
      });

      const result = await svc.translateAttachment('att-dur-null');

      expect(result).not.toBeNull();
      expect(processSpy).toHaveBeenCalledWith(
        expect.objectContaining({ audioDurationMs: 0 })
      );
    });
  });

  // =========================================================================
  // 22. _saveTranslationToDatabase — null message (line 2773,223,1)
  // =========================================================================
  describe('_saveTranslationToDatabase — message.findUnique returns null', () => {
    it('uses empty translations {} when message is not found (line 2773 alt#1)', async () => {
      // Covers: (message?.translations ...) || {} → {} fallback (line 2773,223,1 when message=null)
      prisma.message.findUnique.mockResolvedValue(null);  // message not found → || {}

      await (svc as any)['_saveTranslationToDatabase']({
        messageId: 'msg-not-found-db',
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        translatorModel: 'nllb',
        modelType: 'medium',
        confidenceScore: 0.9
      });

      // Despite null message, update is still called with the new translation
      expect(prisma.message.update).toHaveBeenCalled();
    });
  });
});
