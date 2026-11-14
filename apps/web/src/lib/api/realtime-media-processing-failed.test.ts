import { describe, expect, test } from 'bun:test';

import {
  TRANSCRIPTION_STAGE,
  TRANSLATIONS_STAGE,
  createMediaProcessingFailuresStore,
  failedStagesOf,
} from './media-processing-failures';
import {
  applyAudioTranslationFailed,
  applyTranscriptionFailed,
  isMediaProcessingFailed,
} from './realtime-media-processing-failed';

/**
 * #18537 — LE PUITS DES DEUX PANNES DE TRAITEMENT D'UNE PIÈCE.
 *
 * La garde est partagée par les deux événements parce que leurs charges sont
 * identiques (`TranscriptionFailedEventData` et `AudioTranslationFailedEventData`
 * déclarent les mêmes six clés). Les témoins partent donc de la charge RÉELLE de
 * l'émetteur, recopiée clé par clé depuis `MeeshySocketIOManager` —
 * `_handleTranscriptionFailed` et `_handleAudioTranslationFailed`.
 */
const wirePayload = (over: Record<string, unknown> = {}) => ({
  messageId: '68c1f0a9b2d4e5f601020304',
  attachmentId: '68c1f0a9b2d4e5f60102aaaa',
  conversationId: '68c1f0a9b2d4e5f60102bbbb',
  error: 'Whisper worker unavailable',
  errorCode: 'TRANSCRIPTION_FAILED',
  taskId: 'task-7',
  ...over,
});

describe('la garde de forme refuse ce qui ne nomme pas sa pièce', () => {
  test('la charge de l’émetteur passe', () => {
    expect(isMediaProcessingFailed(wirePayload())).toBe(true);
  });

  /**
   * `error` est déclaré REQUIS au contrat et n'est pas exigé ici, et le témoin le
   * dit : le lecteur rend sa propre phrase traduite, jamais le texte du serveur.
   * Refuser la trame pour un champ qu'on n'affiche pas ferait perdre la seule
   * preuve de panne dont le lecteur dispose.
   */
  test('une charge sans `error` passe — le lecteur ne l’affiche pas', () => {
    const { error: _ignored, ...withoutError } = wirePayload();
    expect(isMediaProcessingFailed(withoutError)).toBe(true);
  });

  const REFUSED: readonly (readonly [string, Record<string, unknown>])[] = [
    ['sans pièce', { attachmentId: undefined }],
    ['pièce vide', { attachmentId: '' }],
    ['pièce non textuelle', { attachmentId: 42 }],
    ['sans conversation', { conversationId: undefined }],
    ['sans message', { messageId: undefined }],
  ];

  for (const [label, over] of REFUSED) {
    test(`refuse : ${label}`, () => {
      expect(isMediaProcessingFailed(wirePayload(over))).toBe(false);
    });
  }

  const NOT_OBJECTS: readonly unknown[] = [null, undefined, 'a-1', 7, []];

  for (const [index, payload] of NOT_OBJECTS.entries()) {
    test(`refuse une charge qui n’est pas un objet (${index})`, () => {
      expect(isMediaProcessingFailed(payload)).toBe(false);
    });
  }
});

describe('la panne s’écrit sur la PIÈCE, par étage', () => {
  test('une transcription échouée n’écrit que son étage', () => {
    const store = createMediaProcessingFailuresStore();
    applyTranscriptionFailed(store, wirePayload());

    expect(failedStagesOf(store.getState(), '68c1f0a9b2d4e5f60102aaaa')).toEqual([TRANSCRIPTION_STAGE]);
  });

  test('une traduction audio échouée n’écrit que le sien', () => {
    const store = createMediaProcessingFailuresStore();
    applyAudioTranslationFailed(store, wirePayload());

    expect(failedStagesOf(store.getState(), '68c1f0a9b2d4e5f60102aaaa')).toEqual([TRANSLATIONS_STAGE]);
  });

  test('les deux étages d’une même pièce coexistent', () => {
    const store = createMediaProcessingFailuresStore();
    applyTranscriptionFailed(store, wirePayload());
    applyAudioTranslationFailed(store, wirePayload());

    expect(failedStagesOf(store.getState(), '68c1f0a9b2d4e5f60102aaaa')).toEqual([TRANSCRIPTION_STAGE, TRANSLATIONS_STAGE]);
  });

  /** Le traducteur peut rejouer une trame : deux livraisons valent une. */
  test('une seconde trame pour le même étage n’ajoute rien, et ne change pas l’état', () => {
    const store = createMediaProcessingFailuresStore();
    applyTranscriptionFailed(store, wirePayload());
    const afterFirst = store.getState().byAttachment;
    applyTranscriptionFailed(store, wirePayload());

    expect(store.getState().byAttachment).toBe(afterFirst);
  });

  test('une pièce sans panne rend TOUJOURS la même référence — un abonné ne rend pas sans fin', () => {
    const store = createMediaProcessingFailuresStore();

    expect(failedStagesOf(store.getState(), 'jamais-vue')).toBe(failedStagesOf(store.getState(), 'autre'));
  });

  test('effacer un étage libère la pièce quand c’était le dernier', () => {
    const store = createMediaProcessingFailuresStore();
    applyTranscriptionFailed(store, wirePayload());
    applyAudioTranslationFailed(store, wirePayload());

    store.getState().cleared('68c1f0a9b2d4e5f60102aaaa', TRANSCRIPTION_STAGE);
    expect(failedStagesOf(store.getState(), '68c1f0a9b2d4e5f60102aaaa')).toEqual([TRANSLATIONS_STAGE]);

    store.getState().cleared('68c1f0a9b2d4e5f60102aaaa', TRANSLATIONS_STAGE);
    expect(store.getState().byAttachment).toEqual({});
  });

  test('effacer un étage qui n’a pas échoué ne change pas l’état', () => {
    const store = createMediaProcessingFailuresStore();
    applyTranscriptionFailed(store, wirePayload());
    const before = store.getState().byAttachment;

    store.getState().cleared('68c1f0a9b2d4e5f60102aaaa', TRANSLATIONS_STAGE);
    store.getState().cleared('une-autre-piece', TRANSCRIPTION_STAGE);

    expect(store.getState().byAttachment).toBe(before);
  });
});
