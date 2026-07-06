/**
 * Unit tests for AudioTranslateService
 *
 * Covers: event handlers, _sendRequest lifecycle (timeout / send-failure / success),
 * every public API method, DB persistence helpers, utility methods, and the singleton.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// ─── logger mock ────────────────────────────────────────────────────────────
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

// ─── attachment-audio types mock ─────────────────────────────────────────────
jest.mock('@meeshy/shared/types/attachment-audio', () => ({}));

// ─── ZMQ client mock ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<any>;

class MockZmqClient extends EventEmitter {
  sendVoiceAPIRequest: MockFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  sendTranscriptionOnlyRequest: MockFn = jest.fn<() => Promise<string>>();
}

// ─── Prisma mock factory ──────────────────────────────────────────────────────
function createMockPrisma() {
  return {
    messageAttachment: {
      findUnique: jest.fn() as MockFn,
      update: jest.fn<() => Promise<any>>().mockResolvedValue({}) as MockFn,
    },
    userVoiceModel: {
      findUnique: jest.fn() as MockFn,
      upsert: jest.fn() as MockFn,
    },
  };
}

// ─── Import after mocks ───────────────────────────────────────────────────────
import {
  AudioTranslateService,
  AudioTranslateError,
  getAudioTranslateService,
  resetAudioTranslateService,
} from '../../../services/AudioTranslateService';

// ─── Shared fixtures ──────────────────────────────────────────────────────────
const VOICE_TRANSLATE_SYNC_TIMEOUT = 16 * 60_000;
const ASYNC_SUBMIT_TIMEOUT = 5_000;
const DEFAULT_TIMEOUT = 60_000;

const mockTranslationResult = {
  translationId: 'trans-001',
  originalAudio: {
    transcription: 'Hello world',
    language: 'en',
    durationMs: 2000,
    confidence: 0.95,
  },
  translations: [
    {
      targetLanguage: 'fr',
      translatedText: 'Bonjour le monde',
      audioUrl: 'https://cdn.meeshy.me/audio/fr.mp3',
      durationMs: 2100,
      voiceCloned: true,
      voiceQuality: 0.92,
    },
  ],
  processingTimeMs: 3500,
};

const mockTranscriptionResult = {
  taskId: 'task-transcribe-111',
  messageId: 'msg-111',
  attachmentId: 'att-111',
  transcription: {
    text: 'Hello from audio',
    language: 'en',
    confidence: 0.97,
    durationMs: 1500,
    source: 'whisper',
    segments: [{ text: 'Hello from audio', startMs: 0, endMs: 1500 }],
  },
  processingTimeMs: 800,
};

// ─── Helper: emit voiceAPISuccess after capturing the taskId ──────────────────
function emitVoiceSuccess(zmq: MockZmqClient, result: any): void {
  const calls = zmq.sendVoiceAPIRequest.mock.calls;
  const req = calls[calls.length - 1][0] as { taskId: string };
  zmq.emit('voiceAPISuccess', { taskId: req.taskId, result, processingTimeMs: 100 });
}

function emitVoiceError(zmq: MockZmqClient, error: string, errorCode: string): void {
  const calls = zmq.sendVoiceAPIRequest.mock.calls;
  const req = calls[calls.length - 1][0] as { taskId: string };
  zmq.emit('voiceAPIError', { taskId: req.taskId, error, errorCode });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AudioTranslateService', () => {
  let service: AudioTranslateService;
  let zmq: MockZmqClient;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.useFakeTimers();
    resetAudioTranslateService();
    zmq = new MockZmqClient();
    prisma = createMockPrisma();
    service = new AudioTranslateService(prisma as any, zmq as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    resetAudioTranslateService();
  });

  // ── constructor / initialization ──────────────────────────────────────────

  describe('initialization', () => {
    it('is healthy immediately after construction', () => {
      expect(service.isHealthy()).toBe(true);
    });

    it('registers 5 event listeners on the ZMQ client', () => {
      expect(zmq.listenerCount('voiceAPISuccess')).toBe(1);
      expect(zmq.listenerCount('voiceAPIError')).toBe(1);
      expect(zmq.listenerCount('voiceJobProgress')).toBe(1);
      expect(zmq.listenerCount('transcriptionCompleted')).toBe(1);
      expect(zmq.listenerCount('transcriptionError')).toBe(1);
    });

    it('starts with zero pending requests', () => {
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── _handleSuccess / _handleError (via voiceAPISuccess/Error events) ────────

  describe('voiceAPISuccess event', () => {
    it('resolves a pending request and removes it from the map', async () => {
      const promise = service.getHealthStatus();
      emitVoiceSuccess(zmq, { healthy: true });
      const result = await promise;
      expect(result).toEqual({ healthy: true });
      expect(service.getPendingRequestsCount()).toBe(0);
    });

    it('ignores events with an unknown taskId', () => {
      expect(() => {
        zmq.emit('voiceAPISuccess', { taskId: 'unknown', result: {}, processingTimeMs: 0 });
      }).not.toThrow();
    });
  });

  describe('voiceAPIError event', () => {
    it('rejects a pending request with AudioTranslateError', async () => {
      const promise = service.getHealthStatus();
      emitVoiceError(zmq, 'Service down', 'SERVICE_UNAVAILABLE');
      await expect(promise).rejects.toBeInstanceOf(AudioTranslateError);
    });

    it('sets the correct error code on rejection', async () => {
      const promise = service.getHealthStatus();
      emitVoiceError(zmq, 'Service down', 'SERVICE_UNAVAILABLE');
      await expect(promise).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    });

    it('removes the request from pending map on error', async () => {
      const promise = service.getHealthStatus();
      emitVoiceError(zmq, 'err', 'CODE');
      await promise.catch(() => {});
      expect(service.getPendingRequestsCount()).toBe(0);
    });

    it('ignores error events with an unknown taskId', () => {
      expect(() => {
        zmq.emit('voiceAPIError', { taskId: 'unknown', error: 'x', errorCode: 'Y' });
      }).not.toThrow();
    });
  });

  // ── voiceJobProgress is re-emitted ──────────────────────────────────────────

  describe('voiceJobProgress event', () => {
    it('re-emits voiceJobProgress as jobProgress on the service itself', () => {
      const listener = jest.fn();
      service.on('jobProgress', listener);
      const payload = { jobId: 'job-1', progress: 50 };
      zmq.emit('voiceJobProgress', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  // ── _sendRequest: timeout ─────────────────────────────────────────────────

  describe('_sendRequest timeout', () => {
    it('rejects with TIMEOUT code when the timeout fires', async () => {
      const promise = service.getHealthStatus(); // 5_000 ms timeout
      jest.advanceTimersByTime(5001);
      await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT', message: 'Request timeout' });
    });

    it('removes the request from pending on timeout', async () => {
      const promise = service.getHealthStatus();
      jest.advanceTimersByTime(5001);
      await promise.catch(() => {});
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── _sendRequest: ZMQ send failure ──────────────────────────────────────────

  describe('_sendRequest ZMQ send failure', () => {
    it('rejects with SEND_FAILED when sendVoiceAPIRequest rejects', async () => {
      zmq.sendVoiceAPIRequest.mockRejectedValue(new Error('socket closed'));
      const promise = service.getHealthStatus();
      await expect(promise).rejects.toMatchObject({ code: 'SEND_FAILED' });
    });

    it('removes the request from pending on send failure', async () => {
      zmq.sendVoiceAPIRequest.mockRejectedValue(new Error('socket closed'));
      const promise = service.getHealthStatus();
      await promise.catch(() => {});
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── transcribeOnly ────────────────────────────────────────────────────────

  describe('transcribeOnly', () => {
    it('throws INVALID_REQUEST when neither audioPath nor audioBase64 is given', async () => {
      await expect(service.transcribeOnly('user-1', {}))
        .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    });

    it('throws INVALID_REQUEST when audioBase64 is given without audioFormat', async () => {
      await expect(service.transcribeOnly('user-1', { audioBase64: 'base64data' }))
        .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    });

    it('resolves with transcription result on transcriptionCompleted event', async () => {
      const taskId = 'task-tc-999';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-1', { audioPath: '/uploads/audio.mp3' });

      // flush microtasks so the async Promise executor reaches pendingRequests.set(...)
      await Promise.resolve();
      await Promise.resolve();

      zmq.emit('transcriptionCompleted', { ...mockTranscriptionResult, taskId });

      const result = await promise;
      expect(result.text).toBe('Hello from audio');
      expect(result.language).toBe('en');
    });

    it('rejects on transcriptionError event', async () => {
      const taskId = 'task-tc-fail';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-1', { audioPath: '/audio.mp3' });

      await Promise.resolve();
      await Promise.resolve();

      zmq.emit('transcriptionError', {
        taskId,
        messageId: 'msg-x',
        attachmentId: 'att-x',
        error: 'Whisper crashed',
        errorCode: 'WHISPER_ERROR',
      });

      await expect(promise).rejects.toMatchObject({ code: 'WHISPER_ERROR' });
    });

    it('rejects with SEND_FAILED if sendTranscriptionOnlyRequest throws', async () => {
      zmq.sendTranscriptionOnlyRequest.mockRejectedValue(new Error('ZMQ down'));
      await expect(service.transcribeOnly('user-1', { audioPath: '/audio.mp3' }))
        .rejects.toMatchObject({ code: 'SEND_FAILED' });
    });

    it('accepts audioBase64 + audioFormat without throwing', async () => {
      const taskId = 'task-b64';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-1', {
        audioBase64: 'AABB==',
        audioFormat: 'wav',
      });

      await Promise.resolve();
      await Promise.resolve();

      zmq.emit('transcriptionCompleted', { ...mockTranscriptionResult, taskId });

      const result = await promise;
      expect(result.text).toBe('Hello from audio');
    });

    it('calls prisma.messageAttachment.update when saveToDatabase is true', async () => {
      const taskId = 'task-save';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-1', {
        audioPath: '/audio.mp3',
        attachmentId: 'att-save-99',
        saveToDatabase: true,
      });

      await Promise.resolve();
      await Promise.resolve();

      zmq.emit('transcriptionCompleted', { ...mockTranscriptionResult, taskId });

      await promise;

      expect(prisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'att-save-99' } })
      );
    });
  });

  // ── transcribeAttachment ──────────────────────────────────────────────────

  describe('transcribeAttachment', () => {
    it('returns cached transcription when one already exists in DB', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValueOnce({
        transcription: {
          text: 'Cached text',
          language: 'en',
          confidence: 0.9,
          durationMs: 1000,
          source: 'whisper',
          segments: [],
        },
      });

      const result = await service.transcribeAttachment('att-cached');

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Cached text');
      expect(zmq.sendTranscriptionOnlyRequest).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when attachment does not exist', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.transcribeAttachment('att-missing');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });

    it('returns INVALID_TYPE for non-audio attachment', async () => {
      // first call returns no transcription, second returns the attachment row
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ id: 'att-img', fileUrl: '/img.png', filePath: null, mimeType: 'image/png', messageId: 'msg-1' });

      const result = await service.transcribeAttachment('att-img');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TYPE');
    });
  });

  // ── translateSync ─────────────────────────────────────────────────────────

  describe('translateSync', () => {
    it('sends a voice_translate request and resolves with the result', async () => {
      const promise = service.translateSync('user-1', {
        audioPath: '/audio.mp3',
        targetLanguages: ['fr'],
      });

      emitVoiceSuccess(zmq, mockTranslationResult);

      const result = await promise;
      expect(result.translationId).toBe('trans-001');
      expect(result.translations[0].targetLanguage).toBe('fr');
    });

    it('uses voice_translate request type', async () => {
      const promise = service.translateSync('user-1', { targetLanguages: ['es'] });
      emitVoiceSuccess(zmq, mockTranslationResult);
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_translate');
    });

    it('defaults generateVoiceClone to true', async () => {
      const promise = service.translateSync('user-1', { targetLanguages: ['de'] });
      emitVoiceSuccess(zmq, mockTranslationResult);
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.generateVoiceClone).toBe(true);
    });

    it('forwards existingTranscription as mobileTranscription', async () => {
      const existingTranscription = {
        text: 'Pre-transcribed',
        language: 'en',
        confidence: 0.98,
        source: 'mobile',
        segments: [],
      };

      const promise = service.translateSync('user-1', {
        targetLanguages: ['fr'],
        existingTranscription,
      });
      emitVoiceSuccess(zmq, mockTranslationResult);
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.mobileTranscription?.text).toBe('Pre-transcribed');
    });

    it('calls prisma.messageAttachment.update when saveToDatabase and attachmentId given', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({ translations: null });

      const promise = service.translateSync('user-1', {
        targetLanguages: ['fr'],
        attachmentId: 'att-to-save',
        saveToDatabase: true,
      });
      emitVoiceSuccess(zmq, mockTranslationResult);
      await promise;

      expect(prisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'att-to-save' } })
      );
    });

    it('uses VOICE_TRANSLATE_SYNC_TIMEOUT for the request', async () => {
      const promise = service.translateSync('user-1', { targetLanguages: ['fr'] });
      // Advance less than the sync timeout — should NOT timeout
      jest.advanceTimersByTime(VOICE_TRANSLATE_SYNC_TIMEOUT - 1);
      emitVoiceSuccess(zmq, mockTranslationResult);
      const result = await promise;
      expect(result.translationId).toBe('trans-001');
    });
  });

  // ── translateAsync ─────────────────────────────────────────────────────

  describe('translateAsync', () => {
    it('sends a voice_translate_async request', async () => {
      const promise = service.translateAsync('user-1', { targetLanguages: ['fr'] });
      emitVoiceSuccess(zmq, { jobId: 'job-async-1', status: 'pending' });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_translate_async');
    });

    it('defaults priority to 1', async () => {
      const promise = service.translateAsync('user-1', { targetLanguages: ['fr'] });
      emitVoiceSuccess(zmq, { jobId: 'job-1', status: 'pending' });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.priority).toBe(1);
    });

    it('resolves with jobId and status', async () => {
      const promise = service.translateAsync('user-1', { targetLanguages: ['es'] });
      emitVoiceSuccess(zmq, { jobId: 'job-async-2', status: 'pending' });
      const result = await promise;

      expect(result.jobId).toBe('job-async-2');
      expect(result.status).toBe('pending');
    });

    it('uses ASYNC_SUBMIT_TIMEOUT', async () => {
      const promise = service.translateAsync('user-1', { targetLanguages: ['fr'] });
      jest.advanceTimersByTime(ASYNC_SUBMIT_TIMEOUT + 1);
      await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    });
  });

  // ── translateAttachment ───────────────────────────────────────────────────

  describe('translateAttachment', () => {
    it('returns cached result when all requested languages already exist', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        transcription: { text: 'Hi', language: 'en', confidence: 0.9, durationMs: 1000 },
        translations: { fr: { transcription: 'Salut', url: '/fr.mp3', durationMs: 1100, cloned: true, quality: 0.9 } },
      });

      const result = await service.translateAttachment('att-cached', { targetLanguages: ['fr'] });

      expect(result.success).toBe(true);
      expect(result.data?.translations[0].targetLanguage).toBe('fr');
      expect(zmq.sendVoiceAPIRequest).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when attachment is missing', async () => {
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null, translations: null })
        .mockResolvedValueOnce(null);

      const result = await service.translateAttachment('att-missing', { targetLanguages: ['fr'] });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });

    it('returns INVALID_TYPE for non-audio attachment', async () => {
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null, translations: null })
        .mockResolvedValueOnce({
          id: 'att-img2',
          fileUrl: '/video.mp4',
          filePath: null,
          mimeType: 'video/mp4',
          uploadedBy: 'user-1',
        });

      const result = await service.translateAttachment('att-img2', { targetLanguages: ['fr'] });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TYPE');
    });
  });

  // ── getJobStatus ──────────────────────────────────────────────────────────

  describe('getJobStatus', () => {
    it('uses voice_job_status request type', async () => {
      const promise = service.getJobStatus('user-1', 'job-999');
      emitVoiceSuccess(zmq, { jobId: 'job-999', status: 'completed' });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_job_status');
      expect(req.jobId).toBe('job-999');
    });
  });

  // ── cancelJob ────────────────────────────────────────────────────────────

  describe('cancelJob', () => {
    it('uses voice_job_cancel request type', async () => {
      const promise = service.cancelJob('user-1', 'job-888');
      emitVoiceSuccess(zmq, { success: true, message: 'Cancelled' });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_job_cancel');
      expect(req.jobId).toBe('job-888');
    });
  });

  // ── analyzeVoice ─────────────────────────────────────────────────────────

  describe('analyzeVoice', () => {
    it('uses voice_analyze request type', async () => {
      const promise = service.analyzeVoice('user-1', { audioPath: '/audio.mp3' });
      emitVoiceSuccess(zmq, { analysisId: 'an-1', features: {} });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_analyze');
      expect(req.userId).toBe('user-1');
    });
  });

  // ── compareVoices ─────────────────────────────────────────────────────────

  describe('compareVoices', () => {
    it('uses voice_compare request type', async () => {
      const promise = service.compareVoices('user-1', {
        audioPath_1: '/a.mp3',
        audioPath_2: '/b.mp3',
      });
      emitVoiceSuccess(zmq, { similarity: 0.87 });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_compare');
    });
  });

  // ── submitFeedback ────────────────────────────────────────────────────────

  describe('submitFeedback', () => {
    it('uses voice_feedback request type', async () => {
      const promise = service.submitFeedback('user-1', {
        translationId: 'trans-1',
        rating: 4,
      });
      emitVoiceSuccess(zmq, { success: true, feedbackId: 'fb-1' });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_feedback');
      expect(req.translationId).toBe('trans-1');
      expect(req.rating).toBe(4);
    });
  });

  // ── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('uses voice_history request type with default limit/offset', async () => {
      const promise = service.getHistory('user-1');
      emitVoiceSuccess(zmq, { history: [], total: 0 });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_history');
      expect(req.limit).toBe(20);
      expect(req.offset).toBe(0);
    });

    it('accepts custom limit and offset', async () => {
      const promise = service.getHistory('user-1', { limit: 5, offset: 10 });
      emitVoiceSuccess(zmq, { history: [], total: 0 });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.limit).toBe(5);
      expect(req.offset).toBe(10);
    });
  });

  // ── getUserStats ──────────────────────────────────────────────────────────

  describe('getUserStats', () => {
    it('defaults period to "all"', async () => {
      const promise = service.getUserStats('user-1');
      emitVoiceSuccess(zmq, { userId: 'user-1', totalTranslations: 42 });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_stats');
      expect(req.period).toBe('all');
    });
  });

  // ── getSystemMetrics ──────────────────────────────────────────────────────

  describe('getSystemMetrics', () => {
    it('uses voice_admin_metrics request type', async () => {
      const promise = service.getSystemMetrics('admin-1');
      emitVoiceSuccess(zmq, { queueDepth: 0, workerCount: 4 });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_admin_metrics');
      expect(req.userId).toBe('admin-1');
    });
  });

  // ── getHealthStatus ───────────────────────────────────────────────────────

  describe('getHealthStatus', () => {
    it('uses voice_health request type', async () => {
      const promise = service.getHealthStatus();
      emitVoiceSuccess(zmq, { status: 'ok', latencyMs: 5 });
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_health');
    });

    it('resolves with health data', async () => {
      const promise = service.getHealthStatus();
      emitVoiceSuccess(zmq, { status: 'ok', latencyMs: 5 });
      const result = await promise;
      expect(result).toMatchObject({ status: 'ok' });
    });
  });

  // ── getSupportedLanguages ─────────────────────────────────────────────────

  describe('getSupportedLanguages', () => {
    it('uses voice_languages request type', async () => {
      const promise = service.getSupportedLanguages();
      emitVoiceSuccess(zmq, [{ code: 'fr', name: 'French' }]);
      await promise;

      const req = zmq.sendVoiceAPIRequest.mock.calls[0][0] as any;
      expect(req.type).toBe('voice_languages');
    });
  });

  // ── getVoiceProfile ───────────────────────────────────────────────────────

  describe('getVoiceProfile', () => {
    it('queries prisma.userVoiceModel.findUnique by userId', async () => {
      const mockProfile = { userId: 'user-1', qualityScore: 0.88 };
      prisma.userVoiceModel.findUnique.mockResolvedValue(mockProfile);

      const result = await service.getVoiceProfile('user-1');

      expect(prisma.userVoiceModel.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(result).toEqual(mockProfile);
    });

    it('returns null when no profile exists', async () => {
      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
      const result = await service.getVoiceProfile('user-no-profile');
      expect(result).toBeNull();
    });
  });

  // ── saveVoiceProfile ──────────────────────────────────────────────────────

  describe('saveVoiceProfile', () => {
    it('calls prisma.userVoiceModel.upsert with the correct userId', async () => {
      prisma.userVoiceModel.upsert.mockResolvedValue({ userId: 'user-1' });

      await service.saveVoiceProfile('user-1', { qualityScore: 0.9, audioCount: 5 });

      expect(prisma.userVoiceModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ userId: 'user-1', qualityScore: 0.9 }),
          update: expect.objectContaining({ qualityScore: 0.9 }),
        })
      );
    });

    it('generates a profileId prefixed with "vfp_"', async () => {
      prisma.userVoiceModel.upsert.mockResolvedValue({});

      await service.saveVoiceProfile('user-abc', {});

      const createArg = (prisma.userVoiceModel.upsert.mock.calls[0][0] as any).create;
      expect(createArg.profileId).toBe('vfp_user-abc');
    });
  });

  // ── getAttachmentWithTranscription ────────────────────────────────────────

  describe('getAttachmentWithTranscription', () => {
    it('returns null when attachment does not exist', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      const result = await service.getAttachmentWithTranscription('att-missing');
      expect(result).toBeNull();
    });

    it('returns attachment with parsed transcription and translatedAudios', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        messageId: 'msg-1',
        fileName: 'audio.mp3',
        fileUrl: '/att/audio.mp3',
        mimeType: 'audio/mpeg',
        fileSize: 2048,
        duration: 5000,
        transcription: { text: 'Hi', language: 'en', confidence: 0.9, source: 'whisper', durationMs: 1000, segments: [] },
        translations: {
          fr: { type: 'audio', transcription: 'Salut', url: '/fr.mp3', path: '/fr.mp3', durationMs: 1100, format: 'mp3', cloned: true, quality: 0.88 },
        },
        createdAt: new Date('2025-01-01'),
      });

      const result = await service.getAttachmentWithTranscription('att-1');

      expect(result).not.toBeNull();
      expect(result!.transcription?.text).toBe('Hi');
      expect(result!.translatedAudios).toHaveLength(1);
      expect(result!.translatedAudios[0].targetLanguage).toBe('fr');
    });
  });

  // ── getPendingRequestsCount ───────────────────────────────────────────────

  describe('getPendingRequestsCount', () => {
    it('increases as requests are added', () => {
      // fire-and-forget 3 concurrent requests
      service.getHealthStatus();
      service.getSupportedLanguages();
      service.getUserStats('user-1');
      expect(service.getPendingRequestsCount()).toBe(3);
    });

    it('decreases when a request resolves', async () => {
      const promise = service.getHealthStatus();
      emitVoiceSuccess(zmq, { status: 'ok' });
      await promise;
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── cleanupTimedOutRequests ───────────────────────────────────────────────

  describe('cleanupTimedOutRequests', () => {
    it('returns 0 when no stale requests exist', () => {
      expect(service.cleanupTimedOutRequests()).toBe(0);
    });

    it('rejects stale requests and reports count', async () => {
      // translateSync uses VOICE_TRANSLATE_SYNC_TIMEOUT (16 min) — won't auto-timeout at 2 min
      const promise = service.translateSync('user-1', { targetLanguages: ['fr'] });

      // advance past the cleanup threshold (DEFAULT_TIMEOUT * 2 = 120_000 ms)
      jest.advanceTimersByTime(DEFAULT_TIMEOUT * 2 + 1);

      const cleaned = service.cleanupTimedOutRequests();
      expect(cleaned).toBe(1);

      await expect(promise).rejects.toMatchObject({ code: 'CLEANUP_TIMEOUT' });
    });

    it('does not clean up requests that are still within threshold', () => {
      service.translateSync('user-1', { targetLanguages: ['fr'] });

      jest.advanceTimersByTime(DEFAULT_TIMEOUT); // only 1× threshold, not 2×

      const cleaned = service.cleanupTimedOutRequests();
      expect(cleaned).toBe(0);
      expect(service.getPendingRequestsCount()).toBe(1);
    });
  });

  // ── transcribeOnly: timeout branch ───────────────────────────────────────

  describe('transcribeOnly timeout', () => {
    it('rejects with TIMEOUT after 30 seconds of no response', async () => {
      const taskId = 'task-timeout-tc';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-1', { audioPath: '/audio.mp3' });

      // flush microtasks so the timeout is registered in the pending map
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(30001);

      await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT', message: 'Transcription timeout' });
    });
  });

  // ── transcribeAttachment: success path ───────────────────────────────────

  describe('transcribeAttachment success path', () => {
    it('transcribes an audio attachment end-to-end', async () => {
      const taskId = 'task-att-transcribe';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      // first call: no existing transcription; second call: the attachment row
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({
          id: 'att-audio',
          fileUrl: '/api/v1/attachments/file/audio.mp3',
          filePath: null,
          mimeType: 'audio/mpeg',
          messageId: 'msg-att',
        });

      const promise = service.transcribeAttachment('att-audio');

      // flush microtasks so the async pending is registered
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      zmq.emit('transcriptionCompleted', {
        taskId,
        messageId: 'msg-att',
        attachmentId: 'att-audio',
        transcription: {
          text: 'Attachment audio text',
          language: 'fr',
          confidence: 0.91,
          durationMs: 3000,
          source: 'whisper',
        },
        processingTimeMs: 1200,
      });

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Attachment audio text');
    });

    it('uses filePath when present to build the absolute audio path', async () => {
      const taskId = 'task-filepath';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({
          id: 'att-fp',
          fileUrl: '/api/v1/attachments/file/audio.mp3',
          filePath: 'user-uploads/audio.mp3',
          mimeType: 'audio/ogg',
          messageId: 'msg-fp',
        });

      const promise = service.transcribeAttachment('att-fp');

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const sentRequest = (zmq.sendTranscriptionOnlyRequest.mock.calls[0][0] as any);
      expect(sentRequest.audioPath).toContain('user-uploads/audio.mp3');

      zmq.emit('transcriptionCompleted', {
        taskId,
        messageId: 'msg-fp',
        attachmentId: 'att-fp',
        transcription: { text: 'path test', language: 'en', confidence: 0.85, durationMs: 500, source: 'whisper' },
        processingTimeMs: 300,
      });

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('returns TRANSCRIPTION_FAILED when transcription throws', async () => {
      zmq.sendTranscriptionOnlyRequest.mockRejectedValue(new Error('ZMQ died'));

      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({
          id: 'att-err',
          fileUrl: '/api/v1/attachments/file/err.mp3',
          filePath: null,
          mimeType: 'audio/mpeg',
          messageId: 'msg-err',
        });

      const result = await service.transcribeAttachment('att-err');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TRANSCRIPTION_FAILED');
    });
  });

  // ── translateAttachment: partial-cache success path ───────────────────────

  describe('translateAttachment partial cache + translation', () => {
    it('translates only missing languages and merges with cached ones', async () => {
      // fr already cached, de is missing.
      // translateAttachment awaits 2 findUnique calls before reaching translateSync.
      // _saveTranslationResult (inside translateSync) needs a 3rd findUnique + update.
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({
          transcription: { text: 'Hello', language: 'en', confidence: 0.9, durationMs: 1000 },
          translations: {
            fr: { transcription: 'Bonjour', url: '/fr.mp3', durationMs: 1100, cloned: true, quality: 0.9 },
          },
        }) // #1: existing translations check
        .mockResolvedValueOnce({
          id: 'att-partial',
          fileUrl: '/api/v1/attachments/file/audio.mp3',
          filePath: null,
          mimeType: 'audio/mpeg',
          uploadedBy: 'user-owner',
        }) // #2: attachment row
        .mockResolvedValueOnce({ translations: null }); // #3: _saveTranslationResult internal

      const deTranslation = {
        targetLanguage: 'de',
        translatedText: 'Hallo',
        audioUrl: '/de.mp3',
        durationMs: 1200,
        voiceCloned: true,
        voiceQuality: 0.88,
      };

      const resultPromise = service.translateAttachment('att-partial', {
        targetLanguages: ['fr', 'de'],
      });

      // 2 microtask flushes to advance past the 2 awaited findUnique calls so
      // that sendVoiceAPIRequest has been called before we emit the response.
      await Promise.resolve();
      await Promise.resolve();

      emitVoiceSuccess(zmq, {
        ...mockTranslationResult,
        translations: [deTranslation],
      });

      const result = await resultPromise;

      expect(result.success).toBe(true);
      // should include both fr (cached) and de (newly translated)
      const langs = result.data!.translations.map((t: any) => t.targetLanguage);
      expect(langs).toContain('de');
      expect(langs).toContain('fr');
    });

    it('returns TRANSLATION_FAILED when translateSync throws', async () => {
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null, translations: null })
        .mockResolvedValueOnce({
          id: 'att-fail',
          fileUrl: '/api/v1/attachments/file/fail.mp3',
          filePath: null,
          mimeType: 'audio/mpeg',
          uploadedBy: 'user-1',
        });

      zmq.sendVoiceAPIRequest.mockRejectedValue(new Error('translator down'));

      const result = await service.translateAttachment('att-fail', { targetLanguages: ['fr'] });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TRANSLATION_FAILED');
    });
  });

  // ── _saveTranscription error path (line 835) ─────────────────────────────

  describe('_saveTranscription error handling', () => {
    it('silently catches prisma error and still resolves the promise', async () => {
      prisma.messageAttachment.update.mockRejectedValue(new Error('DB write error'));

      const taskId = 'task-save-err';
      zmq.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-1', {
        audioPath: '/audio.mp3',
        attachmentId: 'att-err',
        saveToDatabase: true,
      });

      await Promise.resolve();
      await Promise.resolve();

      zmq.emit('transcriptionCompleted', { ...mockTranscriptionResult, taskId });

      // Even though the DB save failed, the transcription result should still resolve
      const result = await promise;
      expect(result.text).toBe('Hello from audio');
    });
  });

  // ── _saveTranslationResult error path (line 895) ──────────────────────────

  describe('_saveTranslationResult error handling', () => {
    it('silently catches prisma error and still resolves translateSync', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB read error'));

      const promise = service.translateSync('user-1', {
        targetLanguages: ['fr'],
        attachmentId: 'att-tl-err',
        saveToDatabase: true,
      });

      emitVoiceSuccess(zmq, mockTranslationResult);

      // Even though the DB save failed, translateSync should still resolve
      const result = await promise;
      expect(result.translationId).toBe('trans-001');
    });
  });

  // ── saveVoiceProfile: with binary data ────────────────────────────────────

  describe('saveVoiceProfile with binary embedding', () => {
    it('converts Buffer embedding to Uint8Array in create and update', async () => {
      prisma.userVoiceModel.upsert.mockResolvedValue({});

      const embedding = Buffer.from([1, 2, 3, 4]);
      await service.saveVoiceProfile('user-buf', { embedding, qualityScore: 0.95 });

      const upsertCall = (prisma.userVoiceModel.upsert.mock.calls[0][0] as any);
      expect(upsertCall.create.embedding).toBeInstanceOf(Uint8Array);
      expect(upsertCall.update.embedding).toBeInstanceOf(Uint8Array);
    });
  });

  // ── getAttachmentWithTranscription: no translations ────────────────────────

  describe('getAttachmentWithTranscription edge cases', () => {
    it('returns empty translatedAudios when translations is undefined', async () => {
      prisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-no-trans',
        messageId: 'msg-1',
        fileName: 'audio.mp3',
        fileUrl: '/att/audio.mp3',
        mimeType: 'audio/mpeg',
        fileSize: 1024,
        duration: 2000,
        transcription: null,
        translations: undefined,
        createdAt: new Date(),
      });

      const result = await service.getAttachmentWithTranscription('att-no-trans');

      expect(result).not.toBeNull();
      expect(result!.transcription).toBeNull();
      expect(result!.translatedAudios).toHaveLength(0);
    });
  });

  // ── isHealthy ─────────────────────────────────────────────────────────────

  describe('isHealthy', () => {
    it('returns true for a fully initialized service', () => {
      expect(service.isHealthy()).toBe(true);
    });
  });

  // ── AudioTranslateError ───────────────────────────────────────────────────

  describe('AudioTranslateError', () => {
    it('is instanceof Error', () => {
      const err = new AudioTranslateError('oops', 'MY_CODE');
      expect(err).toBeInstanceOf(Error);
    });

    it('exposes name, message, and code', () => {
      const err = new AudioTranslateError('something broke', 'BROKEN');
      expect(err.name).toBe('AudioTranslateError');
      expect(err.message).toBe('something broke');
      expect(err.code).toBe('BROKEN');
    });
  });

  // ── singleton helpers ─────────────────────────────────────────────────────

  describe('getAudioTranslateService / resetAudioTranslateService', () => {
    it('returns the same instance on repeated calls', () => {
      const a = getAudioTranslateService(prisma as any, zmq as any);
      const b = getAudioTranslateService(prisma as any, zmq as any);
      expect(a).toBe(b);
    });

    it('creates a fresh instance after reset', () => {
      const a = getAudioTranslateService(prisma as any, zmq as any);
      resetAudioTranslateService();
      const b = getAudioTranslateService(prisma as any, zmq as any);
      expect(a).not.toBe(b);
    });
  });
});
