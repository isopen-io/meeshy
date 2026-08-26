import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  hasTranslation,
  getTranslation,
  getAvailableLanguages,
  softDeleteTranslation,
  upsertTranslation,
  toSocketIOTranslation,
  toSocketIOTranslations,
  toSocketIOAudio,
  toSocketIOAudios,
  transcriptTranslationTexts,
  transcriptTranslationTracks,
} from '../../types/attachment-audio';
import type {
  AttachmentTranslation,
  AttachmentTranslations,
} from '../../types/attachment-audio';

// ── factories ──────────────────────────────────────────────────────────────

function makeTranslation(overrides: Partial<AttachmentTranslation> = {}): AttachmentTranslation {
  return {
    type: 'audio',
    transcription: 'Hello world',
    url: 'https://example.com/audio.mp3',
    durationMs: 5000,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTranslations(
  langs: Record<string, Partial<AttachmentTranslation> | null>
): AttachmentTranslations {
  const result: AttachmentTranslations = {};
  for (const [lang, overrides] of Object.entries(langs)) {
    if (overrides !== null) {
      result[lang] = makeTranslation(overrides);
    }
  }
  return result;
}

// ── hasTranslation ─────────────────────────────────────────────────────────

describe('hasTranslation', () => {
  it('returns false when translations is undefined', () => {
    expect(hasTranslation(undefined, 'fr')).toBe(false);
  });

  it('returns false when language not in map', () => {
    const translations = makeTranslations({ en: {} });
    expect(hasTranslation(translations, 'fr')).toBe(false);
  });

  it('returns false when translation is soft-deleted', () => {
    const translations = makeTranslations({ fr: { deletedAt: '2024-06-01T00:00:00Z' } });
    expect(hasTranslation(translations, 'fr')).toBe(false);
  });

  it('returns true when translation exists and not deleted', () => {
    const translations = makeTranslations({ fr: {} });
    expect(hasTranslation(translations, 'fr')).toBe(true);
  });

  it('returns true when deletedAt is null (explicitly undeleted)', () => {
    const translations = makeTranslations({ fr: { deletedAt: null } });
    expect(hasTranslation(translations, 'fr')).toBe(true);
  });
});

// ── getTranslation ─────────────────────────────────────────────────────────

describe('getTranslation', () => {
  it('returns undefined when translations is undefined', () => {
    expect(getTranslation(undefined, 'fr')).toBeUndefined();
  });

  it('returns undefined when language not in map', () => {
    const translations = makeTranslations({ en: {} });
    expect(getTranslation(translations, 'fr')).toBeUndefined();
  });

  it('returns undefined when translation is soft-deleted', () => {
    const translations = makeTranslations({ fr: { deletedAt: '2024-06-01T00:00:00Z' } });
    expect(getTranslation(translations, 'fr')).toBeUndefined();
  });

  it('returns the translation when exists and not deleted', () => {
    const translations = makeTranslations({ fr: { transcription: 'Bonjour' } });
    const result = getTranslation(translations, 'fr');
    expect(result?.transcription).toBe('Bonjour');
  });

  it('returns translation when deletedAt is null', () => {
    const translations = makeTranslations({ fr: { deletedAt: null } });
    expect(getTranslation(translations, 'fr')).toBeDefined();
  });

  it('returns undefined when key exists but value is undefined at runtime', () => {
    const translations = { fr: undefined } as unknown as AttachmentTranslations;
    expect(getTranslation(translations, 'fr')).toBeUndefined();
  });
});

// ── getAvailableLanguages ──────────────────────────────────────────────────

describe('getAvailableLanguages', () => {
  it('returns empty array when translations is undefined', () => {
    expect(getAvailableLanguages(undefined)).toEqual([]);
  });

  it('returns empty array for empty translations map', () => {
    expect(getAvailableLanguages({})).toEqual([]);
  });

  it('excludes soft-deleted translations', () => {
    const translations = makeTranslations({
      fr: {},
      en: { deletedAt: '2024-06-01T00:00:00Z' },
    });
    expect(getAvailableLanguages(translations)).toEqual(['fr']);
  });

  it('includes all non-deleted translations', () => {
    const translations = makeTranslations({ fr: {}, en: {}, es: {} });
    expect(getAvailableLanguages(translations).sort()).toEqual(['en', 'es', 'fr']);
  });

  it('returns empty when all translations are deleted', () => {
    const translations = makeTranslations({
      fr: { deletedAt: '2024-01-01T00:00:00Z' },
      en: { deletedAt: '2024-01-01T00:00:00Z' },
    });
    expect(getAvailableLanguages(translations)).toEqual([]);
  });
});

// ── softDeleteTranslation ──────────────────────────────────────────────────

describe('softDeleteTranslation', () => {
  it('returns same object when language is not in map', () => {
    const translations = makeTranslations({ en: {} });
    const result = softDeleteTranslation(translations, 'fr');
    expect(result).toBe(translations);
  });

  it('sets deletedAt and updatedAt on the translation', () => {
    const before = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(before);
    const translations = makeTranslations({ fr: {} });
    const result = softDeleteTranslation(translations, 'fr');
    expect(result['fr']?.deletedAt).toBe(before.toISOString());
    expect(result['fr']?.updatedAt).toBe(before.toISOString());
    vi.useRealTimers();
  });

  it('does not mutate the original translations', () => {
    const translations = makeTranslations({ fr: {} });
    const original = { ...translations };
    softDeleteTranslation(translations, 'fr');
    expect(translations['fr']?.deletedAt).toBeUndefined();
    expect(translations).toEqual(original);
  });

  it('preserves all other languages', () => {
    const translations = makeTranslations({ fr: {}, en: {} });
    const result = softDeleteTranslation(translations, 'fr');
    expect(result['en']).toEqual(translations['en']);
  });

  it('returns same object when key exists but value is undefined at runtime', () => {
    const translations = { fr: undefined } as unknown as AttachmentTranslations;
    const result = softDeleteTranslation(translations, 'fr');
    expect(result).toBe(translations);
  });
});

// ── upsertTranslation ──────────────────────────────────────────────────────

describe('upsertTranslation', () => {
  it('creates a new entry when translations is undefined', () => {
    const translation = { type: 'audio' as const, transcription: 'Hello', url: 'u', createdAt: '' };
    const { createdAt: _, updatedAt: __, deletedAt: ___, ...partial } = { ...translation, deletedAt: null };
    const result = upsertTranslation(undefined, 'fr', partial);
    expect(result['fr']?.transcription).toBe('Hello');
    expect(result['fr']?.deletedAt).toBeNull();
    expect(result['fr']?.createdAt).toBeDefined();
  });

  it('adds a new language when not present', () => {
    const translations = makeTranslations({ en: {} });
    const partial = { type: 'audio' as const, transcription: 'Bonjour' };
    const result = upsertTranslation(translations, 'fr', partial);
    expect(result['fr']).toBeDefined();
    expect(result['en']).toEqual(translations['en']);
  });

  it('preserves original createdAt on update', () => {
    const original = makeTranslation({ createdAt: '2024-01-01T00:00:00Z' });
    const translations: AttachmentTranslations = { fr: original };
    const partial = { type: 'audio' as const, transcription: 'Updated' };
    const result = upsertTranslation(translations, 'fr', partial);
    expect(result['fr']?.createdAt).toBe('2024-01-01T00:00:00Z');
  });

  it('clears deletedAt on re-upsert of soft-deleted entry', () => {
    const translations = makeTranslations({ fr: { deletedAt: '2024-06-01T00:00:00Z' } });
    const partial = { type: 'audio' as const, transcription: 'Restored' };
    const result = upsertTranslation(translations, 'fr', partial);
    expect(result['fr']?.deletedAt).toBeNull();
  });

  it('sets updatedAt on every upsert', () => {
    const now = new Date('2025-01-15T10:00:00Z');
    vi.setSystemTime(now);
    const translations = makeTranslations({ fr: {} });
    const partial = { type: 'audio' as const, transcription: 'New' };
    const result = upsertTranslation(translations, 'fr', partial);
    expect(result['fr']?.updatedAt).toBe(now.toISOString());
    vi.useRealTimers();
  });
});

// ── toSocketIOTranslation ──────────────────────────────────────────────────

describe('toSocketIOTranslation', () => {
  it('generates id as attachmentId_language', () => {
    const translation = makeTranslation();
    const result = toSocketIOTranslation('att-123', 'fr', translation);
    expect(result.id).toBe('att-123_fr');
  });

  it('maps all standard fields', () => {
    const translation = makeTranslation({
      type: 'audio',
      transcription: 'Hello',
      url: 'https://example.com/a.mp3',
      durationMs: 3000,
      cloned: true,
      quality: 0.9,
      format: 'mp3',
      ttsModel: 'xtts',
      voiceModelId: 'vm-1',
    });
    const result = toSocketIOTranslation('att-1', 'en', translation);
    expect(result.type).toBe('audio');
    expect(result.targetLanguage).toBe('en');
    expect(result.translatedText).toBe('Hello');
    expect(result.url).toBe('https://example.com/a.mp3');
    expect(result.durationMs).toBe(3000);
    expect(result.cloned).toBe(true);
    expect(result.quality).toBe(0.9);
    expect(result.format).toBe('mp3');
    expect(result.ttsModel).toBe('xtts');
    expect(result.voiceModelId).toBe('vm-1');
  });

  it('falls back to empty string when url is absent', () => {
    const translation = makeTranslation({ url: undefined });
    const result = toSocketIOTranslation('att-1', 'fr', translation);
    expect(result.url).toBe('');
  });

  it('toSocketIOAudio is an alias for toSocketIOTranslation', () => {
    expect(toSocketIOAudio).toBe(toSocketIOTranslation);
  });
});

// ── toSocketIOTranslations ─────────────────────────────────────────────────

describe('toSocketIOTranslations', () => {
  it('returns empty array when translations is undefined', () => {
    expect(toSocketIOTranslations('att-1', undefined)).toEqual([]);
  });

  it('returns empty array for empty translations map', () => {
    expect(toSocketIOTranslations('att-1', {})).toEqual([]);
  });

  it('excludes soft-deleted translations', () => {
    const translations = makeTranslations({
      fr: {},
      en: { deletedAt: '2024-06-01T00:00:00Z' },
    });
    const result = toSocketIOTranslations('att-1', translations);
    expect(result).toHaveLength(1);
    expect(result[0]?.targetLanguage).toBe('fr');
  });

  it('converts all available translations', () => {
    const translations = makeTranslations({ fr: {}, en: {}, es: {} });
    const result = toSocketIOTranslations('att-1', translations);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.targetLanguage).sort()).toEqual(['en', 'es', 'fr']);
  });

  it('toSocketIOAudios is an alias for toSocketIOTranslations', () => {
    expect(toSocketIOAudios).toBe(toSocketIOTranslations);
  });

  it('skips entries where the value is undefined at runtime', () => {
    const translations = { fr: undefined } as unknown as AttachmentTranslations;
    const result = toSocketIOTranslations('att-1', translations);
    expect(result).toEqual([]);
  });
});

/**
 * Cycle 123 — la bannière d'un VOCAL descend son propre Prisme.
 *
 * `resolvePrismTranslation` consomme `langue → texte`. Les traductions d'une
 * transcription arrivent, elles, dans l'enveloppe de stockage d'un attachment
 * (`{ type, transcription, url, deletedAt? }`) et depuis une colonne `Json`,
 * donc en `unknown`. Ce dépouillement est le site UNIQUE de la conversion.
 */
describe('transcriptTranslationTexts', () => {
  it('dépouille l\'enveloppe de stockage en langue → texte', () => {
    const result = transcriptTranslationTexts({
      fr: { type: 'audio', transcription: 'Salut', url: '/a.mp3', createdAt: new Date() },
      es: { type: 'audio', transcription: 'Hola', createdAt: new Date() },
    });

    expect(result).toEqual({ fr: 'Salut', es: 'Hola' });
  });

  it('écarte une entrée soft-supprimée — aucun lecteur ne doit la servir', () => {
    const result = transcriptTranslationTexts({
      fr: { type: 'audio', transcription: 'Salut', createdAt: new Date(), deletedAt: new Date() },
      es: { type: 'audio', transcription: 'Hola', createdAt: new Date() },
    });

    expect(result).toEqual({ es: 'Hola' });
  });

  it('écarte un texte vide — il effacerait la bannière au lieu de la traduire', () => {
    const result = transcriptTranslationTexts({
      fr: { type: 'audio', transcription: '   ', createdAt: new Date() },
      es: { type: 'audio', transcription: 'Hola', createdAt: new Date() },
    });

    expect(result).toEqual({ es: 'Hola' });
  });

  it('tolère une colonne Json absente ou informe — c\'est une frontière de désérialisation', () => {
    expect(transcriptTranslationTexts(null)).toEqual({});
    expect(transcriptTranslationTexts(undefined)).toEqual({});
    expect(transcriptTranslationTexts('pas un objet')).toEqual({});
    expect(transcriptTranslationTexts({ fr: null })).toEqual({});
    expect(transcriptTranslationTexts({ fr: { type: 'audio' } })).toEqual({});
  });
});

/**
 * Cycle 128 — la JUMELLE du dépouillement ci-dessus, pour le MÉDIUM.
 *
 * `transcriptTranslationTexts` ne prend de la carte de traductions que le TEXTE.
 * La MÊME entrée porte la piste TTS de la langue (`url`, `durationMs`, `format`)
 * — la bannière d'un vocal servait donc la bonne langue en texte et attachait le
 * fichier ORIGINAL en son.
 */
describe('transcriptTranslationTracks', () => {
  it('dépouille l\'enveloppe en langue → piste servable', () => {
    const result = transcriptTranslationTracks({
      fr: {
        type: 'audio', transcription: 'Salut', url: '/api/v1/attachments/file/translated/a_fr.mp3',
        durationMs: 5200, format: 'mp3', createdAt: new Date(),
      },
    });

    expect(result).toEqual({
      fr: { url: '/api/v1/attachments/file/translated/a_fr.mp3', mimeType: 'audio/mp3', durationMs: 5200 },
    });
  });

  /**
   * Les DEUX producteurs de `format` divergent — `'mp3'` sur le chemin message
   * (`audioMimeType.replace('audio/', '')`), `'audio/mp3'` sur le chemin post.
   * Le dépouillement NORMALISE plutôt que de choisir : un `typeHint` UTI faux
   * fait rejeter la pièce jointe par la NSE, silencieusement.
   */
  it('normalise `format` que le producteur l\'ait écrit nu ou en mime complet', () => {
    const bare = transcriptTranslationTracks({
      fr: { type: 'audio', transcription: 'Salut', url: '/a_fr.m4a', format: 'm4a', createdAt: new Date() },
    });
    const full = transcriptTranslationTracks({
      fr: { type: 'audio', transcription: 'Salut', url: '/a_fr.m4a', format: 'audio/m4a', createdAt: new Date() },
    });

    expect(bare.fr?.mimeType).toBe('audio/m4a');
    expect(full.fr?.mimeType).toBe('audio/m4a');
  });

  it('rend une piste SANS mime quand le producteur n\'a pas dit son format', () => {
    // Fail-open sur l'étiquette, jamais sur le fichier : la NSE sait déduire un
    // UTI de l'extension. Inventer `audio/mp3` sur un `.m4a` serait pire.
    const result = transcriptTranslationTracks({
      fr: { type: 'audio', transcription: 'Salut', url: '/a_fr.m4a', createdAt: new Date() },
    });

    expect(result.fr).toEqual({ url: '/a_fr.m4a' });
  });

  it('écarte une entrée soft-supprimée — même règle que son texte', () => {
    const result = transcriptTranslationTracks({
      fr: { type: 'audio', transcription: 'Salut', url: '/a_fr.mp3', createdAt: new Date(), deletedAt: new Date() },
      es: { type: 'audio', transcription: 'Hola', url: '/a_es.mp3', createdAt: new Date() },
    });

    expect(Object.keys(result)).toEqual(['es']);
  });

  /**
   * Le cas qui SÉPARE les deux jumelles : une traduction TEXTE peut exister sans
   * que le TTS ait produit sa piste. L'entrée concourt alors pour le texte et
   * PAS pour le son — c'est ce qui fait retomber l'élection sur le fichier
   * original plutôt que sur une URL vide.
   */
  it('écarte une entrée sans url — le texte existe, la piste non', () => {
    const source = {
      fr: { type: 'audio', transcription: 'Salut', createdAt: new Date() },
      es: { type: 'audio', transcription: 'Hola', url: '  ', createdAt: new Date() },
    };

    expect(transcriptTranslationTracks(source)).toEqual({});
    expect(transcriptTranslationTexts(source)).toEqual({ fr: 'Salut', es: 'Hola' });
  });

  it('tolère une colonne Json absente ou informe — même frontière', () => {
    expect(transcriptTranslationTracks(null)).toEqual({});
    expect(transcriptTranslationTracks(undefined)).toEqual({});
    expect(transcriptTranslationTracks('pas un objet')).toEqual({});
    expect(transcriptTranslationTracks({ fr: null })).toEqual({});
  });
});
