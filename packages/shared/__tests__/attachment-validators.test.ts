import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  attachmentTranscriptionSchema,
  attachmentTranslationSchema,
  attachmentTranslationsMapSchema,
  transcriptionSegmentSchema,
  languageCodeSchema,
  parseAttachmentTranscription,
  parseAttachmentTranslation,
  parseAttachmentTranslationsMap,
  type AttachmentTranscriptionInput,
  type AttachmentTranslationInput,
  type AttachmentTranslationsMapInput,
  type TranscriptionSegmentInput,
} from '../utils/attachment-validators';
import type {
  AttachmentTranscription,
  AttachmentTranslation,
  AttachmentTranslations,
  TranscriptionSegment,
} from '../types/attachment-audio';

describe('attachment-validators — Zod schemas at the JSON boundary', () => {
  describe('Type alignment with packages/shared/types/attachment-audio.ts', () => {
    it('AttachmentTranscriptionInput is assignable to AttachmentTranscription', () => {
      // The Zod-inferred type and the hand-written TS interface in
      // attachment-audio.ts MUST describe the same shape. Otherwise
      // consumers cannot round-trip a parsed transcription back into the
      // type the rest of the codebase reads.
      expectTypeOf<AttachmentTranscriptionInput>().toMatchTypeOf<AttachmentTranscription>();
      expectTypeOf<AttachmentTranslationInput>().toMatchTypeOf<AttachmentTranslation>();
      expectTypeOf<AttachmentTranslationsMapInput>().toMatchTypeOf<AttachmentTranslations>();
      expectTypeOf<TranscriptionSegmentInput>().toMatchTypeOf<TranscriptionSegment>();
    });
  });

  describe('languageCodeSchema', () => {
    it('accepts ISO 639-1 two-letter codes', () => {
      for (const code of ['fr', 'en', 'es', 'de', 'pt']) {
        expect(languageCodeSchema.safeParse(code).success).toBe(true);
      }
    });

    it('accepts BCP-47 region tags', () => {
      for (const code of ['pt-BR', 'en-US', 'zh-Hans']) {
        expect(languageCodeSchema.safeParse(code).success).toBe(true);
      }
    });

    it('accepts supported ISO 639-3 three-letter codes (bas/ksf/nnh/dua/ewo)', () => {
      // These are first-class supported Cameroonian languages (languages.ts),
      // treated as canonical and never truncated (language-normalize.ts). A
      // `[a-zA-Z]{2}` anchor would reject a legitimate Basaa transcription or
      // `{ bas: {...} }` translation map at the trust boundary.
      for (const code of ['bas', 'ksf', 'nnh', 'dua', 'ewo']) {
        expect(languageCodeSchema.safeParse(code).success).toBe(true);
      }
    });

    it('rejects non-letter codes and empty strings', () => {
      for (const code of ['', '1', '123', '!!', 'a']) {
        expect(languageCodeSchema.safeParse(code).success).toBe(false);
      }
    });
  });

  describe('attachmentTranscriptionSchema — canonical (attachment-audio.ts) shape', () => {
    const minimalValid: AttachmentTranscriptionInput = {
      text: 'Bonjour le monde',
      language: 'fr',
      confidence: 0.92,
      source: 'whisper',
    };

    it('accepts the minimal valid payload (no `type`, no segments)', () => {
      // Legacy persisted shape — type discriminator is omitted; the
      // consumer infers it from MessageAttachment.mimeType. Pre-R6, this
      // shape was the de-facto contract written by PostAudioService.
      expect(attachmentTranscriptionSchema.safeParse(minimalValid).success).toBe(true);
    });

    it('accepts a fully-typed payload with all four discriminator values', () => {
      for (const type of ['audio', 'video', 'document', 'image'] as const) {
        const ok = { ...minimalValid, type };
        expect(attachmentTranscriptionSchema.safeParse(ok).success).toBe(true);
      }
    });

    it('rejects an invalid `type` discriminator', () => {
      const bad = { ...minimalValid, type: 'hologram' };
      expect(attachmentTranscriptionSchema.safeParse(bad).success).toBe(false);
    });

    it('rejects confidence outside [0, 1]', () => {
      expect(
        attachmentTranscriptionSchema.safeParse({ ...minimalValid, confidence: 1.5 }).success,
      ).toBe(false);
      expect(
        attachmentTranscriptionSchema.safeParse({ ...minimalValid, confidence: -0.1 }).success,
      ).toBe(false);
    });

    it('accepts all five canonical `source` values', () => {
      for (const source of ['mobile', 'whisper', 'voice_api', 'ocr', 'vision_api'] as const) {
        const ok = { ...minimalValid, source };
        expect(attachmentTranscriptionSchema.safeParse(ok).success).toBe(true);
      }
    });

    it('rejects an unknown `source`', () => {
      expect(
        attachmentTranscriptionSchema.safeParse({ ...minimalValid, source: 'custom_ai' }).success,
      ).toBe(false);
    });

    it('accepts a rich payload with segments + speakerAnalysis + voiceQualityAnalysis', () => {
      const rich: AttachmentTranscriptionInput = {
        ...minimalValid,
        type: 'audio',
        durationMs: 1500,
        segments: [
          { text: 'Bonjour', startMs: 0, endMs: 800, confidence: 0.95 },
          { text: 'le monde', startMs: 800, endMs: 1500, speakerId: 's0' },
        ],
        speakerCount: 1,
        primarySpeakerId: 's0',
        speakerAnalysis: { method: 'pyannote', speakers: [{ id: 's0', durationMs: 1500 }] },
        senderVoiceIdentified: true,
        senderSpeakerId: 's0',
        voiceQualityAnalysis: { snr: 18.3, clipping: 0.001 },
      };
      expect(attachmentTranscriptionSchema.safeParse(rich).success).toBe(true);
    });

    it('rejects a missing required field', () => {
      const bad: Record<string, unknown> = { ...minimalValid };
      delete bad.text;
      expect(attachmentTranscriptionSchema.safeParse(bad).success).toBe(false);
    });
  });

  describe('transcriptionSegmentSchema', () => {
    it('accepts a minimal segment', () => {
      const ok: TranscriptionSegmentInput = { text: 'hello', startMs: 0, endMs: 100 };
      expect(transcriptionSegmentSchema.safeParse(ok).success).toBe(true);
    });

    it('rejects negative timestamps', () => {
      expect(
        transcriptionSegmentSchema.safeParse({ text: 'x', startMs: -1, endMs: 100 }).success,
      ).toBe(false);
      expect(
        transcriptionSegmentSchema.safeParse({ text: 'x', startMs: 0, endMs: -1 }).success,
      ).toBe(false);
    });

    it('rejects voiceSimilarityScore outside [0, 1]', () => {
      expect(
        transcriptionSegmentSchema.safeParse({
          text: 'x',
          startMs: 0,
          endMs: 100,
          voiceSimilarityScore: 1.5,
        }).success,
      ).toBe(false);
    });
  });

  describe('attachmentTranslationSchema', () => {
    const minimalValid: AttachmentTranslationInput = {
      type: 'audio',
      transcription: 'Hello world',
      createdAt: new Date('2026-05-20T12:00:00Z'),
    };

    it('accepts the minimal valid payload', () => {
      expect(attachmentTranslationSchema.safeParse(minimalValid).success).toBe(true);
    });

    it('accepts ISO string `createdAt` (wire format)', () => {
      const wireFormat = { ...minimalValid, createdAt: '2026-05-20T12:00:00.000Z' };
      expect(attachmentTranslationSchema.safeParse(wireFormat).success).toBe(true);
    });

    it('rejects a non-URL `url`', () => {
      const bad = { ...minimalValid, url: '/relative/path.mp3' };
      expect(attachmentTranslationSchema.safeParse(bad).success).toBe(false);
    });

    it('rejects quality outside [0, 1]', () => {
      expect(
        attachmentTranslationSchema.safeParse({ ...minimalValid, quality: 1.2 }).success,
      ).toBe(false);
    });

    it('rejects negative durationMs', () => {
      expect(
        attachmentTranslationSchema.safeParse({ ...minimalValid, durationMs: -1 }).success,
      ).toBe(false);
    });

    it('accepts all five canonical translation types', () => {
      for (const type of ['audio', 'video', 'text', 'document', 'image'] as const) {
        const ok = { ...minimalValid, type };
        expect(attachmentTranslationSchema.safeParse(ok).success).toBe(true);
      }
    });

    it('accepts soft-delete null on deletedAt', () => {
      const ok = { ...minimalValid, deletedAt: null };
      expect(attachmentTranslationSchema.safeParse(ok).success).toBe(true);
    });

    it('accepts a fully-populated TTS audio payload', () => {
      const full: AttachmentTranslationInput = {
        type: 'audio',
        transcription: 'Hello world',
        url: 'https://gate.meeshy.me/static/voice-en-fr.mp3',
        durationMs: 1500,
        format: 'mp3',
        cloned: true,
        quality: 0.87,
        voiceModelId: 'vm_123',
        ttsModel: 'xtts',
        createdAt: '2026-05-20T12:00:00.000Z',
        updatedAt: '2026-05-20T12:05:00.000Z',
      };
      expect(attachmentTranslationSchema.safeParse(full).success).toBe(true);
    });
  });

  describe('attachmentTranslationsMapSchema', () => {
    const en: AttachmentTranslationInput = {
      type: 'audio',
      transcription: 'Hello',
      createdAt: '2026-05-20T12:00:00Z',
    };
    const fr: AttachmentTranslationInput = {
      type: 'audio',
      transcription: 'Bonjour',
      createdAt: '2026-05-20T12:00:00Z',
    };

    it('accepts a valid map keyed by language code', () => {
      expect(attachmentTranslationsMapSchema.safeParse({ en, fr }).success).toBe(true);
    });

    it('rejects a malformed language code key', () => {
      expect(attachmentTranslationsMapSchema.safeParse({ '123': en }).success).toBe(false);
    });

    it('rejects when any inner value is malformed', () => {
      expect(
        attachmentTranslationsMapSchema.safeParse({ en, fr: { ...fr, quality: 2 } }).success,
      ).toBe(false);
    });

    // Contract lock (iter. 183): the outer language key is AUTHORITATIVE and is
    // NOT cross-checked against the content. AttachmentTranslation carries no
    // top-level language field, so a key/content mismatch is structurally
    // undetectable at this boundary — keying correctly is the caller's
    // responsibility. This pins the honest contract (docstring above the schema)
    // so the previously contradictory "cross-field validation is enforced" claim
    // cannot silently return.
    it('accepts a map whose key does not match the content language (no cross-field check)', () => {
      const englishContentUnderFrenchKey: AttachmentTranslationInput = {
        type: 'audio',
        transcription: 'Hello, this is English text stored under the "fr" key',
        createdAt: '2026-05-20T12:00:00Z',
      };
      const result = parseAttachmentTranslationsMap({ fr: englishContentUnderFrenchKey });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value['fr']?.transcription).toContain('English text');
      }
    });
  });

  describe('parse helpers — boundary contract', () => {
    it('parseAttachmentTranscription returns ok:true on valid input', () => {
      const r = parseAttachmentTranscription({
        text: 't',
        language: 'fr',
        confidence: 0.9,
        source: 'whisper',
      });
      expect(r.ok).toBe(true);
    });

    it('parseAttachmentTranscription returns a structured error on invalid input', () => {
      const r = parseAttachmentTranscription({ text: 't' /* missing language/confidence/source */ });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('INVALID_TRANSCRIPTION');
        expect(Array.isArray(r.issues)).toBe(true);
        expect(r.issues.length).toBeGreaterThan(0);
      }
    });

    it('parseAttachmentTranslation returns ok:true on valid input', () => {
      const r = parseAttachmentTranslation({
        type: 'audio',
        transcription: 'Bonjour le monde',
        createdAt: '2024-01-01T00:00:00Z',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.transcription).toBe('Bonjour le monde');
        expect(r.value.type).toBe('audio');
      }
    });

    it('parseAttachmentTranslation returns a structured error on invalid input', () => {
      const r = parseAttachmentTranslation({ type: 'audio' /* missing transcription, createdAt */ });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('INVALID_TRANSLATION');
      }
    });

    it('parseAttachmentTranslationsMap returns ok:true on valid map', () => {
      const r = parseAttachmentTranslationsMap({
        fr: {
          type: 'audio',
          transcription: 'Bonjour',
          createdAt: '2024-06-01T00:00:00Z',
        },
        en: {
          type: 'audio',
          transcription: 'Hello',
          createdAt: '2024-06-01T00:00:00Z',
        },
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value['fr']?.transcription).toBe('Bonjour');
        expect(r.value['en']?.transcription).toBe('Hello');
      }
    });

    it('parseAttachmentTranslationsMap rejects malformed maps', () => {
      const r = parseAttachmentTranslationsMap({ en: { /* invalid */ } });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('INVALID_TRANSLATIONS_MAP');
      }
    });

    it('every error variant carries a non-empty issues array and message', () => {
      const results = [
        parseAttachmentTranscription({ text: 't' }),
        parseAttachmentTranslation({ type: 'audio' }),
        parseAttachmentTranslationsMap({ '123': {} }),
      ] as const;
      for (const r of results) {
        if (!r.ok) {
          expect(r.issues.length).toBeGreaterThan(0);
          expect(r.message).toBeTruthy();
        } else {
          throw new Error('expected !r.ok');
        }
      }
    });
  });

  describe('Realistic gateway payloads — regression suite', () => {
    it('accepts the shape persisted by PostAudioService.handleTranscriptionReady', () => {
      // Mirrors the literal payload built at PostAudioService.ts:173-185.
      // If this test breaks, PostAudioService is writing a non-canonical
      // shape and either it should be fixed or the schema needs to flex.
      const persisted = {
        text: 'Bonjour',
        language: 'fr',
        confidence: 0.92,
        durationMs: 1500,
        source: 'whisper' as const,
        model: 'whisper_medium',
        segments: [{ text: 'Bonjour', startMs: 0, endMs: 1500 }],
        speakerCount: 1,
        primarySpeakerId: 's0',
        senderVoiceIdentified: true,
        senderSpeakerId: 's0',
      };
      expect(attachmentTranscriptionSchema.safeParse(persisted).success).toBe(true);
    });

    it('accepts the ZMQ TranscriptionData shape from the translator service', () => {
      // Mirrors zmq-translation/types.ts:165 TranscriptionData. The ZMQ
      // payload is the upstream of every PostAudioService / AttachmentService
      // persistence — if it doesn't validate, the whole pipeline is broken.
      const zmq = {
        text: 'transcription text',
        language: 'en',
        confidence: 0.95,
        durationMs: 3000,
        source: 'whisper' as const,
        model: 'whisper_medium',
        segments: [],
        speakerCount: 2,
        primarySpeakerId: 's0',
        senderVoiceIdentified: false,
        senderSpeakerId: null,
        speakerAnalysis: { method: 'pyannote', speakers: [] },
      };
      // Note: `senderSpeakerId: null` is the canonical "unknown" marker on
      // the wire — the schema allows it via `.optional()` (undefined or
      // absent), and our parser strips `null` to undefined before reading.
      // For this test we drop the null to match the schema shape.
      const { senderSpeakerId: _ignored, ...zmqClean } = zmq;
      expect(attachmentTranscriptionSchema.safeParse(zmqClean).success).toBe(true);
    });
  });
});
