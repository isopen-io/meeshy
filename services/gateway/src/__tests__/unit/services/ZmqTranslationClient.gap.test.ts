/**
 * Gap-fill tests for ZmqTranslationClient — covers paths not exercised by
 * the primary test file (ZmqTranslationClient.test.ts):
 *
 *  - sendTranscriptionOnlyRequest()
 *  - translateText() / translateToMultipleLanguages() / translateTextObject()
 *  - Circuit-breaker: open guard, CB_FAILURE_THRESHOLD, cooldown/auto-reset, success-reset
 *  - Retry resend lambdas (sendTranslation / sendAudio / sendVoiceProfile)
 *  - Retry max-exhausted → error emitted
 *  - Retry resend throw → error emitted
 *  - Event forwarding for 10 previously-untested event types
 *  - close() swallows connectionManager errors
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
// Seuils de tolérance ZMQ (source de vérité) — évite que ces tests dérivent quand
// les défauts changent. Aucune env var posée en test → valeurs par défaut.
import { ZMQ_TOLERANCE_DEFAULTS } from '../../../services/zmq-translation/zmqToleranceConfig';

// ── Mock zeromq ──────────────────────────────────────────────────────────────
const mockPushSocket = {
  connect: jest.fn(),
  send: jest.fn(),
  close: jest.fn()
};

const mockSubSocket = {
  connect: jest.fn(),
  subscribe: jest.fn(),
  receive: jest.fn(),
  close: jest.fn()
};

jest.mock('zeromq', () => ({
  Push: jest.fn().mockImplementation(() => mockPushSocket),
  Subscriber: jest.fn().mockImplementation(() => mockSubSocket),
  Context: jest.fn().mockImplementation(() => ({}))
}));

// ── Mock crypto ───────────────────────────────────────────────────────────────
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('gap-uuid-0001')
}));

// ── Mock zmq-helpers ──────────────────────────────────────────────────────────
jest.mock('../../../services/zmq-translation/utils/zmq-helpers', () => ({
  loadAudioAsBinary: jest.fn().mockResolvedValue({
    buffer: Buffer.from('fake-audio-data'),
    mimeType: 'audio/wav',
    size: 15
  }),
  audioFormatToMimeType: jest.fn((fmt: string) => `audio/${fmt || 'wav'}`),
  mimeTypeToAudioFormat: jest.fn((m: string) => m.replace('audio/', ''))
}));

// ── Import SUT ────────────────────────────────────────────────────────────────
import { ZmqTranslationClient } from '../../../services/ZmqTranslationClient';

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeTranslationErrorBuf = (taskId: string) =>
  Buffer.from(JSON.stringify({
    type: 'translation_error',
    taskId,
    messageId: 'msg-x',
    error: 'err',
    conversationId: 'conv-x'
  }));

const makeTranslationCompletedBuf = (taskId: string) =>
  Buffer.from(JSON.stringify({
    type: 'translation_completed',
    taskId,
    result: {
      messageId: 'msg-x',
      translatedText: 'Bonjour',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      confidenceScore: 0.9,
      processingTime: 100,
      modelType: 'basic'
    },
    targetLanguage: 'fr',
    timestamp: Date.now()
  }));

describe('ZmqTranslationClient — gap-fill', () => {
  let client: ZmqTranslationClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    process.env.ZMQ_TRANSLATOR_HOST = '0.0.0.0';
    process.env.ZMQ_TRANSLATOR_PUSH_PORT = '5555';
    process.env.ZMQ_TRANSLATOR_SUB_PORT = '5558';

    (mockPushSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.send as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.subscribe as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.receive as jest.Mock).mockRejectedValue(new Error('No message'));

    client = new ZmqTranslationClient();
    await client.initialize();
  });

  afterEach(async () => {
    jest.useRealTimers();
    try { await client.close(); } catch { /* ignore */ }
  });

  // ── sendTranscriptionOnlyRequest ─────────────────────────────────────────────
  describe('sendTranscriptionOnlyRequest()', () => {
    it('should send request via audioPath and return taskId', async () => {
      const taskId = await client.sendTranscriptionOnlyRequest({
        messageId: 'msg-tc-1',
        attachmentId: 'att-1',
        audioPath: '/tmp/audio.wav'
      });

      expect(taskId).toBe('gap-uuid-0001');
      // sendMultipart sends an array of Buffers; just assert send was called
      expect(mockPushSocket.send).toHaveBeenCalled();
    });

    it('should increment requests_sent stat', async () => {
      await client.sendTranscriptionOnlyRequest({
        messageId: 'msg-tc-2',
        audioPath: '/tmp/audio.wav'
      });

      expect(client.getStats().requests_sent).toBe(1);
    });

    it('should send request via base64 audioData', async () => {
      const taskId = await client.sendTranscriptionOnlyRequest({
        messageId: 'msg-tc-b64',
        audioData: Buffer.from('fake').toString('base64'),
        audioFormat: 'mp3'
      });

      expect(taskId).toBe('gap-uuid-0001');
      expect(mockPushSocket.send).toHaveBeenCalled();
    });

    it('should throw when neither audioPath nor audioData is provided', async () => {
      await expect(
        client.sendTranscriptionOnlyRequest({ messageId: 'msg-tc-empty' })
      ).rejects.toThrow('Either audioPath or audioData');
    });

    it('should register retry timeout (resend fires after 30s)', async () => {
      await client.sendTranscriptionOnlyRequest({
        messageId: 'msg-tc-retry',
        audioPath: '/tmp/audio.wav'
      });

      const callsBefore = (mockPushSocket.send as jest.Mock).mock.calls.length;
      expect(callsBefore).toBe(1);

      await jest.advanceTimersByTimeAsync(30_001);

      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── translateText ─────────────────────────────────────────────────────────────
  describe('translateText()', () => {
    it('should delegate to sendTranslationRequest and return taskId', async () => {
      const taskId = await client.translateText(
        'Hello',
        'en',
        'fr',
        'msg-tt-1',
        'conv-tt-1'
      );

      expect(taskId).toBe('gap-uuid-0001');
      const sent = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sent.text).toBe('Hello');
      expect(sent.targetLanguages).toEqual(['fr']);
    });

    it('should use provided modelType', async () => {
      await client.translateText('Hi', 'en', 'es', 'msg-2', 'conv-2', 'premium');

      const sent = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sent.modelType).toBe('premium');
    });
  });

  // ── translateToMultipleLanguages ──────────────────────────────────────────────
  describe('translateToMultipleLanguages()', () => {
    it('should delegate to sendTranslationRequest with multiple targets', async () => {
      const taskId = await client.translateToMultipleLanguages(
        'Hello world',
        'en',
        ['fr', 'es', 'de'],
        'msg-mul-1',
        'conv-mul-1'
      );

      expect(taskId).toBe('gap-uuid-0001');
      const sent = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sent.targetLanguages).toEqual(['fr', 'es', 'de']);
    });

    it('should use default modelType basic', async () => {
      await client.translateToMultipleLanguages('text', 'en', ['fr'], 'msg', 'conv');

      const sent = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sent.modelType).toBe('basic');
    });
  });

  // ── translateTextObject ───────────────────────────────────────────────────────
  describe('translateTextObject()', () => {
    it('should send a story_text_object_translation request (fire-and-forget)', async () => {
      client.translateTextObject({
        postId: 'post-1',
        textObjectIndex: 0,
        text: 'Story caption',
        sourceLanguage: 'en',
        targetLanguages: ['fr']
      });

      // Allow the async sendStoryTextObjectRequest to resolve
      await Promise.resolve();
      await Promise.resolve();

      const sent = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sent.type).toBe('story_text_object_translation');
      expect(sent.postId).toBe('post-1');
      expect(sent.text).toBe('Story caption');
    });

    it('should silently swallow ZMQ send failures', async () => {
      (mockPushSocket.send as jest.Mock).mockRejectedValueOnce(new Error('ZMQ fail'));

      // Should not throw
      expect(() => {
        client.translateTextObject({
          postId: 'post-fail',
          textObjectIndex: 1,
          text: 'text',
          sourceLanguage: 'en',
          targetLanguages: ['es']
        });
      }).not.toThrow();

      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // ── Circuit breaker ───────────────────────────────────────────────────────────
  describe('Circuit breaker', () => {
    async function openCircuitBreaker() {
      // CB_FAILURE_THRESHOLD erreurs consécutives ouvrent le breaker (valeur source).
      for (let i = 0; i < ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold; i++) {
        (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([makeTranslationErrorBuf(`cb-task-${i}`)]);
        await jest.advanceTimersByTimeAsync(100);
      }
    }

    it('should throw when circuit breaker is open on sendTranslationRequest', async () => {
      await openCircuitBreaker();

      await expect(
        client.sendTranslationRequest({
          messageId: 'msg-blocked',
          text: 'Hello',
          sourceLanguage: 'en',
          targetLanguages: ['fr'],
          conversationId: 'conv-1'
        })
      ).rejects.toThrow('ZMQ circuit breaker OPEN');
    });

    it('should throw when circuit breaker is open on sendAudioProcessRequest', async () => {
      await openCircuitBreaker();

      await expect(
        client.sendAudioProcessRequest({
          messageId: 'msg-audio-blocked',
          attachmentId: 'att-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          audioUrl: 'https://example.com/a.mp3',
          audioPath: '/tmp/a.mp3',
          audioDurationMs: 1000,
          targetLanguages: ['fr'],
          generateVoiceClone: false,
          modelType: 'basic'
        })
      ).rejects.toThrow('ZMQ circuit breaker OPEN');
    });

    it('should open the circuit breaker after CB_FAILURE_THRESHOLD consecutive errors', async () => {
      const threshold = ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold;
      // threshold-1 errors should NOT open the CB.
      for (let i = 0; i < threshold - 1; i++) {
        (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([makeTranslationErrorBuf(`pre-task-${i}`)]);
        await jest.advanceTimersByTimeAsync(100);
      }

      // Still closed (threshold-1 errors < threshold).
      await expect(
        client.sendTranslationRequest({
          messageId: 'msg-pre',
          text: 'hi',
          sourceLanguage: 'en',
          targetLanguages: ['fr'],
          conversationId: 'conv-1'
        })
      ).resolves.toBe('gap-uuid-0001');

      // The threshold-th error opens the CB.
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([makeTranslationErrorBuf(`pre-task-${threshold - 1}`)]);
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();

      await expect(
        client.sendTranslationRequest({
          messageId: 'msg-now-blocked',
          text: 'hi',
          sourceLanguage: 'en',
          targetLanguages: ['fr'],
          conversationId: 'conv-1'
        })
      ).rejects.toThrow('ZMQ circuit breaker OPEN');
    });

    it('should auto-reset the circuit breaker after the cooldown period', async () => {
      await openCircuitBreaker();

      // CB is open — advance past the 30s cooldown
      await jest.advanceTimersByTimeAsync(30_001);

      // Now the CB should be reset; request should succeed
      const taskId = await client.sendTranslationRequest({
        messageId: 'msg-after-reset',
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-1'
      });

      expect(taskId).toBe('gap-uuid-0001');
    });

    it('should reset consecutive error count on success (translationCompleted)', async () => {
      // Accumulate 7 errors (just below threshold so CB is NOT open)
      for (let i = 0; i < 7; i++) {
        (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([makeTranslationErrorBuf(`reset-e${i}`)]);
        await jest.advanceTimersByTimeAsync(100);
      }

      // Now emit one success — resets cbConsecutiveErrors to 0
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([makeTranslationCompletedBuf('reset-ok')]);
      await jest.advanceTimersByTimeAsync(100);

      // Accumulate 7 more errors — still below threshold (reset to 0 + 7 = 7 < 8)
      for (let i = 0; i < 7; i++) {
        (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([makeTranslationErrorBuf(`reset-e2-${i}`)]);
        await jest.advanceTimersByTimeAsync(100);
      }

      // CB should NOT be open (only 7 consecutive errors since last success)
      const taskId = await client.sendTranslationRequest({
        messageId: 'msg-still-ok',
        text: 'Hi',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-1'
      });

      expect(taskId).toBe('gap-uuid-0001');
    });
  });

  // ── Retry resend lambdas ──────────────────────────────────────────────────────
  describe('Retry resend lambdas', () => {
    it('sendTranslationRequest: retry fires on 30s timeout, requests_sent increments', async () => {
      await client.sendTranslationRequest({
        messageId: 'msg-retry-1',
        text: 'Retry me',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-retry'
      });

      expect(client.getStats().requests_sent).toBe(1);

      await jest.advanceTimersByTimeAsync(30_001);

      // Retry resend was called — stats.requests_sent became 2
      expect(client.getStats().requests_sent).toBe(2);
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('sendTranslationRequest: emits error after MAX_RETRIES exhausted', async () => {
      const errors: unknown[] = [];
      client.on('translationError', (e) => errors.push(e));

      await client.sendTranslationRequest({
        messageId: 'msg-exhaust',
        text: 'Exhaust me',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-ex'
      });

      // Initial attempt + ZMQ_MAX_RETRIES retries = maxRetries+1 timer firings.
      // The polling setInterval (100ms) fires ~300× per 30s advance, flooding
      // the microtask queue with receive-rejection microtasks before the retry
      // chain gets to run.  We drain them all (700 flush iterations is well
      // above 300×2 setInterval microtasks + retry-chain microtasks).
      // On the last firing (retries===ZMQ_MAX_RETRIES) the else-branch emits
      // the error synchronously inside advanceTimersByTime.
      const flush = async () => { for (let j = 0; j < 700; j++) await Promise.resolve(); };
      for (let i = 0; i < ZMQ_TOLERANCE_DEFAULTS.maxRetries + 1; i++) {
        jest.advanceTimersByTime(30_001);
        await flush();
      }

      expect(errors.length).toBe(1);
      const err = errors[0] as Record<string, unknown>;
      expect(err.taskId).toBe('gap-uuid-0001');
      expect(err.error).toMatch(/timeout/i);
    });

    it('sendTranslationRequest: emits error immediately when resend throws', async () => {
      let sendCount = 0;
      (mockPushSocket.send as jest.Mock).mockImplementation(() => {
        sendCount++;
        return sendCount >= 2
          ? Promise.reject(new Error('network failure on retry'))
          : Promise.resolve(undefined);
      });

      const errors: unknown[] = [];
      client.on('translationError', (e) => errors.push(e));

      await client.sendTranslationRequest({
        messageId: 'msg-throw-retry',
        text: 'Throw on retry',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-tr'
      });

      // First timeout fires → resend throws → error emitted.
      await jest.advanceTimersByTimeAsync(30_001);

      expect(errors.length).toBe(1);
      const err = errors[0] as Record<string, unknown>;
      expect(err.taskId).toBe('gap-uuid-0001');
    });

    it('sendAudioProcessRequest: retry fires on 30s timeout', async () => {
      await client.sendAudioProcessRequest({
        messageId: 'msg-audio-retry',
        attachmentId: 'att-2',
        conversationId: 'conv-ar',
        senderId: 'user-2',
        audioUrl: 'https://example.com/b.mp3',
        audioPath: '/tmp/b.mp3',
        audioDurationMs: 2000,
        targetLanguages: ['es'],
        generateVoiceClone: false,
        modelType: 'basic'
      });

      const callsBefore = (mockPushSocket.send as jest.Mock).mock.calls.length;

      await jest.advanceTimersByTimeAsync(30_001);

      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('sendVoiceProfileRequest: retry fires on 30s timeout', async () => {
      await client.sendVoiceProfileRequest({
        type: 'voice_profile_analyze',
        request_id: 'analyze-retry-1',
        user_id: 'user-vp',
        audio_data: 'base64data',
        audio_format: 'wav'
      });

      const callsBefore = (mockPushSocket.send as jest.Mock).mock.calls.length;

      await jest.advanceTimersByTimeAsync(30_001);

      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // ── Event forwarding — previously-uncovered types ────────────────────────────
  describe('Event forwarding — uncovered event types', () => {
    function emitAndAdvance(msgBuf: Buffer): void {
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([msgBuf]);
      jest.advanceTimersByTime(100);
    }

    it('transcription_completed → transcriptionCompleted (with taskId cleanup)', (done) => {
      const payload = {
        type: 'transcription_completed',
        taskId: 'tc-task-1',
        messageId: 'msg-tc',
        attachmentId: 'att-tc',
        transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 500
      };
      client.on('transcriptionCompleted', (data) => {
        expect(data.taskId).toBe('tc-task-1');
        expect(data.transcription.text).toBe('Hello');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('transcription_error → transcriptionError', (done) => {
      const payload = {
        type: 'transcription_error',
        taskId: 'te-task-1',
        messageId: 'msg-te',
        error: 'Audio too noisy',
        errorCode: 'QUALITY_TOO_LOW'
      };
      client.on('transcriptionError', (data) => {
        expect(data.taskId).toBe('te-task-1');
        expect(data.error).toBe('Audio too noisy');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('transcription_ready → transcriptionReady', (done) => {
      const payload = {
        type: 'transcription_ready',
        taskId: 'tr-task-1',
        messageId: 'msg-tr',
        attachmentId: 'att-tr',
        transcription: { text: 'Hey', language: 'en', confidence: 0.85, durationMs: 800, source: 'whisper' },
        processingTimeMs: 300
      };
      client.on('transcriptionReady', (data) => {
        expect(data.taskId).toBe('tr-task-1');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('translation_ready → translationReady (deprecated forward)', (done) => {
      const payload = {
        type: 'translation_ready',
        taskId: 'trd-task-1',
        messageId: 'msg-trd',
        attachmentId: 'att-trd',
        language: 'fr',
        translatedAudio: { id: 'ta-1', targetLanguage: 'fr', translatedText: 'Bonjour', audioUrl: 'u', durationMs: 1000, voiceCloned: false, voiceQuality: 0.8, segments: [] }
      };
      client.on('translationReady', (data) => {
        expect(data.taskId).toBe('trd-task-1');
        expect(data.language).toBe('fr');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('audio_translation_ready → audioTranslationReady', (done) => {
      const payload = {
        type: 'audio_translation_ready',
        taskId: 'atr-task-1',
        messageId: 'msg-atr',
        attachmentId: 'att-atr',
        language: 'es',
        translatedAudio: { id: 'ta-es', targetLanguage: 'es', translatedText: 'Hola', audioUrl: 'u', durationMs: 500, voiceCloned: false, voiceQuality: 0.75, segments: [] }
      };
      client.on('audioTranslationReady', (data) => {
        expect(data.taskId).toBe('atr-task-1');
        expect(data.language).toBe('es');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('audio_translations_progressive → audioTranslationsProgressive', (done) => {
      const payload = {
        type: 'audio_translations_progressive',
        taskId: 'atp-task-1',
        messageId: 'msg-atp',
        attachmentId: 'att-atp',
        language: 'de',
        translatedAudio: { id: 'ta-de', targetLanguage: 'de', translatedText: 'Hallo', audioUrl: 'u', durationMs: 600, voiceCloned: false, voiceQuality: 0.8, segments: [] }
      };
      client.on('audioTranslationsProgressive', (data) => {
        expect(data.taskId).toBe('atp-task-1');
        expect(data.language).toBe('de');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('audio_translations_completed → audioTranslationsCompleted', (done) => {
      const payload = {
        type: 'audio_translations_completed',
        taskId: 'atc-task-1',
        messageId: 'msg-atc',
        attachmentId: 'att-atc',
        language: 'it',
        translatedAudio: { id: 'ta-it', targetLanguage: 'it', translatedText: 'Ciao', audioUrl: 'u', durationMs: 700, voiceCloned: false, voiceQuality: 0.82, segments: [] }
      };
      client.on('audioTranslationsCompleted', (data) => {
        expect(data.taskId).toBe('atc-task-1');
        expect(data.language).toBe('it');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('voice_translation_completed → voiceTranslationCompleted', (done) => {
      const payload = {
        type: 'voice_translation_completed',
        jobId: 'job-vtc-1',
        status: 'completed',
        userId: 'user-vtc',
        timestamp: Date.now(),
        result: {
          originalAudio: { transcription: 'Hello', language: 'en' },
          translations: [{ targetLanguage: 'fr', translatedText: 'Bonjour', audioUrl: 'u' }]
        }
      };
      client.on('voiceTranslationCompleted', (data) => {
        expect(data.jobId).toBe('job-vtc-1');
        expect(data.status).toBe('completed');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('voice_translation_failed → voiceTranslationFailed', (done) => {
      const payload = {
        type: 'voice_translation_failed',
        jobId: 'job-vtf-1',
        status: 'failed',
        userId: 'user-vtf',
        timestamp: Date.now(),
        error: 'Voice model unavailable',
        errorCode: 'MODEL_UNAVAILABLE'
      };
      client.on('voiceTranslationFailed', (data) => {
        expect(data.jobId).toBe('job-vtf-1');
        expect(data.error).toBe('Voice model unavailable');
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });

    it('story_text_object_translation_completed → storyTextObjectTranslationCompleted', (done) => {
      const payload = {
        type: 'story_text_object_translation_completed',
        postId: 'post-sto-1',
        textObjectIndex: 2,
        translations: { fr: 'Bonjour', es: 'Hola' }
      };
      client.on('storyTextObjectTranslationCompleted', (data) => {
        expect(data.postId).toBe('post-sto-1');
        expect(data.textObjectIndex).toBe(2);
        done();
      });
      emitAndAdvance(Buffer.from(JSON.stringify(payload)));
    });
  });

  // ── close() error handling ────────────────────────────────────────────────────
  describe('close() error handling', () => {
    it('should swallow errors thrown by connectionManager.close()', async () => {
      (mockSubSocket.close as jest.Mock).mockRejectedValueOnce(new Error('socket already closed'));

      // Must not throw even though the underlying close fails
      await expect(client.close()).resolves.toBeUndefined();
    });
  });
});
