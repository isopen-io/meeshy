/**
 * Additional AudioTranslateService tests — covers gaps not reached by the
 * primary suite:
 *  - transcribeOnly: timeout (30 s), saveToDatabase path (_saveTranscription)
 *  - transcribeAttachment: success with filePath, error catch
 *  - translateSync: saveToDatabase path (_saveTranslationResult)
 *  - translateAttachment: success with filePath, existing-translation merge, error catch
 *  - submitFeedback, getHistory, getUserStats, getSystemMetrics, getSupportedLanguages
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  AudioTranslateService,
  AudioTranslateError,
  resetAudioTranslateService,
} from '../../../services/AudioTranslateService';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Shared mocks ──────────────────────────────────────────────────────────────

class MockZmqClient extends EventEmitter {
  sendVoiceAPIRequest = jest.fn() as jest.Mock<any>;
  sendTranscriptionOnlyRequest = jest.fn() as jest.Mock<any>;
}

const buildMockPrisma = () => ({
  messageAttachment: {
    findUnique: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
  },
  userVoiceModel: {
    findUnique: jest.fn() as jest.Mock<any>,
    upsert: jest.fn() as jest.Mock<any>,
  },
});

// Helper: emit voiceAPISuccess on the next tick
function emitSuccess(zmqClient: MockZmqClient, taskId: string, result: any) {
  zmqClient.emit('voiceAPISuccess', { taskId, result, processingTimeMs: 5 });
}

// ── transcribeOnly — timeout + saveToDatabase ─────────────────────────────────

describe('AudioTranslateService.transcribeOnly — timeout + saveToDatabase', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('rejects with TIMEOUT after 30 s without a response', async () => {
    const taskId = 'tr-timeout-task';
    zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

    const promise = service.transcribeOnly('user-123', { audioPath: '/tmp/audio.mp3' });
    // Let the async Promise body run past the sendTranscriptionOnlyRequest await
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(30001);

    await expect(promise).rejects.toMatchObject({
      name: 'AudioTranslateError',
      code: 'TIMEOUT',
    });
    expect(service.getPendingRequestsCount()).toBe(0);
  });

  it('calls _saveTranscription (prisma.update) when saveToDatabase + attachmentId provided', async () => {
    jest.useRealTimers(); // not needed for this test
    const taskId = 'tr-save-task';
    zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);
    mockPrisma.messageAttachment.update.mockResolvedValue({});

    const promise = service.transcribeOnly('user-123', {
      audioPath: '/tmp/audio.mp3',
      attachmentId: 'att-save-123',
      saveToDatabase: true,
    });

    await Promise.resolve();
    await Promise.resolve();

    zmqClient.emit('transcriptionCompleted', {
      taskId,
      messageId: 'msg-1',
      attachmentId: 'att-save-123',
      transcription: {
        text: 'saved text',
        language: 'en',
        confidence: 0.9,
        durationMs: 2000,
        source: 'whisper',
      },
      processingTimeMs: 100,
    });

    const result = await promise;
    expect(result.text).toBe('saved text');
    expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'att-save-123' } }),
    );
  });

  it('does NOT call prisma.update when saveToDatabase is false', async () => {
    jest.useRealTimers();
    const taskId = 'tr-nosave-task';
    zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

    const promise = service.transcribeOnly('user-123', {
      audioPath: '/tmp/audio.mp3',
      attachmentId: 'att-nosave',
      saveToDatabase: false,
    });

    await Promise.resolve();
    await Promise.resolve();

    zmqClient.emit('transcriptionCompleted', {
      taskId,
      messageId: 'msg-1',
      attachmentId: 'att-nosave',
      transcription: {
        text: 'no save',
        language: 'en',
        confidence: 0.85,
        durationMs: 1500,
        source: 'whisper',
      },
      processingTimeMs: 50,
    });

    await promise;
    expect(mockPrisma.messageAttachment.update).not.toHaveBeenCalled();
  });
});

// ── transcribeAttachment — success paths + error catch ────────────────────────

describe('AudioTranslateService.transcribeAttachment — success + error', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('succeeds using attachment.filePath to build the audio path', async () => {
    const taskId = 'tr-filepath-ok';
    zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);
    mockPrisma.messageAttachment.update.mockResolvedValue({});

    // First findUnique: no cached transcription
    // Second findUnique: attachment with filePath set
    mockPrisma.messageAttachment.findUnique
      .mockResolvedValueOnce({ transcription: null })
      .mockResolvedValueOnce({
        id: 'att-filepath',
        fileUrl: '/api/v1/attachments/file/originals%2Faudio.mp3',
        filePath: 'originals/audio.mp3',
        mimeType: 'audio/mpeg',
        messageId: 'msg-filepath',
      });

    const promise = service.transcribeAttachment('att-filepath');
    // 3 ticks needed: findUnique#1, findUnique#2, sendTranscriptionOnlyRequest
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    zmqClient.emit('transcriptionCompleted', {
      taskId,
      messageId: 'msg-filepath',
      attachmentId: 'att-filepath',
      transcription: {
        text: 'audio via filePath',
        language: 'fr',
        confidence: 0.92,
        durationMs: 3000,
        source: 'whisper',
      },
      processingTimeMs: 200,
    });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data?.text).toBe('audio via filePath');
    // sendTranscriptionOnlyRequest should have been called with the absolute path
    expect(zmqClient.sendTranscriptionOnlyRequest).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: expect.stringContaining('originals/audio.mp3') }),
    );
  });

  it('succeeds using attachment.fileUrl (filePath is null)', async () => {
    const taskId = 'tr-fileurl-ok';
    zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);
    mockPrisma.messageAttachment.update.mockResolvedValue({});

    mockPrisma.messageAttachment.findUnique
      .mockResolvedValueOnce({ transcription: null })
      .mockResolvedValueOnce({
        id: 'att-fileurl',
        fileUrl: '/api/v1/attachments/file/originals%2Fvoice.ogg',
        filePath: null,
        mimeType: 'audio/ogg',
        messageId: 'msg-fileurl',
      });

    const promise = service.transcribeAttachment('att-fileurl');
    // 3 ticks needed: findUnique#1, findUnique#2, sendTranscriptionOnlyRequest
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    zmqClient.emit('transcriptionCompleted', {
      taskId,
      messageId: 'msg-fileurl',
      attachmentId: 'att-fileurl',
      transcription: {
        text: 'audio via fileUrl',
        language: 'de',
        confidence: 0.88,
        durationMs: 2000,
        source: 'whisper',
      },
      processingTimeMs: 150,
    });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data?.text).toBe('audio via fileUrl');
    expect(zmqClient.sendTranscriptionOnlyRequest).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: expect.stringContaining('originals/voice.ogg') }),
    );
  });

  it('returns TRANSCRIPTION_FAILED when prisma throws unexpectedly', async () => {
    mockPrisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.transcribeAttachment('att-db-error');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TRANSCRIPTION_FAILED');
  });
});

// ── translateSync — saveToDatabase (_saveTranslationResult) ───────────────────

describe('AudioTranslateService.translateSync — saveToDatabase', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('calls _saveTranslationResult (findUnique + update) when saveToDatabase + attachmentId provided', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    // _saveTranslationResult calls findUnique then update
    mockPrisma.messageAttachment.findUnique.mockResolvedValue({ translations: {} });
    mockPrisma.messageAttachment.update.mockResolvedValue({});

    const mockResult = {
      translationId: 'tr-save-001',
      originalAudio: {
        transcription: 'hello',
        language: 'en',
        confidence: 0.9,
        durationMs: 2000,
      },
      translations: [
        { targetLanguage: 'fr', translatedText: 'bonjour', durationMs: 1000, voiceCloned: true },
      ],
      processingTimeMs: 300,
    };

    const promise = service.translateSync('user-123', {
      audioPath: '/tmp/audio.mp3',
      targetLanguages: ['fr'],
      attachmentId: 'att-tr-save',
      saveToDatabase: true,
    });

    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockResult);

    const result = await promise;
    expect(result.translationId).toBe('tr-save-001');
    expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'att-tr-save' } }),
    );
  });

  it('does NOT call prisma when saveToDatabase is false', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const mockResult = {
      translationId: 'tr-nosave',
      translations: [{ targetLanguage: 'es', translatedText: 'hola', durationMs: 800, voiceCloned: false }],
      processingTimeMs: 100,
    };

    const promise = service.translateSync('user-123', {
      audioBase64: 'base64data',
      targetLanguages: ['es'],
    });

    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockResult);

    await promise;
    expect(mockPrisma.messageAttachment.update).not.toHaveBeenCalled();
  });
});

// ── translateAttachment — success + merge + error ─────────────────────────────

describe('AudioTranslateService.translateAttachment — success + merge + error', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('translates using filePath and returns result', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    mockPrisma.messageAttachment.findUnique
      // translateAttachment: first call (existing translations check)
      .mockResolvedValueOnce({ transcription: null, translations: null })
      // translateAttachment: second call (attachment details)
      .mockResolvedValueOnce({
        id: 'att-tr-fp',
        fileUrl: '/api/v1/attachments/file/originals%2Fspeech.mp3',
        filePath: 'originals/speech.mp3',
        mimeType: 'audio/mpeg',
        uploadedBy: 'user-tr',
      })
      // _saveTranslationResult: findUnique for existing translations
      .mockResolvedValueOnce({ translations: {} });

    mockPrisma.messageAttachment.update.mockResolvedValue({});

    const mockResult = {
      translationId: 'tr-fp-001',
      translations: [{ targetLanguage: 'es', translatedText: 'hola', durationMs: 900, voiceCloned: false }],
      processingTimeMs: 200,
    };

    const promise = service.translateAttachment('att-tr-fp', {
      targetLanguages: ['es'],
      generateVoiceClone: false,
    });

    // 2 ticks needed: findUnique#1 + findUnique#2 before translateSync/_sendRequest runs
    await Promise.resolve();
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockResult);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data?.translations[0].targetLanguage).toBe('es');
    expect(zmqClient.sendVoiceAPIRequest).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: expect.stringContaining('originals/speech.mp3') }),
    );
  });

  it('merges new translations with pre-existing cached ones', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    // existing 'fr' translation already cached; we request 'fr' + 'de'
    // translateAttachment first findUnique: returns existing fr translation
    // translateAttachment second findUnique: attachment details (for 'de' translation)
    // _saveTranslationResult findUnique: existing translations
    mockPrisma.messageAttachment.findUnique
      .mockResolvedValueOnce({
        transcription: null,
        translations: {
          fr: { transcription: 'bonjour', url: '/fr.mp3', durationMs: 1000, cloned: true, quality: 0.9 },
        },
      })
      .mockResolvedValueOnce({
        id: 'att-merge',
        fileUrl: '/api/v1/attachments/file/audio%2Fsound.mp3',
        filePath: 'audio/sound.mp3',
        mimeType: 'audio/mpeg',
        uploadedBy: 'user-merge',
      })
      .mockResolvedValueOnce({ translations: {} });

    mockPrisma.messageAttachment.update.mockResolvedValue({});

    const mockResult = {
      translationId: 'tr-merge',
      translations: [{ targetLanguage: 'de', translatedText: 'hallo', durationMs: 800, voiceCloned: false }],
      processingTimeMs: 150,
    };

    const promise = service.translateAttachment('att-merge', {
      targetLanguages: ['fr', 'de'],
    });

    // 2 ticks needed: findUnique#1 + findUnique#2 before translateSync/_sendRequest runs
    await Promise.resolve();
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockResult);

    const result = await promise;
    expect(result.success).toBe(true);

    const langs = result.data?.translations.map((t: any) => t.targetLanguage);
    expect(langs).toContain('de');
    expect(langs).toContain('fr');
  });

  it('returns TRANSLATION_FAILED when prisma throws', async () => {
    mockPrisma.messageAttachment.findUnique.mockRejectedValue(new Error('network error'));

    const result = await service.translateAttachment('att-err', { targetLanguages: ['fr'] });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TRANSLATION_FAILED');
  });
});

// ── submitFeedback ────────────────────────────────────────────────────────────

describe('AudioTranslateService.submitFeedback', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('sends voice_feedback request and resolves with feedbackId', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const promise = service.submitFeedback('user-123', {
      translationId: 'tr-fb-1',
      rating: 5,
      feedbackType: 'quality',
      comment: 'Great translation',
    });

    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, { success: true, feedbackId: 'fb-abc' });

    const result = await promise;
    expect(result.feedbackId).toBe('fb-abc');
    expect(capturedRequest.type).toBe('voice_feedback');
    expect(capturedRequest.translationId).toBe('tr-fb-1');
    expect(capturedRequest.rating).toBe(5);
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe('AudioTranslateService.getHistory', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('sends voice_history with default limit/offset when not specified', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const promise = service.getHistory('user-123');
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, { history: [], total: 0 });

    const result = await promise;
    expect(result.total).toBe(0);
    expect(capturedRequest.type).toBe('voice_history');
    expect(capturedRequest.limit).toBe(20);
    expect(capturedRequest.offset).toBe(0);
  });

  it('passes custom limit, offset, and date range', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const promise = service.getHistory('user-123', {
      limit: 5,
      offset: 10,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
    });
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, { history: [], total: 100 });

    await promise;
    expect(capturedRequest.limit).toBe(5);
    expect(capturedRequest.offset).toBe(10);
    expect(capturedRequest.startDate).toBe('2026-01-01');
    expect(capturedRequest.endDate).toBe('2026-06-01');
  });
});

// ── getUserStats ──────────────────────────────────────────────────────────────

describe('AudioTranslateService.getUserStats', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('sends voice_stats with period "all" by default', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const mockStats = { totalTranslations: 42, totalMinutes: 120 };
    const promise = service.getUserStats('user-123');
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockStats);

    const result = await promise;
    expect(result).toEqual(mockStats);
    expect(capturedRequest.type).toBe('voice_stats');
    expect(capturedRequest.period).toBe('all');
  });

  it('passes a custom period', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const promise = service.getUserStats('user-123', 'month');
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, { totalTranslations: 5 });

    await promise;
    expect(capturedRequest.period).toBe('month');
  });
});

// ── getSystemMetrics ──────────────────────────────────────────────────────────

describe('AudioTranslateService.getSystemMetrics', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('sends voice_admin_metrics request', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const mockMetrics = { activeJobs: 3, queueSize: 10, avgProcessingMs: 500 };
    const promise = service.getSystemMetrics('admin-user');
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockMetrics);

    const result = await promise;
    expect(result).toEqual(mockMetrics);
    expect(capturedRequest.type).toBe('voice_admin_metrics');
    expect(capturedRequest.userId).toBe('admin-user');
  });
});

// ── getSupportedLanguages ─────────────────────────────────────────────────────

describe('AudioTranslateService.getSupportedLanguages', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  it('sends voice_languages request and returns language list', async () => {
    let capturedRequest: any;
    zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
      capturedRequest = req;
      return Promise.resolve();
    });

    const mockLanguages = [
      { code: 'fr', name: 'French', supportsVoiceClone: true },
      { code: 'de', name: 'German', supportsVoiceClone: false },
    ];

    const promise = service.getSupportedLanguages();
    await Promise.resolve();
    emitSuccess(zmqClient, capturedRequest.taskId, mockLanguages);

    const result = await promise;
    expect(result).toEqual(mockLanguages);
    expect(capturedRequest.type).toBe('voice_languages');
  });
});
