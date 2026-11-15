/**
 * #13100 — septième audit adversarial, témoin (rouge avant son correctif) : une RETRADUCTION dont l'écriture échoue
 * (verrou injoignable, a4ea9e2586) retire `url` ET `path` de l'entrée qui
 * désignait la piste précédente. Le fichier de cette piste reste sur le disque
 * (et sa ligne de scellement), mais plus aucune ligne ne le cite : la
 * suppression de la pièce (`unlinkDerivedFiles` lit `translations`) ne l'efface
 * plus jamais — une vue unique ou un éphémère échu laisse sa piste derrière lui.
 * Attendu : soit l'ancienne entrée garde sa référence, soit le fichier part.
 */
jest.mock('../../../services/attachments/atRest/translatedTrackWrite', () => ({
  writeTranslatedTrack: jest.fn(async () => { const e = new Error('seal lock unavailable'); e.name = 'SealLockUnavailableError'; throw e; }),
}));
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
    mockResolveUserLanguagesOrdered(...args),
  generateConversationIdentifier: (title?: string) =>
    `mshy_${(title ?? 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'}-20260101000000`
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
    update: jest.fn() as MockFn,
    updateMany: jest.fn() as MockFn
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
  it('une retraduction qui échoue ne laisse pas l’ancienne piste orpheline', async () => {
    const fsMock = require('fs');
    const oldTrack = { type: 'audio', transcription: 'Ancien', url: '/api/v1/attachments/file/translated/att-1_fr.mp3', path: '/app/uploads/translated/att-1_fr.mp3', durationMs: 900, format: 'mp3' };
    prisma.messageAttachment.findUnique.mockResolvedValue({ id: 'att-1', messageId: 'msg-1', duration: 2000, translations: { fr: oldTrack } } as any);
    mockZmqClient.emit('audioProcessCompleted', makeAudioProcessCompletedData({
      translatedAudios: [makeTranslatedAudio({ targetLanguage: 'fr', _audioBinary: Buffer.from('piste neuve') })],
    }));
    await flushAsync(8);
    const written = prisma.messageAttachment.update.mock.calls.map((call: any[]) => call[0]?.data?.translations?.fr).filter(Boolean);
    expect(written.length).toBeGreaterThan(0);
    const stillReferenced = written.every((entry: any) => entry.path === oldTrack.path || entry.url === oldTrack.url);
    const erased = fsMock.promises.unlink.mock.calls.some((call: any[]) => String(call[0]).endsWith('att-1_fr.mp3'));
    expect({ stillReferenced, erased }).not.toEqual({ stillReferenced: false, erased: false });
  });
});
