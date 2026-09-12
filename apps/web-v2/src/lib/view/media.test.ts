/**
 * `src/lib/view/media.ts` (#5805) — l'ÉLECTION d'une pièce jointe, un site
 * UNIQUE pour le texte servi ET la piste audio, jamais deux descentes
 * (CLAUDE.md § Prisme, cycle 128). Les témoins de RANG s'écrivent sur un
 * rang AUTRE que le premier (leçon 261) : au rang 1, le court-circuit
 * interdit et la règle juste rendent le même verdict.
 */
import { describe, expect, test } from 'bun:test';

import { electAudio, electAudioTrack, electDescription, type MediaAttachment } from './media';

const englishVoiceWithFrenchTrack: MediaAttachment = {
  transcription: { type: 'audio', transcribedText: 'Hello team', language: 'en', confidence: 0.9, source: 'whisper' },
  translations: {
    fr: { type: 'audio', transcription: 'Bonjour équipe', url: 'data:audio/wav;base64,FR', createdAt: new Date() },
  },
  originalName: 'report.wav',
  fileUrl: 'data:audio/wav;base64,ORIGINAL_EN',
};

describe('electAudioTrack — la piste suit le TEXTE servi, à son RANG (#5805)', () => {
  test('rang ≠ 1 : ["de","fr"] — "de" n’a pas de piste, "fr" en a une ⇒ la piste FR', () => {
    const track = electAudioTrack(englishVoiceWithFrenchTrack, ['de', 'fr']);
    expect(track).toEqual({ url: 'data:audio/wav;base64,FR', language: 'fr' });
  });

  test('rang 1 = original : ["en","fr"] ⇒ null, JAMAIS translations[0]', () => {
    const track = electAudioTrack(englishVoiceWithFrenchTrack, ['en', 'fr']);
    expect(track).toBeNull();
  });

  test('langue servie SANS piste : repli sur l’original ⇒ null (miroir url(for:) :86-95)', () => {
    const germanVoiceWithTextOnlySpanish: MediaAttachment = {
      transcription: { type: 'audio', transcribedText: 'Die Präsentation', language: 'de', confidence: 0.9, source: 'whisper' },
      translations: {
        // `es` porte un TEXTE mais aucune URL — le TTS n'a pas encore produit
        // la piste (`transcriptTranslationTracks` l'écarte).
        es: { type: 'audio', transcription: 'La presentación', createdAt: new Date() },
      },
      originalName: 'presentation.wav',
      fileUrl: 'data:audio/wav;base64,ORIGINAL_DE',
    };
    const track = electAudioTrack(germanVoiceWithTextOnlySpanish, ['es', 'fr']);
    expect(track).toBeNull();
  });

  test('`displayLanguage` == original ⇒ null (miroir manualOverride :70-73)', () => {
    const track = electAudioTrack(englishVoiceWithFrenchTrack, ['de', 'fr'], { displayLanguage: 'en' });
    expect(track).toBeNull();
  });

  test('métadonnées (mimeType/durationMs) remontent quand présentes', () => {
    const withMeta: MediaAttachment = {
      transcription: { type: 'audio', transcribedText: 'Hello', language: 'en', confidence: 0.9, source: 'whisper' },
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
      originalName: 'note.wav',
      fileUrl: 'data:audio/wav;base64,ORIGINAL',
    };
    const track = electAudioTrack(withMeta, ['fr']);
    expect(track).toEqual({ url: 'data:audio/wav;base64,FR', language: 'fr', mimeType: 'audio/wav', durationMs: 12_400 });
  });
});

describe('electAudio — UNE descente, deux projections (#5805)', () => {
  test('la piste est élue par la langue du texte servi, JAMAIS par une seconde descente', () => {
    // Piégée : texte disponible en fr ET de, mais la PISTE n'existe qu'en de.
    // Une seconde descente indépendante pour la piste servirait `de`
    // au-dessus d'un texte `fr` — exactement le défaut du cycle 128.
    const trapped: MediaAttachment = {
      transcription: { type: 'audio', transcribedText: 'Hello', language: 'en', confidence: 0.9, source: 'whisper' },
      translations: {
        fr: { type: 'audio', transcription: 'Bonjour', createdAt: new Date() },
        de: { type: 'audio', transcription: 'Hallo', url: 'data:audio/wav;base64,DE', createdAt: new Date() },
      },
      originalName: 'note.wav',
      fileUrl: 'data:audio/wav;base64,ORIGINAL',
    };
    const elected = electAudio({ attachment: trapped, readerLanguages: ['fr', 'de'], fallbackLanguage: 'en' });
    expect(elected.described.language).toBe('fr');
    expect(elected.described.text).toBe('Bonjour');
    // La piste sert l'ORIGINAL (rang du texte servi = 'fr', sans piste fr) —
    // JAMAIS la piste 'de', qu'une seconde descente indépendante aurait élue.
    expect(elected.track).toEqual({ url: 'data:audio/wav;base64,ORIGINAL', language: 'en', translated: false });
  });

  test('`described.language === track.language` quand la piste ET le texte partagent le même rang', () => {
    const elected = electAudio({ attachment: englishVoiceWithFrenchTrack, readerLanguages: ['de', 'fr'], fallbackLanguage: 'en' });
    expect(elected.described.language).toBe('fr');
    expect(elected.track.language).toBe('fr');
    expect(elected.track).toEqual({ url: 'data:audio/wav;base64,FR', language: 'fr', translated: true });
  });

  test('`displayLanguage` insère au rang 0, jusqu’à revenir à l’original', () => {
    const elected = electAudio({
      attachment: englishVoiceWithFrenchTrack,
      readerLanguages: ['de', 'fr'],
      displayLanguage: 'en',
      fallbackLanguage: 'en',
    });
    expect(elected.described).toEqual({ text: 'Hello team', language: 'en', translated: false });
    expect(elected.track).toEqual({ url: 'data:audio/wav;base64,ORIGINAL_EN', language: 'en', translated: false });
  });

  test('un vocal SANS traduction de piste sert l’original, jamais une URL fabriquée', () => {
    const untranslated: MediaAttachment = {
      transcription: { type: 'audio', transcribedText: 'Bonjour', language: 'fr', confidence: 0.9, source: 'whisper' },
      translations: {},
      originalName: 'note.wav',
      fileUrl: 'data:audio/wav;base64,ORIGINAL_FR',
    };
    const elected = electAudio({ attachment: untranslated, readerLanguages: ['en', 'fr'], fallbackLanguage: 'fr' });
    expect(elected.described).toEqual({ text: 'Bonjour', language: 'fr', translated: false });
    expect(elected.track).toEqual({ url: 'data:audio/wav;base64,ORIGINAL_FR', language: 'fr', translated: false });
  });
});

/**
 * `electDescription` — LA MOITIÉ TEXTE, SEULE (revue #5805). Le lot livrait un
 * `electMedia` unique que l'IMAGE appelait aussi : elle recevait une « piste
 * audio servie » dont l'`url` était son propre PNG, et le dépouillement des
 * pistes tournait à chaque rendu de chaque image pour une valeur jetée. Ces
 * témoins tiennent la frontière — l'image descend le Prisme pour son `alt`, et
 * n'élit AUCUNE piste.
 */
describe('electDescription — le TEXTE d’une pièce, et rien d’autre (#5805)', () => {
  const dashboard: MediaAttachment = {
    alt: 'Capture du tableau de bord',
    originalName: 'dashboard.png',
    translations: {
      en: { type: 'image', transcription: 'Dashboard screenshot', createdAt: new Date() },
      de: { type: 'image', transcription: 'Bildschirmfoto', createdAt: new Date() },
    },
    fileUrl: 'data:image/png;base64,ABC',
    transcription: { type: 'image', text: 'Capture du tableau de bord', language: 'fr', confidence: 1, source: 'vision' },
  };

  test('rang ≠ 1 : ["es","de"] — "es" n’a pas d’alt, "de" en a un ⇒ l’alt allemand', () => {
    expect(electDescription({ attachment: dashboard, readerLanguages: ['es', 'de'], fallbackLanguage: 'fr' })).toEqual({
      text: 'Bildschirmfoto',
      language: 'de',
      translated: true,
    });
  });

  test('la langue d’origine concourt à son RANG : ["fr","en"] ⇒ l’original, jamais translations[0]', () => {
    expect(electDescription({ attachment: dashboard, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' })).toEqual({
      text: 'Capture du tableau de bord',
      language: 'fr',
      translated: false,
    });
  });

  test('une pièce sans transcription ni alt retombe sur son nom, jamais sur du vide inventé', () => {
    const bare: MediaAttachment = { originalName: 'facture.pdf', translations: {}, fileUrl: 'data:application/pdf;base64,ABC' };
    expect(electDescription({ attachment: bare, readerLanguages: ['en', 'fr'], fallbackLanguage: 'fr' })).toEqual({
      text: 'facture.pdf',
      language: 'fr',
      translated: false,
    });
  });

  test('rend le MÊME texte que `electAudio` — une seule descente, deux portées', () => {
    const audio = electAudio({ attachment: englishVoiceWithFrenchTrack, readerLanguages: ['de', 'fr'], fallbackLanguage: 'en' });
    const text = electDescription({ attachment: englishVoiceWithFrenchTrack, readerLanguages: ['de', 'fr'], fallbackLanguage: 'en' });
    expect(text).toEqual(audio.described);
  });
});

/**
 * DÉFAUT BLOQUANT, REVUE #5805 — `transcription: null` (et non un champ
 * ABSENT) EFFONDRE LE FIL RÉEL. Relevé le 2026-09-12 sur
 * `gate.staging.meeshy.me` (conv `690d64275c50e29d3c0c6f29`) : TOUTE pièce
 * jointe sans transcription sert `transcription: null` explicite —
 * `translations`/`alt`/`thumbnailUrl` suivent le même régime. Le type
 * partagé (`packages/shared/types/attachment.ts:284`) déclare
 * `transcription?: AttachmentTranscription`, SANS `| null` : `tsc` est
 * satisfait pendant que `transcription.type` lève sur la charge RÉELLE — le
 * motif « un `Json?` Prisma sérialise `null` » déjà payé par le dépôt
 * (`tasks/lessons.md`).
 *
 * Ce témoin construit la charge EXACTEMENT comme la passerelle la sert (les
 * quatre champs à `null`, jamais absents) et prouve que l'élection ne lève
 * PAS — c'est `decodeAttachment` (`api/decode.ts`), appelé par
 * `decodeMessage` sur `message.attachments`, qui défait ces `null` À LA
 * FRONTIÈRE ; `transcriptionTextOf` (`api/prism.ts`) est en outre durci en
 * ceinture, pour tout appelant qui construirait une `MediaAttachment` sans
 * passer par ce décodeur.
 */
describe('electDescription / electAudio — `transcription: null` explicite (charge RÉELLE, revue #5805)', () => {
  const attachmentAsServedByTheGateway = {
    transcription: null,
    translations: null,
    alt: null,
    originalName: 'capture.png',
    fileUrl: 'data:image/png;base64,ABC',
  } as unknown as MediaAttachment;

  test('electDescription ne lève PAS et retombe sur le nom du fichier', () => {
    expect(() =>
      electDescription({ attachment: attachmentAsServedByTheGateway, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' }),
    ).not.toThrow();
    expect(electDescription({ attachment: attachmentAsServedByTheGateway, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' })).toEqual({
      text: 'capture.png',
      language: 'fr',
      translated: false,
    });
  });

  test('electAudio ne lève PAS et sert la piste originale', () => {
    const voiceAsServedByTheGateway = { ...attachmentAsServedByTheGateway, originalName: 'note.mp4', fileUrl: 'data:audio/mp4;base64,ABC' };
    expect(() =>
      electAudio({ attachment: voiceAsServedByTheGateway, readerLanguages: ['fr', 'en'], fallbackLanguage: 'en' }),
    ).not.toThrow();
    const elected = electAudio({ attachment: voiceAsServedByTheGateway, readerLanguages: ['fr', 'en'], fallbackLanguage: 'en' });
    expect(elected.track).toEqual({ url: 'data:audio/mp4;base64,ABC', language: 'en', translated: false });
  });
});

/**
 * DÉFAUT MAJEUR, REVUE #5805 (second passage) — L'ÉLECTION PAR `type` PERD LE
 * TEXTE SUR LA FORME RÉELLE DU WIRE. `type` est optionnel et AUCUN écrivain de
 * production ne le pose (`AudioTranslateService.ts:790-797`,
 * `AttachmentTranslateService.ts:648-662` : les deux écrivent `text`, jamais
 * `type` ni `transcribedText`). Et quand `type === 'audio'` EST présent — la
 * forme que les témoins du gateway anticipent (`sync.test.ts:1372`,
 * `attachments-metadata-scope-guard.test.ts:60`) — le texte réel vit encore
 * dans `text`, jamais dans `transcribedText`. Élire PAR `type` rend donc
 * `undefined` sur les DEUX formes réelles, et `servedTranscript` retombe sur
 * `alt ?? originalName` : le fil affiche « note.m4a » à la place de ce qui a
 * été dit, et `servedRowLanguage` (`message.ts:169-186`), ne voyant plus de
 * texte de pièce, ré-affiche la langue du MESSAGE — le contrôle INERTE que ce
 * lot prétendait avoir corrigé, un cran plus bas.
 *
 * La RÉFÉRENCE iOS (D-1) et la passerelle elle-même sont TOLÉRANTES sur ce
 * même champ : `MessageModels.swift:89` (`text ?? transcribedText`),
 * `messages-list.ts:579` (`att.transcription.text ||
 * att.transcription.transcribedText`). `transcriptionTextOf` (`api/prism.ts`)
 * en est désormais le miroir exact — c'est CE témoin qui le garde.
 */
describe('electDescription / servedTranscript — la forme RÉELLE du wire (`type` présent, `text` seul, revue #5805)', () => {
  test('`type: \'audio\'` avec `text` (aucun `transcribedText`) : le texte dit, jamais le nom du fichier', () => {
    const voiceAsWrittenByAudioTranslateService: MediaAttachment = {
      transcription: { type: 'audio', text: 'La réunion est déplacée', language: 'en', confidence: 0.92, source: 'whisper' } as never,
      translations: {},
      originalName: 'note.m4a',
      fileUrl: 'data:audio/mp4;base64,ABC',
    };
    expect(
      electDescription({ attachment: voiceAsWrittenByAudioTranslateService, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' }),
    ).toEqual({ text: 'La réunion est déplacée', language: 'en', translated: false });
  });

  test('`type` ABSENT (forme majoritaire écrite en production) avec `text` : le texte dit, jamais le nom du fichier', () => {
    const voiceWithoutType: MediaAttachment = {
      transcription: { text: 'La réunion est déplacée', language: 'en', confidence: 0.92, source: 'whisper' } as never,
      translations: {},
      originalName: 'note.m4a',
      fileUrl: 'data:audio/mp4;base64,ABC',
    };
    expect(electDescription({ attachment: voiceWithoutType, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' })).toEqual({
      text: 'La réunion est déplacée',
      language: 'en',
      translated: false,
    });
  });
});
