/**
 * Unit tests for ZmqRequestSender
 *
 * Coverage targets: ≥92% lines + branches
 *
 * Mocks:
 * - logger-enhanced (no-op)
 * - ./utils/zmq-helpers (loadAudioAsBinary, audioFormatToMimeType)
 * - crypto (randomUUID)
 * - connectionManager (send, sendMultipart as jest.fn())
 *
 * zeromq is NOT imported by ZmqRequestSender — no mock needed for it.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mock logger (must be before imports) ─────────────────────────────────────
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

// ─── Mock zmq-helpers ─────────────────────────────────────────────────────────
const mockLoadAudioAsBinary = jest.fn();
const mockAudioFormatToMimeType = jest.fn();

jest.mock('../utils/zmq-helpers', () => ({
  loadAudioAsBinary: mockLoadAudioAsBinary,
  audioFormatToMimeType: mockAudioFormatToMimeType,
}));

// ─── Mock crypto (stable UUIDs in tests) ──────────────────────────────────────
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid-fixed'),
}));

import { ZmqRequestSender } from '../ZmqRequestSender';

// ─── Connection manager factory ────────────────────────────────────────────────

type MockConnectionManager = {
  send: jest.Mock;
  sendMultipart: jest.Mock;
};

function makeConnectionManager(): MockConnectionManager {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    sendMultipart: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Helpers to extract call args safely ──────────────────────────────────────

function firstSendArg(cm: MockConnectionManager): any {
  return (cm.send.mock.calls[0] as unknown[])[0];
}

function firstSendMultipartArgs(cm: MockConnectionManager): { msg: any; frames: Buffer[] } {
  const call = cm.sendMultipart.mock.calls[0] as unknown[];
  return { msg: call[0], frames: call[1] as Buffer[] };
}

// ─── Request factories ─────────────────────────────────────────────────────────

function makeTranslationRequest(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-001',
    text: 'Hello world',
    sourceLanguage: 'en',
    targetLanguages: ['fr', 'de'],
    conversationId: 'conv-001',
    modelType: 'basic' as const,
    ...overrides,
  };
}

function makeAudioProcessRequest(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-audio-001',
    attachmentId: 'att-001',
    conversationId: 'conv-001',
    senderId: 'user-sender',
    audioPath: '/tmp/audio.wav',
    audioUrl: '',
    audioDurationMs: 2000,
    targetLanguages: ['fr'],
    generateVoiceClone: false,
    modelType: 'basic',
    ...overrides,
  };
}

function makeTranscriptionRequest(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-trans-001',
    attachmentId: 'att-trans-001',
    audioPath: '/tmp/audio.wav',
    ...overrides,
  };
}

function makeVoiceAPIRequest(overrides: Record<string, unknown> = {}) {
  return {
    type: 'voice_translate',
    taskId: 'voice-task-001',
    userId: 'user-001',
    ...overrides,
  };
}

function makeVoiceProfileRequest(overrides: Record<string, unknown> = {}) {
  return {
    type: 'voice_profile_analyze' as const,
    request_id: 'req-001',
    user_id: 'user-001',
    audio_data: 'base64data',
    audio_format: 'wav',
    ...overrides,
  };
}

function makeAudioBinaryData(overrides: Record<string, unknown> = {}) {
  return {
    buffer: Buffer.from('fake-audio-data'),
    mimeType: 'audio/wav',
    size: 15,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ZmqRequestSender', () => {
  let connectionManager: MockConnectionManager;
  let sender: ZmqRequestSender;

  beforeEach(() => {
    jest.useFakeTimers();
    connectionManager = makeConnectionManager();
    sender = new ZmqRequestSender(connectionManager as any);
    mockLoadAudioAsBinary.mockReset();
    mockAudioFormatToMimeType.mockReset();
    // Default happy-path stubs
    mockLoadAudioAsBinary.mockResolvedValue(makeAudioBinaryData());
    mockAudioFormatToMimeType.mockImplementation((fmt: string) => {
      const map: Record<string, string> = {
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        ogg: 'audio/ogg',
        webm: 'audio/webm',
        aac: 'audio/aac',
        flac: 'audio/flac',
      };
      return map[fmt] ?? 'audio/wav';
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    sender.clear();
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with zero stats', () => {
      const stats = sender.getStats();
      expect(stats.translationRequests).toBe(0);
      expect(stats.audioProcessRequests).toBe(0);
      expect(stats.transcriptionRequests).toBe(0);
      expect(stats.voiceAPIRequests).toBe(0);
      expect(stats.voiceProfileRequests).toBe(0);
    });

    it('starts with zero pending requests', () => {
      expect(sender.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── sendTranslationRequest ────────────────────────────────────────────────────

  describe('sendTranslationRequest', () => {
    it('returns a taskId and increments translationRequests', async () => {
      const taskId = await sender.sendTranslationRequest(makeTranslationRequest());
      expect(typeof taskId).toBe('string');
      expect(taskId).toBeTruthy();
      expect(sender.getStats().translationRequests).toBe(1);
    });

    it('calls connectionManager.send once with type=translation', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest());
      expect(connectionManager.send).toHaveBeenCalledTimes(1);
      const arg = firstSendArg(connectionManager);
      expect(arg.type).toBe('translation');
    });

    it('uses existingTaskId when provided', async () => {
      const taskId = await sender.sendTranslationRequest(makeTranslationRequest(), 'existing-id-123');
      expect(taskId).toBe('existing-id-123');
    });

    it('generates a UUID when existingTaskId is not provided', async () => {
      const taskId = await sender.sendTranslationRequest(makeTranslationRequest());
      expect(taskId).toBe('test-uuid-fixed');
    });

    it('deduplicates and lowercases targetLanguages', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest({ targetLanguages: ['FR', 'fr', 'EN'] }));
      const arg = firstSendArg(connectionManager);
      expect(arg.targetLanguages).toEqual(['fr', 'en']);
    });

    it('throws when deduped targetLanguages is empty', async () => {
      await expect(
        sender.sendTranslationRequest(makeTranslationRequest({ targetLanguages: [] }))
      ).rejects.toThrow('targetLanguages must not be empty after deduplication');
    });

    it('adds the request to pendingRequests', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest());
      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('builds requestMessage with correct fields', async () => {
      const req = makeTranslationRequest();
      await sender.sendTranslationRequest(req, 'tid-abc');
      const msg = firstSendArg(connectionManager);
      expect(msg.taskId).toBe('tid-abc');
      expect(msg.messageId).toBe(req.messageId);
      expect(msg.text).toBe(req.text);
      expect(msg.sourceLanguage).toBe(req.sourceLanguage);
      expect(msg.conversationId).toBe(req.conversationId);
    });

    it('defaults modelType to "basic" when not provided', async () => {
      const req = makeTranslationRequest();
      delete (req as any).modelType;
      await sender.sendTranslationRequest(req);
      const msg = firstSendArg(connectionManager);
      expect(msg.modelType).toBe('basic');
    });

    it('throws and does not add to pending when send rejects', async () => {
      connectionManager.send.mockRejectedValueOnce(new Error('ZMQ send failed'));
      await expect(sender.sendTranslationRequest(makeTranslationRequest())).rejects.toThrow('ZMQ send failed');
      expect(sender.getPendingRequestsCount()).toBe(0);
      expect(sender.getStats().translationRequests).toBe(0);
    });

    it('throws on 5s timeout and does not add to pending', async () => {
      connectionManager.send.mockImplementationOnce(
        () => new Promise<void>(() => {}) // hangs forever
      );
      const resultPromise = sender.sendTranslationRequest(makeTranslationRequest());
      jest.advanceTimersByTime(5001);
      await expect(resultPromise).rejects.toThrow(/ZMQ send timeout/);
      expect(sender.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── sendAudioProcessRequest ───────────────────────────────────────────────────

  describe('sendAudioProcessRequest', () => {
    it('returns taskId and increments audioProcessRequests', async () => {
      const taskId = await sender.sendAudioProcessRequest(makeAudioProcessRequest());
      expect(typeof taskId).toBe('string');
      expect(sender.getStats().audioProcessRequests).toBe(1);
    });

    it('calls connectionManager.sendMultipart with one binary frame (audio only)', async () => {
      await sender.sendAudioProcessRequest(makeAudioProcessRequest());
      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
      const { frames } = firstSendMultipartArgs(connectionManager);
      expect(frames).toHaveLength(1); // audio frame only (no voice profile)
    });

    it('throws when audioPath is missing', async () => {
      const req = makeAudioProcessRequest();
      delete (req as any).audioPath;
      await expect(sender.sendAudioProcessRequest(req)).rejects.toThrow('audioPath must be provided');
    });

    it('throws when loadAudioAsBinary returns null', async () => {
      mockLoadAudioAsBinary.mockResolvedValueOnce(null);
      await expect(sender.sendAudioProcessRequest(makeAudioProcessRequest())).rejects.toThrow(
        'Impossible de charger le fichier audio'
      );
    });

    it('uses existingTaskId when provided', async () => {
      const taskId = await sender.sendAudioProcessRequest(makeAudioProcessRequest(), 'audio-existing-id');
      expect(taskId).toBe('audio-existing-id');
    });

    it('includes "provided" in log when mobileTranscription is set', async () => {
      const req = makeAudioProcessRequest({ mobileTranscription: { text: 'hello', language: 'en', confidence: 0.9 } });
      await sender.sendAudioProcessRequest(req);
      // branch: request.mobileTranscription ? 'provided' : 'none' — truthy side
      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
    });

    it('adds two binary frames when existingVoiceProfile.embedding is present', async () => {
      const embedding = Buffer.alloc(32, 0xff).toString('base64');
      const req = makeAudioProcessRequest({
        existingVoiceProfile: {
          profileId: 'vp-001',
          userId: 'user-001',
          embedding,
          qualityScore: 0.9,
          version: 1,
          audioCount: 5,
          totalDurationMs: 3000,
        },
      });
      await sender.sendAudioProcessRequest(req);
      const { frames } = firstSendMultipartArgs(connectionManager);
      expect(frames).toHaveLength(2); // audio + embedding
    });

    it('strips embedding from voiceProfile metadata in JSON frame', async () => {
      const embedding = Buffer.alloc(16, 0xab).toString('base64');
      const req = makeAudioProcessRequest({
        existingVoiceProfile: {
          profileId: 'vp-002',
          userId: 'user-002',
          embedding,
          qualityScore: 0.85,
          version: 2,
          audioCount: 3,
          totalDurationMs: 1500,
        },
      });
      await sender.sendAudioProcessRequest(req);
      const { msg } = firstSendMultipartArgs(connectionManager);
      // existingVoiceProfile in JSON should NOT contain embedding field
      expect(msg.existingVoiceProfile.embedding).toBeUndefined();
      expect(msg.existingVoiceProfile.profileId).toBe('vp-002');
    });

    it('adds request to pendingRequests', async () => {
      await sender.sendAudioProcessRequest(makeAudioProcessRequest());
      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('continues gracefully when voice profile base64 decoding throws (catch branch)', async () => {
      // Force the catch branch: use a getter that throws on access during Buffer.from()
      // We pass an object whose .embedding property throws on second access
      // (first access for the truthiness check passes, second access inside try throws)
      let callCount = 0;
      const faultyVoiceProfile = {
        profileId: 'vp-faulty',
        userId: 'user-faulty',
        qualityScore: 0.9,
        version: 1,
        audioCount: 1,
        totalDurationMs: 500,
        get embedding() {
          callCount++;
          if (callCount === 1) return 'validbase64'; // passes truthiness check
          throw new Error('base64 decode failed');
        },
      };
      const req = makeAudioProcessRequest({ existingVoiceProfile: faultyVoiceProfile });
      // Should not throw — the catch inside sendAudioProcessRequest swallows the error
      await expect(sender.sendAudioProcessRequest(req)).resolves.toBeTruthy();
      // Only audio frame (embedding was not pushed due to catch)
      const { frames } = firstSendMultipartArgs(connectionManager);
      expect(frames).toHaveLength(1);
    });
  });

  // ── sendTranscriptionOnlyRequest ──────────────────────────────────────────────

  describe('sendTranscriptionOnlyRequest', () => {
    it('returns taskId and increments transcriptionRequests (file mode)', async () => {
      const taskId = await sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest());
      expect(typeof taskId).toBe('string');
      expect(sender.getStats().transcriptionRequests).toBe(1);
    });

    it('calls sendMultipart in file mode', async () => {
      await sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest());
      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
    });

    it('throws when neither audioPath nor audioData is provided', async () => {
      await expect(
        sender.sendTranscriptionOnlyRequest({ messageId: 'msg-001', attachmentId: 'att-001' } as any)
      ).rejects.toThrow('Either audioPath or audioData (base64) must be provided');
    });

    it('throws when file mode and loadAudioAsBinary returns null', async () => {
      mockLoadAudioAsBinary.mockResolvedValueOnce(null);
      await expect(sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest())).rejects.toThrow(
        'Impossible de charger le fichier audio'
      );
    });

    it('uses existingTaskId when provided', async () => {
      const taskId = await sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest(), 'trans-existing-id');
      expect(taskId).toBe('trans-existing-id');
    });

    it('adds request to pendingRequests', async () => {
      await sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest());
      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('logs "OUI" branch when mobileTranscription is provided', async () => {
      const audioData = Buffer.from('bytes').toString('base64');
      const req = makeTranscriptionRequest({
        audioPath: undefined,
        audioData,
        mobileTranscription: { text: 'hello', language: 'en', confidence: 0.95 },
      });
      await sender.sendTranscriptionOnlyRequest(req);
      // branch: request.mobileTranscription ? 'OUI' : 'NON' — truthy side (line 251)
      // branch: request.mobileTranscription ? 'provided' : 'none' — truthy side (line 323)
      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
    });

    it('logs "N/A" when attachmentId is omitted', async () => {
      const req = makeTranscriptionRequest({ attachmentId: undefined });
      await sender.sendTranscriptionOnlyRequest(req);
      // branch: request.attachmentId || 'N/A' — falsy side (line 317)
      expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
    });

    describe('base64 mode', () => {
      it('decodes base64 audioData and calls sendMultipart', async () => {
        const audioData = Buffer.from('fake-audio-bytes').toString('base64');
        const req = makeTranscriptionRequest({ audioPath: undefined, audioData, audioFormat: 'mp3' });
        await sender.sendTranscriptionOnlyRequest(req);
        expect(connectionManager.sendMultipart).toHaveBeenCalledTimes(1);
        expect(mockAudioFormatToMimeType).toHaveBeenCalledWith('mp3');
      });

      it('defaults audioFormat to "wav" when not provided', async () => {
        const audioData = Buffer.from('bytes').toString('base64');
        const req = makeTranscriptionRequest({ audioPath: undefined, audioData });
        await sender.sendTranscriptionOnlyRequest(req);
        expect(mockAudioFormatToMimeType).toHaveBeenCalledWith('wav');
      });

      it('increments transcriptionRequests', async () => {
        const audioData = Buffer.from('bytes').toString('base64');
        await sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest({ audioPath: undefined, audioData }));
        expect(sender.getStats().transcriptionRequests).toBe(1);
      });

      it('builds correct requestMessage with type=transcription_only', async () => {
        const audioData = Buffer.from('bytes').toString('base64');
        await sender.sendTranscriptionOnlyRequest(makeTranscriptionRequest({ audioPath: undefined, audioData }));
        const { msg } = firstSendMultipartArgs(connectionManager);
        expect(msg.type).toBe('transcription_only');
      });
    });
  });

  // ── sendVoiceAPIRequest ───────────────────────────────────────────────────────

  describe('sendVoiceAPIRequest', () => {
    it('returns request.taskId and increments voiceAPIRequests', async () => {
      const req = makeVoiceAPIRequest({ taskId: 'voice-api-task' });
      const taskId = await sender.sendVoiceAPIRequest(req);
      expect(taskId).toBe('voice-api-task');
      expect(sender.getStats().voiceAPIRequests).toBe(1);
    });

    it('calls connectionManager.send with the full request object', async () => {
      const req = makeVoiceAPIRequest({ taskId: 'vapi-send-check' });
      await sender.sendVoiceAPIRequest(req);
      expect(connectionManager.send).toHaveBeenCalledTimes(1);
      const arg = firstSendArg(connectionManager);
      expect(arg.taskId).toBe('vapi-send-check');
      expect(arg.type).toBe('voice_translate');
    });

    it('adds request to pendingRequests keyed by request.taskId', async () => {
      await sender.sendVoiceAPIRequest(makeVoiceAPIRequest({ taskId: 'vapi-key' }));
      expect(sender.getPendingRequestsCount()).toBe(1);
    });

    it('ignores _existingTaskId parameter', async () => {
      const taskId = await sender.sendVoiceAPIRequest(makeVoiceAPIRequest({ taskId: 'vapi-key-2' }), 'should-be-ignored');
      expect(taskId).toBe('vapi-key-2');
    });

    it('logs "N/A" when userId is omitted', async () => {
      const req = makeVoiceAPIRequest({ taskId: 'vapi-no-user', userId: undefined });
      await sender.sendVoiceAPIRequest(req);
      // branch: request.userId || 'N/A' — falsy side (line 358)
      expect(connectionManager.send).toHaveBeenCalledTimes(1);
    });
  });

  // ── sendVoiceProfileRequest ───────────────────────────────────────────────────

  describe('sendVoiceProfileRequest', () => {
    it('returns request.request_id and increments voiceProfileRequests', async () => {
      const req = makeVoiceProfileRequest({ request_id: 'vp-req-001' });
      const id = await sender.sendVoiceProfileRequest(req);
      expect(id).toBe('vp-req-001');
      expect(sender.getStats().voiceProfileRequests).toBe(1);
    });

    it('calls connectionManager.send with the full request object', async () => {
      const req = makeVoiceProfileRequest({ request_id: 'vp-send-check' });
      await sender.sendVoiceProfileRequest(req);
      expect(connectionManager.send).toHaveBeenCalledTimes(1);
      const arg = firstSendArg(connectionManager);
      expect(arg.request_id).toBe('vp-send-check');
    });

    it('adds request to pendingRequests keyed by request.request_id', async () => {
      await sender.sendVoiceProfileRequest(makeVoiceProfileRequest({ request_id: 'vp-key' }));
      expect(sender.getPendingRequestsCount()).toBe(1);
    });
  });

  // ── sendStoryTextObjectRequest ────────────────────────────────────────────────

  describe('sendStoryTextObjectRequest', () => {
    it('calls connectionManager.send with the story translation message', async () => {
      await sender.sendStoryTextObjectRequest({
        postId: 'post-001',
        textObjectIndex: 0,
        text: 'Hello story',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'de'],
      });
      expect(connectionManager.send).toHaveBeenCalledTimes(1);
      const msg = firstSendArg(connectionManager);
      expect(msg.type).toBe('story_text_object_translation');
      expect(msg.postId).toBe('post-001');
      expect(msg.textObjectIndex).toBe(0);
      expect(msg.targetLanguages).toEqual(['fr', 'de']);
    });

    it('returns void (no return value)', async () => {
      const result = await sender.sendStoryTextObjectRequest({
        postId: 'post-002',
        textObjectIndex: 1,
        text: 'text',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
      });
      expect(result).toBeUndefined();
    });

    it('does NOT add to pendingRequests', async () => {
      await sender.sendStoryTextObjectRequest({
        postId: 'post-003',
        textObjectIndex: 0,
        text: 'text',
        sourceLanguage: 'en',
        targetLanguages: ['fr'],
      });
      expect(sender.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── registerTimeout ───────────────────────────────────────────────────────────

  describe('registerTimeout', () => {
    it('no-op when taskId is not in pendingRequests', () => {
      const onTimeout = jest.fn();
      sender.registerTimeout('nonexistent-task', 1000, onTimeout);
      jest.advanceTimersByTime(2000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('calls onTimeout after timeoutMs when task is still pending', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'timeout-task');
      const onTimeout = jest.fn();
      sender.registerTimeout('timeout-task', 2000, onTimeout);
      jest.advanceTimersByTime(2001);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('removes the task from pendingRequests when timeout fires', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'timeout-remove-task');
      sender.registerTimeout('timeout-remove-task', 500, jest.fn());
      jest.advanceTimersByTime(501);
      expect(sender.getPendingRequestsCount()).toBe(0);
    });

    it('does NOT call onTimeout when task is removed before timeout fires', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'cancel-task');
      const onTimeout = jest.fn();
      sender.registerTimeout('cancel-task', 5000, onTimeout);
      sender.removePendingRequest('cancel-task');
      jest.advanceTimersByTime(6000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('skips callback when entry was already deleted by an earlier timer (double-register guard)', async () => {
      // Register the task, then register a timeout twice.
      // The second registerTimeout replaces the stored timeoutId but does NOT cancel the first
      // timer — both timers are now live. When the second fires first (shorter duration), it
      // deletes the entry and fires onTimeout2. When the first fires later, it finds no entry
      // (pendingRequests.has(taskId) === false) and does nothing — covering the false branch on
      // the defensive guard inside the setTimeout callback (line 445).
      await sender.sendTranslationRequest(makeTranslationRequest(), 'double-reg-task');
      const onTimeout1 = jest.fn();
      const onTimeout2 = jest.fn();
      sender.registerTimeout('double-reg-task', 5000, onTimeout1); // t1 fires at 5000ms
      sender.registerTimeout('double-reg-task', 2000, onTimeout2); // t2 fires at 2000ms, replaces stored handle
      // t2 fires first — task exists, so it deletes entry and calls onTimeout2
      jest.advanceTimersByTime(2001);
      expect(onTimeout2).toHaveBeenCalledTimes(1);
      expect(sender.getPendingRequestsCount()).toBe(0);
      // t1 fires later — task is already gone → false branch, onTimeout1 NOT called
      jest.advanceTimersByTime(3000); // total 5001ms
      expect(onTimeout1).not.toHaveBeenCalled();
    });
  });

  // ── removePendingRequest ──────────────────────────────────────────────────────

  describe('removePendingRequest', () => {
    it('removes a pending request by taskId', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'remove-me');
      expect(sender.getPendingRequestsCount()).toBe(1);
      sender.removePendingRequest('remove-me');
      expect(sender.getPendingRequestsCount()).toBe(0);
    });

    it('clears the associated timeout when removing', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'remove-timeout-task');
      const onTimeout = jest.fn();
      sender.registerTimeout('remove-timeout-task', 3000, onTimeout);
      sender.removePendingRequest('remove-timeout-task');
      jest.advanceTimersByTime(4000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('is a no-op for a taskId that does not exist', () => {
      expect(() => sender.removePendingRequest('ghost-task')).not.toThrow();
    });

    it('works when the entry has no timeoutId (no clearTimeout branch)', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'no-timeout-task');
      // No registerTimeout call → timeoutId is undefined
      expect(() => sender.removePendingRequest('no-timeout-task')).not.toThrow();
      expect(sender.getPendingRequestsCount()).toBe(0);
    });
  });

  // ── getPendingRequestsCount ───────────────────────────────────────────────────

  describe('getPendingRequestsCount', () => {
    it('reflects the current number of tracked requests', async () => {
      expect(sender.getPendingRequestsCount()).toBe(0);
      await sender.sendTranslationRequest(makeTranslationRequest(), 'cnt-1');
      expect(sender.getPendingRequestsCount()).toBe(1);
      await sender.sendVoiceAPIRequest(makeVoiceAPIRequest({ taskId: 'cnt-2' }));
      expect(sender.getPendingRequestsCount()).toBe(2);
      sender.removePendingRequest('cnt-1');
      expect(sender.getPendingRequestsCount()).toBe(1);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns a copy — mutating it does not affect internal state', () => {
      const stats = sender.getStats();
      (stats as any).translationRequests = 9999;
      expect(sender.getStats().translationRequests).toBe(0);
    });

    it('accumulates counts across multiple request types', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'stat-t1');
      await sender.sendTranslationRequest(makeTranslationRequest(), 'stat-t2');
      await sender.sendVoiceAPIRequest(makeVoiceAPIRequest({ taskId: 'stat-v1' }));
      const stats = sender.getStats();
      expect(stats.translationRequests).toBe(2);
      expect(stats.voiceAPIRequests).toBe(1);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('clears all pending requests and cancels their timeouts', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'clear-t1');
      await sender.sendTranslationRequest(makeTranslationRequest(), 'clear-t2');
      const onTimeout1 = jest.fn();
      const onTimeout2 = jest.fn();
      sender.registerTimeout('clear-t1', 2000, onTimeout1);
      sender.registerTimeout('clear-t2', 2000, onTimeout2);

      sender.clear();
      expect(sender.getPendingRequestsCount()).toBe(0);

      jest.advanceTimersByTime(3000);
      expect(onTimeout1).not.toHaveBeenCalled();
      expect(onTimeout2).not.toHaveBeenCalled();
    });

    it('is safe to call when pendingRequests is already empty', () => {
      expect(() => sender.clear()).not.toThrow();
    });

    it('clears entries without timeoutId without throwing', async () => {
      await sender.sendTranslationRequest(makeTranslationRequest(), 'clear-no-timeout');
      // No registerTimeout → timeoutId undefined
      expect(() => sender.clear()).not.toThrow();
      expect(sender.getPendingRequestsCount()).toBe(0);
    });
  });
});
