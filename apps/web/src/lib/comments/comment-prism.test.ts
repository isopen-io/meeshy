import { describe, expect, test } from 'bun:test';

import type { FeedMedia } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';

import { commentPrism, commentTranslatedLanguages, servedCommentAudio } from './comment-prism';

/**
 * **LE PRISME D'UN COMMENTAIRE, COMME CELUI D'UN MESSAGE** (#16541) — les
 * drapeaux disent les AUTRES langues disponibles, l'original en tête, jamais
 * celle déjà servie ; un vocal sans texte sert sa transcription, et sa piste
 * suit la langue de cette transcription.
 *
 * Le corpus se lit sur un rang ≠ 1 (leçon 261) : le lecteur préfère
 * `['fr','en']`, et seul l'anglais existe.
 */
const READER = ['fr', 'en'];

const text = (patch: Partial<PostComment> = {}): Pick<PostComment, 'content' | 'originalLanguage' | 'translations' | 'media'> => ({
  content: 'Buenos días',
  originalLanguage: 'es',
  translations: { en: { text: 'Good morning' } },
  ...patch,
});

const voice: FeedMedia = {
  id: 'pm-voice',
  mimeType: 'audio/mp4',
  fileUrl: '/voice-es.m4a',
  transcription: { text: 'Hola a todos', language: 'es' } as FeedMedia['transcription'],
  translations: { en: { type: 'audio', transcription: 'Hello everyone', url: '/voice-en.m4a' } } as unknown as FeedMedia['translations'],
};

describe('commentPrism — un commentaire de texte', () => {
  test('sert le rang 2, et offre le drapeau de l’ORIGINAL — jamais celui déjà servi', () => {
    const prism = commentPrism({ comment: text(), readerLanguages: READER, displayLanguage: null });
    expect(prism.text.text).toBe('Good morning');
    expect(prism.servedLanguage).toBe('en');
    expect(prism.band).toEqual(['es']);
  });

  test('explorer l’original le sert, et le drapeau de la traduction prend sa place', () => {
    const prism = commentPrism({ comment: text(), readerLanguages: READER, displayLanguage: 'es' });
    expect(prism.text.text).toBe('Buenos días');
    expect(prism.servedLanguage).toBe('es');
    expect(prism.band).toEqual(['en']);
  });

  test('un commentaire déjà dans la langue du lecteur n’offre aucun drapeau', () => {
    expect(commentPrism({ comment: text({ content: 'Bonjour', originalLanguage: 'fr', translations: {} }), readerLanguages: READER, displayLanguage: null }).band).toEqual([]);
  });
});

describe('commentPrism — un commentaire VOCAL', () => {
  const vocal = text({ content: '', translations: {}, media: [voice] });

  test('la rangée sert la TRANSCRIPTION traduite, et offre l’original', () => {
    expect(commentTranslatedLanguages(vocal)).toEqual(['en']);
    const prism = commentPrism({ comment: vocal, readerLanguages: READER, displayLanguage: null });
    expect(prism.servedLanguage).toBe('en');
    expect(prism.band).toEqual(['es']);
  });

  test('la piste suit la langue servie — et l’original au geste', () => {
    const served = commentPrism({ comment: vocal, readerLanguages: READER, displayLanguage: null });
    expect(servedCommentAudio({ media: voice, prism: served.prism, fallbackLanguage: 'es' }).url).toBe('/voice-en.m4a');
    const original = commentPrism({ comment: vocal, readerLanguages: READER, displayLanguage: 'es' });
    expect(servedCommentAudio({ media: voice, prism: original.prism, fallbackLanguage: 'es' }).url).toBe('/voice-es.m4a');
    expect(original.band).toEqual(['en']);
  });
});
