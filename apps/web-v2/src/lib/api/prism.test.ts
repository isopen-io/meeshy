/**
 * LES TÉMOINS DE L'ADAPTATEUR DE PRISME.
 *
 * La RÈGLE est celle de `@meeshy/shared`, qui a ses propres témoins ; ce qui
 * se vérifie ici est que l'application l'appelle JUSTE — et c'est là que les
 * trois familles divergentes du dépôt sont nées, pas dans la règle.
 *
 * Le premier cas est celui qui compte : un témoin de RANG s'écrit sur un rang
 * AUTRE que le premier, sinon le court-circuit interdit (« la langue d'origine
 * est dans le prisme ⇒ afficher l'original ») et la règle juste rendent le
 * même verdict, et le témoin ne peut pas tomber.
 */
import { describe, expect, test } from 'bun:test';

import { prismFor, resolveAudioTrack, served, servedTranscript } from './prism';

/** La forme que rend un message : un tableau de lignes `MessageTranslation`. */
const rows = (targetLanguage: string, translatedContent: string) => [
  {
    id: 't1',
    messageId: 'm1',
    targetLanguage,
    translatedContent,
    translationModel: 'medium' as const,
    createdAt: new Date(),
  },
];

test('la langue primaire gagne même quand la langue d’origine est dans le prisme à un rang inférieur', () => {
  const r = served({
    preferredLanguages: ['fr', 'en'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Bonjour', language: 'fr', translated: true });
});

test('sans traduction vers la langue primaire, le rang suivant est servi', () => {
  const r = served({
    preferredLanguages: ['de', 'fr'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r.text).toBe('Bonjour');
  expect(r.language).toBe('fr');
});

test('le message déjà écrit dans une langue du prisme est servi À SON RANG', () => {
  const r = served({
    preferredLanguages: ['en', 'fr'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Hello', language: 'en', translated: false });
});

test('aucune langue servie : l’original, jamais translations[0]', () => {
  const r = served({
    preferredLanguages: ['de'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Hello', language: 'en', translated: false });
});

/**
 * La CARTE `{ langue: texte }` est la seconde forme, celle que la passerelle
 * précalcule pour une ligne de liste (`lastMessageTranslations`). Les deux
 * entrent par la même porte : c'est tout l'objet de l'adaptateur, et le seul
 * endroit où l'application pouvait se tromper de dialecte.
 */
test('la carte précalculée d’une ligne de liste descend le même prisme', () => {
  const r = served({
    preferredLanguages: ['fr'],
    originalLanguage: 'en',
    translations: { fr: 'Bonjour' },
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Bonjour', language: 'fr', translated: true });
});

test('une carte absente sert l’original sans lever', () => {
  const r = served({
    preferredLanguages: ['fr'],
    originalLanguage: 'en',
    translations: undefined,
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Hello', language: 'en', translated: false });
});

/**
 * `resolveAudioTrack — la piste suit le TEXTE servi (cycle 128)` — la loi
 * du CLAUDE.md § Prisme : « la piste est élue par la langue du TEXTE SERVI,
 * jamais par une descente indépendante ». `resolveAudioTrack` ne relit donc
 * AUCUN prisme ; il PREND le rang déjà élu par `servedTranscript`/`served`.
 */
describe('resolveAudioTrack — la piste suit le TEXTE servi (cycle 128)', () => {
  test('rang ≠ 1 : la langue servie au rang 2 élit sa piste, jamais le rang 1 ni l’original', () => {
    const track = resolveAudioTrack({
      servedLanguage: 'de',
      originalLanguage: 'en',
      originalUrl: 'data:audio/wav;base64,ORIGINAL',
      translations: {
        fr: { type: 'audio', transcription: 'Bonjour', url: 'data:audio/wav;base64,FR', createdAt: new Date() },
        de: { type: 'audio', transcription: 'Hallo', url: 'data:audio/wav;base64,DE', createdAt: new Date() },
      },
    });
    expect(track).toEqual({ url: 'data:audio/wav;base64,DE', language: 'de', translated: true });
  });

  test('langue servie SANS piste : repli sur l’original (miroir url(for:) :86-95)', () => {
    const track = resolveAudioTrack({
      servedLanguage: 'de',
      originalLanguage: 'en',
      originalUrl: 'data:audio/wav;base64,ORIGINAL',
      translations: {
        // `de` porte un TEXTE mais aucune URL — le TTS n'a pas encore produit
        // la piste (`transcriptTranslationTracks` l'écarte, `attachment-audio.ts:441-444`).
        de: { type: 'audio', transcription: 'Hallo', createdAt: new Date() },
      },
    });
    expect(track).toEqual({ url: 'data:audio/wav;base64,ORIGINAL', language: 'en', translated: false });
  });

  test('langue servie = langue d’origine : l’original, sans consulter les traductions', () => {
    const track = resolveAudioTrack({
      servedLanguage: 'en',
      originalLanguage: 'en',
      originalUrl: 'data:audio/wav;base64,ORIGINAL',
      translations: { en: { type: 'audio', transcription: 'Hello', url: 'data:audio/wav;base64,EN', createdAt: new Date() } },
    });
    expect(track).toEqual({ url: 'data:audio/wav;base64,ORIGINAL', language: 'en', translated: false });
  });

  test('mimeType/durationMs remontent de la piste élue quand présents, absents sinon', () => {
    const withMeta = resolveAudioTrack({
      servedLanguage: 'fr',
      originalLanguage: 'en',
      originalUrl: 'data:audio/wav;base64,ORIGINAL',
      translations: {
        fr: {
          type: 'audio',
          transcription: 'Bonjour',
          url: 'data:audio/wav;base64,FR',
          format: 'wav',
          durationMs: 12_400,
          createdAt: new Date(),
        },
      },
    });
    expect(withMeta).toEqual({
      url: 'data:audio/wav;base64,FR',
      language: 'fr',
      translated: true,
      mimeType: 'audio/wav',
      durationMs: 12_400,
    });

    const withoutMeta = resolveAudioTrack({
      servedLanguage: 'fr',
      originalLanguage: 'en',
      originalUrl: 'data:audio/wav;base64,ORIGINAL',
      translations: { fr: { type: 'audio', transcription: 'Bonjour', url: 'data:audio/wav;base64,FR', createdAt: new Date() } },
    });
    expect(withoutMeta.mimeType).toBeUndefined();
    expect(withoutMeta.durationMs).toBeUndefined();
  });
});

/**
 * `Attachment.transcription` (`packages/shared/types/attachment.ts`) porte
 * l'union V1 de `attachment-transcription.ts` — `AudioTranscription` nomme
 * son texte `transcribedText`, PAS `text` (seuls video/document/image le
 * nomment `text`) : c'est un ÉCART entre la spécification (qui supposait un
 * `.text` uniforme, la forme du type V2 de `attachment-audio.ts`) et le champ
 * RÉEL du domaine — suivi ici, jamais réécrit en silence.
 */
describe('servedTranscript — la descente du texte d’une pièce', () => {
  test('rang 2 : la transcription originale cède à une traduction texte servie à un rang inférieur', () => {
    const result = servedTranscript({
      preferredLanguages: ['de', 'fr'],
      attachment: {
        transcription: { type: 'audio', transcribedText: 'Hello', language: 'en', confidence: 0.9, source: 'whisper' },
        translations: {
          fr: { type: 'audio', transcription: 'Bonjour', createdAt: new Date() },
          de: { type: 'audio', transcription: 'Hallo', createdAt: new Date() },
        },
        originalName: 'note.wav',
      },
      fallbackLanguage: 'fr',
    });
    expect(result).toEqual({ text: 'Hallo', language: 'de', translated: true });
  });

  test('aucune traduction vers le prisme : l’original SERVI À SON RANG, jamais un autre', () => {
    const result = servedTranscript({
      preferredLanguages: ['en', 'fr'],
      attachment: {
        transcription: { type: 'audio', transcribedText: 'Hello', language: 'en', confidence: 0.9, source: 'whisper' },
        translations: {},
        originalName: 'note.wav',
      },
      fallbackLanguage: 'fr',
    });
    expect(result).toEqual({ text: 'Hello', language: 'en', translated: false });
  });

  test('pièce sans transcription : texte vide, langue de repli, jamais traduit', () => {
    const result = servedTranscript({
      preferredLanguages: ['en', 'fr'],
      attachment: { translations: {}, originalName: '' },
      fallbackLanguage: 'fr',
    });
    expect(result).toEqual({ text: '', language: 'fr', translated: false });
  });

  test('`displayLanguage` inséré au rang 0 (manualOverride) change le résultat, jusqu’à revenir à l’original', () => {
    const attachment = {
      transcription: {
        type: 'audio' as const,
        transcribedText: 'Hello',
        language: 'en',
        confidence: 0.9,
        source: 'whisper' as const,
      },
      translations: {
        fr: { type: 'audio' as const, transcription: 'Bonjour', createdAt: new Date() },
        de: { type: 'audio' as const, transcription: 'Hallo', createdAt: new Date() },
      },
      originalName: 'note.wav',
    };
    const overridden = servedTranscript({ preferredLanguages: ['en', 'de', 'fr'], attachment, fallbackLanguage: 'fr' });
    expect(overridden).toEqual({ text: 'Hello', language: 'en', translated: false });
  });
});

/**
 * `prismFor` — SITE UNIQUE de l'insertion au rang 0 (revue #5805). Le ternaire
 * qu'elle remplace vivait en QUATRE copies (`bubble.tsx`, `focal-row.tsx`,
 * `use-message-menu.ts`, `view/media.ts`) ; le témoin de RANG porte sur ce que
 * l'insertion CHANGE pour la descente, jamais sur la forme du tableau.
 */
describe('prismFor — l’exploration prend la TÊTE du prisme, sans court-circuit (#5805)', () => {
  test('au repos, le prisme du lecteur passe INTACT — jamais une copie réordonnée', () => {
    const readerLanguages = ['fr', 'en'] as const;
    expect(prismFor({ readerLanguages })).toBe(readerLanguages);
  });

  test('la langue explorée se place au rang 0 SANS retirer les rangs du lecteur', () => {
    expect(prismFor({ readerLanguages: ['fr', 'en'], displayLanguage: 'de' })).toEqual(['de', 'fr', 'en']);
  });

  test('`displayLanguage` explicitement `undefined` équivaut au repos (exactOptionalPropertyTypes)', () => {
    expect(prismFor({ readerLanguages: ['fr', 'en'], displayLanguage: undefined })).toEqual(['fr', 'en']);
  });

  test('RANG ≠ 1 : la langue explorée SANS traduction laisse la descente continuer, jamais l’original', () => {
    // Le court-circuit interdit (« langue explorée absente ⇒ original ») et la
    // règle juste diffèrent ICI et seulement ici : `de` n'a rien, `en` a une
    // traduction — c'est `en` qui doit gagner, à son rang.
    const servedText = served({
      preferredLanguages: prismFor({ readerLanguages: ['en'], displayLanguage: 'de' }),
      originalLanguage: 'fr',
      translations: { en: 'Good morning' },
      original: 'Bonjour',
    });
    expect(servedText).toEqual({ text: 'Good morning', language: 'en', translated: true });
  });

  test('la langue explorée ÉGALE à l’origine rend l’original à SON rang (règle 3)', () => {
    const servedText = served({
      preferredLanguages: prismFor({ readerLanguages: ['en'], displayLanguage: 'fr' }),
      originalLanguage: 'fr',
      translations: { en: 'Good morning' },
      original: 'Bonjour',
    });
    expect(servedText).toEqual({ text: 'Bonjour', language: 'fr', translated: false });
  });
});
