/**
 * La transcription d'une vidéo ou d'un vocal se sert en sous-titres WebVTT,
 * traduits, dans la langue du LECTEUR (#11329). Le Prisme gouverne : la
 * langue servie est la première du prisme ordonné qui est servie — par une
 * traduction, ou parce que la transcription est déjà dans cette langue
 * (`resolvePrismTranslation`) — jamais `translations.first`.
 */
import { describe, it, expect } from 'vitest';
import { prismSubtitleLanguage, subtitleCuesFor, webVtt } from '../subtitles';

const transcription = {
  text: 'Bonjour à tous. On se retrouve demain à dix heures.',
  language: 'fr',
  durationMs: 6000,
  segments: [
    { text: 'Bonjour à tous.', startMs: 0, endMs: 1800 },
    { text: 'On se retrouve demain à dix heures.', startMs: 2000, endMs: 5800 },
  ],
};
const translations = {
  en: { type: 'audio', transcription: 'Hello everyone. See you tomorrow at ten.', createdAt: '2026-10-23' },
  es: { type: 'audio', transcription: 'Hola a todos. Nos vemos mañana a las diez.', createdAt: '2026-10-23' },
  de: { type: 'audio', transcription: 'Gelöscht.', createdAt: '2026-10-23', deletedAt: '2026-10-23' },
};

describe('prismSubtitleLanguage — le Prisme, rang par rang (#11329)', () => {
  it('rang 1 servi par une traduction', () => {
    expect(prismSubtitleLanguage({ transcription, translations, preferredLanguages: ['en', 'fr'] })).toBe('en');
  });

  it('rang 1 absent, rang 2 traduit : le rang 2, jamais la première traduction venue', () => {
    expect(prismSubtitleLanguage({ transcription, translations, preferredLanguages: ['it', 'es', 'en'] })).toBe('es');
  });

  it('la langue d’origine concourt à SON rang : prisme [en, fr] sur un vocal français traduit en anglais ⇒ en', () => {
    expect(prismSubtitleLanguage({ transcription, translations, preferredLanguages: ['en', 'fr'] })).toBe('en');
    expect(prismSubtitleLanguage({ transcription, translations, preferredLanguages: ['fr', 'en'] })).toBe('fr');
  });

  it('aucune langue du prisme servie : l’original, jamais `translations.first`', () => {
    expect(prismSubtitleLanguage({ transcription, translations, preferredLanguages: ['ja'] })).toBe('fr');
  });

  it('une traduction supprimée ne concourt pas', () => {
    expect(prismSubtitleLanguage({ transcription, translations, preferredLanguages: ['de', 'es'] })).toBe('es');
  });

  it('sans transcription : rien', () => {
    expect(prismSubtitleLanguage({ transcription: null, translations, preferredLanguages: ['en'] })).toBeNull();
  });
});

describe('subtitleCuesFor — les repères (#11329)', () => {
  it('langue d’origine : les segments de Whisper, tels quels', () => {
    expect(subtitleCuesFor({ transcription, translations, language: 'fr' })).toEqual([
      { startMs: 0, endMs: 1800, text: 'Bonjour à tous.' },
      { startMs: 2000, endMs: 5800, text: 'On se retrouve demain à dix heures.' },
    ]);
  });

  it('langue traduite : le texte traduit, posé sur la chronologie de l’ORIGINAL, au prorata des segments', () => {
    const cues = subtitleCuesFor({ transcription, translations, language: 'en' });
    expect(cues?.map((c) => [c.startMs, c.endMs])).toEqual([[0, 1800], [2000, 5800]]);
    expect(cues?.map((c) => c.text).join(' ')).toBe('Hello everyone. See you tomorrow at ten.');
    expect(cues?.every((c) => c.text.length > 0)).toBe(true);
  });

  it('sans segments : un seul repère sur toute la durée', () => {
    expect(subtitleCuesFor({ transcription: { text: 'Salut', language: 'fr', durationMs: 3000 }, translations: {}, language: 'fr' }))
      .toEqual([{ startMs: 0, endMs: 3000, text: 'Salut' }]);
  });

  it('une langue sans traduction ni origine : null', () => {
    expect(subtitleCuesFor({ transcription, translations, language: 'ja' })).toBeNull();
    expect(subtitleCuesFor({ transcription, translations, language: 'de' })).toBeNull();
  });
});

describe('webVtt — le fichier (#11329)', () => {
  it('écrit un WebVTT valide, horodatage HH:MM:SS.mmm, texte échappé', () => {
    expect(webVtt([
      { startMs: 0, endMs: 1800, text: 'a < b & c' },
      { startMs: 3_723_004, endMs: 3_725_000, text: 'fin --> ici' },
    ])).toBe('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.800\na &lt; b &amp; c\n\n2\n01:02:03.004 --> 01:02:05.000\nfin --&gt; ici\n');
  });
});
