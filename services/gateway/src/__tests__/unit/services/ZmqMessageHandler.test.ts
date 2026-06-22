/**
 * Unit tests for ZmqMessageHandler
 *
 * Covers:
 * - handleMessage: single buffer, multipart array, JSON parse error (no throw)
 * - All 20+ event types routed through handleMessage
 * - translationCompleted dedup: same resultKey twice → second ignored
 * - LRU eviction at 1001 entries
 * - translationCompleted with no result / no result.messageId → early return
 * - audioProcessCompleted: binary frame extraction (audio_ keys, embedding, invalid index)
 * - voiceProfile handlers: success=true/false for Analyze/Verify/Compare
 * - audioTranslationReady/Progressive/Completed: with and without __binaryFrames
 * - voiceTranslationCompleted: with result and without result
 * - pong → no emit
 * - unknown type → no emit
 * - getStats, resetStats, clear
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

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

import { ZmqMessageHandler } from '../../../services/zmq-translation/ZmqMessageHandler';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function toBuffer(obj: object): Buffer {
  return Buffer.from(JSON.stringify(obj));
}

function makeTranslationCompletedEvent(overrides: Partial<{
  taskId: string;
  targetLanguage: string;
  messageId: string;
  result: object | null;
}> = {}) {
  const messageId = overrides.messageId ?? 'msg-001';
  return {
    type: 'translation_completed',
    taskId: overrides.taskId ?? 'task-001',
    targetLanguage: overrides.targetLanguage ?? 'fr',
    timestamp: Date.now(),
    result: overrides.result !== undefined
      ? overrides.result
      : {
          messageId,
          translatedText: 'Bonjour',
          sourceLanguage: 'en',
          targetLanguage: overrides.targetLanguage ?? 'fr',
          confidenceScore: 0.99,
          processingTime: 42,
          modelType: 'basic',
        },
  };
}

function makeAudioProcessCompletedEvent(opts: {
  taskId?: string;
  messageId?: string;
  binaryFrames?: Record<string, { index: number; size: number; mimeType?: string }>;
  translatedAudios?: Array<{ targetLanguage: string; [k: string]: unknown }>;
  newVoiceProfile?: object;
} = {}) {
  return {
    type: 'audio_process_completed',
    taskId: opts.taskId ?? 'audio-task-001',
    messageId: opts.messageId ?? 'msg-audio-001',
    attachmentId: 'att-001',
    transcription: { text: 'Hello world', language: 'en', confidence: 0.95, durationMs: 2000, source: 'whisper' },
    translatedAudios: opts.translatedAudios ?? [
      { targetLanguage: 'fr', translatedText: 'Bonjour', audioUrl: '/fr.wav', audioPath: '/fr.wav', durationMs: 2000, voiceCloned: false, voiceQuality: 0.9, audioMimeType: 'audio/wav' },
    ],
    voiceModelUserId: 'user-001',
    voiceModelQuality: 0.9,
    processingTimeMs: 1234,
    timestamp: Date.now(),
    binaryFrames: opts.binaryFrames ?? {},
    newVoiceProfile: opts.newVoiceProfile ?? null,
  };
}

function makeBaseTranslationAudioEvent(type: string, opts: { withBinaryFrames?: boolean } = {}) {
  return {
    type,
    taskId: 'task-audio-001',
    messageId: 'msg-audio-001',
    attachmentId: 'att-001',
    language: 'fr',
    translatedAudio: {
      targetLanguage: 'fr',
      translatedText: 'Bonjour',
      audioUrl: '/fr.wav',
      audioPath: '/fr.wav',
      durationMs: 2000,
      voiceCloned: false,
      voiceQuality: 0.9,
      audioMimeType: 'audio/wav',
      segments: [],
    },
    timestamp: Date.now(),
    ...(opts.withBinaryFrames ? {} : {}),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('ZmqMessageHandler', () => {
  let handler: ZmqMessageHandler;

  beforeEach(() => {
    handler = new ZmqMessageHandler();
  });

  // ── handleMessage shape ─────────────────────────────────────────────────────

  describe('handleMessage', () => {
    it('handles a single Buffer (non-array)', async () => {
      const event = makeTranslationCompletedEvent();
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (payload) => emitted.push(payload));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
    });

    it('handles a multipart Buffer[] and increments multipartMessages stat', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translation_ready', { withBinaryFrames: false });
      const audioBuf = Buffer.from('fake-audio');
      const emitted: unknown[] = [];
      handler.on('audioTranslationReady', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf]);

      const stats = handler.getStats();
      expect(stats.multipartMessages).toBe(1);
      expect(emitted).toHaveLength(1);
    });

    it('does not throw and does not increment messagesProcessed on JSON parse error', async () => {
      await expect(
        handler.handleMessage(Buffer.from('{ NOT VALID JSON }'))
      ).resolves.not.toThrow();

      expect(handler.getStats().messagesProcessed).toBe(0);
    });

    it('increments messagesProcessed for each valid message', async () => {
      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 't1' })));
      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 't2' })));
      expect(handler.getStats().messagesProcessed).toBe(2);
    });
  });

  // ── translation_completed ───────────────────────────────────────────────────

  describe('translation_completed', () => {
    it('emits translationCompleted with correct payload', async () => {
      const event = makeTranslationCompletedEvent({ taskId: 'task-1', targetLanguage: 'fr', messageId: 'msg-1' });
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
      const payload = emitted[0] as any;
      expect(payload.taskId).toBe('task-1');
      expect(payload.targetLanguage).toBe('fr');
      expect(payload.result.messageId).toBe('msg-1');
    });

    it('emits scoped translationCompleted:{messageId} event', async () => {
      const event = makeTranslationCompletedEvent({ taskId: 'task-2', messageId: 'msg-scoped' });
      const scoped: unknown[] = [];
      handler.on('translationCompleted:msg-scoped', (p) => scoped.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(scoped).toHaveLength(1);
    });

    it('increments translationCompleted stat', async () => {
      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 'task-stat' })));
      expect(handler.getStats().translationCompleted).toBe(1);
    });

    it('deduplicates: same taskId+targetLanguage only processed once', async () => {
      const event = makeTranslationCompletedEvent({ taskId: 'dedup-task', targetLanguage: 'es' });
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));
      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
      expect(handler.getStats().translationCompleted).toBe(1);
    });

    it('does not dedup different taskId same targetLanguage (different resultKey)', async () => {
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 'task-A', targetLanguage: 'fr' })));
      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 'task-B', targetLanguage: 'fr' })));

      expect(emitted).toHaveLength(2);
    });

    it('evicts oldest entry when processedResults exceeds 1000', async () => {
      // Fill the set with 1000 unique entries
      for (let i = 0; i < 1000; i++) {
        const ev = makeTranslationCompletedEvent({ taskId: `fill-task-${i}`, targetLanguage: 'fr', messageId: `msg-${i}` });
        await handler.handleMessage(toBuffer(ev));
      }
      // Entry 0 should now be the oldest; adding entry 1001 evicts it
      const entryZero = makeTranslationCompletedEvent({ taskId: 'fill-task-0', targetLanguage: 'fr', messageId: 'msg-0' });
      const newEntry = makeTranslationCompletedEvent({ taskId: 'brand-new', targetLanguage: 'fr', messageId: 'msg-new' });
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(newEntry)); // triggers eviction of entry 0
      // Now entry 0 is evicted — sending it again should emit
      await handler.handleMessage(toBuffer(entryZero));

      // Both new-entry and re-processed entry-0 should have emitted
      expect(emitted.length).toBeGreaterThanOrEqual(2);
    });

    it('returns early (no emit) when event.result is falsy', async () => {
      const event = makeTranslationCompletedEvent({ taskId: 'no-result', result: null });
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(0);
      expect(handler.getStats().translationCompleted).toBe(0);
    });

    it('returns early (no emit) when event.result.messageId is falsy', async () => {
      const event = makeTranslationCompletedEvent({
        taskId: 'no-mid',
        result: { translatedText: 'Hi', sourceLanguage: 'en', targetLanguage: 'fr', confidenceScore: 0.9, processingTime: 1, modelType: 'basic' },
      });
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(0);
    });

    it('includes metadata in emitted payload', async () => {
      const event = { ...makeTranslationCompletedEvent({ taskId: 'meta-task' }), metadata: { source: 'test' } };
      const emitted: any[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].metadata).toEqual({ source: 'test' });
    });

    it('uses empty object as metadata when metadata missing', async () => {
      const event = makeTranslationCompletedEvent({ taskId: 'no-meta' });
      const emitted: any[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].metadata).toEqual({});
    });
  });

  // ── translation_error ───────────────────────────────────────────────────────

  describe('translation_error', () => {
    it('emits translationError with correct payload', async () => {
      const event = {
        type: 'translation_error',
        taskId: 'err-task',
        messageId: 'msg-err',
        error: 'Translation failed',
        conversationId: 'conv-001',
        metadata: { retries: 1 },
      };
      const emitted: any[] = [];
      handler.on('translationError', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
      expect(emitted[0].taskId).toBe('err-task');
      expect(emitted[0].messageId).toBe('msg-err');
      expect(emitted[0].error).toBe('Translation failed');
      expect(handler.getStats().translationErrors).toBe(1);
    });

    it('uses empty metadata when metadata is absent', async () => {
      const event = { type: 'translation_error', taskId: 't', messageId: 'm', error: 'e', conversationId: 'c' };
      const emitted: any[] = [];
      handler.on('translationError', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].metadata).toEqual({});
    });
  });

  // ── audio_process_completed ─────────────────────────────────────────────────

  describe('audio_process_completed', () => {
    it('emits audioProcessCompleted with enriched translatedAudios', async () => {
      const audioBuf = Buffer.alloc(512, 0xab);
      const event = makeAudioProcessCompletedEvent({
        taskId: 'aud-1',
        translatedAudios: [{ targetLanguage: 'fr', translatedText: 'Bonjour', audioUrl: '', audioPath: '', durationMs: 1000, voiceCloned: false, voiceQuality: 0.9, audioMimeType: 'audio/wav' }],
        binaryFrames: { audio_fr: { index: 1, size: 512, mimeType: 'audio/wav' } },
      });
      const emitted: any[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf]);

      expect(emitted).toHaveLength(1);
      const payload = emitted[0];
      expect(payload.translatedAudios[0]._audioBinary).toBe(audioBuf);
      expect(handler.getStats().audioCompleted).toBe(1);
    });

    it('sets _audioBinary to null when binary frame index is out of range', async () => {
      const event = makeAudioProcessCompletedEvent({
        taskId: 'aud-bad-idx',
        translatedAudios: [{ targetLanguage: 'fr', translatedText: '', audioUrl: '', audioPath: '', durationMs: 0, voiceCloned: false, voiceQuality: 0, audioMimeType: 'audio/wav' }],
        binaryFrames: { audio_fr: { index: 99, size: 0 } }, // out of range
      });
      const emitted: any[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), Buffer.alloc(8)]);

      expect(emitted[0].translatedAudios[0]._audioBinary).toBeNull();
    });

    it('skips frame extraction for a key that is not audio_ prefixed and not embedding', async () => {
      const audioBuf = Buffer.alloc(64, 0x11);
      const unknownBuf = Buffer.alloc(32, 0x33);
      // "unknown_key" does not start with audio_ and is not "embedding"
      // It hits the else-if false branch at line 332
      const event = makeAudioProcessCompletedEvent({
        taskId: 'aud-unknown-key',
        translatedAudios: [],
        binaryFrames: { unknown_key: { index: 1, size: 64 } },
      });
      const emitted: any[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf, unknownBuf]);

      // Emitted but the unknown_key didn't map to any audio
      expect(emitted).toHaveLength(1);
    });

    it('extracts embedding binary frame', async () => {
      const audioBuf = Buffer.alloc(64, 0x11);
      const embBuf = Buffer.alloc(128, 0x22);
      const event = makeAudioProcessCompletedEvent({
        taskId: 'aud-emb',
        translatedAudios: [{ targetLanguage: 'fr', translatedText: '', audioUrl: '', audioPath: '', durationMs: 0, voiceCloned: false, voiceQuality: 0, audioMimeType: 'audio/wav' }],
        binaryFrames: {
          audio_fr: { index: 1, size: 64 },
          embedding: { index: 2, size: 128 },
        },
        newVoiceProfile: { profileId: 'vp-1', userId: 'u-1', qualityScore: 0.9 },
      });
      const emitted: any[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf, embBuf]);

      const payload = emitted[0];
      expect(payload.newVoiceProfile._embeddingBinary).toBe(embBuf);
    });

    it('deduplicates audio_process_completed by taskId', async () => {
      const event = makeAudioProcessCompletedEvent({ taskId: 'dup-aud' });
      const emitted: unknown[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));
      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
    });

    it('emits newVoiceProfile as null when not present in event', async () => {
      const event = makeAudioProcessCompletedEvent({ taskId: 'aud-no-vp' });
      const emitted: any[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].newVoiceProfile).toBeNull();
    });

    it('evicts oldest audio entry when processedResults exceeds 1000', async () => {
      // Fill the shared processedResults set with 1000 unique audio entries
      for (let i = 0; i < 1000; i++) {
        await handler.handleMessage(
          toBuffer(makeAudioProcessCompletedEvent({ taskId: `aud-fill-${i}`, messageId: `msg-af-${i}` }))
        );
      }
      // The 1001st audio event triggers LRU eviction (lines 306-307)
      const emitted: unknown[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(makeAudioProcessCompletedEvent({ taskId: 'aud-new', messageId: 'msg-new' })));
      // After eviction, the first entry (aud-fill-0) is gone and can be re-processed
      await handler.handleMessage(
        toBuffer(makeAudioProcessCompletedEvent({ taskId: 'aud-fill-0', messageId: 'msg-af-0' }))
      );

      expect(emitted.length).toBeGreaterThanOrEqual(2);
    });

    it('handles event without binaryFrames property (covers binaryFrames || {} branch)', async () => {
      const rawEvent = {
        type: 'audio_process_completed',
        taskId: 'aud-no-bf',
        messageId: 'msg-no-bf',
        attachmentId: 'att-no-bf',
        transcription: { text: '', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper' },
        translatedAudios: [],
        voiceModelUserId: 'u-1',
        voiceModelQuality: 0.9,
        processingTimeMs: 100,
        timestamp: Date.now(),
        // binaryFrames key intentionally absent
      };
      const emitted: any[] = [];
      handler.on('audioProcessCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(rawEvent));

      expect(emitted).toHaveLength(1);
      expect(emitted[0].translatedAudios).toEqual([]);
    });
  });

  // ── audio_process_error ─────────────────────────────────────────────────────

  describe('audio_process_error', () => {
    it('emits audioProcessError and increments audioErrors', async () => {
      const event = {
        type: 'audio_process_error',
        taskId: 'aud-err',
        messageId: 'msg-ae',
        attachmentId: 'att-ae',
        error: 'Audio processing failed',
        errorCode: 'AUDIO_FAIL',
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('audioProcessError', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
      expect(emitted[0].errorCode).toBe('AUDIO_FAIL');
      expect(handler.getStats().audioErrors).toBe(1);
    });
  });

  // ── voice_api_success ───────────────────────────────────────────────────────

  describe('voice_api_success', () => {
    it('emits voiceAPISuccess and increments voiceEvents', async () => {
      const event = {
        type: 'voice_api_success',
        taskId: 'voice-t',
        requestType: 'voice_translate',
        result: { url: '/out.wav' },
        processingTimeMs: 300,
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('voiceAPISuccess', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].taskId).toBe('voice-t');
      expect(emitted[0].result).toEqual({ url: '/out.wav' });
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── voice_api_error ─────────────────────────────────────────────────────────

  describe('voice_api_error', () => {
    it('emits voiceAPIError and increments voiceEvents', async () => {
      const event = {
        type: 'voice_api_error',
        taskId: 'verr-t',
        requestType: 'voice_analyze',
        error: 'Model error',
        errorCode: 'MODEL_ERR',
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('voiceAPIError', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].errorCode).toBe('MODEL_ERR');
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── voice_job_progress ──────────────────────────────────────────────────────

  describe('voice_job_progress', () => {
    it('emits voiceJobProgress and increments voiceEvents', async () => {
      const event = {
        type: 'voice_job_progress',
        taskId: 'vjp-t',
        jobId: 'job-1',
        progress: 50,
        currentStep: 'tts',
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('voiceJobProgress', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].progress).toBe(50);
      expect(emitted[0].jobId).toBe('job-1');
    });
  });

  // ── voice_profile_analyze_result ────────────────────────────────────────────

  describe('voice_profile_analyze_result', () => {
    it('emits voiceProfileAnalyzeResult on success=true', async () => {
      const event = {
        type: 'voice_profile_analyze_result',
        request_id: 'req-1',
        success: true,
        user_id: 'user-1',
        quality_score: 0.92,
      };
      const emitted: any[] = [];
      handler.on('voiceProfileAnalyzeResult', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].success).toBe(true);
      expect(emitted[0].request_id).toBe('req-1');
      expect(handler.getStats().voiceEvents).toBe(1);
    });

    it('emits voiceProfileAnalyzeResult on success=false', async () => {
      const event = {
        type: 'voice_profile_analyze_result',
        request_id: 'req-2',
        success: false,
        user_id: 'user-1',
        error: 'Not enough audio',
      };
      const emitted: any[] = [];
      handler.on('voiceProfileAnalyzeResult', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].success).toBe(false);
      expect(emitted[0].error).toBe('Not enough audio');
    });
  });

  // ── voice_profile_verify_result ─────────────────────────────────────────────

  describe('voice_profile_verify_result', () => {
    it('emits voiceProfileVerifyResult on success=true', async () => {
      const event = {
        type: 'voice_profile_verify_result',
        request_id: 'verify-1',
        success: true,
        user_id: 'u-1',
        is_match: true,
        similarity_score: 0.88,
      };
      const emitted: any[] = [];
      handler.on('voiceProfileVerifyResult', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].is_match).toBe(true);
      expect(emitted[0].similarity_score).toBe(0.88);
    });

    it('emits voiceProfileVerifyResult on success=false', async () => {
      const event = {
        type: 'voice_profile_verify_result',
        request_id: 'verify-2',
        success: false,
        user_id: 'u-1',
        error: 'Insufficient quality',
      };
      const emitted: any[] = [];
      handler.on('voiceProfileVerifyResult', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].success).toBe(false);
    });
  });

  // ── voice_profile_compare_result ────────────────────────────────────────────

  describe('voice_profile_compare_result', () => {
    it('emits voiceProfileCompareResult on success=true', async () => {
      const event = {
        type: 'voice_profile_compare_result',
        request_id: 'cmp-1',
        success: true,
        similarity_score: 0.77,
        is_match: false,
        threshold: 0.8,
      };
      const emitted: any[] = [];
      handler.on('voiceProfileCompareResult', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].is_match).toBe(false);
      expect(emitted[0].similarity_score).toBe(0.77);
    });

    it('emits voiceProfileCompareResult on success=false', async () => {
      const event = {
        type: 'voice_profile_compare_result',
        request_id: 'cmp-2',
        success: false,
        error: 'Invalid fingerprint',
      };
      const emitted: any[] = [];
      handler.on('voiceProfileCompareResult', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].success).toBe(false);
    });
  });

  // ── voice_profile_error ─────────────────────────────────────────────────────

  describe('voice_profile_error', () => {
    it('emits voiceProfileError', async () => {
      const event = {
        type: 'voice_profile_error',
        request_id: 'vpe-1',
        user_id: 'u-1',
        error: 'Profile corrupted',
        success: false as const,
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('voiceProfileError', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].error).toBe('Profile corrupted');
      expect(handler.getStats().voiceEvents).toBe(1);
    });
  });

  // ── transcription_completed ─────────────────────────────────────────────────

  describe('transcription_completed', () => {
    it('emits transcriptionCompleted and increments stat', async () => {
      const event = {
        type: 'transcription_completed',
        taskId: 'tc-1',
        messageId: 'msg-tc',
        attachmentId: 'att-tc',
        transcription: { text: 'Hello world', language: 'en', confidence: 0.99, durationMs: 3000, source: 'whisper' },
        processingTimeMs: 500,
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('transcriptionCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].transcription.text).toBe('Hello world');
      expect(handler.getStats().transcriptionCompleted).toBe(1);
    });

    it('handles transcription without text or language (covers if-branch false sides at lines 510-514)', async () => {
      const event = {
        type: 'transcription_completed',
        taskId: 'tc-no-txt',
        messageId: 'msg-tc-2',
        attachmentId: 'att-tc-2',
        transcription: { text: '', language: '', confidence: 0.5, durationMs: 1000, source: 'whisper' },
        processingTimeMs: 100,
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('transcriptionCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
      expect(handler.getStats().transcriptionCompleted).toBe(1);
    });
  });

  // ── transcription_ready ─────────────────────────────────────────────────────

  describe('transcription_ready', () => {
    it('emits transcriptionReady with all fields including postId', async () => {
      const event = {
        type: 'transcription_ready',
        taskId: 'tr-1',
        messageId: 'msg-tr',
        attachmentId: 'att-tr',
        transcription: { text: 'Hey', language: 'en', confidence: 0.9, durationMs: 1000, source: 'whisper', speakerCount: 2 },
        processingTimeMs: 200,
        timestamp: Date.now(),
        postId: 'post-1',
        postMediaId: 'media-1',
      };
      const emitted: any[] = [];
      handler.on('transcriptionReady', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].postId).toBe('post-1');
      expect(emitted[0].postMediaId).toBe('media-1');
      expect(emitted[0].transcription.speakerCount).toBe(2);
    });

    it('handles transcriptionReady without text, language, or speakerCount (covers false branches at 536-542)', async () => {
      const event = {
        type: 'transcription_ready',
        taskId: 'tr-empty',
        messageId: 'msg-tr-e',
        attachmentId: 'att-tr-e',
        transcription: { text: '', language: '', confidence: 0.5, durationMs: 500, source: 'whisper' },
        processingTimeMs: 50,
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('transcriptionReady', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(1);
    });
  });

  // ── audio_translation_ready ─────────────────────────────────────────────────

  describe('audio_translation_ready', () => {
    it('emits audioTranslationReady with null _audioBinary when no binary frames', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translation_ready');
      const emitted: any[] = [];
      handler.on('audioTranslationReady', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].translatedAudio._audioBinary).toBeNull();
    });

    it('emits audioTranslationReady with _audioBinary from binaryFrames[0]', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translation_ready');
      const audioBuf = Buffer.alloc(32, 0xff);
      const emitted: any[] = [];
      handler.on('audioTranslationReady', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf]);

      expect(emitted[0].translatedAudio._audioBinary).toBe(audioBuf);
    });
  });

  // ── audio_translations_progressive ─────────────────────────────────────────

  describe('audio_translations_progressive', () => {
    it('emits audioTranslationsProgressive with null _audioBinary when no binary frames', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translations_progressive');
      const emitted: any[] = [];
      handler.on('audioTranslationsProgressive', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].translatedAudio._audioBinary).toBeNull();
    });

    it('emits audioTranslationsProgressive with _audioBinary from binaryFrames[0]', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translations_progressive');
      const audioBuf = Buffer.alloc(64, 0xaa);
      const emitted: any[] = [];
      handler.on('audioTranslationsProgressive', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf]);

      expect(emitted[0].translatedAudio._audioBinary).toBe(audioBuf);
    });
  });

  // ── audio_translations_completed ────────────────────────────────────────────

  describe('audio_translations_completed', () => {
    it('emits audioTranslationsCompleted with null _audioBinary when no binary frames', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translations_completed');
      const emitted: any[] = [];
      handler.on('audioTranslationsCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].translatedAudio._audioBinary).toBeNull();
    });

    it('emits audioTranslationsCompleted with _audioBinary from binaryFrames[0]', async () => {
      const event = makeBaseTranslationAudioEvent('audio_translations_completed');
      const audioBuf = Buffer.alloc(16, 0xcc);
      const emitted: any[] = [];
      handler.on('audioTranslationsCompleted', (p) => emitted.push(p));

      await handler.handleMessage([toBuffer(event), audioBuf]);

      expect(emitted[0].translatedAudio._audioBinary).toBe(audioBuf);
    });
  });

  // ── translation_ready (deprecated) ─────────────────────────────────────────

  describe('translation_ready (deprecated)', () => {
    it('emits translationReady', async () => {
      const event = {
        type: 'translation_ready',
        taskId: 'dep-1',
        messageId: 'msg-dep',
        attachmentId: 'att-dep',
        language: 'fr',
        translatedAudio: {
          targetLanguage: 'fr',
          translatedText: 'Salut',
          audioUrl: '/fr.wav',
          audioPath: '/fr.wav',
          durationMs: 1000,
          voiceCloned: false,
          voiceQuality: 0.8,
          audioMimeType: 'audio/wav',
        },
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('translationReady', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].language).toBe('fr');
    });
  });

  // ── transcription_error ─────────────────────────────────────────────────────

  describe('transcription_error', () => {
    it('emits transcriptionError and increments transcriptionErrors', async () => {
      const event = {
        type: 'transcription_error',
        taskId: 'terr-1',
        messageId: 'msg-terr',
        attachmentId: 'att-terr',
        error: 'Whisper failed',
        errorCode: 'WHISPER_ERR',
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('transcriptionError', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].errorCode).toBe('WHISPER_ERR');
      expect(handler.getStats().transcriptionErrors).toBe(1);
    });
  });

  // ── voice_translation_completed ─────────────────────────────────────────────

  describe('voice_translation_completed', () => {
    it('emits voiceTranslationCompleted with result including transcription', async () => {
      const event = {
        type: 'voice_translation_completed',
        jobId: 'job-1',
        status: 'completed',
        userId: 'user-1',
        timestamp: Date.now(),
        result: {
          originalAudio: {
            transcription: 'Hello everyone',
            language: 'en',
          },
          translations: [
            { targetLanguage: 'fr', translatedText: 'Bonjour' },
            { targetLanguage: 'es', translatedText: 'Hola' },
          ],
        },
      };
      const emitted: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].jobId).toBe('job-1');
      expect(emitted[0].result.translations).toHaveLength(2);
      expect(handler.getStats().voiceTranslationCompleted).toBe(1);
    });

    it('emits voiceTranslationCompleted without result (result=undefined)', async () => {
      const event = {
        type: 'voice_translation_completed',
        jobId: 'job-2',
        status: 'completed',
        userId: 'user-1',
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].jobId).toBe('job-2');
      expect(emitted[0].result).toBeUndefined();
    });

    it('covers false branches: result with no transcription and empty translations', async () => {
      // result exists, but originalAudio.transcription is falsy and translations is empty
      // This covers lines 710 (transcription false) and 714 (translations?.length false)
      const event = {
        type: 'voice_translation_completed',
        jobId: 'job-3',
        status: 'completed',
        userId: 'user-1',
        timestamp: Date.now(),
        result: {
          originalAudio: {
            transcription: null,
            language: 'en',
          },
          translations: [],
        },
      };
      const emitted: any[] = [];
      handler.on('voiceTranslationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].jobId).toBe('job-3');
    });
  });

  // ── voice_translation_failed ────────────────────────────────────────────────

  describe('voice_translation_failed', () => {
    it('emits voiceTranslationFailed and increments voiceTranslationFailed stat', async () => {
      const event = {
        type: 'voice_translation_failed',
        jobId: 'job-fail-1',
        status: 'failed',
        userId: 'user-1',
        timestamp: Date.now(),
        error: 'GPU OOM',
        errorCode: 'OOM',
      };
      const emitted: any[] = [];
      handler.on('voiceTranslationFailed', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].error).toBe('GPU OOM');
      expect(handler.getStats().voiceTranslationFailed).toBe(1);
    });
  });

  // ── story_text_object_translation_completed ─────────────────────────────────

  describe('story_text_object_translation_completed', () => {
    it('emits storyTextObjectTranslationCompleted and increments stat', async () => {
      const event = {
        type: 'story_text_object_translation_completed',
        postId: 'post-1',
        textObjectIndex: 2,
        translations: { fr: 'Bonjour', es: 'Hola' },
        timestamp: Date.now(),
      };
      const emitted: any[] = [];
      handler.on('storyTextObjectTranslationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted[0].postId).toBe('post-1');
      expect(emitted[0].textObjectIndex).toBe(2);
      expect(emitted[0].translations).toEqual({ fr: 'Bonjour', es: 'Hola' });
      expect(handler.getStats().storyTextObjectTranslationCompleted).toBe(1);
    });
  });

  // ── pong ────────────────────────────────────────────────────────────────────

  describe('pong', () => {
    it('does not emit any event and does not throw', async () => {
      const event = { type: 'pong', timestamp: Date.now(), translator_status: 'ok' };
      const emitted: unknown[] = [];
      handler.on('pong', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(emitted).toHaveLength(0);
      expect(handler.getStats().messagesProcessed).toBe(1);
    });
  });

  // ── unknown event type ──────────────────────────────────────────────────────

  describe('unknown event type', () => {
    it('does not throw and does not emit', async () => {
      const event = { type: 'totally_unknown_event', data: 'whatever' };
      const allEmitted: unknown[] = [];
      handler.on('totally_unknown_event', (p) => allEmitted.push(p));

      await handler.handleMessage(toBuffer(event));

      expect(allEmitted).toHaveLength(0);
    });
  });

  // ── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns a copy (not reference) of stats', async () => {
      const stats1 = handler.getStats();
      stats1.messagesProcessed = 9999; // mutate the copy

      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent()));
      const stats2 = handler.getStats();

      expect(stats2.messagesProcessed).toBe(1); // not 9999
    });

    it('initial stats are all zero', () => {
      const stats = handler.getStats();
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.translationCompleted).toBe(0);
      expect(stats.translationErrors).toBe(0);
      expect(stats.audioCompleted).toBe(0);
      expect(stats.audioErrors).toBe(0);
      expect(stats.voiceEvents).toBe(0);
      expect(stats.transcriptionCompleted).toBe(0);
      expect(stats.transcriptionErrors).toBe(0);
      expect(stats.multipartMessages).toBe(0);
      expect(stats.voiceTranslationCompleted).toBe(0);
      expect(stats.voiceTranslationFailed).toBe(0);
      expect(stats.storyTextObjectTranslationCompleted).toBe(0);
    });
  });

  // ── resetStats ──────────────────────────────────────────────────────────────

  describe('resetStats', () => {
    it('resets all counters to 0', async () => {
      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 'rs-t' })));
      expect(handler.getStats().messagesProcessed).toBe(1);

      handler.resetStats();

      const stats = handler.getStats();
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.translationCompleted).toBe(0);
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('clears processedResults so previously seen entries are accepted again', async () => {
      const event = makeTranslationCompletedEvent({ taskId: 'clr-task' });
      const emitted: unknown[] = [];
      handler.on('translationCompleted', (p) => emitted.push(p));

      await handler.handleMessage(toBuffer(event)); // processed once
      handler.clear();
      await handler.handleMessage(toBuffer(event)); // should process again

      expect(emitted).toHaveLength(2);
    });

    it('resets stats to zero', async () => {
      await handler.handleMessage(toBuffer(makeTranslationCompletedEvent({ taskId: 'clr-stat' })));
      handler.clear();

      expect(handler.getStats().translationCompleted).toBe(0);
      expect(handler.getStats().messagesProcessed).toBe(0);
    });
  });
});
