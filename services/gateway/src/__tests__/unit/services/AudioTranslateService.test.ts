import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  AudioTranslateService,
  AudioTranslateError,
  getAudioTranslateService,
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

// ── Mock ZmqTranslationClient ─────────────────────────────────────────────

class MockZmqClient extends EventEmitter {
  sendVoiceAPIRequest = jest.fn() as jest.Mock<any>;
  sendTranscriptionOnlyRequest = jest.fn() as jest.Mock<any>;
}

// ── Mock Prisma ───────────────────────────────────────────────────────────

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

describe('AudioTranslateService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let zmqClient: MockZmqClient;
  let service: AudioTranslateService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    zmqClient = new MockZmqClient();
    zmqClient.sendVoiceAPIRequest.mockResolvedValue(undefined);
    zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue('default-task-id');
    service = new AudioTranslateService(mockPrisma as any, zmqClient as any);
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    resetAudioTranslateService();
  });

  // ── AudioTranslateError ───────────────────────────────────────────────────

  describe('AudioTranslateError', () => {
    it('is an Error with name, message, and code fields', () => {
      const err = new AudioTranslateError('something went wrong', 'SOME_CODE');
      expect(err instanceof Error).toBe(true);
      expect(err.name).toBe('AudioTranslateError');
      expect(err.message).toBe('something went wrong');
      expect(err.code).toBe('SOME_CODE');
    });
  });

  // ── Constructor / lifecycle ───────────────────────────────────────────────

  describe('constructor', () => {
    it('reports healthy after construction', () => {
      expect(service.isHealthy()).toBe(true);
    });

    it('starts with zero pending requests', () => {
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── Internal event handlers ───────────────────────────────────────────────

  describe('voiceAPISuccess event', () => {
    it('resolves the pending request and removes it from the map', async () => {
      const taskId = 'task-success-01';
      const mockResult = { translationId: 'tr-1', translations: [] };

      const p = new Promise<any>((resolve) => {
        (service as any).pendingRequests.set(taskId, {
          resolve,
          reject: jest.fn(),
          timeout: setTimeout(() => {}, 60000),
          requestType: 'voice_translate',
          timestamp: Date.now(),
        });
      });

      zmqClient.emit('voiceAPISuccess', { taskId, result: mockResult, processingTimeMs: 50 });

      const result = await p;
      expect(result).toEqual(mockResult);
      expect(service.getPendingRequestsCount()).toBe(0);
    });

    it('ignores events for unknown taskIds without throwing', () => {
      expect(() => {
        zmqClient.emit('voiceAPISuccess', { taskId: 'ghost', result: {}, processingTimeMs: 0 });
      }).not.toThrow();
    });
  });

  describe('voiceAPIError event', () => {
    it('rejects the pending request with an AudioTranslateError', async () => {
      const taskId = 'task-error-01';

      const p = new Promise<any>((_, reject) => {
        (service as any).pendingRequests.set(taskId, {
          resolve: jest.fn(),
          reject,
          timeout: setTimeout(() => {}, 60000),
          requestType: 'voice_translate',
          timestamp: Date.now(),
        });
      });

      zmqClient.emit('voiceAPIError', { taskId, error: 'Translation failed', errorCode: 'TRANSLATE_ERR' });

      await expect(p).rejects.toMatchObject({ name: 'AudioTranslateError', code: 'TRANSLATE_ERR' });
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  describe('voiceJobProgress event', () => {
    it('re-emits as "jobProgress" on the service', () => {
      const listener = jest.fn();
      service.on('jobProgress', listener);
      const progressPayload = { taskId: 'job-1', progress: 50, stage: 'transcribing' };

      zmqClient.emit('voiceJobProgress', progressPayload);

      expect(listener).toHaveBeenCalledWith(progressPayload);
    });
  });

  describe('transcriptionCompleted event', () => {
    it('resolves the pending request with transcription fields', async () => {
      const taskId = 'transcription-ok';

      const p = new Promise<any>((resolve) => {
        (service as any).pendingRequests.set(taskId, {
          resolve,
          reject: jest.fn(),
          timeout: setTimeout(() => {}, 30000),
          requestType: 'transcription_only',
          timestamp: Date.now(),
        });
      });

      zmqClient.emit('transcriptionCompleted', {
        taskId,
        messageId: 'msg-1',
        attachmentId: 'att-1',
        transcription: {
          text: 'bonjour',
          language: 'fr',
          confidence: 0.95,
          durationMs: 2500,
          source: 'whisper',
        },
        processingTimeMs: 400,
      });

      const result = await p;
      expect(result.text).toBe('bonjour');
      expect(result.language).toBe('fr');
      expect(result.processingTimeMs).toBe(400);
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  describe('transcriptionError event', () => {
    it('rejects the pending request with an AudioTranslateError', async () => {
      const taskId = 'transcription-fail';

      const p = new Promise<any>((_, reject) => {
        (service as any).pendingRequests.set(taskId, {
          resolve: jest.fn(),
          reject,
          timeout: setTimeout(() => {}, 30000),
          requestType: 'transcription_only',
          timestamp: Date.now(),
        });
      });

      zmqClient.emit('transcriptionError', {
        taskId,
        messageId: 'msg-1',
        attachmentId: 'att-1',
        error: 'Audio too short',
        errorCode: 'AUDIO_TOO_SHORT',
      });

      await expect(p).rejects.toMatchObject({ code: 'AUDIO_TOO_SHORT' });
    });
  });

  // ── transcribeOnly ────────────────────────────────────────────────────────

  describe('transcribeOnly', () => {
    it('rejects with INVALID_REQUEST when neither audioPath nor audioBase64 provided', async () => {
      await expect(service.transcribeOnly('user-123', {})).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      });
    });

    it('rejects with INVALID_REQUEST when audioBase64 provided without audioFormat', async () => {
      await expect(
        service.transcribeOnly('user-123', { audioBase64: 'base64data' })
      ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    });

    it('resolves with transcription result when transcriptionCompleted fires', async () => {
      const taskId = 'tr-task-ok';
      zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-123', { audioPath: '/tmp/audio.mp3' });
      await Promise.resolve();
      await Promise.resolve();

      zmqClient.emit('transcriptionCompleted', {
        taskId,
        messageId: 'msg-1',
        attachmentId: 'att-1',
        transcription: {
          text: 'hello world',
          language: 'en',
          confidence: 0.9,
          durationMs: 3000,
          source: 'whisper',
        },
        processingTimeMs: 250,
      });

      const result = await promise;
      expect(result.text).toBe('hello world');
      expect(result.language).toBe('en');
    });

    it('rejects when transcriptionError fires', async () => {
      const taskId = 'tr-task-fail';
      zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-123', { audioPath: '/tmp/audio.mp3' });
      await Promise.resolve();
      await Promise.resolve();

      zmqClient.emit('transcriptionError', {
        taskId,
        messageId: 'msg-1',
        attachmentId: 'att-1',
        error: 'Failed to decode audio',
        errorCode: 'DECODE_FAILED',
      });

      await expect(promise).rejects.toMatchObject({ code: 'DECODE_FAILED' });
    });

    it('rejects with SEND_FAILED when sendTranscriptionOnlyRequest throws', async () => {
      zmqClient.sendTranscriptionOnlyRequest.mockRejectedValue(new Error('ZMQ socket closed'));

      await expect(
        service.transcribeOnly('user-123', { audioPath: '/tmp/audio.mp3' })
      ).rejects.toMatchObject({ code: 'SEND_FAILED' });
    });

    it('accepts audioBase64 + audioFormat without validation error', async () => {
      const taskId = 'tr-task-b64';
      zmqClient.sendTranscriptionOnlyRequest.mockResolvedValue(taskId);

      const promise = service.transcribeOnly('user-123', {
        audioBase64: 'AABB==',
        audioFormat: 'wav',
      });
      await Promise.resolve();
      await Promise.resolve();

      zmqClient.emit('transcriptionCompleted', {
        taskId,
        messageId: 'msg-2',
        attachmentId: 'att-2',
        transcription: {
          text: 'salut',
          language: 'fr',
          confidence: 0.88,
          durationMs: 1500,
          source: 'whisper',
        },
        processingTimeMs: 200,
      });

      const result = await promise;
      expect(result.text).toBe('salut');
    });
  });

  // ── transcribeAttachment ──────────────────────────────────────────────────

  describe('transcribeAttachment', () => {
    it('returns cached transcription when one already exists', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        transcription: {
          text: 'cached transcript',
          language: 'en',
          confidence: 0.92,
          durationMs: 1800,
          source: 'whisper',
        },
      });

      const result = await service.transcribeAttachment('att-123');

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('cached transcript');
      expect(zmqClient.sendTranscriptionOnlyRequest).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when attachment does not exist', async () => {
      mockPrisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce(null);

      const result = await service.transcribeAttachment('att-missing');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });

    it('returns INVALID_TYPE for non-audio attachments', async () => {
      mockPrisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({
          id: 'att-doc',
          fileUrl: '/api/v1/attachments/file/doc.pdf',
          filePath: null,
          mimeType: 'application/pdf',
          messageId: 'msg-1',
        });

      const result = await service.transcribeAttachment('att-doc');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TYPE');
    });
  });

  // ── translateSync ─────────────────────────────────────────────────────────

  describe('translateSync', () => {
    it('sends voice_translate request and resolves on voiceAPISuccess', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const mockResult = {
        translationId: 'tr-001',
        translations: [{ targetLanguage: 'fr', translatedText: 'bonjour', durationMs: 1000, voiceCloned: true }],
        processingTimeMs: 2000,
      };

      const promise = service.translateSync('user-123', {
        audioBase64: 'base64data',
        targetLanguages: ['fr'],
      });

      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: mockResult,
        processingTimeMs: 2000,
      });

      const result = await promise;
      expect(result.translationId).toBe('tr-001');
      expect(capturedRequest.type).toBe('voice_translate');
      expect(capturedRequest.targetLanguages).toContain('fr');
    });

    it('rejects with AudioTranslateError on voiceAPIError', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.translateSync('user-123', {
        audioBase64: 'base64data',
        targetLanguages: ['fr'],
      });

      await Promise.resolve();
      zmqClient.emit('voiceAPIError', {
        taskId: capturedRequest.taskId,
        error: 'Voice service unavailable',
        errorCode: 'SERVICE_DOWN',
      });

      await expect(promise).rejects.toMatchObject({ code: 'SERVICE_DOWN' });
    });

    it('rejects with SEND_FAILED when sendVoiceAPIRequest throws', async () => {
      zmqClient.sendVoiceAPIRequest.mockRejectedValue(new Error('ZMQ disconnected'));

      await expect(
        service.translateSync('user-123', { audioBase64: 'x', targetLanguages: ['fr'] })
      ).rejects.toMatchObject({ code: 'SEND_FAILED' });
    });

    it('passes existingTranscription as mobileTranscription in the request', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.translateSync('user-123', {
        audioBase64: 'data',
        targetLanguages: ['es'],
        existingTranscription: { text: 'hello', language: 'en', confidence: 0.9, source: 'mobile' },
      });

      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: { translationId: 'tr-2', translations: [], processingTimeMs: 100 },
        processingTimeMs: 100,
      });
      await promise;

      expect(capturedRequest.mobileTranscription).toBeDefined();
      expect(capturedRequest.mobileTranscription.text).toBe('hello');
    });
  });

  // ── translateAsync ────────────────────────────────────────────────────────

  describe('translateAsync', () => {
    it('sends voice_translate_async and returns jobId', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.translateAsync('user-123', {
        audioBase64: 'data',
        targetLanguages: ['es'],
      });

      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: { jobId: 'job-999', status: 'pending' },
        processingTimeMs: 10,
      });

      const result = await promise;
      expect(result.jobId).toBe('job-999');
      expect(result.status).toBe('pending');
      expect(capturedRequest.type).toBe('voice_translate_async');
    });
  });

  // ── translateAttachment ───────────────────────────────────────────────────

  describe('translateAttachment', () => {
    it('returns cached result when all target languages are already translated', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        transcription: { text: 'hello', language: 'en', confidence: 0.9, durationMs: 1000 },
        translations: {
          fr: { transcription: 'bonjour', url: '/fr.mp3', durationMs: 1000, cloned: true, quality: 0.9 },
        },
      });

      const result = await service.translateAttachment('att-123', { targetLanguages: ['fr'] });

      expect(result.success).toBe(true);
      expect(zmqClient.sendVoiceAPIRequest).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND error when attachment does not exist', async () => {
      mockPrisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null, translations: null })
        .mockResolvedValueOnce(null);

      const result = await service.translateAttachment('att-missing', { targetLanguages: ['fr'] });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });

    it('returns INVALID_TYPE for non-audio attachments', async () => {
      mockPrisma.messageAttachment.findUnique
        .mockResolvedValueOnce({ transcription: null, translations: null })
        .mockResolvedValueOnce({
          id: 'att-img',
          fileUrl: '/api/v1/attachments/file/img.png',
          filePath: null,
          mimeType: 'image/png',
          uploadedBy: 'user-1',
        });

      const result = await service.translateAttachment('att-img', { targetLanguages: ['fr'] });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TYPE');
    });
  });

  // ── Job management ────────────────────────────────────────────────────────

  describe('getJobStatus', () => {
    it('sends voice_job_status request with correct jobId', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.getJobStatus('user-123', 'job-abc');
      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: { jobId: 'job-abc', status: 'completed' },
        processingTimeMs: 5,
      });

      await promise;
      expect(capturedRequest.type).toBe('voice_job_status');
      expect(capturedRequest.jobId).toBe('job-abc');
    });
  });

  describe('cancelJob', () => {
    it('sends voice_job_cancel request with correct jobId', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.cancelJob('user-123', 'job-to-cancel');
      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: { success: true, message: 'Cancelled' },
        processingTimeMs: 5,
      });

      await promise;
      expect(capturedRequest.type).toBe('voice_job_cancel');
      expect(capturedRequest.jobId).toBe('job-to-cancel');
    });
  });

  // ── Voice analysis ────────────────────────────────────────────────────────

  describe('analyzeVoice', () => {
    it('sends voice_analyze request', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.analyzeVoice('user-123', { audioPath: '/tmp/audio.wav' });
      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: { pitch: 200, tempo: 120 },
        processingTimeMs: 600,
      });

      await promise;
      expect(capturedRequest.type).toBe('voice_analyze');
      expect(capturedRequest.audioPath).toBe('/tmp/audio.wav');
    });
  });

  describe('compareVoices', () => {
    it('sends voice_compare request with both audio paths', async () => {
      let capturedRequest: any;
      zmqClient.sendVoiceAPIRequest.mockImplementation((req: any) => {
        capturedRequest = req;
        return Promise.resolve();
      });

      const promise = service.compareVoices('user-123', {
        audioPath_1: '/tmp/a1.wav',
        audioPath_2: '/tmp/a2.wav',
      });
      await Promise.resolve();
      zmqClient.emit('voiceAPISuccess', {
        taskId: capturedRequest.taskId,
        result: { similarity: 0.85 },
        processingTimeMs: 400,
      });

      await promise;
      expect(capturedRequest.type).toBe('voice_compare');
      expect(capturedRequest.audioPath_1).toBe('/tmp/a1.wav');
    });
  });

  // ── Voice profiles (DB ops) ───────────────────────────────────────────────

  describe('getVoiceProfile', () => {
    it('queries userVoiceModel by userId', async () => {
      const mockProfile = { userId: 'user-123', qualityScore: 0.85, profileId: 'vfp_user-123' };
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockProfile);

      const result = await service.getVoiceProfile('user-123');

      expect(result).toEqual(mockProfile);
      expect(mockPrisma.userVoiceModel.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
    });

    it('returns null when no profile exists', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);
      expect(await service.getVoiceProfile('user-no-profile')).toBeNull();
    });
  });

  describe('saveVoiceProfile', () => {
    it('upserts voice model with correct userId and profileId prefix', async () => {
      const mockSaved = { userId: 'user-123', qualityScore: 0.9, profileId: 'vfp_user-123' };
      mockPrisma.userVoiceModel.upsert.mockResolvedValue(mockSaved);

      const result = await service.saveVoiceProfile('user-123', {
        qualityScore: 0.9,
        audioCount: 3,
        totalDurationMs: 15000,
      });

      expect(result).toEqual(mockSaved);
      expect(mockPrisma.userVoiceModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
          create: expect.objectContaining({ userId: 'user-123', profileId: 'vfp_user-123' }),
          update: expect.objectContaining({ qualityScore: 0.9, audioCount: 3 }),
        })
      );
    });
  });

  // ── getAttachmentWithTranscription ────────────────────────────────────────

  describe('getAttachmentWithTranscription', () => {
    it('returns null when attachment does not exist', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);
      expect(await service.getAttachmentWithTranscription('att-missing')).toBeNull();
    });

    it('parses transcription and translatedAudios from JSON fields', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        messageId: 'msg-1',
        fileName: 'audio.mp3',
        fileUrl: '/api/v1/attachments/file/audio.mp3',
        mimeType: 'audio/mp3',
        fileSize: 50000,
        duration: 3.0,
        transcription: { text: 'hello', language: 'en', confidence: 0.9, source: 'whisper', durationMs: 3000 },
        translations: {
          fr: { type: 'audio', transcription: 'bonjour', url: '/fr.mp3', durationMs: 3000, cloned: true, quality: 0.8 },
        },
        createdAt: new Date(),
      });

      const result = await service.getAttachmentWithTranscription('att-1');

      expect(result).not.toBeNull();
      expect(result!.transcription!.text).toBe('hello');
      expect(result!.translatedAudios).toHaveLength(1);
      expect(result!.translatedAudios[0].targetLanguage).toBe('fr');
      expect(result!.translatedAudios[0].voiceCloned).toBe(true);
    });

    it('returns null transcription and empty translatedAudios for attachments without audio data', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: 'att-2',
        messageId: 'msg-2',
        fileName: 'img.png',
        fileUrl: '/img.png',
        mimeType: 'image/png',
        fileSize: 10000,
        duration: null,
        transcription: null,
        translations: null,
        createdAt: new Date(),
      });

      const result = await service.getAttachmentWithTranscription('att-2');

      expect(result).not.toBeNull();
      expect(result!.transcription).toBeNull();
      expect(result!.translatedAudios).toHaveLength(0);
    });
  });

  // ── cleanupTimedOutRequests ───────────────────────────────────────────────

  describe('cleanupTimedOutRequests', () => {
    const TIMEOUT_2X = 60000 * 2; // 2 × DEFAULT_TIMEOUT (120s)

    it('returns 0 when no requests have exceeded 2× timeout', () => {
      const timeoutHandle = setTimeout(() => {}, 120000);
      (service as any).pendingRequests.set('fresh-task', {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: timeoutHandle,
        requestType: 'voice_translate',
        timestamp: Date.now(),
      });

      expect(service.cleanupTimedOutRequests()).toBe(0);
      clearTimeout(timeoutHandle);
    });

    it('removes stale requests, rejects them with CLEANUP_TIMEOUT, returns count', () => {
      const rejectMock = jest.fn();
      (service as any).pendingRequests.set('stale-task', {
        resolve: jest.fn(),
        reject: rejectMock,
        timeout: setTimeout(() => {}, 120000),
        requestType: 'voice_translate',
        timestamp: Date.now() - TIMEOUT_2X - 1,
      });

      const cleaned = service.cleanupTimedOutRequests();

      expect(cleaned).toBe(1);
      expect(service.getPendingRequestsCount()).toBe(0);
      expect(rejectMock).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CLEANUP_TIMEOUT' })
      );
    });

    it('leaves fresh requests intact while cleaning stale ones', () => {
      const freshTimeout = setTimeout(() => {}, 120000);
      (service as any).pendingRequests.set('fresh', {
        resolve: jest.fn(), reject: jest.fn(),
        timeout: freshTimeout,
        requestType: 'voice_translate',
        timestamp: Date.now(),
      });
      (service as any).pendingRequests.set('stale', {
        resolve: jest.fn(), reject: jest.fn(),
        timeout: setTimeout(() => {}, 120000),
        requestType: 'voice_translate',
        timestamp: Date.now() - TIMEOUT_2X - 1,
      });

      expect(service.cleanupTimedOutRequests()).toBe(1);
      expect(service.getPendingRequestsCount()).toBe(1);
      expect((service as any).pendingRequests.has('fresh')).toBe(true);
      clearTimeout(freshTimeout);
    });
  });

  // ── Request timeout ───────────────────────────────────────────────────────

  describe('_sendRequest timeout', () => {
    it('rejects with TIMEOUT when no response arrives before the deadline', async () => {
      jest.useFakeTimers();
      zmqClient.sendVoiceAPIRequest.mockResolvedValue(undefined);

      const promise = service.getHealthStatus(); // 5000ms timeout

      jest.advanceTimersByTime(5001);

      await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
      expect(service.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── Singleton ─────────────────────────────────────────────────────────────

  describe('getAudioTranslateService', () => {
    it('returns the same instance on repeated calls', () => {
      resetAudioTranslateService();
      const i1 = getAudioTranslateService(mockPrisma as any, zmqClient as any);
      const i2 = getAudioTranslateService(mockPrisma as any, zmqClient as any);
      expect(i1).toBe(i2);
    });

    it('returns a fresh instance after resetAudioTranslateService', () => {
      resetAudioTranslateService();
      const i1 = getAudioTranslateService(mockPrisma as any, zmqClient as any);
      resetAudioTranslateService();
      const i2 = getAudioTranslateService(mockPrisma as any, zmqClient as any);
      expect(i1).not.toBe(i2);
    });
  });
});
