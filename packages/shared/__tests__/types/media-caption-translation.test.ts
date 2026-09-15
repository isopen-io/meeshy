import { describe, expect, it } from 'vitest';

import {
  mediaCaptionTranslationEntrySchema,
  mediaCaptionTranslationsSchema,
} from '../../types/media-caption-translation';

describe('mediaCaptionTranslationEntrySchema', () => {
  it('accepts the same shape as Post.translations entries', () => {
    const parsed = mediaCaptionTranslationEntrySchema.safeParse({
      text: 'Bonjour le monde',
      translationModel: 'nllb-200',
      confidenceScore: 0.94,
      createdAt: '2026-09-14T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an entry with no translated text', () => {
    const parsed = mediaCaptionTranslationEntrySchema.safeParse({
      translationModel: 'nllb-200',
      createdAt: '2026-09-14T00:00:00.000Z',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('mediaCaptionTranslationsSchema', () => {
  it('accepts a per-language map, keyed by language code', () => {
    const parsed = mediaCaptionTranslationsSchema.safeParse({
      fr: {
        text: 'Bonjour le monde',
        translationModel: 'nllb-200',
        createdAt: '2026-09-14T00:00:00.000Z',
      },
      es: {
        text: 'Hola mundo',
        translationModel: 'nllb-200',
        createdAt: '2026-09-14T00:00:00.000Z',
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data)).toEqual(['fr', 'es']);
    }
  });

  // Cette forme doit rester DISTINCTE de `PostMedia.translations` (pistes audio) :
  // une entrée audio porte `transcription`/`durationMs`, jamais `text` seul, et
  // ne doit donc jamais être confondue avec une entrée de légende — un futur
  // appelant qui passerait la mauvaise carte au mauvais schéma doit voir un
  // rejet, pas une coercition silencieuse.
  it('rejects an audio-track translation entry mistakenly passed as a caption translation', () => {
    const parsed = mediaCaptionTranslationsSchema.safeParse({
      fr: {
        type: 'audio',
        transcription: 'Bonjour le monde',
        durationMs: 4200,
        createdAt: '2026-09-14T00:00:00.000Z',
      },
    });
    expect(parsed.success).toBe(false);
  });
});
