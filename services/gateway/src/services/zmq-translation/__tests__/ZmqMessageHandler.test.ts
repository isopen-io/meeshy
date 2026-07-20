/**
 * Unit tests for ZmqMessageHandler
 *
 * Coverage targets: ≥92% lines + branches
 *
 * Strategy:
 * - Drive every event type through handleMessage() as a real JSON Buffer
 * - Drive multipart paths with Buffer arrays
 * - Assert emitted events and stats rather than internal state
 * - Cover all deduplication + LRU eviction branches
 * - Cover binary-frame extraction for audio_process_completed
 * - Cover __binaryFrames injection for the three audio-translation events
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mock logger before any import ────────────────────────────────────────────
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

import { ZmqMessageHandler } from '../ZmqMessageHandler';

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeBuffer(obj: object): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf-8');
}

function makeMultipart(obj: object, binaries: Buffer[]): Buffer[] {
  return [makeBuffer(obj), ...binaries];
}

function makeTranslationResult(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-001',
    translatedText: 'Bonjour',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    confidenceScore: 0.99,
    processingTime: 42,
    modelType: 'basic',
    ...overrides,
  };
}

function makeTranscription(overrides: Record<string, unknown> = {}) {
  return {
    text: 'Hello world',
    language: 'en',
    confidence: 0.98,
    durationMs: 1200,
    source: 'whisper',
    ...overrides,
  };
}

function makeTranslatedAudio(lang: string) {
  return {
    targetLanguage: lang,
    translatedText: `text-${lang}`,
    audioUrl: `http://example.com/${lang}.mp3`,
    audioPath: `/tmp/${lang}.mp3`,
    durationMs: 800,
    voiceCloned: false,
    voiceQuality: 0.9,
    audioMimeType: 'audio/mpeg',
  };
}

function makeBaseTranslationEvent(lang: string) {
  return {
    taskId: 'task-123',
    messageId: 'msg-001',
    attachmentId: 'att-001',
    language: lang,
    translatedAudio: makeTranslatedAudio(lang),
    timestamp: Date.now(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ZmqMessageHandler', () => {
  let handler: ZmqMessageHandler;

  beforeEach(() => {
    handler = new ZmqMessageHandler();
  });

  // ── Construction ─────────────────────────────────────────────────────────────

  describe('construction', () => {
    it('starts with all-zero stats', () => {
      const stats = handler.getStats();
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.translationCompleted).toBe(0);
      expect(stats.multipartMessages).toBe(0);
    });
  });

  // ── handleMessage — simple (single Buffer) ───────────────────────────────────

  describe('handleMessage — simple Buffer', () => {
    it('increments messagesProcessed and does NOT increment multipartMessages', async () => {
      const event = { type: 'pong', timestamp: Date.now(), translator_status: 'ok' };
      await handler.handleMessage(makeBuffer(event));
      const stats = handler.getStats();
      expect(stats.messagesProcessed).toBe(1);
      expect(stats.multipartMessages).toBe(0);
    });

    it('silently ignores invalid JSON without throwing', async () => {
      const badBuffer = Buffer.from('NOT JSON!!!', 'utf-8');
      await expect(handler.handleMessage(badBuffer)).resolves.toBeUndefined();
      // messagesProcessed is NOT incremented because JSON.parse threw before the increment
      expect(handler.getStats().messagesProcessed).toBe(0);
    });
  });

  // ── handleMessage — multipart (Buffer[]) ─────────────────────────────────────

  describe('handleMessage — multipart Buffer[]', () => {
    it('increments multipartMessages for a Buffer array', async () => {
      const event = { type: 'pong', timestamp: Date.now(), translator_status: 'ok' };
      const binary = Buffer.from('binary-data');
      await handler.handleMessage(makeMultipart(event, [binary]));
      expect(handler.getStats().multipartMessages).toBe(1);
      expect(handler.getStats().messagesProcessed).toBe(1);
    });

    it('handles a multipart message with zero extra frames', async () => {
      const event = { type: 'pong', timestamp: Date.now(), translator_status: 'ok' };
      // Array with only the JSON frame — binaryFrames will be []
      await handler.handleMessage([makeBuffer(event)]);
      expect(handler.getStats().multipartMessages).toBe(1);
    });
  });

  // ── routeEvent — pong ─────────────────────────────────────────────────────────

  describe('pong event', () => {
    it('is silently handled (no emit, no stat increment beyond messagesProcessed)', async () => {
      const listener = jest.fn();
      handler.on('pong', listener);
      await handler.handleMessage(makeBuffer({ type: 'pong', timestamp: 1, translator_status: 'ok' }));
      expect(listener).not.toHaveBeenCalled();
      expect(handler.getStats().messagesProcessed).toBe(1);
    });
  });

  // ── routeEvent — unknown type ─────────────────────────────────────────────────

  describe('unknown event type', () => {
    it('logs a warning but does not throw or crash', async () => {
      const listener = jest.fn();
      handler.on('unknown', listener);
      await handler.handleMessage(makeBuffer({ type: 'totally_unknown_type' }));
      expect(handler.getStats().messagesProcessed).toBe(1);
    });
  });

  // ── translation_completed ─────────────────────────────────────────────────────

  describe('translation_completed', () => {
    function makeEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: 'translation_completed',
        taskId: 'task-001',
        targetLanguage: 'fr',
        timestamp: Date.now(),
        result: makeTranslationResult(),
        ...overrides,
      };
    }

    it('emits translationCompleted with correct payload', async () => {
      const received: unknown[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      const payload = received[0] as any;
      expect(payload.taskId).toBe('task-001');
      expect(payload.targetLanguage).toBe('fr');
      expect(payload.result.messageId).toBe('msg-001');
    });

    it('increments translationCompleted stat', async () => {
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(handler.getStats().translationCompleted).toBe(1);
    });

    it('emits the scoped translationCompleted:${messageId} event when messageId is present', async () => {
      const scopedReceived: unknown[] = [];
      handler.on('translationCompleted:msg-001', (p) => scopedReceived.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(scopedReceived).toHaveLength(1);
    });

    it('does NOT emit global or scoped event when result has no messageId', async () => {
      const event = makeEvent();
      // result without messageId → guard at !event.result.messageId returns early
      (event as any).result = { translatedText: 'hi' };
      const globalReceived: unknown[] = [];
      handler.on('translationCompleted', (p) => globalReceived.push(p));
      await handler.handleMessage(makeBuffer(event));
      expect(globalReceived).toHaveLength(0);
    });

    it('returns early when result is missing entirely', async () => {
      const event = makeEvent();
      delete (event as any).result;
      const received: unknown[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(event));
      expect(received).toHaveLength(0);
      expect(handler.getStats().translationCompleted).toBe(0);
    });

    it('deduplicates by taskId+targetLanguage: same key fires only once', async () => {
      const received: unknown[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      const event = makeEvent();
      await handler.handleMessage(makeBuffer(event));
      await handler.handleMessage(makeBuffer(event)); // duplicate
      expect(received).toHaveLength(1);
    });

    it('does NOT deduplicate when targetLanguage differs', async () => {
      const received: unknown[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ taskId: 'task-dup', targetLanguage: 'fr' })));
      await handler.handleMessage(makeBuffer(makeEvent({ taskId: 'task-dup', targetLanguage: 'en', result: makeTranslationResult({ messageId: 'msg-002' }) })));
      expect(received).toHaveLength(2);
    });

    it('does NOT deduplicate when taskId differs', async () => {
      const received: unknown[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ taskId: 'task-A', targetLanguage: 'fr' })));
      await handler.handleMessage(makeBuffer(makeEvent({ taskId: 'task-B', targetLanguage: 'fr', result: makeTranslationResult({ messageId: 'msg-003' }) })));
      expect(received).toHaveLength(2);
    });

    it('LRU evicts the oldest entry when processedResults exceeds 1000', async () => {
      // Fill the set with 1001 unique translation keys so first one gets evicted
      for (let i = 0; i < 1001; i++) {
        await handler.handleMessage(makeBuffer(makeEvent({ taskId: `evict-task-${i}`, result: makeTranslationResult({ messageId: `msg-evict-${i}` }) })));
      }

      // After 1001 inserts, "evict-task-0_fr" should have been evicted.
      // Re-sending it should NOT be deduplicated.
      handler.resetStats();
      const received: unknown[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ taskId: 'evict-task-0' })));
      expect(received).toHaveLength(1);
    });

    it('includes metadata from the event in the payload', async () => {
      const received: any[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ metadata: { conversationId: 'conv-xyz' } })));
      expect(received[0].metadata).toEqual({ conversationId: 'conv-xyz' });
    });

    it('defaults metadata to {} when absent', async () => {
      const received: any[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      const event = makeEvent();
      delete (event as any).metadata;
      await handler.handleMessage(makeBuffer(event));
      expect(received[0].metadata).toEqual({});
    });
  });

  // ── translation_error ─────────────────────────────────────────────────────────

  describe('translation_error', () => {
    function makeEvent() {
      return {
        type: 'translation_error',
        taskId: 'task-err',
        messageId: 'msg-err',
        error: 'translator crashed',
        conversationId: 'conv-001',
        metadata: { retryCount: 1 },
      };
    }

    it('emits translationError with correct payload', async () => {
      const received: any[] = [];
      handler.on('translationError', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].error).toBe('translator crashed');
      expect(received[0].conversationId).toBe('conv-001');
    });

    it('increments translationErrors stat', async () => {
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(handler.getStats().translationErrors).toBe(1);
    });

    it('defaults metadata to {} when absent', async () => {
      const received: any[] = [];
      handler.on('translationError', (p) => received.push(p));
      const ev = makeEvent();
      delete (ev as any).metadata;
      await handler.handleMessage(makeBuffer(ev));
      expect(received[0].metadata).toEqual({});
    });
  });

  // ── audio_process_completed ───────────────────────────────────────────────────

  describe('audio_process_completed', () => {
    function makeEvent(
      translatedAudios = [makeTranslatedAudio('fr')],
      extraFields: Record<string, unknown> = {}
    ) {
      return {
        type: 'audio_process_completed',
        taskId: 'audio-task-001',
        messageId: 'msg-audio-001',
        attachmentId: 'att-001',
        transcription: makeTranscription(),
        translatedAudios,
        voiceModelUserId: 'user-001',
        voiceModelQuality: 0.9,
        processingTimeMs: 3500,
        timestamp: Date.now(),
        ...extraFields,
      };
    }

    it('emits audioProcessCompleted and increments audioCompleted', async () => {
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].messageId).toBe('msg-audio-001');
      expect(handler.getStats().audioCompleted).toBe(1);
    });

    it('emits audioProcessCompleted with an empty array when translatedAudios is absent (transcription-only frame)', async () => {
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      // Transcription-only frame: the translator emitted no target-language audios,
      // so translatedAudios is absent from the untyped ZMQ JSON parsed off the socket.
      const rawEvent = {
        type: 'audio_process_completed',
        taskId: 'audio-task-transcription-only',
        messageId: 'msg-audio-002',
        attachmentId: 'att-002',
        transcription: makeTranscription(),
        voiceModelUserId: 'user-001',
        voiceModelQuality: 0.9,
        processingTimeMs: 3500,
        timestamp: Date.now(),
      };
      await handler.handleMessage(makeBuffer(rawEvent));
      expect(received).toHaveLength(1);
      expect(received[0].translatedAudios).toEqual([]);
      expect(handler.getStats().audioCompleted).toBe(1);
    });

    it('sets _audioBinary to null when no binaryFrames object on the event', async () => {
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received[0].translatedAudios[0]._audioBinary).toBeNull();
    });

    it('enriches translatedAudios with _audioBinary buffer from multipart frames', async () => {
      const audioFrBuffer = Buffer.from('AUDIO_FR_BINARY');
      const eventObj = makeEvent([makeTranslatedAudio('fr')], {
        binaryFrames: {
          audio_fr: { index: 1, size: audioFrBuffer.length, mimeType: 'audio/mpeg' },
        },
      });
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(eventObj, [audioFrBuffer]));
      expect(received[0].translatedAudios[0]._audioBinary).toEqual(audioFrBuffer);
    });

    it('handles multiple translated audios with correct binary mapping', async () => {
      const audioEn = Buffer.alloc(512, 0xaa);
      const audioFr = Buffer.alloc(256, 0xbb);
      const eventObj = makeEvent([makeTranslatedAudio('en'), makeTranslatedAudio('fr')], {
        binaryFrames: {
          audio_en: { index: 1, size: 512 },
          audio_fr: { index: 2, size: 256 },
        },
      });
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(eventObj, [audioEn, audioFr]));
      const audios = received[0].translatedAudios as any[];
      expect(audios.find((a: any) => a.targetLanguage === 'en')._audioBinary).toEqual(audioEn);
      expect(audios.find((a: any) => a.targetLanguage === 'fr')._audioBinary).toEqual(audioFr);
    });

    it('extracts embeddingBinary and enriches newVoiceProfile when both are present', async () => {
      const audioFr = Buffer.alloc(128, 0xcc);
      const embedding = Buffer.alloc(64, 0xdd);
      const eventObj = makeEvent([makeTranslatedAudio('fr')], {
        binaryFrames: {
          audio_fr: { index: 1, size: 128 },
          embedding: { index: 2, size: 64 },
        },
        newVoiceProfile: { profileId: 'vp-001', userId: 'user-001' },
      });
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(eventObj, [audioFr, embedding]));
      expect(received[0].newVoiceProfile._embeddingBinary).toEqual(embedding);
    });

    it('does NOT enrich newVoiceProfile when embeddingBinary is null', async () => {
      const eventObj = makeEvent([makeTranslatedAudio('fr')], {
        newVoiceProfile: { profileId: 'vp-002' },
      });
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(eventObj));
      expect(received[0].newVoiceProfile._embeddingBinary).toBeUndefined();
    });

    it('sets newVoiceProfile to null when absent from event', async () => {
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received[0].newVoiceProfile).toBeNull();
    });

    it('ignores frame index that is out of range', async () => {
      const audioFr = Buffer.alloc(64, 0xee);
      const eventObj = makeEvent([makeTranslatedAudio('fr'), makeTranslatedAudio('de')], {
        binaryFrames: {
          audio_fr: { index: 1, size: 64 },
          audio_de: { index: 99, size: 64 }, // out of range
        },
      });
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(eventObj, [audioFr]));
      const audios = received[0].translatedAudios as any[];
      expect(audios.find((a: any) => a.targetLanguage === 'fr')._audioBinary).toEqual(audioFr);
      expect(audios.find((a: any) => a.targetLanguage === 'de')._audioBinary).toBeNull();
    });

    it('deduplicates by audio_${taskId}: same taskId processed only once', async () => {
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      const event = makeEvent();
      await handler.handleMessage(makeBuffer(event));
      await handler.handleMessage(makeBuffer(event)); // duplicate
      expect(received).toHaveLength(1);
      expect(handler.getStats().audioCompleted).toBe(1);
    });

    it('LRU evicts audio entries after >1000 unique tasks', async () => {
      for (let i = 0; i < 1001; i++) {
        await handler.handleMessage(makeBuffer(makeEvent([], { taskId: `audio-evict-${i}` })));
      }
      handler.resetStats();
      const received: any[] = [];
      handler.on('audioProcessCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent([makeTranslatedAudio('fr')], { taskId: 'audio-evict-0' })));
      expect(received).toHaveLength(1);
    });
  });

  // ── audio_process_error ───────────────────────────────────────────────────────

  describe('audio_process_error', () => {
    function makeEvent() {
      return {
        type: 'audio_process_error',
        taskId: 'task-audio-err',
        messageId: 'msg-audio-err',
        attachmentId: 'att-err',
        error: 'whisper failed',
        errorCode: 'WHISPER_ERROR',
        timestamp: Date.now(),
      };
    }

    it('emits audioProcessError with correct payload', async () => {
      const received: any[] = [];
      handler.on('audioProcessError', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].error).toBe('whisper failed');
      expect(received[0].errorCode).toBe('WHISPER_ERROR');
    });

    it('increments audioErrors stat', async () => {
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(handler.getStats().audioErrors).toBe(1);
    });
  });

  // ── voice_api_success ─────────────────────────────────────────────────────────

  describe('voice_api_success', () => {
    function makeEvent() {
      return {
        type: 'voice_api_success',
        taskId: 'voice-task-001',
        requestType: 'voice_translate',
        result: { audioUrl: 'http://example.com/audio.mp3' },
        processingTimeMs: 1200,
        timestamp: Date.now(),
      };
    }

    it('emits voiceAPISuccess and increments voiceEvents', async () => {
      const received: any[] = [];
      handler.on('voiceAPISuccess', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].taskId).toBe('voice-task-001');
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── voice_api_error ───────────────────────────────────────────────────────────

  describe('voice_api_error', () => {
    function makeEvent() {
      return {
        type: 'voice_api_error',
        taskId: 'voice-err-task',
        requestType: 'voice_translate',
        error: 'TTS failed',
        errorCode: 'TTS_ERROR',
        timestamp: Date.now(),
      };
    }

    it('emits voiceAPIError and increments voiceEvents', async () => {
      const received: any[] = [];
      handler.on('voiceAPIError', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].errorCode).toBe('TTS_ERROR');
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── voice_job_progress ────────────────────────────────────────────────────────

  describe('voice_job_progress', () => {
    function makeEvent() {
      return {
        type: 'voice_job_progress',
        taskId: 'job-task-001',
        jobId: 'job-001',
        progress: 50,
        currentStep: 'tts_synthesis',
        timestamp: Date.now(),
      };
    }

    it('emits voiceJobProgress and increments voiceEvents', async () => {
      const received: any[] = [];
      handler.on('voiceJobProgress', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].progress).toBe(50);
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── voice_profile_analyze_result ──────────────────────────────────────────────

  describe('voice_profile_analyze_result', () => {
    it('emits voiceProfileAnalyzeResult and increments voiceEvents on success', async () => {
      const received: any[] = [];
      handler.on('voiceProfileAnalyzeResult', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_analyze_result',
        request_id: 'req-001',
        success: true,
        user_id: 'user-001',
        quality_score: 0.92,
      }));
      expect(received).toHaveLength(1);
      expect(received[0].request_id).toBe('req-001');
      expect(handler.getStats().voiceEvents).toBe(1);
    });

    it('emits voiceProfileAnalyzeResult on failure (success=false branch)', async () => {
      const received: any[] = [];
      handler.on('voiceProfileAnalyzeResult', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_analyze_result',
        request_id: 'req-002',
        success: false,
        user_id: 'user-002',
        error: 'audio too short',
      }));
      expect(received).toHaveLength(1);
      expect(received[0].success).toBe(false);
    });
  });

  // ── voice_profile_verify_result ───────────────────────────────────────────────

  describe('voice_profile_verify_result', () => {
    it('emits voiceProfileVerifyResult on success', async () => {
      const received: any[] = [];
      handler.on('voiceProfileVerifyResult', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_verify_result',
        request_id: 'vv-001',
        success: true,
        user_id: 'user-001',
        is_match: true,
        similarity_score: 0.95,
      }));
      expect(received).toHaveLength(1);
      expect(received[0].is_match).toBe(true);
      expect(handler.getStats().voiceEvents).toBe(1);
    });

    it('emits voiceProfileVerifyResult on failure (success=false branch)', async () => {
      const received: any[] = [];
      handler.on('voiceProfileVerifyResult', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_verify_result',
        request_id: 'vv-002',
        success: false,
        user_id: 'user-002',
        error: 'fingerprint mismatch',
      }));
      expect(received[0].success).toBe(false);
    });
  });

  // ── voice_profile_compare_result ──────────────────────────────────────────────

  describe('voice_profile_compare_result', () => {
    it('emits voiceProfileCompareResult on success', async () => {
      const received: any[] = [];
      handler.on('voiceProfileCompareResult', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_compare_result',
        request_id: 'vc-001',
        success: true,
        similarity_score: 0.87,
        is_match: true,
      }));
      expect(received).toHaveLength(1);
      expect(received[0].similarity_score).toBe(0.87);
      expect(handler.getStats().voiceEvents).toBe(1);
    });

    it('emits voiceProfileCompareResult on failure (success=false branch)', async () => {
      const received: any[] = [];
      handler.on('voiceProfileCompareResult', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_compare_result',
        request_id: 'vc-002',
        success: false,
        error: 'comparison failed',
      }));
      expect(received[0].success).toBe(false);
    });
  });

  // ── voice_profile_error ───────────────────────────────────────────────────────

  describe('voice_profile_error', () => {
    it('emits voiceProfileError and increments voiceEvents', async () => {
      const received: any[] = [];
      handler.on('voiceProfileError', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_profile_error',
        request_id: 'vpe-001',
        error: 'profile not found',
        success: false,
        timestamp: Date.now(),
      }));
      expect(received).toHaveLength(1);
      expect(received[0].error).toBe('profile not found');
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── transcription_completed ───────────────────────────────────────────────────

  describe('transcription_completed', () => {
    function makeEvent(transcriptionOverrides: Record<string, unknown> = {}) {
      return {
        type: 'transcription_completed',
        taskId: 'trans-task-001',
        messageId: 'msg-trans-001',
        attachmentId: 'att-trans-001',
        transcription: {
          text: 'Hello world this is a test sentence for transcription',
          language: 'en',
          confidence: 0.98,
          durationMs: 2000,
          source: 'whisper',
          ...transcriptionOverrides,
        },
        processingTimeMs: 800,
        timestamp: Date.now(),
      };
    }

    it('emits transcriptionCompleted with correct payload', async () => {
      const received: any[] = [];
      handler.on('transcriptionCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].messageId).toBe('msg-trans-001');
      expect(handler.getStats().transcriptionCompleted).toBe(1);
    });

    it('handles transcription without text (no text log branch)', async () => {
      const received: any[] = [];
      handler.on('transcriptionCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ text: undefined })));
      expect(received).toHaveLength(1);
    });

    it('handles transcription without language (no language log branch)', async () => {
      const received: any[] = [];
      handler.on('transcriptionCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ language: undefined })));
      expect(received).toHaveLength(1);
    });
  });

  // ── transcription_ready ───────────────────────────────────────────────────────

  describe('transcription_ready', () => {
    function makeEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: 'transcription_ready',
        taskId: 'tr-task-001',
        messageId: 'msg-tr-001',
        attachmentId: 'att-tr-001',
        transcription: makeTranscription({ speakerCount: 2 }),
        processingTimeMs: 600,
        timestamp: Date.now(),
        ...overrides,
      };
    }

    it('emits transcriptionReady with correct payload', async () => {
      const received: any[] = [];
      handler.on('transcriptionReady', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent()));
      expect(received).toHaveLength(1);
      expect(received[0].messageId).toBe('msg-tr-001');
    });

    it('includes postId and postMediaId when present', async () => {
      const received: any[] = [];
      handler.on('transcriptionReady', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEvent({ postId: 'post-001', postMediaId: 'pm-001' })));
      expect(received[0].postId).toBe('post-001');
      expect(received[0].postMediaId).toBe('pm-001');
    });

    it('handles missing transcription.text (no text log branch)', async () => {
      const received: any[] = [];
      handler.on('transcriptionReady', (p) => received.push(p));
      const event = makeEvent();
      (event.transcription as any).text = undefined;
      await handler.handleMessage(makeBuffer(event));
      expect(received).toHaveLength(1);
    });

    it('handles missing transcription.language (no language log branch)', async () => {
      const received: any[] = [];
      handler.on('transcriptionReady', (p) => received.push(p));
      const event = makeEvent();
      (event.transcription as any).language = undefined;
      await handler.handleMessage(makeBuffer(event));
      expect(received).toHaveLength(1);
    });

    it('handles missing transcription.speakerCount (no speakerCount log branch)', async () => {
      const received: any[] = [];
      handler.on('transcriptionReady', (p) => received.push(p));
      const event = makeEvent();
      (event.transcription as any).speakerCount = undefined;
      await handler.handleMessage(makeBuffer(event));
      expect(received).toHaveLength(1);
    });
  });

  // ── translation_ready (deprecated) ───────────────────────────────────────────

  describe('translation_ready (deprecated)', () => {
    it('emits translationReady with correct payload', async () => {
      const received: any[] = [];
      handler.on('translationReady', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'translation_ready',
        taskId: 'tr-001',
        messageId: 'msg-tr-001',
        attachmentId: 'att-001',
        language: 'fr',
        translatedAudio: {
          targetLanguage: 'fr',
          translatedText: 'Bonjour',
          audioUrl: 'http://example.com/fr.mp3',
          audioPath: '/tmp/fr.mp3',
          durationMs: 900,
          voiceCloned: true,
          voiceQuality: 0.88,
          audioMimeType: 'audio/mpeg',
          segments: [],
        },
        timestamp: Date.now(),
      }));
      expect(received).toHaveLength(1);
      expect(received[0].language).toBe('fr');
      expect(received[0].translatedAudio.translatedText).toBe('Bonjour');
    });
  });

  // ── audio_translation_ready ───────────────────────────────────────────────────

  describe('audio_translation_ready', () => {
    function makeEventObj() {
      return { type: 'audio_translation_ready', ...makeBaseTranslationEvent('fr') };
    }

    it('emits audioTranslationReady with _audioBinary null when no binary frames', async () => {
      const received: any[] = [];
      handler.on('audioTranslationReady', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEventObj()));
      expect(received).toHaveLength(1);
      expect(received[0].translatedAudio._audioBinary).toBeNull();
    });

    it('enriches translatedAudio._audioBinary when multipart frames present', async () => {
      const audioBuf = Buffer.from('BINARY_AUDIO_FR');
      const received: any[] = [];
      handler.on('audioTranslationReady', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(makeEventObj(), [audioBuf]));
      expect(received[0].translatedAudio._audioBinary).toEqual(audioBuf);
    });
  });

  // ── audio_translations_progressive ───────────────────────────────────────────

  describe('audio_translations_progressive', () => {
    function makeEventObj() {
      return { type: 'audio_translations_progressive', ...makeBaseTranslationEvent('de') };
    }

    it('emits audioTranslationsProgressive with _audioBinary null when no binary frames', async () => {
      const received: any[] = [];
      handler.on('audioTranslationsProgressive', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEventObj()));
      expect(received).toHaveLength(1);
      expect(received[0].language).toBe('de');
      expect(received[0].translatedAudio._audioBinary).toBeNull();
    });

    it('enriches _audioBinary from multipart frames', async () => {
      const audioBuf = Buffer.from('BINARY_AUDIO_DE');
      const received: any[] = [];
      handler.on('audioTranslationsProgressive', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(makeEventObj(), [audioBuf]));
      expect(received[0].translatedAudio._audioBinary).toEqual(audioBuf);
    });
  });

  // ── audio_translations_completed ─────────────────────────────────────────────

  describe('audio_translations_completed', () => {
    function makeEventObj() {
      return { type: 'audio_translations_completed', ...makeBaseTranslationEvent('es') };
    }

    it('emits audioTranslationsCompleted with _audioBinary null when no binary frames', async () => {
      const received: any[] = [];
      handler.on('audioTranslationsCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer(makeEventObj()));
      expect(received).toHaveLength(1);
      expect(received[0].translatedAudio._audioBinary).toBeNull();
    });

    it('enriches _audioBinary from multipart frames', async () => {
      const audioBuf = Buffer.from('BINARY_AUDIO_ES');
      const received: any[] = [];
      handler.on('audioTranslationsCompleted', (p) => received.push(p));
      await handler.handleMessage(makeMultipart(makeEventObj(), [audioBuf]));
      expect(received[0].translatedAudio._audioBinary).toEqual(audioBuf);
    });
  });

  // ── transcription_error ───────────────────────────────────────────────────────

  describe('transcription_error', () => {
    it('emits transcriptionError and increments transcriptionErrors', async () => {
      const received: any[] = [];
      handler.on('transcriptionError', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'transcription_error',
        taskId: 'task-terr',
        messageId: 'msg-terr',
        attachmentId: 'att-terr',
        error: 'model OOM',
        errorCode: 'WHISPER_OOM',
        timestamp: Date.now(),
      }));
      expect(received).toHaveLength(1);
      expect(received[0].errorCode).toBe('WHISPER_OOM');
      expect(handler.getStats().transcriptionErrors).toBe(1);
    });
  });

  // ── voice_translation_completed ───────────────────────────────────────────────

  describe('voice_translation_completed', () => {
    it('emits voiceTranslationCompleted with full result and increments stat', async () => {
      const received: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_translation_completed',
        jobId: 'job-vt-001',
        status: 'completed',
        userId: 'user-001',
        timestamp: Date.now(),
        result: {
          originalAudio: {
            transcription: 'Hello world from the original audio file',
            language: 'en',
          },
          translations: [
            { targetLanguage: 'fr', translatedText: 'Bonjour monde' },
            { targetLanguage: 'de', translatedText: 'Hallo Welt' },
          ],
        },
      }));
      expect(received).toHaveLength(1);
      expect(received[0].jobId).toBe('job-vt-001');
      expect(handler.getStats().voiceTranslationCompleted).toBe(1);
    });

    it('handles event without result (no result logging branch)', async () => {
      const received: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_translation_completed',
        jobId: 'job-vt-002',
        status: 'completed',
        userId: 'user-002',
        timestamp: Date.now(),
      }));
      expect(received).toHaveLength(1);
      expect(received[0].result).toBeUndefined();
    });

    it('handles result without transcription (partial result branch)', async () => {
      const received: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_translation_completed',
        jobId: 'job-vt-003',
        status: 'completed',
        userId: 'user-003',
        timestamp: Date.now(),
        result: {
          translations: [],
          originalAudio: { language: 'en' }, // no transcription field
        },
      }));
      expect(received).toHaveLength(1);
    });

    it('handles result with empty translations array (no translations log branch)', async () => {
      const received: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_translation_completed',
        jobId: 'job-vt-004',
        status: 'completed',
        userId: 'user-004',
        timestamp: Date.now(),
        result: {
          originalAudio: {
            transcription: 'Hi',
            language: 'en',
          },
          translations: [], // no translations → branch not logged
        },
      }));
      expect(received).toHaveLength(1);
    });
  });

  // ── voice_translation_failed ──────────────────────────────────────────────────

  describe('voice_translation_failed', () => {
    it('emits voiceTranslationFailed and increments voiceTranslationFailed stat', async () => {
      const received: any[] = [];
      handler.on('voiceTranslationFailed', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'voice_translation_failed',
        jobId: 'job-vt-err',
        status: 'failed',
        userId: 'user-err',
        timestamp: Date.now(),
        error: 'GPU timeout',
        errorCode: 'GPU_TIMEOUT',
      }));
      expect(received).toHaveLength(1);
      expect(received[0].error).toBe('GPU timeout');
      expect(handler.getStats().voiceTranslationFailed).toBe(1);
    });
  });

  // ── story_text_object_translation_completed ───────────────────────────────────

  describe('story_text_object_translation_completed', () => {
    it('emits storyTextObjectTranslationCompleted and increments stat', async () => {
      const received: any[] = [];
      handler.on('storyTextObjectTranslationCompleted', (p) => received.push(p));
      await handler.handleMessage(makeBuffer({
        type: 'story_text_object_translation_completed',
        postId: 'post-story-001',
        textObjectIndex: 2,
        translations: { fr: 'Bonjour', de: 'Hallo' },
        timestamp: Date.now(),
      }));
      expect(received).toHaveLength(1);
      expect(received[0].postId).toBe('post-story-001');
      expect(received[0].textObjectIndex).toBe(2);
      expect(received[0].translations).toEqual({ fr: 'Bonjour', de: 'Hallo' });
      expect(handler.getStats().storyTextObjectTranslationCompleted).toBe(1);
    });
  });

  // ── getStats / resetStats / clear ─────────────────────────────────────────────

  describe('getStats', () => {
    it('returns a copy — mutating the returned object does not affect internal state', () => {
      const stats = handler.getStats();
      (stats as any).translationCompleted = 9999;
      expect(handler.getStats().translationCompleted).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('resets all counters to zero', async () => {
      await handler.handleMessage(makeBuffer({ type: 'pong', timestamp: 1, translator_status: 'ok' }));
      handler.resetStats();
      const stats = handler.getStats();
      Object.values(stats).forEach((v) => expect(v).toBe(0));
    });
  });

  describe('clear', () => {
    it('resets stats and clears processedResults so a deduped key can fire again', async () => {
      const received: any[] = [];
      handler.on('translationCompleted', (p) => received.push(p));
      const event = {
        type: 'translation_completed',
        taskId: 'clear-task',
        targetLanguage: 'fr',
        timestamp: Date.now(),
        result: makeTranslationResult(),
      };
      await handler.handleMessage(makeBuffer(event));
      expect(received).toHaveLength(1);

      handler.clear();

      await handler.handleMessage(makeBuffer(event));
      expect(received).toHaveLength(2);

      // Stats were reset before second message, so translationCompleted = 1
      expect(handler.getStats().translationCompleted).toBe(1);
    });
  });
});
