/**
 * Zod schemas for the `transcription` / `translations` JSON payloads stored
 * on `MessageAttachment` and `PostMedia`.
 *
 * Source of truth
 * ---------------
 * These schemas validate the SAME shape as the canonical TypeScript
 * interfaces in `packages/shared/types/attachment-audio.ts`:
 *
 *   - `AttachmentTranscription`  ↔ `attachmentTranscriptionSchema`
 *   - `TranscriptionSegment`     ↔ `transcriptionSegmentSchema`
 *   - `AttachmentTranslation`    ↔ `attachmentTranslationSchema`
 *   - `AttachmentTranslations`   ↔ `attachmentTranslationsMapSchema`
 *
 * The pair is kept aligned by the regression tests in
 * `__tests__/attachment-validators.test.ts` which assert that every Zod
 * schema's inferred type is assignable to its TypeScript counterpart and
 * vice-versa. A drift between the two layers fails the test suite.
 *
 * Background
 * ----------
 * Before R6, the JSON arrived at the persistence boundary and at the
 * Socket.IO / REST trust boundary without any runtime validation. A
 * malformed payload from a misbehaving (or malicious) client was silently
 * persisted and re-served, breaking downstream consumers that relied on
 * the documented shape. Two production drifts illustrate the cost:
 *
 *   - The `type` discriminator was missing from PostAudioService writes,
 *     blocking any future migration to a discriminated-union shape.
 *   - Pre-R5, the Fastify response schema dropped 7 fields silently —
 *     this layer catches client-side equivalents at the input boundary.
 *
 * Where to call
 * -------------
 * Apply at every trust boundary where the JSON enters the gateway:
 *   - Socket event handlers receiving client transcription payloads.
 *   - REST routes accepting transcription / translation bodies.
 *   - ZMQ handlers receiving payloads from the translator service.
 * Use `parseAttachmentTranscription` / `parseAttachmentTranslation` which
 * surface a structured error code rather than throwing a raw ZodError.
 *
 * Note on `text` vs `transcribedText`
 * -----------------------------------
 * The active production format uses `text` (per `attachment-audio.ts`).
 * The legacy V2-attempt interface in `attachment-transcription.ts`
 * proposed `transcribedText` and a strict discriminated union, but never
 * shipped end-to-end — call sites continue reading `.text`. These Zod
 * schemas accept `text` only. The legacy interface is being phased out.
 */

import { z } from 'zod';

// ============================================================================
// Atoms
// ============================================================================

/**
 * ISO 639-1/639-3 (or BCP-47-ish prefix) language code, e.g. "fr", "en",
 * "pt-BR", "bas". The primary subtag is 2 OR 3 letters: the platform treats
 * the 3-letter ISO 639-3 codes `bas`/`ksf`/`nnh`/`dua`/`ewo` (supported
 * Cameroonian languages, see languages.ts) as canonical and never truncates
 * them — a `[a-zA-Z]{2}` anchor would reject a legitimate `bas` transcription
 * or `{ bas: {...} }` translation map at the trust boundary. Mirrors the
 * widened `CommonSchemas.language` regex in validation.ts.
 */
export const languageCodeSchema = z
  .string()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/, 'Invalid language code');

/** Confidence score in the [0, 1] range. */
export const confidenceScoreSchema = z.number().min(0).max(1);

/** Type of transcribable attachment — kept optional on the parent schema
 *  for backward compatibility with the legacy persisted shape that omits
 *  the discriminator (the renderer infers it from `mimeType` in that case). */
export const transcribableTypeSchema = z.enum(['audio', 'video', 'document', 'image']);

/** Where the transcription originated. */
export const transcriptionSourceSchema = z.enum([
  'mobile',
  'whisper',
  'voice_api',
  'ocr',
  'vision_api',
]);

/** Type of attachment translation — note `text` is valid here (canonical
 *  union widens to include a plain-text translation case). */
export const translationTypeSchema = z.enum(['audio', 'video', 'text', 'document', 'image']);

// ============================================================================
// TranscriptionSegment — used inside transcription + translation payloads
// ============================================================================

export const transcriptionSegmentSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  speakerId: z.string().optional(),
  voiceSimilarityScore: z.number().min(0).max(1).optional(),
  confidence: confidenceScoreSchema.optional(),
  language: languageCodeSchema.optional(),
  isFinal: z.boolean().optional(),
  translatedText: z.string().optional(),
  translatedLanguage: languageCodeSchema.optional(),
});

// ============================================================================
// AttachmentTranscription — single flat schema with optional discriminator
// ============================================================================

export const attachmentTranscriptionSchema = z.object({
  /** Optional for compatibility with legacy transcriptions that omit it;
   *  consumers infer the type from `MessageAttachment.mimeType` when missing. */
  type: transcribableTypeSchema.optional(),
  text: z.string(),
  language: languageCodeSchema,
  confidence: confidenceScoreSchema,
  source: transcriptionSourceSchema,
  model: z.string().optional(),

  // Audio/video specifics
  segments: z.array(transcriptionSegmentSchema).optional(),
  speakerCount: z.number().int().nonnegative().optional(),
  primarySpeakerId: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),

  // Audio-specific voice analysis (loose Record — the inner shape varies
  // with the diarisation backend; tightened in attachment-audio.ts when the
  // contract stabilises).
  speakerAnalysis: z.record(z.string(), z.unknown()).optional(),
  senderVoiceIdentified: z.boolean().optional(),
  senderSpeakerId: z.string().optional(),
  voiceQualityAnalysis: z.record(z.string(), z.unknown()).optional(),

  // Document-specific
  pageCount: z.number().int().nonnegative().optional(),
  documentLayout: z.record(z.string(), z.unknown()).optional(),

  // Image-specific
  imageDescription: z.string().optional(),
  detectedObjects: z.array(z.record(z.string(), z.unknown())).optional(),
  ocrRegions: z.array(z.record(z.string(), z.unknown())).optional(),
});

// ============================================================================
// AttachmentTranslation — single flat schema (matches attachment-audio.ts)
// ============================================================================

export const attachmentTranslationSchema = z.object({
  type: translationTypeSchema,
  /** The translated text — the canonical name in attachment-audio.ts.
   *  Yes, the field is called `transcription` even though it is a
   *  TRANSLATION. The name is a historical accident: the V1 schema
   *  conflated transcription + translation. Renaming requires a migration
   *  of every persisted document. */
  transcription: z.string(),
  path: z.string().optional(),
  url: z.url().optional(),

  // Audio/video specifics
  durationMs: z.number().nonnegative().optional(),
  format: z.string().optional(),
  cloned: z.boolean().optional(),
  quality: z.number().min(0).max(1).optional(),
  voiceModelId: z.string().optional(),
  ttsModel: z.string().optional(),
  segments: z.array(transcriptionSegmentSchema).optional(),

  // Document/image specifics
  pageCount: z.number().int().nonnegative().optional(),
  overlayApplied: z.boolean().optional(),

  // Metadata. Accept either a `Date` (server-side, freshly constructed)
  // or an ISO string (wire format). Persistence emits ISO; in-memory
  // construction uses Date. Both must round-trip through validation.
  createdAt: z.union([z.iso.datetime({ offset: true }), z.date()]),
  updatedAt: z.union([z.iso.datetime({ offset: true }), z.date()]).optional(),
  deletedAt: z
    .union([z.iso.datetime({ offset: true }), z.date()])
    .nullable()
    .optional(),
});

/**
 * Map of target language code → AttachmentTranslation.
 *
 * The outer key is the BCP-47 language code; the inner value is a typed
 * translation payload. The key is AUTHORITATIVE and is NOT cross-checked
 * against the content: `AttachmentTranslation` carries no top-level language
 * field (the target language is implicit in the map key), so an
 * `outerKey === inner.<lang>` check is structurally impossible at this layer —
 * there is nothing to compare against. `parseAttachmentTranslationsMap` below
 * validates only the key SHAPE (`languageCodeSchema`) and each inner payload;
 * it does not — and cannot — detect a key/content-language mismatch.
 *
 * Consequence for the Prisme Linguistique: the client resolves
 * `translations[user.preferredLanguage]`, so a payload persisted under the
 * wrong key would surface as the wrong language. Keying each entry under the
 * language it actually holds is therefore the WRITER's responsibility, upstream
 * of this boundary — not a guarantee this schema provides. See the matching
 * note on `parseAttachmentTranslationsMap` and the contract-lock test in
 * `__tests__/attachment-validators.test.ts`.
 */
export const attachmentTranslationsMapSchema = z.record(
  languageCodeSchema,
  attachmentTranslationSchema,
);

// ============================================================================
// Boundary parse helpers
// ============================================================================

/** Error codes returned by the parse helpers. */
export type AttachmentValidationErrorCode =
  | 'INVALID_TRANSCRIPTION'
  | 'INVALID_TRANSLATION'
  | 'INVALID_TRANSLATIONS_MAP';

export type ParseResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: AttachmentValidationErrorCode;
      issues: z.ZodIssue[];
      message: string;
    };

/**
 * Validate a transcription JSON blob at a trust boundary.
 * Returns a tagged result rather than throwing — handlers can map cleanly
 * to the gateway's `sendError(reply, 'VALIDATION', …)` response shape.
 */
export function parseAttachmentTranscription(
  input: unknown,
): ParseResult<z.infer<typeof attachmentTranscriptionSchema>> {
  const result = attachmentTranscriptionSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    code: 'INVALID_TRANSCRIPTION',
    issues: result.error.issues,
    message: 'Transcription payload failed validation',
  };
}

/** Validate a single translation payload (no outer language key). */
export function parseAttachmentTranslation(
  input: unknown,
): ParseResult<z.infer<typeof attachmentTranslationSchema>> {
  const result = attachmentTranslationSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    code: 'INVALID_TRANSLATION',
    issues: result.error.issues,
    message: 'Translation payload failed validation',
  };
}

/**
 * Validate the `{ [lang]: AttachmentTranslation }` map. The map's outer
 * key is informational and is NOT cross-checked against any inner field
 * — `AttachmentTranslation` does not carry a `targetLanguage` property
 * in the canonical shape; the language is implicit in the map key.
 */
export function parseAttachmentTranslationsMap(
  input: unknown,
): ParseResult<z.infer<typeof attachmentTranslationsMapSchema>> {
  const result = attachmentTranslationsMapSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    code: 'INVALID_TRANSLATIONS_MAP',
    issues: result.error.issues,
    message: 'Translations map failed validation',
  };
}

// ============================================================================
// Inferred types — re-exported for convenience.
// ============================================================================

export type AttachmentTranscriptionInput = z.infer<typeof attachmentTranscriptionSchema>;
export type AttachmentTranslationInput = z.infer<typeof attachmentTranslationSchema>;
export type AttachmentTranslationsMapInput = z.infer<typeof attachmentTranslationsMapSchema>;
export type TranscriptionSegmentInput = z.infer<typeof transcriptionSegmentSchema>;
