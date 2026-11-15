/**
 * La description textuelle d'un média (#11329) : celle que l'auteur a saisie,
 * sinon la transcription de Whisper — chacune servie dans la langue du LECTEUR
 * (Prisme, rang par rang, original quand aucun rang n'est servi), et jamais
 * pour une pièce protégée.
 */
import { describe, it, expect } from 'vitest';
import { MEDIA_DESCRIPTION_MAX_LENGTH, resolveMediaDescription, sanitizeMediaDescription } from '../media-description';

const transcription = { text: 'Bonjour à tous.', language: 'fr' };
const translations = {
  en: { type: 'audio', transcription: 'Hello everyone.', createdAt: 'x' },
  es: { type: 'audio', transcription: 'Hola a todos.', createdAt: 'x' },
};

describe('sanitizeMediaDescription — la saisie à l’envoi', () => {
  it('rogne, retire les caractères de contrôle, replie les blancs, borne la longueur', () => {
    expect(sanitizeMediaDescription('  Un chat\u0000 sur\n\n un   toit  ')).toBe('Un chat sur un toit');
    expect(sanitizeMediaDescription('x'.repeat(MEDIA_DESCRIPTION_MAX_LENGTH + 50))).toHaveLength(MEDIA_DESCRIPTION_MAX_LENGTH);
  });

  it('vide, blanc ou non textuel : rien', () => {
    expect(sanitizeMediaDescription('   ')).toBeNull();
    expect(sanitizeMediaDescription(42)).toBeNull();
    expect(sanitizeMediaDescription(undefined)).toBeNull();
  });
});

describe('resolveMediaDescription — saisie d’abord, transcription par défaut, Prisme partout', () => {
  it('la description saisie, traduite au rang servi du lecteur', () => {
    expect(resolveMediaDescription({
      alt: 'Un chat sur un toit', altLanguage: 'fr', altTranslations: { en: { text: 'A cat on a roof' } },
      transcription: null, translations: null, preferredLanguages: ['it', 'en'], isProtected: false,
    })).toEqual({ text: 'A cat on a roof', language: 'en', source: 'author', translated: true });
  });

  it('la description saisie, dans sa langue quand aucun rang n’est servi', () => {
    expect(resolveMediaDescription({
      alt: 'Un chat', altLanguage: 'fr', altTranslations: null,
      transcription: null, translations: null, preferredLanguages: ['ja'], isProtected: false,
    })).toEqual({ text: 'Un chat', language: 'fr', source: 'author', translated: false });
  });

  it('sans saisie : la transcription, au RANG servi — jamais la première traduction venue', () => {
    expect(resolveMediaDescription({
      alt: null, altLanguage: null, altTranslations: null,
      transcription, translations, preferredLanguages: ['it', 'es', 'en'], isProtected: false,
    })).toEqual({ text: 'Hola a todos.', language: 'es', source: 'transcription', translated: true });
  });

  it('la langue d’origine concourt à son rang : prisme [fr, en] ⇒ l’original français', () => {
    expect(resolveMediaDescription({
      alt: null, altLanguage: null, altTranslations: null,
      transcription, translations, preferredLanguages: ['fr', 'en'], isProtected: false,
    })).toEqual({ text: 'Bonjour à tous.', language: 'fr', source: 'transcription', translated: false });
  });

  it('les DEUX sources descendent ensemble, rang par rang : l’auteur d’abord à chaque rang', () => {
    const both = { alt: 'Un chat qui chante', altLanguage: 'fr', altTranslations: { es: { text: 'Un gato que canta' } }, transcription, translations };
    expect(resolveMediaDescription({ ...both, preferredLanguages: ['es'], isProtected: false }))
      .toEqual({ text: 'Un gato que canta', language: 'es', source: 'author', translated: true });
    expect(resolveMediaDescription({ ...both, preferredLanguages: ['it', 'en'], isProtected: false }))
      .toEqual({ text: 'Hello everyone.', language: 'en', source: 'transcription', translated: true });
    expect(resolveMediaDescription({ ...both, preferredLanguages: ['fr'], isProtected: false }))
      .toEqual({ text: 'Un chat qui chante', language: 'fr', source: 'author', translated: false });
    expect(resolveMediaDescription({ ...both, preferredLanguages: ['ja'], isProtected: false }))
      .toEqual({ text: 'Un chat qui chante', language: 'fr', source: 'author', translated: false });
  });

  it('une transcription longue est bornée à un mot entier', () => {
    const long = { text: `${'mot '.repeat(400)}fin`, language: 'fr' };
    const served = resolveMediaDescription({ alt: null, altLanguage: null, altTranslations: null, transcription: long, translations: null, preferredLanguages: ['fr'], isProtected: false });
    expect(served?.text.length).toBeLessThanOrEqual(MEDIA_DESCRIPTION_MAX_LENGTH);
    expect(served?.text.endsWith('…')).toBe(true);
    expect(served?.text).not.toMatch(/\smo…$/);
  });

  it('une pièce PROTÉGÉE ne transporte ni description ni transcription', () => {
    expect(resolveMediaDescription({
      alt: 'Un chat', altLanguage: 'fr', altTranslations: null,
      transcription, translations, preferredLanguages: ['fr'], isProtected: true,
    })).toBeNull();
  });

  it('la transcription se lit sous ses DEUX formes (`text`, `transcribedText`)', () => {
    expect(resolveMediaDescription({
      alt: null, altLanguage: null, altTranslations: null,
      transcription: { transcribedText: 'Hello team', language: 'en' }, translations: null, preferredLanguages: ['en'], isProtected: false,
    })?.text).toBe('Hello team');
  });

  it('ni saisie ni transcription : rien', () => {
    expect(resolveMediaDescription({ alt: '  ', altLanguage: null, altTranslations: null, transcription: null, translations: null, preferredLanguages: ['fr'], isProtected: false })).toBeNull();
  });
});
