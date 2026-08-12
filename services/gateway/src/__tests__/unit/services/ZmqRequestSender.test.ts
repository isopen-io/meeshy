/**
 * Unit tests for ZmqRequestSender
 *
 * Covers:
 * - sendTranslationRequest: dedup/lowercase, empty after dedup, timeout, success, existingTaskId
 * - sendAudioProcessRequest: no audioPath, loadAudio null, with voice profile, without
 * - sendTranscriptionOnlyRequest: no source, file mode success, file mode loadAudio null, base64 success, base64 with format
 * - sendVoiceAPIRequest and sendVoiceProfileRequest
 * - sendStoryTextObjectRequest
 * - registerTimeout: no-op when absent; fires after delay; safe when removed first
 * - removePendingRequest: clears timeout, deletes; no-op when not found
 * - getPendingRequestsCount, getStats, clear
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock helpers — must be declared before import
jest.mock('../../../services/zmq-translation/utils/zmq-helpers', () => ({
  loadAudioAsBinary: jest.fn(),
  audioFormatToMimeType: jest.fn((fmt: string) => `audio/${fmt}`),
}));

import { ZmqRequestSender } from '../../../services/zmq-translation/ZmqRequestSender';
import { loadAudioAsBinary, audioFormatToMimeType } from '../../../services/zmq-translation/utils/zmq-helpers';

const mockLoadAudio = loadAudioAsBinary as jest.MockedFunction<typeof loadAudioAsBinary>;
const mockAudioFormatToMimeType = audioFormatToMimeType as jest.MockedFunction<typeof audioFormatToMimeType>;

// ──────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeMockConnectionManager() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send: jest.fn().mockResolvedValue(undefined) as jest.Mock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendMultipart: jest.fn().mockResolvedValue(undefined) as jest.Mock,
  };
}

function makeTranslationRequest(overrides: Partial<{
  messageId: string;
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
  conversationId: string;
  modelType: string;
}> = {}) {
  return {
    messageId: overrides.messageId ?? 'msg-001',
    text: overrides.text ?? 'Hello',
    sourceLanguage: overrides.sourceLanguage ?? 'en',
    targetLanguages: overrides.targetLanguages ?? ['fr'],
    conversationId: overrides.conversationId ?? 'conv-001',
    modelType: overrides.modelType,
  };
}

function makeAudioProcessRequest(overrides: Partial<{
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  audioPath: string;
  audioDurationMs: number;
  targetLanguages: string[];
  generateVoiceClone: boolean;
  modelType: string;
  existingVoiceProfile: object | null;
}> = {}) {
  return {
    messageId: overrides.messageId ?? 'msg-aud-001',
    attachmentId: overrides.attachmentId ?? 'att-001',
    conversationId: overrides.conversationId ?? 'conv-001',
    senderId: overrides.senderId ?? 'user-001',
    audioPath: overrides.audioPath ?? '/tmp/audio.wav',
    audioDurationMs: overrides.audioDurationMs ?? 2000,
    targetLanguages: overrides.targetLanguages ?? ['fr'],
    generateVoiceClone: overrides.generateVoiceClone ?? false,
    modelType: overrides.modelType ?? 'basic',
    existingVoiceProfile: overrides.existingVoiceProfile !== undefined
      ? overrides.existingVoiceProfile
      : null,
  };
}

function fakeAudioData(opts: Partial<{ buffer: Buffer; mimeType: string; size: number }> = {}) {
  return {
    buffer: opts.buffer ?? Buffer.from('fake-audio'),
    mimeType: opts.mimeType ?? 'audio/wav',
    size: opts.size ?? 1024,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('ZmqRequestSender', () => {
  let connectionManager: ReturnType<typeof makeMockConnectionManager>;
  let sender: ZmqRequestSender;

  beforeEach(() => {
    jest.useFakeTimers();
    connectionManager = makeMockConnectionManager();
    sender = new ZmqRequestSender(connectionManager as any);
    jest.clearAllMocks();
    connectionManager.send.mockResolvedValue(undefined);
    connectionManager.sendMultipart.mockResolvedValue(undefined);
  });

  afterEach(() => {
    sender.clear();
    jest.useRealTimers();
  });

  // ── sendTranslationRequest ──────────────────────────────────────────────────

  describe('sendTranslationRequest', () => {
    it('returns a taskId string on success', async () => {
      const taskId = await sender.sendTranslationRequest(makeTranslationRequest());
      expect(typeof taskId).toBe('string');
      expect(taskId.length).toBeGreaterThan(0);
    });

    it('uses existingTaskId when provided', async () => {
      const taskId = await sender.sendTranslationRequest(makeTranslationRequest(), 'my-custom-task-id');
      expect(taskId).toBe('my-custom-task-id');
    });

    it('deduplicates and lowercases targetLanguages', async () => {
      const request = makeTranslationRequest({ targetLanguages: ['FR', 'fr', 'EN', 'en'] });
      await sender.sendTranslationRequest(request);

      const sentPayload = connectionManager.send.mock.calls[0][0] as any;
      expect(sentPayload.targetLanguages).toEqual(['fr', 'en']);
    });

    it('throws when targetLanguages is empty after dedup', async () => {
      const request = makeTranslationRequest({ targetLanguages: [] });
      await expect(sender.sendTranslationRequest(request)).rejects.toThrow(
        'targetLanguages must not be empty after deduplication'
      );
    });

    it('stores pending request after successful send', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest());
      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('increments translationRequests stat', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest());
      expect(sender.getStats().translationRequests).toBe(1);
    });

    it('throws when connectionManager.send times out after 5s', async () => {
      // never-resolving send
      connectionManager.send.mockReturnValue(new Promise<void>(() => {}));

      const promise = sender.sendTranslationRequest(makeTranslationRequest());
      // Attach the rejection handler BEFORE advancing the clock so the rejection is
      // always handled synchronously and doesn't trigger PromiseRejectionHandledWarning.
      const assertionPromise = expect(promise).rejects.toThrow(/ZMQ send timeout after 5s/);
      await jest.advanceTimersByTimeAsync(5001);
      await assertionPromise;
    });

    it('calls connectionManager.send with correct message shape', async () => {
      const request = makeTranslationRequest({ messageId: 'msg-shape', text: 'Test text', targetLanguages: ['ES'] });
      await sender.sendTranslationRequest(request);

      const sentPayload = connectionManager.send.mock.calls[0][0] as any;
      expect(sentPayload.type).toBe('translation');
      expect(sentPayload.messageId).toBe('msg-shape');
      expect(sentPayload.text).toBe('Test text');
      expect(sentPayload.targetLanguages).toEqual(['es']);
    });
  });

  // ── sendAudioProcessRequest ─────────────────────────────────────────────────

  describe('sendAudioProcessRequest', () => {
    it('throws when audioPath is not provided', async () => {
      const request = makeAudioProcessRequest({ audioPath: undefined });
      // Remove audioPath entirely
      const { audioPath: _removed, ...noAudioPath } = request;
      await expect(sender.sendAudioProcessRequest(noAudioPath as any)).rejects.toThrow(
        'audioPath must be provided'
      );
    });

    it('throws when audioPath is empty string', async () => {
      const request = makeAudioProcessRequest({ audioPath: '' });
      await expect(sender.sendAudioProcessRequest(request)).rejects.toThrow(
        'audioPath must be provided'
      );
    });

    it('throws when loadAudioAsBinary returns null', async () => {
      mockLoadAudio.mockResolvedValueOnce(null);
      const request = makeAudioProcessRequest({ audioPath: '/tmp/missing.wav' });
      await expect(sender.sendAudioProcessRequest(request)).rejects.toThrow(
        /Impossible de charger le fichier audio/
      );
    });

    it('returns taskId and stores pending request on success', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());
      const taskId = await sender.sendAudioProcessRequest(makeAudioProcessRequest());

      expect(typeof taskId).toBe('string');
      expect(sender.getPendingRequestsCount()).toBe(1);
      expect(sender.getStats().audioProcessRequests).toBe(1);
    });

    it('uses existingTaskId when provided', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());
      const taskId = await sender.sendAudioProcessRequest(makeAudioProcessRequest(), 'audio-task-42');
      expect(taskId).toBe('audio-task-42');
    });

    it('calls sendMultipart with audio buffer frame', async () => {
      const audioBuf = Buffer.from('wav-data');
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData({ buffer: audioBuf }));
      await sender.sendAudioProcessRequest(makeAudioProcessRequest());

      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
      const frames = connectionManager.sendMultipart.mock.calls[0][1] as Buffer[];
      expect(frames[0]).toBe(audioBuf);
    });

    it('adds embedding frame when existingVoiceProfile.embedding is provided', async () => {
      const audioBuf = Buffer.from('wav-data');
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData({ buffer: audioBuf }));
      const embeddingBase64 = Buffer.from('fake-embedding').toString('base64');
      const request = makeAudioProcessRequest({
        existingVoiceProfile: {
          profileId: 'vp-1',
          userId: 'u-1',
          embedding: embeddingBase64,
          qualityScore: 0.9,
          version: 1,
          audioCount: 3,
          totalDurationMs: 6000,
        },
      });
      await sender.sendAudioProcessRequest(request);

      const frames = connectionManager.sendMultipart.mock.calls[0][1] as Buffer[];
      expect(frames).toHaveLength(2);
      expect(frames[1].toString()).toBe('fake-embedding');
    });

    it('sends only one frame when no existingVoiceProfile', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());
      await sender.sendAudioProcessRequest(makeAudioProcessRequest({ existingVoiceProfile: null }));

      const frames = connectionManager.sendMultipart.mock.calls[0][1] as Buffer[];
      expect(frames).toHaveLength(1);
    });

    it('logs "provided" branch for mobileTranscription when it is provided', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());
      const requestWithMobile = {
        ...makeAudioProcessRequest(),
        mobileTranscription: { text: 'Hi', language: 'en', confidence: 0.9, source: 'mobile' },
      };

      // Just verifying it doesn't throw and completes successfully (covers line 212 true branch)
      const taskId = await sender.sendAudioProcessRequest(requestWithMobile);
      expect(typeof taskId).toBe('string');
    });

    it('catches and ignores decoding error when embedding is not a valid base64 string', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());
      // Non-string truthy embedding triggers Buffer.from() TypeError → caught at line 172
      const request = makeAudioProcessRequest({
        existingVoiceProfile: {
          profileId: 'vp-1',
          userId: 'u-1',
          embedding: {} as unknown as string,
          qualityScore: 0.9,
          version: 1,
          audioCount: 1,
          totalDurationMs: 2000,
        },
      });

      // Should NOT throw — the catch block swallows the decoding error
      const taskId = await sender.sendAudioProcessRequest(request);
      expect(typeof taskId).toBe('string');
      // Embedding decoding failed, so only the audio frame is present
      const frames = connectionManager.sendMultipart.mock.calls[0][1] as Buffer[];
      expect(frames).toHaveLength(1);
    });
  });

  // ── sendTranscriptionOnlyRequest ────────────────────────────────────────────

  describe('sendTranscriptionOnlyRequest', () => {
    it('throws when neither audioPath nor audioData provided', async () => {
      await expect(
        sender.sendTranscriptionOnlyRequest({ messageId: 'msg-1', attachmentId: 'att-1' } as any)
      ).rejects.toThrow('Either audioPath or audioData (base64) must be provided');
    });

    it('file mode: throws when loadAudioAsBinary returns null', async () => {
      mockLoadAudio.mockResolvedValueOnce(null);
      await expect(
        sender.sendTranscriptionOnlyRequest({ messageId: 'msg-1', attachmentId: 'att-1', audioPath: '/tmp/bad.wav' })
      ).rejects.toThrow(/Impossible de charger le fichier audio/);
    });

    it('file mode: returns taskId on success', async () => {
      const buf = Buffer.from('wav-content');
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData({ buffer: buf, mimeType: 'audio/wav', size: buf.length }));

      const taskId = await sender.sendTranscriptionOnlyRequest({
        messageId: 'msg-t',
        attachmentId: 'att-t',
        audioPath: '/tmp/audio.wav',
      });

      expect(typeof taskId).toBe('string');
      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
      expect(sender.getStats().transcriptionRequests).toBe(1);
    });

    it('file mode: uses existingTaskId', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());
      const taskId = await sender.sendTranscriptionOnlyRequest(
        { messageId: 'msg-t', attachmentId: 'att-t', audioPath: '/tmp/audio.wav' },
        'existing-task-id'
      );
      expect(taskId).toBe('existing-task-id');
    });

    it('base64 mode: decodes audioData and uses audioFormatToMimeType', async () => {
      const rawAudio = Buffer.from('raw-pcm-data');
      const audioBase64 = rawAudio.toString('base64');
      mockAudioFormatToMimeType.mockReturnValueOnce('audio/mpeg');

      const taskId = await sender.sendTranscriptionOnlyRequest({
        messageId: 'msg-b64',
        attachmentId: 'att-b64',
        audioData: audioBase64,
        audioFormat: 'mp3',
      });

      expect(typeof taskId).toBe('string');
      expect(mockAudioFormatToMimeType).toHaveBeenCalledWith('mp3');

      const sentMsg = connectionManager.sendMultipart.mock.calls[0][0] as any;
      expect(sentMsg.audioFormat).toBe('mpeg'); // mimeType 'audio/mpeg' → replace 'audio/' → 'mpeg'

      const frames = connectionManager.sendMultipart.mock.calls[0][1] as Buffer[];
      expect(frames[0].toString('base64')).toBe(audioBase64);
    });

    it('base64 mode: defaults to wav format when audioFormat not provided', async () => {
      const rawAudio = Buffer.from('pcm-data');
      mockAudioFormatToMimeType.mockReturnValueOnce('audio/wav');

      await sender.sendTranscriptionOnlyRequest({
        messageId: 'msg-def',
        attachmentId: 'att-def',
        audioData: rawAudio.toString('base64'),
      });

      expect(mockAudioFormatToMimeType).toHaveBeenCalledWith('wav');
    });

    it('base64 mode: stores pending request', async () => {
      mockAudioFormatToMimeType.mockReturnValueOnce('audio/wav');

      await sender.sendTranscriptionOnlyRequest({
        messageId: 'msg-pend',
        attachmentId: 'att-pend',
        audioData: Buffer.from('data').toString('base64'),
      });

      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('file mode: works without attachmentId (covers attachmentId || "N/A" branch)', async () => {
      mockLoadAudio.mockResolvedValueOnce(fakeAudioData());

      // No attachmentId provided → covers line 317 false branch
      const taskId = await sender.sendTranscriptionOnlyRequest({
        messageId: 'msg-no-att',
        audioPath: '/tmp/audio.wav',
      });
      expect(typeof taskId).toBe('string');
    });

    it('base64 mode: works with mobileTranscription (covers "OUI" and "provided" branches)', async () => {
      mockAudioFormatToMimeType.mockReturnValueOnce('audio/wav');

      const taskId = await sender.sendTranscriptionOnlyRequest({
        messageId: 'msg-mobile',
        attachmentId: 'att-mobile',
        audioData: Buffer.from('data').toString('base64'),
        mobileTranscription: { text: 'Hello', language: 'en', confidence: 0.9, source: 'mobile' },
      });
      expect(typeof taskId).toBe('string');
    });
  });

  // ── sendVoiceAPIRequest ─────────────────────────────────────────────────────

  describe('sendVoiceAPIRequest', () => {
    it('sends request and returns taskId from request.taskId', async () => {
      const request = { type: 'voice_translate', taskId: 'voice-task-1', userId: 'u-1' };

      const returnedId = await sender.sendVoiceAPIRequest(request);

      expect(returnedId).toBe('voice-task-1');
      expect(connectionManager.send).toHaveBeenCalledWith(request);
      expect(sender.getStats().voiceAPIRequests).toBe(1);
      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('works when userId is not provided (covers userId || "N/A" branch)', async () => {
      // No userId → covers line 358 false branch
      const request = { type: 'voice_health', taskId: 'health-task-1' };
      const returnedId = await sender.sendVoiceAPIRequest(request);
      expect(returnedId).toBe('health-task-1');
    });
  });

  // ── sendVoiceProfileRequest ─────────────────────────────────────────────────

  describe('sendVoiceProfileRequest', () => {
    it('sends request and returns request_id', async () => {
      const request = {
        type: 'voice_profile_analyze' as const,
        request_id: 'req-profile-1',
        user_id: 'u-1',
        audio_data: 'base64string',
        audio_format: 'wav',
      };

      const returnedId = await sender.sendVoiceProfileRequest(request);

      expect(returnedId).toBe('req-profile-1');
      expect(connectionManager.send).toHaveBeenCalledWith(request);
      expect(sender.getStats().voiceProfileRequests).toBe(1);
      expect(sender.getPendingRequestsCount()).toBe(1);
    });
  });

  // ── sendStoryTextObjectRequest ──────────────────────────────────────────────

  describe('sendStoryTextObjectRequest', () => {
    it('sends story text object message via connectionManager.send', async () => {
      await sender.sendStoryTextObjectRequest({
        postId: 'post-1',
        textObjectIndex: 3,
        text: 'Hello story',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'es'],
      });

      expect(connectionManager.send).toHaveBeenCalledTimes(1);
      const sentMsg = connectionManager.send.mock.calls[0][0] as any;
      expect(sentMsg.type).toBe('story_text_object_translation');
      expect(sentMsg.postId).toBe('post-1');
      expect(sentMsg.textObjectIndex).toBe(3);
      expect(sentMsg.text).toBe('Hello story');
      expect(sentMsg.targetLanguages).toEqual(['fr', 'es']);
    });

    it('returns void (no taskId)', async () => {
      const result = await sender.sendStoryTextObjectRequest({
        postId: 'post-2',
        textObjectIndex: 0,
        text: 'Test',
        sourceLanguage: 'en',
        targetLanguages: ['de'],
      });
      expect(result).toBeUndefined();
    });
  });

  // ── registerTimeout ─────────────────────────────────────────────────────────

  describe('registerTimeout', () => {
    it('is a no-op when taskId is not in pendingRequests', () => {
      const onTimeout = jest.fn();
      sender.registerTimeout('non-existent-task', 1000, onTimeout);
      jest.advanceTimersByTime(2000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('fires onTimeout after timeoutMs and removes from pending', async () => {
      // Add a pending request via sendVoiceAPIRequest
      const request = { type: 'voice_translate', taskId: 'to-task-1', userId: 'u-1' };
      await sender.sendVoiceAPIRequest(request);
      expect(sender.getPendingRequestsCount()).toBe(1);

      const onTimeout = jest.fn();
      sender.registerTimeout('to-task-1', 3000, onTimeout);

      jest.advanceTimersByTime(3001);

      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(sender.getPendingRequestsCount()).toBe(0);
    });

    it('does NOT fire onTimeout when removePendingRequest is called before timeout fires', async () => {
      const request = { type: 'voice_translate', taskId: 'to-safe-1', userId: 'u-1' };
      await sender.sendVoiceAPIRequest(request);

      const onTimeout = jest.fn();
      sender.registerTimeout('to-safe-1', 3000, onTimeout);

      // Remove before timeout fires
      sender.removePendingRequest('to-safe-1');
      jest.advanceTimersByTime(5000);

      expect(onTimeout).not.toHaveBeenCalled();
    });
  });

  // ── removePendingRequest ────────────────────────────────────────────────────

  describe('removePendingRequest', () => {
    it('removes existing pending request', async () => {
      const request = { type: 'voice_translate', taskId: 'rem-1', userId: 'u-1' };
      await sender.sendVoiceAPIRequest(request);
      expect(sender.getPendingRequestsCount()).toBe(1);

      sender.removePendingRequest('rem-1');
      expect(sender.getPendingRequestsCount()).toBe(0);
    });

    it('is a no-op when taskId not found', () => {
      expect(() => sender.removePendingRequest('does-not-exist')).not.toThrow();
    });

    it('cancels timeout when removing entry that has a registered timeout', async () => {
      const request = { type: 'voice_translate', taskId: 'rem-to', userId: 'u-1' };
      await sender.sendVoiceAPIRequest(request);

      const onTimeout = jest.fn();
      sender.registerTimeout('rem-to', 5000, onTimeout);
      sender.removePendingRequest('rem-to');

      jest.advanceTimersByTime(10000);
      expect(onTimeout).not.toHaveBeenCalled();
    });
  });

  // ── getPendingRequestsCount ─────────────────────────────────────────────────

  describe('getPendingRequestsCount', () => {
    it('returns 0 initially', () => {
      expect(sender.getPendingRequestsCount()).toBe(0);
    });

    it('returns correct count after multiple requests', async () => {
      const r1 = { type: 'v', taskId: 'pc-1', userId: 'u' };
      const r2 = { type: 'v', taskId: 'pc-2', userId: 'u' };
      await sender.sendVoiceAPIRequest(r1);
      await sender.sendVoiceAPIRequest(r2);
      expect(sender.getPendingRequestsCount()).toBe(2);
    });
  });

  // ── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns a copy of stats (not reference)', async () => {
      const stats1 = sender.getStats();
      stats1.translationRequests = 9999;

      await sender.sendTranslationRequest(makeTranslationRequest());
      const stats2 = sender.getStats();
      expect(stats2.translationRequests).toBe(1);
    });

    it('initial stats are all zero', () => {
      const stats = sender.getStats();
      expect(stats.translationRequests).toBe(0);
      expect(stats.audioProcessRequests).toBe(0);
      expect(stats.transcriptionRequests).toBe(0);
      expect(stats.voiceAPIRequests).toBe(0);
      expect(stats.voiceProfileRequests).toBe(0);
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('empties pendingRequests map', async () => {
      const r1 = { type: 'v', taskId: 'cl-1', userId: 'u' };
      const r2 = { type: 'v', taskId: 'cl-2', userId: 'u' };
      await sender.sendVoiceAPIRequest(r1);
      await sender.sendVoiceAPIRequest(r2);
      expect(sender.getPendingRequestsCount()).toBe(2);

      sender.clear();
      expect(sender.getPendingRequestsCount()).toBe(0);
    });

    it('cancels all timeouts so none fire after clear', async () => {
      const r1 = { type: 'v', taskId: 'cl-to-1', userId: 'u' };
      await sender.sendVoiceAPIRequest(r1);

      const onTimeout = jest.fn();
      sender.registerTimeout('cl-to-1', 2000, onTimeout);

      sender.clear();
      jest.advanceTimersByTime(5000);

      expect(onTimeout).not.toHaveBeenCalled();
    });
  });
});
