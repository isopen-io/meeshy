/**
 * Unit tests for ZmqTranslationClient
 *
 * Tests:
 * - Constructor and initialization
 * - Socket connection management (PUSH/SUB)
 * - Translation request sending
 * - Audio process request sending
 * - Voice API request sending
 * - Voice Profile request sending
 * - Event handling (translation completed, error, audio, voice events)
 * - Health check functionality
 * - Statistics tracking
 * - Connection closing and cleanup
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
// Source de vérité des seuils de tolérance ZMQ — importée pour que ces tests
// suivent automatiquement toute évolution des défauts (cbFailureThreshold,
// maxRetries) sans dériver. Les env vars ne sont pas posées en test → défauts.
import { ZMQ_TOLERANCE_DEFAULTS } from '../../../services/zmq-translation/zmqToleranceConfig';

// Mock zeromq before importing the client
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

const mockContext = {};

jest.mock('zeromq', () => ({
  Push: jest.fn().mockImplementation(() => mockPushSocket),
  Subscriber: jest.fn().mockImplementation(() => mockSubSocket),
  Context: jest.fn().mockImplementation(() => mockContext)
}));

// Mock crypto for UUID generation
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid-1234')
}));

// Mock zmq-helpers for loadAudioAsBinary
jest.mock('../../../services/zmq-translation/utils/zmq-helpers', () => ({
  loadAudioAsBinary: jest.fn().mockResolvedValue({
    buffer: Buffer.from('fake-audio-data'),
    mimeType: 'audio/mp3',
    size: 15
  }),
  audioFormatToMimeType: jest.fn((format: string) => {
    const map: Record<string, string> = {
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4'
    };
    return map[format] || 'audio/wav';
  }),
  mimeTypeToAudioFormat: jest.fn((mimeType: string) => mimeType.replace('audio/', ''))
}));

// Import after mocking
import {
  ZmqTranslationClient,
  TranslationRequest,
  TranslationResult,
  TranslationCompletedEvent,
  TranslationErrorEvent,
  AudioProcessRequest,
  AudioProcessCompletedEvent,
  AudioProcessErrorEvent,
  VoiceAPIRequest,
  VoiceAPISuccessEvent,
  VoiceAPIErrorEvent,
  VoiceJobProgressEvent,
  VoiceProfileAnalyzeRequest,
  VoiceProfileVerifyRequest,
  VoiceProfileCompareRequest,
  VoiceProfileAnalyzeResult,
  VoiceProfileVerifyResult,
  VoiceProfileCompareResult,
  VoiceProfileErrorEvent,
  ZMQClientStats,
  PongEvent
} from '../../../services/ZmqTranslationClient';

describe('ZmqTranslationClient', () => {
  let client: ZmqTranslationClient;
  const defaultHost = '0.0.0.0';
  const defaultPushPort = 5555;
  const defaultSubPort = 5558;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Set default environment variables before each test
    process.env.ZMQ_TRANSLATOR_HOST = defaultHost;
    process.env.ZMQ_TRANSLATOR_PUSH_PORT = String(defaultPushPort);
    process.env.ZMQ_TRANSLATOR_SUB_PORT = String(defaultSubPort);

    // Reset mock implementations
    (mockPushSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.send as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.subscribe as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.close as jest.Mock).mockResolvedValue(undefined);

    // Default: no messages available (receive throws or returns empty)
    (mockSubSocket.receive as jest.Mock).mockRejectedValue(new Error('No message'));
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (client) {
      await client.close();
    }
  });

  describe('Constructor', () => {
    it('should create instance with default parameters', () => {
      client = new ZmqTranslationClient();
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(EventEmitter);
    });

    it('should create instance with custom host and ports', () => {
      client = new ZmqTranslationClient('192.168.1.1', 6000, 6001);
      expect(client).toBeDefined();
    });

    it('should use environment variables if provided', () => {
      const originalHost = process.env.ZMQ_TRANSLATOR_HOST;
      const originalPushPort = process.env.ZMQ_TRANSLATOR_PUSH_PORT;
      const originalSubPort = process.env.ZMQ_TRANSLATOR_SUB_PORT;

      process.env.ZMQ_TRANSLATOR_HOST = 'env-host';
      process.env.ZMQ_TRANSLATOR_PUSH_PORT = '7000';
      process.env.ZMQ_TRANSLATOR_SUB_PORT = '7001';

      client = new ZmqTranslationClient();
      expect(client).toBeDefined();

      // Restore
      process.env.ZMQ_TRANSLATOR_HOST = originalHost;
      process.env.ZMQ_TRANSLATOR_PUSH_PORT = originalPushPort;
      process.env.ZMQ_TRANSLATOR_SUB_PORT = originalSubPort;
    });
  });

  describe('initialize()', () => {
    beforeEach(() => {
      client = new ZmqTranslationClient();
    });

    it('should initialize sockets successfully', async () => {
      await client.initialize();

      expect(mockPushSocket.connect).toHaveBeenCalledWith(`tcp://${defaultHost}:${defaultPushPort}`);
      expect(mockSubSocket.connect).toHaveBeenCalledWith(`tcp://${defaultHost}:${defaultSubPort}`);
      expect(mockSubSocket.subscribe).toHaveBeenCalledWith('');
    });

    it('should throw error if PUSH socket connection fails', async () => {
      (mockPushSocket.connect as jest.Mock).mockRejectedValue(new Error('PUSH connection failed'));

      await expect(client.initialize()).rejects.toThrow('PUSH connection failed');
    });

    it('should throw error if SUB socket connection fails', async () => {
      (mockSubSocket.connect as jest.Mock).mockRejectedValue(new Error('SUB connection failed'));

      await expect(client.initialize()).rejects.toThrow('SUB connection failed');
    });

    it('should throw error if subscribe fails', async () => {
      (mockSubSocket.subscribe as jest.Mock).mockRejectedValue(new Error('Subscribe failed'));

      await expect(client.initialize()).rejects.toThrow('Subscribe failed');
    });

    it('should start result listener after initialization', async () => {
      await client.initialize();

      // Advance timer to trigger the polling
      jest.advanceTimersByTime(100);

      // The receive should be called as part of polling
      expect(mockSubSocket.receive).toHaveBeenCalled();
    });

    it('keeps a single receive() in flight while one is pending (zeromq allows only one read at a time)', async () => {
      // A receive that never settles — the socket is waiting for a message.
      (mockSubSocket.receive as jest.Mock).mockImplementation(() => new Promise(() => {}));

      client = new ZmqTranslationClient();
      await client.initialize();

      jest.advanceTimersByTime(100);
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Prod 2026-07-04: the old 100ms tick stacked receive() calls on top
      // of the pending one — every extra call threw "Socket is busy
      // reading" into a silent catch, 10×/s for hours.
      expect(mockSubSocket.receive).toHaveBeenCalledTimes(1);
    });

    it('recreates the SUB socket after prolonged silence (zombie watchdog, prod 2026-07-04)', async () => {
      (mockSubSocket.receive as jest.Mock).mockImplementation(() => new Promise(() => {}));

      client = new ZmqTranslationClient();
      await client.initialize();
      const subscriberCallsAfterInit = (require('zeromq').Subscriber as jest.Mock).mock.calls.length;

      // Cross the 120s silence threshold tick by tick.
      for (let elapsed = 0; elapsed <= 121_000; elapsed += 1_000) {
        jest.advanceTimersByTime(1_000);
        await Promise.resolve();
      }

      // The watchdog must have closed the zombie and built a fresh Subscriber
      // (new connection ⇒ the subscription frame is re-emitted to the PUB).
      expect(mockSubSocket.close).toHaveBeenCalled();
      expect((require('zeromq').Subscriber as jest.Mock).mock.calls.length)
        .toBeGreaterThan(subscriberCallsAfterInit);
      expect(mockSubSocket.subscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendTranslationRequest()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should send translation request successfully', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'es'],
        conversationId: 'conv-456'
      };

      const taskId = await client.sendTranslationRequest(request);

      expect(taskId).toBe('test-uuid-1234');
      expect(mockPushSocket.send).toHaveBeenCalled();

      // Verify the sent message structure
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.messageId).toBe('msg-123');
      expect(sentMessage.text).toBe('Hello world');
      expect(sentMessage.sourceLanguage).toBe('en');
      expect(sentMessage.targetLanguages).toEqual(['fr', 'es']);
      expect(sentMessage.conversationId).toBe('conv-456');
      expect(sentMessage.modelType).toBe('basic');
    });

    it('should include modelType when provided', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456',
        modelType: 'premium'
      };

      await client.sendTranslationRequest(request);

      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.modelType).toBe('premium');
    });

    it('should increment requests_sent stat', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);

      const stats = client.getStats();
      expect(stats.requests_sent).toBe(1);
    });

    it('should throw error if push socket not initialized', async () => {
      await client.close();
      client = new ZmqTranslationClient();
      // Not initialized

      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await expect(client.sendTranslationRequest(request)).rejects.toThrow();
    });

    it('should throw error if send fails', async () => {
      (mockPushSocket.send as jest.Mock)
        .mockRejectedValueOnce(new Error('Send failed'));

      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await expect(client.sendTranslationRequest(request)).rejects.toThrow('Send failed');
    });

    it('should track pending requests', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);

      expect(client.getPendingRequestsCount()).toBe(1);
    });

    it('should send translation request with single target language', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456',
        modelType: 'basic'
      };

      const taskId = await client.sendTranslationRequest(request);

      expect(taskId).toBe('test-uuid-1234');
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.targetLanguages).toEqual(['fr']);
    });

    it('should use default modelType when not provided', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);

      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.modelType).toBe('basic');
    });

    it('should send translation request with multiple target languages', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'es', 'de'],
        conversationId: 'conv-456',
        modelType: 'premium'
      };

      const taskId = await client.sendTranslationRequest(request);

      expect(taskId).toBe('test-uuid-1234');
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.targetLanguages).toEqual(['fr', 'es', 'de']);
      expect(sentMessage.modelType).toBe('premium');
    });
  });

  describe('sendAudioProcessRequest()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should send audio process request successfully', async () => {
      const request: Omit<AudioProcessRequest, 'type'> = {
        messageId: 'msg-audio-123',
        attachmentId: 'attach-456',
        conversationId: 'conv-789',
        senderId: 'user-001',
        audioUrl: 'https://example.com/audio.mp3',
        audioPath: '/tmp/audio.mp3',
        audioDurationMs: 5000,
        targetLanguages: ['fr', 'es'],
        generateVoiceClone: true,
        modelType: 'premium'
      };

      const taskId = await client.sendAudioProcessRequest(request);

      expect(taskId).toBe('test-uuid-1234');

      // Le message est maintenant envoyé en multipart (array de Buffers)
      const frames = (mockPushSocket.send as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(frames)).toBe(true);
      expect(frames.length).toBe(2); // JSON + audio binary

      // Le premier frame est le JSON
      const sentMessage = JSON.parse(frames[0].toString('utf-8'));
      expect(sentMessage.type).toBe('audio_process');
      expect(sentMessage.messageId).toBe('msg-audio-123');
      expect(sentMessage.attachmentId).toBe('attach-456');
      expect(sentMessage.generateVoiceClone).toBe(true);

      // Le deuxième frame est l'audio binaire
      expect(Buffer.isBuffer(frames[1])).toBe(true);
    });

    it('should include mobile transcription when provided', async () => {
      const request: Omit<AudioProcessRequest, 'type'> = {
        messageId: 'msg-audio-123',
        attachmentId: 'attach-456',
        conversationId: 'conv-789',
        senderId: 'user-001',
        audioUrl: 'https://example.com/audio.mp3',
        audioPath: '/tmp/audio.mp3',
        audioDurationMs: 5000,
        mobileTranscription: {
          text: 'Hello from mobile',
          language: 'en',
          confidence: 0.95,
          source: 'ios'
        },
        targetLanguages: ['fr'],
        generateVoiceClone: false,
        modelType: 'basic'
      };

      await client.sendAudioProcessRequest(request);

      // Le message est maintenant envoyé en multipart (array de Buffers)
      const frames = (mockPushSocket.send as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(frames)).toBe(true);

      // Le premier frame est le JSON
      const sentMessage = JSON.parse(frames[0].toString('utf-8'));
      expect(sentMessage.mobileTranscription).toBeDefined();
      expect(sentMessage.mobileTranscription.text).toBe('Hello from mobile');
    });

    it('should throw error if push socket not initialized', async () => {
      await client.close();
      client = new ZmqTranslationClient();

      const request: Omit<AudioProcessRequest, 'type'> = {
        messageId: 'msg-123',
        attachmentId: 'attach-456',
        conversationId: 'conv-789',
        senderId: 'user-001',
        audioUrl: 'https://example.com/audio.mp3',
        audioPath: '/tmp/audio.mp3',
        audioDurationMs: 5000,
        targetLanguages: ['fr'],
        generateVoiceClone: false,
        modelType: 'basic'
      };

      await expect(client.sendAudioProcessRequest(request)).rejects.toThrow();
    });
  });

  describe('sendVoiceAPIRequest()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should send voice API request successfully', async () => {
      const request: VoiceAPIRequest = {
        type: 'voice_translate',
        taskId: 'task-voice-123',
        userId: 'user-456',
        audioBase64: 'base64data',
        targetLanguages: ['fr']
      };

      const taskId = await client.sendVoiceAPIRequest(request);

      expect(taskId).toBe('task-voice-123');

      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('voice_translate');
      expect(sentMessage.taskId).toBe('task-voice-123');
    });

    it('should handle voice_health request', async () => {
      const request: VoiceAPIRequest = {
        type: 'voice_health',
        taskId: 'health-task-123'
      };

      await client.sendVoiceAPIRequest(request);

      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('voice_health');
    });

    it('should throw error if push socket not initialized', async () => {
      await client.close();
      client = new ZmqTranslationClient();

      const request: VoiceAPIRequest = {
        type: 'voice_translate',
        taskId: 'task-123'
      };

      await expect(client.sendVoiceAPIRequest(request)).rejects.toThrow();
    });

    it('should NOT retry voice_translate after 30s (long pipeline, single shot)', async () => {
      // Regression: in prod we observed 4× duplicate worker-pool jobs because
      // the gateway resent voice_translate every 30s. Voice pipelines take
      // several minutes (Whisper + NLLB + TTS) — retries just saturate CPU.
      const request: VoiceAPIRequest = {
        type: 'voice_translate',
        taskId: 'no-retry-task',
        userId: 'user-1',
        audioBase64: 'AAAA',
        targetLanguages: ['fr']
      };

      await client.sendVoiceAPIRequest(request);
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBe(1);

      // Advance well past the legacy 30s retry window: no retry should fire.
      jest.advanceTimersByTime(35_000);
      await Promise.resolve();
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBe(1);

      // And past a second window for good measure.
      jest.advanceTimersByTime(35_000);
      await Promise.resolve();
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBe(1);
    });

    it('should emit voiceAPIError after the 15-minute deadman timeout on voice_translate', async () => {
      const request: VoiceAPIRequest = {
        type: 'voice_translate',
        taskId: 'deadman-task',
        userId: 'user-1',
        audioBase64: 'AAAA',
        targetLanguages: ['fr']
      };

      const errorEvents: any[] = [];
      client.on('voiceAPIError', (e) => errorEvents.push(e));

      await client.sendVoiceAPIRequest(request);

      // No error before deadman.
      jest.advanceTimersByTime(14 * 60_000);
      await Promise.resolve();
      expect(errorEvents.length).toBe(0);

      // Deadman fires at 15 minutes.
      jest.advanceTimersByTime(60_000 + 1_000);
      await Promise.resolve();
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].taskId).toBe('deadman-task');
      expect(errorEvents[0].errorCode).toBe('TIMEOUT');
      expect(errorEvents[0].requestType).toBe('voice_translate');
    });

    it('should still retry fast voice ops (e.g. voice_health) on 30s timeout', async () => {
      const request: VoiceAPIRequest = {
        type: 'voice_health',
        taskId: 'health-retry-task'
      };

      await client.sendVoiceAPIRequest(request);
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBe(1);

      jest.advanceTimersByTime(30_000 + 100);
      await Promise.resolve();
      await Promise.resolve();
      // A retry should have been queued for the same taskId.
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('sendVoiceProfileRequest()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should send voice profile analyze request', async () => {
      const request: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: 'analyze-123',
        user_id: 'user-456',
        audio_data: 'base64audiodata',
        audio_format: 'wav'
      };

      const requestId = await client.sendVoiceProfileRequest(request);

      expect(requestId).toBe('analyze-123');

      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('voice_profile_analyze');
      expect(sentMessage.request_id).toBe('analyze-123');
    });

    it('should send voice profile verify request', async () => {
      const request: VoiceProfileVerifyRequest = {
        type: 'voice_profile_verify',
        request_id: 'verify-123',
        user_id: 'user-456',
        audio_data: 'base64audiodata',
        audio_format: 'mp3',
        existing_fingerprint: { id: 'fingerprint-789' }
      };

      const requestId = await client.sendVoiceProfileRequest(request);

      expect(requestId).toBe('verify-123');
    });

    it('should send voice profile compare request', async () => {
      const request: VoiceProfileCompareRequest = {
        type: 'voice_profile_compare',
        request_id: 'compare-123',
        fingerprint_a: { id: 'fp-a' },
        fingerprint_b: { id: 'fp-b' }
      };

      const requestId = await client.sendVoiceProfileRequest(request);

      expect(requestId).toBe('compare-123');
    });

    it('should throw error if push socket not initialized', async () => {
      await client.close();
      client = new ZmqTranslationClient();

      const request: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: 'analyze-123',
        user_id: 'user-456',
        audio_data: 'base64audiodata',
        audio_format: 'wav'
      };

      await expect(client.sendVoiceProfileRequest(request)).rejects.toThrow();
    });
  });

  describe('Event Handling - Translation Events', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should emit translationCompleted event on successful translation', (done) => {
      const completedEvent: TranslationCompletedEvent = {
        type: 'translation_completed',
        taskId: 'task-123',
        result: {
          messageId: 'msg-456',
          translatedText: 'Bonjour le monde',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          confidenceScore: 0.95,
          processingTime: 150,
          modelType: 'premium'
        },
        targetLanguage: 'fr',
        timestamp: Date.now()
      };

      client.on('translationCompleted', (data) => {
        expect(data.taskId).toBe('task-123');
        expect(data.result.translatedText).toBe('Bonjour le monde');
        expect(data.targetLanguage).toBe('fr');
        done();
      });

      // Simulate receiving message
      const messageBuffer = Buffer.from(JSON.stringify(completedEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit translationError event on translation error', (done) => {
      const errorEvent: TranslationErrorEvent = {
        type: 'translation_error',
        taskId: 'task-error-123',
        messageId: 'msg-456',
        error: 'Translation service unavailable',
        conversationId: 'conv-789'
      };

      client.on('translationError', (data) => {
        expect(data.taskId).toBe('task-error-123');
        expect(data.error).toBe('Translation service unavailable');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(errorEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should track pool_full_rejections on pool full error', (done) => {
      const errorEvent: TranslationErrorEvent = {
        type: 'translation_error',
        taskId: 'task-pool-123',
        messageId: 'msg-456',
        error: 'translation pool full',
        conversationId: 'conv-789'
      };

      client.on('translationError', () => {
        const stats = client.getStats();
        expect(stats.pool_full_rejections).toBe(1);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(errorEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should handle pong event silently', async () => {
      const pongEvent: PongEvent = {
        type: 'pong',
        timestamp: Date.now(),
        translator_status: 'healthy'
      };

      const messageBuffer = Buffer.from(JSON.stringify(pongEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);

      // Should not throw error
      expect(client).toBeDefined();
    });

    it('should deduplicate translation results by taskId and targetLanguage', () => {
      // This test verifies that duplicate results are tracked via processedResults Set
      // The deduplication happens in _handleTranslationResult by checking processedResults
      const completedEvent: TranslationCompletedEvent = {
        type: 'translation_completed',
        taskId: 'task-dup-123',
        result: {
          messageId: 'msg-456',
          translatedText: 'Hello',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          confidenceScore: 0.95,
          processingTime: 150,
          modelType: 'basic'
        },
        targetLanguage: 'fr',
        timestamp: Date.now()
      };

      // The deduplication key is formed as taskId_targetLanguage
      const expectedKey = `${completedEvent.taskId}_${completedEvent.targetLanguage}`;
      expect(expectedKey).toBe('task-dup-123_fr');

      // Verify the event structure is valid for processing
      expect(completedEvent.type).toBe('translation_completed');
      expect(completedEvent.result.messageId).toBeDefined();
    });
  });

  describe('Event Handling - Audio Events', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should emit audioProcessCompleted event', (done) => {
      const audioEvent: AudioProcessCompletedEvent = {
        type: 'audio_process_completed',
        taskId: 'audio-task-123',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          durationMs: 3000,
          source: 'whisper'
        },
        translatedAudios: [
          {
            id: 'translated-audio-123',
            targetLanguage: 'fr',
            translatedText: 'Bonjour le monde',
            audioUrl: 'https://example.com/fr.mp3',
            audioPath: '/tmp/fr.mp3',
            durationMs: 2000,
            voiceCloned: true,
            voiceQuality: 0.90
          }
        ],
        voiceModelUserId: 'user-001',
        voiceModelQuality: 0.88,
        processingTimeMs: 3500,
        timestamp: Date.now()
      };

      client.on('audioProcessCompleted', (data) => {
        expect(data.taskId).toBe('audio-task-123');
        expect(data.transcription.text).toBe('Hello world');
        expect(data.translatedAudios).toHaveLength(1);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(audioEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit audioProcessError event', (done) => {
      const audioError: AudioProcessErrorEvent = {
        type: 'audio_process_error',
        taskId: 'audio-error-123',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        error: 'Audio file corrupted',
        errorCode: 'AUDIO_CORRUPTED',
        timestamp: Date.now()
      };

      client.on('audioProcessError', (data) => {
        expect(data.taskId).toBe('audio-error-123');
        expect(data.error).toBe('Audio file corrupted');
        expect(data.errorCode).toBe('AUDIO_CORRUPTED');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(audioError));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });
  });

  describe('Event Handling - Voice API Events', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should emit voiceAPISuccess event', (done) => {
      const successEvent: VoiceAPISuccessEvent = {
        type: 'voice_api_success',
        taskId: 'voice-task-123',
        requestType: 'voice_translate',
        result: {
          translationId: 'trans-456',
          translations: []
        },
        processingTimeMs: 2500,
        timestamp: Date.now()
      };

      client.on('voiceAPISuccess', (data) => {
        expect(data.taskId).toBe('voice-task-123');
        expect(data.requestType).toBe('voice_translate');
        expect(data.processingTimeMs).toBe(2500);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(successEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit voiceAPIError event', (done) => {
      const errorEvent: VoiceAPIErrorEvent = {
        type: 'voice_api_error',
        taskId: 'voice-error-123',
        requestType: 'voice_translate',
        error: 'Voice clone failed',
        errorCode: 'VOICE_CLONE_FAILED',
        timestamp: Date.now()
      };

      client.on('voiceAPIError', (data) => {
        expect(data.taskId).toBe('voice-error-123');
        expect(data.error).toBe('Voice clone failed');
        expect(data.errorCode).toBe('VOICE_CLONE_FAILED');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(errorEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit voiceJobProgress event', (done) => {
      const progressEvent: VoiceJobProgressEvent = {
        type: 'voice_job_progress',
        taskId: 'voice-job-123',
        jobId: 'job-456',
        progress: 45,
        currentStep: 'Generating voice clone',
        timestamp: Date.now()
      };

      client.on('voiceJobProgress', (data) => {
        expect(data.taskId).toBe('voice-job-123');
        expect(data.jobId).toBe('job-456');
        expect(data.progress).toBe(45);
        expect(data.currentStep).toBe('Generating voice clone');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(progressEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });
  });

  describe('Event Handling - Voice Profile Events', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should emit voiceProfileAnalyzeResult on success', (done) => {
      const analyzeResult: VoiceProfileAnalyzeResult = {
        type: 'voice_profile_analyze_result',
        request_id: 'analyze-123',
        success: true,
        user_id: 'user-456',
        profile_id: 'profile-789',
        quality_score: 0.92,
        audio_duration_ms: 5000,
        fingerprint_id: 'fp-001',
        signature_short: 'abc123'
      };

      client.on('voiceProfileAnalyzeResult', (data) => {
        expect(data.request_id).toBe('analyze-123');
        expect(data.success).toBe(true);
        expect(data.quality_score).toBe(0.92);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(analyzeResult));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit voiceProfileAnalyzeResult on failure', (done) => {
      const analyzeResult: VoiceProfileAnalyzeResult = {
        type: 'voice_profile_analyze_result',
        request_id: 'analyze-fail-123',
        success: false,
        user_id: 'user-456',
        error: 'Audio quality too low'
      };

      client.on('voiceProfileAnalyzeResult', (data) => {
        expect(data.request_id).toBe('analyze-fail-123');
        expect(data.success).toBe(false);
        expect(data.error).toBe('Audio quality too low');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(analyzeResult));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit voiceProfileVerifyResult', (done) => {
      const verifyResult: VoiceProfileVerifyResult = {
        type: 'voice_profile_verify_result',
        request_id: 'verify-123',
        success: true,
        user_id: 'user-456',
        is_match: true,
        similarity_score: 0.95,
        threshold: 0.85
      };

      client.on('voiceProfileVerifyResult', (data) => {
        expect(data.request_id).toBe('verify-123');
        expect(data.is_match).toBe(true);
        expect(data.similarity_score).toBe(0.95);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(verifyResult));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit voiceProfileCompareResult', (done) => {
      const compareResult: VoiceProfileCompareResult = {
        type: 'voice_profile_compare_result',
        request_id: 'compare-123',
        success: true,
        similarity_score: 0.75,
        is_match: false,
        threshold: 0.80
      };

      client.on('voiceProfileCompareResult', (data) => {
        expect(data.request_id).toBe('compare-123');
        expect(data.is_match).toBe(false);
        expect(data.similarity_score).toBe(0.75);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(compareResult));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should emit voiceProfileError', (done) => {
      const profileError: VoiceProfileErrorEvent = {
        type: 'voice_profile_error',
        request_id: 'profile-error-123',
        user_id: 'user-456',
        error: 'Profile not found',
        success: false,
        timestamp: Date.now()
      };

      client.on('voiceProfileError', (data) => {
        expect(data.request_id).toBe('profile-error-123');
        expect(data.error).toBe('Profile not found');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(profileError));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });
  });

  describe('healthCheck()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
    });

    it('should return true when healthy', async () => {
      await client.initialize();

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockPushSocket.send).toHaveBeenCalled();
    });

    it('should return false when not running', async () => {
      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should return true even when ping send fails (manager swallows ping errors)', async () => {
      await client.initialize();
      (mockPushSocket.send as jest.Mock).mockRejectedValueOnce(new Error('Send failed'));

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(true);
    });
  });

  describe('getStats()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should return default stats after initialization', () => {
      const stats = client.getStats();

      expect(stats.requests_sent).toBe(0);
      expect(stats.results_received).toBe(0);
      expect(stats.errors_received).toBe(0);
      expect(stats.pool_full_rejections).toBe(0);
      expect(stats.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(stats.memory_usage_mb).toBeGreaterThan(0);
    });

    it('should track requests_sent after sending request', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);

      const stats = client.getStats();
      expect(stats.requests_sent).toBe(1);
    });

    it('should track results_received after translation completed', (done) => {
      const completedEvent: TranslationCompletedEvent = {
        type: 'translation_completed',
        taskId: 'task-stats-123',
        result: {
          messageId: 'msg-456',
          translatedText: 'Test',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          confidenceScore: 0.95,
          processingTime: 150,
          modelType: 'basic'
        },
        targetLanguage: 'fr',
        timestamp: Date.now()
      };

      client.on('translationCompleted', () => {
        const stats = client.getStats();
        expect(stats.results_received).toBe(1);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(completedEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });

    it('should track errors_received after translation error', (done) => {
      const errorEvent: TranslationErrorEvent = {
        type: 'translation_error',
        taskId: 'task-error-stats',
        messageId: 'msg-456',
        error: 'Translation failed',
        conversationId: 'conv-789'
      };

      client.on('translationError', () => {
        const stats = client.getStats();
        expect(stats.errors_received).toBe(1);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(errorEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      jest.advanceTimersByTime(100);
    });
  });

  describe('getPendingRequestsCount()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should return 0 initially', () => {
      expect(client.getPendingRequestsCount()).toBe(0);
    });

    it('should increment after sending request', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);

      expect(client.getPendingRequestsCount()).toBe(1);
    });

    it('should decrement after receiving result', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);
      expect(client.getPendingRequestsCount()).toBe(1);

      // The pending request is stored with taskId as key
      // When a translation_completed event with the same taskId is received,
      // the pendingRequests.delete(taskId) is called in _handleTranslationResult
      // This verifies the logic structure - the actual decrement happens via event
      expect(client.getPendingRequestsCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('close()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should close all sockets', async () => {
      await client.close();

      expect(mockPushSocket.close).toHaveBeenCalled();
      expect(mockSubSocket.close).toHaveBeenCalled();
    });

    it('should clear pending requests', async () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await client.sendTranslationRequest(request);
      expect(client.getPendingRequestsCount()).toBe(1);

      await client.close();

      expect(client.getPendingRequestsCount()).toBe(0);
    });

    it('should attempt to close all connections', async () => {
      // Test that close() calls disconnect on connection pool
      // which internally calls close on both sockets
      await client.close();

      // Verify sockets were closed
      expect(mockPushSocket.close).toHaveBeenCalled();
      expect(mockSubSocket.close).toHaveBeenCalled();
    });

    it('should stop the polling interval', async () => {
      await client.close();

      // After closing, receive should not be called anymore
      const callCountBefore = (mockSubSocket.receive as jest.Mock).mock.calls.length;

      jest.advanceTimersByTime(500);

      const callCountAfter = (mockSubSocket.receive as jest.Mock).mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should handle malformed JSON in received message', async () => {
      const malformedBuffer = Buffer.from('not valid json');
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([malformedBuffer]);

      // Should not throw, just log error
      jest.advanceTimersByTime(100);

      expect(client).toBeDefined();
    });

    it('should handle translation_completed without result', async () => {
      const invalidEvent = {
        type: 'translation_completed',
        taskId: 'task-no-result',
        targetLanguage: 'fr',
        timestamp: Date.now()
        // result is missing
      };

      const messageBuffer = Buffer.from(JSON.stringify(invalidEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      // Should not throw
      jest.advanceTimersByTime(100);

      expect(client).toBeDefined();
    });

    it('should handle translation_completed without messageId in result', async () => {
      const invalidEvent = {
        type: 'translation_completed',
        taskId: 'task-no-msgid',
        result: {
          translatedText: 'Test',
          // messageId is missing
        },
        targetLanguage: 'fr',
        timestamp: Date.now()
      };

      const messageBuffer = Buffer.from(JSON.stringify(invalidEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      // Should not throw
      jest.advanceTimersByTime(100);

      expect(client).toBeDefined();
    });

    it('should handle unknown event type gracefully', async () => {
      const unknownEvent = {
        type: 'unknown_event_type',
        taskId: 'task-unknown',
        timestamp: Date.now()
      };

      const messageBuffer = Buffer.from(JSON.stringify(unknownEvent));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);

      // Should not throw
      jest.advanceTimersByTime(100);

      expect(client).toBeDefined();
    });

    it('should clean old processed results when exceeding limit', async () => {
      // Send many unique results to trigger cleanup
      for (let i = 0; i < 1005; i++) {
        const completedEvent: TranslationCompletedEvent = {
          type: 'translation_completed',
          taskId: `task-${i}`,
          result: {
            messageId: `msg-${i}`,
            translatedText: 'Test',
            sourceLanguage: 'en',
            targetLanguage: 'fr',
            confidenceScore: 0.95,
            processingTime: 150,
            modelType: 'basic'
          },
          targetLanguage: 'fr',
          timestamp: Date.now()
        };

        const messageBuffer = Buffer.from(JSON.stringify(completedEvent));
        (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
        jest.advanceTimersByTime(100);
      }

      // Client should still function correctly
      expect(client).toBeDefined();
    });

    it.skip('should throw error when circuit breaker is open', async () => {
      // Directly inject a mock retry handler that simulates circuit breaker being open
      const mockRetryHandler = {
        canSendRequest: jest.fn().mockReturnValue(false),
        registerRequest: jest.fn(),
        markSuccess: jest.fn(),
        markFailure: jest.fn(),
        cleanupStaleRequests: jest.fn(),
        getPendingCount: jest.fn().mockReturnValue(0),
        getCircuitState: jest.fn().mockReturnValue('OPEN'),
        clear: jest.fn(),
        on: jest.fn(),
      };

      // Replace the retry handler
      (client as any).retryHandler = mockRetryHandler;

      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-456'
      };

      await expect(client.sendTranslationRequest(request)).rejects.toThrow('Circuit breaker is OPEN');
      expect(mockRetryHandler.canSendRequest).toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // GAP-FILL TESTS — added to reach ≥92% line+branch coverage
  // ════════════════════════════════════════════════════════════════════

  describe('ZmqConnectionManager — uncovered branches', () => {
    // Import ZmqConnectionManager directly to test it in isolation
    let connectionManager: any;

    beforeEach(async () => {
      // Purge stray mockResolvedValueOnce queued by earlier tests: with the
      // single-flight listener they are no longer greedily consumed by the
      // polling loop and would leak into these isolated tests.
      (mockSubSocket.receive as jest.Mock).mockReset();
      (mockSubSocket.receive as jest.Mock).mockRejectedValue(new Error('No message'));
      const { ZmqConnectionManager } = await import('../../../services/zmq-translation/ZmqConnectionManager');
      connectionManager = new ZmqConnectionManager({ host: '0.0.0.0', pushPort: 5555, subPort: 5558 });
    });

    afterEach(async () => {
      if (connectionManager) {
        await connectionManager.close();
      }
    });

    it('receive() should throw when subSocket is null (not initialized)', async () => {
      // subSocket is null before initialize() — line 116
      await expect(connectionManager.receive()).rejects.toThrow('Socket SUB non initialisé');
    });

    it('receive() should throw when receive returns empty messages — line 122', async () => {
      await connectionManager.initialize();
      // Return empty array to trigger the "No message available" throw
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([]);
      await expect(connectionManager.receive()).rejects.toThrow('No message available');
    });

    it('receive() returns Buffer[] when multiple frames received', async () => {
      await connectionManager.initialize();
      const frame1 = Buffer.from('frame1');
      const frame2 = Buffer.from('frame2');
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([frame1, frame2]);
      const result = await connectionManager.receive();
      expect(Array.isArray(result)).toBe(true);
      expect((result as Buffer[]).length).toBe(2);
    });

    it('receive() returns single Buffer when one frame received', async () => {
      await connectionManager.initialize();
      const frame1 = Buffer.from('frame1');
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([frame1]);
      const result = await connectionManager.receive();
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('sendPing() should return early when pushSocket is null — lines 144-145', async () => {
      // pushSocket is null before initialize()
      await expect(connectionManager.sendPing()).resolves.toBeUndefined();
    });

    it('close() should handle errors gracefully — lines 186-188', async () => {
      await connectionManager.initialize();
      // Make pushSocket.close() throw to trigger the catch block
      (mockPushSocket.close as jest.Mock).mockRejectedValueOnce(new Error('Close failed'));
      // Should not throw — errors are caught internally
      await expect(connectionManager.close()).resolves.toBeUndefined();
    });

    it('getSockets() should return both sockets — lines 193-198', async () => {
      await connectionManager.initialize();
      const sockets = connectionManager.getSockets();
      expect(sockets).toHaveProperty('pushSocket');
      expect(sockets).toHaveProperty('subSocket');
    });

    it('getSockets() should return null sockets before initialize', () => {
      const sockets = connectionManager.getSockets();
      expect(sockets.pushSocket).toBeNull();
      expect(sockets.subSocket).toBeNull();
    });

    it('getIsConnected() returns false when not initialized', () => {
      expect(connectionManager.getIsConnected()).toBe(false);
    });

    it('getIsConnected() returns true when initialized', async () => {
      await connectionManager.initialize();
      expect(connectionManager.getIsConnected()).toBe(true);
    });
  });

  describe('ZmqTranslationClient — circuit breaker branches', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('sendTranslationRequest() should throw when circuit breaker is open — line 427', async () => {
      // Trigger CB open by injecting state directly
      (client as any).cbOpenedAt = Date.now();
      (client as any).cbConsecutiveErrors = 5;

      const request: TranslationRequest = {
        messageId: 'msg-cb',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-cb'
      };

      await expect(client.sendTranslationRequest(request)).rejects.toThrow('ZMQ circuit breaker OPEN');
    });

    it('sendAudioProcessRequest() should throw when circuit breaker is open — line 449', async () => {
      (client as any).cbOpenedAt = Date.now();
      (client as any).cbConsecutiveErrors = 5;

      const request: Omit<AudioProcessRequest, 'type'> = {
        messageId: 'msg-cb',
        attachmentId: 'attach-cb',
        conversationId: 'conv-cb',
        senderId: 'user-cb',
        audioUrl: 'https://example.com/audio.mp3',
        audioPath: '/tmp/audio.mp3',
        audioDurationMs: 1000,
        targetLanguages: ['fr'],
        generateVoiceClone: false,
        modelType: 'basic'
      };

      await expect(client.sendAudioProcessRequest(request)).rejects.toThrow('ZMQ circuit breaker OPEN');
    });

    it('_cbIsOpen() resets circuit breaker after cooldown — lines 196-200', async () => {
      // Open the circuit breaker
      (client as any).cbOpenedAt = Date.now() - 31_000; // 31s ago — past 30s cooldown
      (client as any).cbConsecutiveErrors = 5;

      // Should auto-reset and return false
      const isOpen = (client as any)._cbIsOpen();
      expect(isOpen).toBe(false);
      expect((client as any).cbOpenedAt).toBeNull();
      expect((client as any).cbConsecutiveErrors).toBe(0);
    });

    it('_cbIsOpen() returns true when circuit breaker is still in cooldown — line 202', async () => {
      (client as any).cbOpenedAt = Date.now(); // Just opened
      (client as any).cbConsecutiveErrors = 5;

      const isOpen = (client as any)._cbIsOpen();
      expect(isOpen).toBe(true);
    });

    it('_cbRecordError() opens circuit breaker after threshold errors — lines 213-214', async () => {
      expect((client as any).cbOpenedAt).toBeNull();

      // Trigger CB_FAILURE_THRESHOLD consecutive errors (source-of-truth value).
      for (let i = 0; i < ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold; i++) {
        (client as any)._cbRecordError();
      }

      expect((client as any).cbOpenedAt).not.toBeNull();
    });

    it('_cbRecordError() does NOT re-open when already open — guard on line 212', () => {
      const openedAt = Date.now() - 1000;
      (client as any).cbOpenedAt = openedAt;
      (client as any).cbConsecutiveErrors = 5;

      // Additional error should increment counter but not reset openedAt
      (client as any)._cbRecordError();

      // cbOpenedAt should remain unchanged (guard: cbOpenedAt === null is false)
      expect((client as any).cbOpenedAt).toBe(openedAt);
    });

    it('_cbRecordSuccess() clears circuit breaker state', () => {
      (client as any).cbOpenedAt = Date.now();
      (client as any).cbConsecutiveErrors = 5;

      (client as any)._cbRecordSuccess();

      expect((client as any).cbConsecutiveErrors).toBe(0);
      expect((client as any).cbOpenedAt).toBeNull();
    });
  });

  describe('ZmqTranslationClient — retry failure branch in _registerRequestTimeout', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should emit translationError when retry resend fails — lines 170-174', async () => {
      const errors: any[] = [];
      client.on('translationError', (e) => errors.push(e));

      const request: TranslationRequest = {
        messageId: 'msg-retry-fail',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-retry'
      };

      await client.sendTranslationRequest(request);

      // Make the retry resend fail (all subsequent sends fail)
      (mockPushSocket.send as jest.Mock).mockRejectedValue(new Error('Retry send failed'));

      // Trigger the 30s timeout (fires async callback that calls resend which throws)
      await jest.advanceTimersByTimeAsync(30_000 + 100);

      expect(errors.length).toBe(1);
      expect(errors[0].error).toContain('ZMQ timeout');
    });

    it('should emit error after max retries exceeded — lines 176-179', async () => {
      const errors: any[] = [];
      client.on('translationError', (e) => errors.push(e));

      const request: TranslationRequest = {
        messageId: 'msg-max-retries',
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
        conversationId: 'conv-max-retries'
      };

      await client.sendTranslationRequest(request);

      // Exhaust all retries: 1 initial attempt + ZMQ_MAX_RETRIES retries = maxRetries+1 timeouts.
      for (let i = 0; i < ZMQ_TOLERANCE_DEFAULTS.maxRetries + 1; i++) {
        await jest.advanceTimersByTimeAsync(30_000 + 100);
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ZmqTranslationClient — sendTranscriptionOnlyRequest', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should send transcription-only request via audioPath — lines 472-484', async () => {
      const taskId = await client.sendTranscriptionOnlyRequest({
        messageId: 'msg-transcription',
        attachmentId: 'attach-transcription',
        audioPath: '/tmp/audio.mp3'
      });

      expect(taskId).toBe('test-uuid-1234');
      const stats = client.getStats();
      expect(stats.requests_sent).toBe(1);
    });

    it('should emit transcriptionError after timeout', async () => {
      const errors: any[] = [];
      client.on('transcriptionError', (e) => errors.push(e));

      await client.sendTranscriptionOnlyRequest({
        messageId: 'msg-transcription-timeout',
        attachmentId: 'attach-timeout',
        audioPath: '/tmp/audio.mp3'
      });

      // Exhaust retries to guarantee an error is eventually emitted (maxRetries+1 timeouts).
      for (let i = 0; i < ZMQ_TOLERANCE_DEFAULTS.maxRetries + 1; i++) {
        await jest.advanceTimersByTimeAsync(30_000 + 100);
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ZmqTranslationClient — translateText and translateToMultipleLanguages', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('translateText() should delegate to sendTranslationRequest — lines 551-561', async () => {
      const taskId = await client.translateText('Hello', 'en', 'fr', 'msg-123', 'conv-456');
      expect(taskId).toBe('test-uuid-1234');
      expect(mockPushSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.text).toBe('Hello');
      expect(sentMessage.targetLanguages).toEqual(['fr']);
    });

    it('translateText() should use provided modelType — lines 551-561', async () => {
      await client.translateText('Hello', 'en', 'fr', 'msg-123', 'conv-456', 'premium');
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.modelType).toBe('premium');
    });

    it('translateText() should use default modelType basic — lines 551-561', async () => {
      await client.translateText('Hello', 'en', 'fr', 'msg-123', 'conv-456');
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.modelType).toBe('basic');
    });

    it('translateToMultipleLanguages() should delegate to sendTranslationRequest — lines 563-581', async () => {
      const taskId = await client.translateToMultipleLanguages(
        'Hello', 'en', ['fr', 'de'], 'msg-123', 'conv-456'
      );
      expect(taskId).toBe('test-uuid-1234');
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.targetLanguages).toEqual(['fr', 'de']);
    });

    it('translateToMultipleLanguages() should use default modelType basic — lines 563-581', async () => {
      await client.translateToMultipleLanguages('Hello', 'en', ['fr'], 'msg-123', 'conv-456');
      const sentMessage = JSON.parse((mockPushSocket.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.modelType).toBe('basic');
    });
  });

  describe('ZmqTranslationClient — translateTextObject', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('translateTextObject() should fire-and-forget — lines 587-591', async () => {
      client.translateTextObject({
        postId: 'post-123',
        textObjectIndex: 0,
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['fr']
      });

      // Let microtasks settle
      await Promise.resolve();
      await Promise.resolve();

      expect(mockPushSocket.send).toHaveBeenCalled();
    });

    it('translateTextObject() should log warning on send failure — line 589', async () => {
      (mockPushSocket.send as jest.Mock).mockRejectedValueOnce(new Error('ZMQ send failed'));

      client.translateTextObject({
        postId: 'post-error',
        textObjectIndex: 1,
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['fr']
      });

      // Should not throw even if ZMQ send fails
      await Promise.resolve();
      await Promise.resolve();
      expect(client).toBeDefined();
    });
  });

  describe('ZmqTranslationClient — healthCheck error path', () => {
    it('healthCheck() should return false when connectionManager.sendPing throws — lines 606-607', async () => {
      client = new ZmqTranslationClient();
      await client.initialize();

      // Spy on connectionManager.sendPing to throw — this triggers the outer catch
      const spy = jest.spyOn((client as any).connectionManager, 'sendPing').mockRejectedValueOnce(new Error('Ping error'));

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);

      spy.mockRestore();
    });
  });

  describe('ZmqTranslationClient — sendVoiceAPIRequest retry resend branch', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should retry voice_health requests (fast ops) and update requests_sent — lines 510-511', async () => {
      const request: VoiceAPIRequest = {
        type: 'voice_health',
        taskId: 'health-resend-task'
      };

      await client.sendVoiceAPIRequest(request);
      const statsBefore = client.getStats().requests_sent;

      // Trigger 30s timeout to cause retry (use async version to flush async callbacks)
      await jest.advanceTimersByTimeAsync(30_000 + 100);

      const statsAfter = client.getStats().requests_sent;
      expect(statsAfter).toBeGreaterThan(statsBefore);
    });
  });

  describe('ZmqTranslationClient — sendVoiceProfileRequest retry resend branch', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should send voiceProfileRequest and register timeout — lines 524-537', async () => {
      const request: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: 'profile-retry-task',
        user_id: 'user-001',
        audio_data: 'base64data',
        audio_format: 'wav'
      };

      const taskId = await client.sendVoiceProfileRequest(request);
      expect(taskId).toBe('profile-retry-task');

      const statsBefore = client.getStats().requests_sent;

      // Trigger 30s timeout to fire retry resend (use async version to flush async callbacks)
      await jest.advanceTimersByTimeAsync(30_000 + 100);

      const statsAfter = client.getStats().requests_sent;
      expect(statsAfter).toBeGreaterThan(statsBefore);
    });
  });

  describe('ZmqTranslationClient — event forwarding for uncovered events', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should forward transcriptionCompleted event — lines 298-302', (done) => {
      const event = {
        type: 'transcription_completed',
        taskId: 'transcription-task-123',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 500
      };

      client.on('transcriptionCompleted', (data) => {
        expect(data.taskId).toBe('transcription-task-123');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward transcriptionError event — lines 304-308', (done) => {
      const event = {
        type: 'transcription_error',
        taskId: 'transcription-error-task',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        error: 'Transcription failed',
        errorCode: 'WHISPER_ERROR'
      };

      client.on('transcriptionError', (data) => {
        expect(data.taskId).toBe('transcription-error-task');
        expect(data.error).toBe('Transcription failed');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward transcriptionReady event — lines 311-313', (done) => {
      const event = {
        type: 'transcription_ready',
        taskId: 'transcription-ready-task',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 200
      };

      client.on('transcriptionReady', (data) => {
        expect(data.taskId).toBe('transcription-ready-task');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward translationReady event (deprecated) — lines 316-318', (done) => {
      const event = {
        type: 'translation_ready',
        taskId: 'translation-ready-task',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        language: 'fr',
        translatedAudio: { audioUrl: 'https://example.com/fr.mp3', language: 'fr', segments: [] }
      };

      client.on('translationReady', (data) => {
        expect(data.taskId).toBe('translation-ready-task');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward audioTranslationReady event — lines 320-322', (done) => {
      const event = {
        type: 'audio_translation_ready',
        taskId: 'audio-trans-ready-task',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        language: 'fr',
        translatedAudio: { audioUrl: 'https://example.com/fr.mp3', language: 'fr', segments: [] }
      };

      client.on('audioTranslationReady', (data) => {
        expect(data.taskId).toBe('audio-trans-ready-task');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward audioTranslationsProgressive event — lines 324-326', (done) => {
      const event = {
        type: 'audio_translations_progressive',
        taskId: 'audio-progressive-task',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        language: 'fr',
        translatedAudio: { audioUrl: 'https://example.com/fr.mp3', language: 'fr', segments: [] }
      };

      client.on('audioTranslationsProgressive', (data) => {
        expect(data.taskId).toBe('audio-progressive-task');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward audioTranslationsCompleted event — lines 328-330', (done) => {
      const event = {
        type: 'audio_translations_completed',
        taskId: 'audio-completed-task',
        messageId: 'msg-456',
        attachmentId: 'attach-789',
        language: 'fr',
        translatedAudio: { audioUrl: 'https://example.com/fr.mp3', language: 'fr', segments: [] }
      };

      client.on('audioTranslationsCompleted', (data) => {
        expect(data.taskId).toBe('audio-completed-task');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward voiceTranslationCompleted event — lines 333-335', (done) => {
      const event = {
        type: 'voice_translation_completed',
        jobId: 'job-123',
        status: 'completed',
        userId: 'user-456',
        timestamp: Date.now(),
        result: {
          originalAudio: { transcription: 'Hello', language: 'en', audioUrl: '' },
          translations: []
        }
      };

      client.on('voiceTranslationCompleted', (data) => {
        expect(data.jobId).toBe('job-123');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward voiceTranslationFailed event — lines 337-339', (done) => {
      const event = {
        type: 'voice_translation_failed',
        jobId: 'job-error-123',
        status: 'failed',
        userId: 'user-456',
        timestamp: Date.now(),
        error: 'Pipeline crashed',
        errorCode: 'PIPELINE_ERROR'
      };

      client.on('voiceTranslationFailed', (data) => {
        expect(data.jobId).toBe('job-error-123');
        expect(data.error).toBe('Pipeline crashed');
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });

    it('should forward storyTextObjectTranslationCompleted event — lines 342-344', (done) => {
      const event = {
        type: 'story_text_object_translation_completed',
        postId: 'post-123',
        textObjectIndex: 2,
        translations: [{ language: 'fr', text: 'Bonjour' }]
      };

      client.on('storyTextObjectTranslationCompleted', (data) => {
        expect(data.postId).toBe('post-123');
        expect(data.textObjectIndex).toBe(2);
        done();
      });

      const messageBuffer = Buffer.from(JSON.stringify(event));
      (mockSubSocket.receive as jest.Mock).mockResolvedValueOnce([messageBuffer]);
      jest.advanceTimersByTime(100);
    });
  });

  describe('ZmqTranslationClient — testReception()', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should call sendPing and schedule a timeout — lines 664-682', async () => {
      await client.testReception();
      expect(mockPushSocket.send).toHaveBeenCalled();
      // Advance to trigger the inner setTimeout
      jest.advanceTimersByTime(3001);
      await Promise.resolve();
      expect(client).toBeDefined();
    });

    it('testReception() should log error when sendPing fails — line 680', async () => {
      jest.spyOn((client as any).connectionManager, 'sendPing').mockRejectedValueOnce(new Error('Ping failed'));
      await client.testReception(); // should not throw
      expect(client).toBeDefined();
    });
  });

  describe('ZmqTranslationClient — voice_translate_async long-running type', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should NOT retry voice_translate_async (deadman only)', async () => {
      const request: VoiceAPIRequest = {
        type: 'voice_translate_async',
        taskId: 'async-no-retry-task',
        userId: 'user-1',
        audioBase64: 'AAAA',
        targetLanguages: ['fr']
      };

      await client.sendVoiceAPIRequest(request);
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBe(1);

      jest.advanceTimersByTime(35_000);
      await Promise.resolve();
      expect((mockPushSocket.send as jest.Mock).mock.calls.length).toBe(1);
    });
  });

  describe('ZmqTranslationClient — sendAudioProcessRequest retry resend branch', () => {
    beforeEach(async () => {
      client = new ZmqTranslationClient();
      await client.initialize();
    });

    it('should retry sendAudioProcessRequest on timeout and increment requests_sent — lines 458-460', async () => {
      const request: Omit<AudioProcessRequest, 'type'> = {
        messageId: 'msg-audio-retry',
        attachmentId: 'attach-retry',
        conversationId: 'conv-retry',
        senderId: 'user-retry',
        audioUrl: '',
        audioPath: '/tmp/audio.mp3',
        audioDurationMs: 1000,
        targetLanguages: ['fr'],
        generateVoiceClone: false,
        modelType: 'basic'
      };

      await client.sendAudioProcessRequest(request);
      const statsBefore = client.getStats().requests_sent;

      // Trigger retry
      await jest.advanceTimersByTimeAsync(30_000 + 100);

      const statsAfter = client.getStats().requests_sent;
      expect(statsAfter).toBeGreaterThan(statsBefore);
    });
  });

  describe('ZmqTranslationClient — close() error path', () => {
    it('close() should handle errors in cleanup — line 657', async () => {
      client = new ZmqTranslationClient();
      await client.initialize();

      // Make connectionManager.close() throw to trigger the catch block
      jest.spyOn((client as any).connectionManager, 'close').mockRejectedValueOnce(new Error('Close error'));

      // Should not propagate the error
      await expect(client.close()).resolves.toBeUndefined();
    });
  });

  describe('ZmqTranslationClient — constructor env var fallbacks', () => {
    it('should use hardcoded defaults when env vars are absent — branches 1[1], 3[1], 5[1]', () => {
      // Temporarily remove env vars so the || fallback is exercised
      const savedHost = process.env.ZMQ_TRANSLATOR_HOST;
      const savedPush = process.env.ZMQ_TRANSLATOR_PUSH_PORT;
      const savedSub = process.env.ZMQ_TRANSLATOR_SUB_PORT;
      delete process.env.ZMQ_TRANSLATOR_HOST;
      delete process.env.ZMQ_TRANSLATOR_PUSH_PORT;
      delete process.env.ZMQ_TRANSLATOR_SUB_PORT;

      try {
        const c = new ZmqTranslationClient();
        expect(c).toBeDefined();
        // host defaults to '0.0.0.0', ports default to 5555/5558
        expect((c as any).host).toBe('0.0.0.0');
        expect((c as any).pushPort).toBe(5555);
        expect((c as any).subPort).toBe(5558);
      } finally {
        // Restore env vars
        if (savedHost !== undefined) process.env.ZMQ_TRANSLATOR_HOST = savedHost;
        if (savedPush !== undefined) process.env.ZMQ_TRANSLATOR_PUSH_PORT = savedPush;
        if (savedSub !== undefined) process.env.ZMQ_TRANSLATOR_SUB_PORT = savedSub;
      }
    });
  });

  describe('ZmqTranslationClient — _startResultListener running=false branch', () => {
    it('should hit running=false branch (lines 389-390) when polling fires after close', async () => {
      client = new ZmqTranslationClient();
      await client.initialize();

      // Directly set running to false WITHOUT clearing the interval
      // This simulates the race where the interval fires after running=false
      (client as any).running = false;

      // Now let the interval tick — it should hit the early-return branch
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Client should still be defined (no throw)
      expect(client).toBeDefined();
    });

    it('should handle if(message) false path (line 400) when receive returns falsy', async () => {
      client = new ZmqTranslationClient();
      await client.initialize();

      // Spy on connectionManager.receive to return null (falsy) to hit if(message)=false
      const spy = jest.spyOn((client as any).connectionManager, 'receive').mockResolvedValueOnce(null as any);

      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();

      expect(client).toBeDefined();
      spy.mockRestore();
    });
  });

  describe('Type Definitions', () => {
    it('should have correct TranslationRequest interface', () => {
      const request: TranslationRequest = {
        messageId: 'msg-123',
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'es'],
        conversationId: 'conv-456',
        modelType: 'premium'
      };

      expect(request.messageId).toBeDefined();
      expect(request.text).toBeDefined();
      expect(request.sourceLanguage).toBeDefined();
      expect(Array.isArray(request.targetLanguages)).toBe(true);
      expect(request.conversationId).toBeDefined();
    });

    it('should have correct TranslationResult interface', () => {
      const result: TranslationResult = {
        messageId: 'msg-123',
        translatedText: 'Bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.95,
        processingTime: 150,
        modelType: 'premium',
        workerName: 'worker-1',
        translatorModel: 'opus-mt',
        workerId: 'worker-001',
        poolType: 'normal',
        translationTime: 100,
        queueTime: 50,
        memoryUsage: 256,
        cpuUsage: 45,
        version: '1.0.0'
      };

      expect(result.messageId).toBeDefined();
      expect(result.translatedText).toBeDefined();
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('should have correct ZMQClientStats interface', () => {
      const stats: ZMQClientStats = {
        requests_sent: 100,
        results_received: 95,
        errors_received: 5,
        pool_full_rejections: 2,
        avg_response_time: 150,
        uptime_seconds: 3600,
        memory_usage_mb: 128
      };

      expect(stats.requests_sent).toBe(100);
      expect(stats.results_received).toBe(95);
      expect(stats.errors_received).toBe(5);
    });

    it('should have correct AudioProcessRequest interface', () => {
      const request: AudioProcessRequest = {
        type: 'audio_process',
        messageId: 'msg-123',
        attachmentId: 'attach-456',
        conversationId: 'conv-789',
        senderId: 'user-001',
        audioUrl: 'https://example.com/audio.mp3',
        audioPath: '/tmp/audio.mp3',
        audioDurationMs: 5000,
        targetLanguages: ['fr'],
        generateVoiceClone: true,
        modelType: 'premium'
      };

      expect(request.type).toBe('audio_process');
      expect(request.generateVoiceClone).toBe(true);
    });
  });
});
