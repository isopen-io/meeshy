import type { AudioTranslationFailedEventData, TranscriptionFailedEventData } from '@meeshy/shared/types/socketio-events/audio';

import { TRANSCRIPTION_STAGE, TRANSLATIONS_STAGE, type MediaProcessingFailuresApi } from './media-processing-failures';

/**
 * `audio:transcription-failed` ET `audio:translation-failed` (#18537) — LES DEUX
 * ISSUES D'UNE DEMANDE MISE EN FILE.
 *
 * Le lecteur demande, la passerelle répond `processing`, et le résultat ne
 * revient que par le temps réel : `audio:transcription-ready` /
 * `message:attachment-updated` pour la RÉUSSITE, ces deux noms pour la PANNE.
 * Seule la première moitié était branchée — iOS (`MessageSocketRoutes+Media`) et
 * Android (`TranslationFailureApplier`) lisent les deux depuis toujours.
 *
 * Les deux charges sont de la MÊME forme (`messageId`, `attachmentId`,
 * `conversationId`, `error`), et la garde est partagée pour cette raison : une
 * seconde garde écrite à la main dériverait de la première au premier champ
 * ajouté.
 */
type MediaProcessingFailedEventData = TranscriptionFailedEventData | AudioTranslationFailedEventData;

/**
 * Garde de FORME, fail-closed : la charge nomme sa conversation, son message et
 * sa pièce. `error` est déclaré requis au contrat et n'est PAS exigé ici — le
 * texte de la passerelle n'est pas affiché (le lecteur rend sa propre phrase,
 * traduite), et refuser la trame pour un champ qu'on n'utilise pas ferait perdre
 * la seule preuve de panne dont le lecteur dispose.
 */
export function isMediaProcessingFailed(payload: unknown): payload is MediaProcessingFailedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.conversationId === 'string' && typeof p.messageId === 'string'
    && typeof p.attachmentId === 'string' && p.attachmentId !== '';
}

/**
 * LA PANNE EST ÉCRITE SUR LA PIÈCE, jamais sur la conversation : le lecteur
 * plein écran ne connaît que sa pièce, et une pièce vit sous un identifiant
 * stable d'un écran à l'autre.
 *
 * Aucun refus par appartenance ici — à la différence d'`applyTranscriptionReady`,
 * qui GREFFE du contenu sur une page de cache et doit donc refuser une pièce
 * inconnue. Celui-ci n'écrit RIEN que le lecteur n'ait demandé : une entrée pour
 * une pièce qu'aucun lecteur n'attend n'est lue par personne, et s'effacerait au
 * prochain geste. Fail-OPEN sur une LIVRAISON de signal, comme le reste du
 * dépôt arbitre (une bannière appauvrie se rattrape, un secret poussé non).
 */
export function applyTranscriptionFailed(store: MediaProcessingFailuresApi, data: MediaProcessingFailedEventData): void {
  store.getState().failed(data.attachmentId, TRANSCRIPTION_STAGE);
}

export function applyAudioTranslationFailed(store: MediaProcessingFailuresApi, data: MediaProcessingFailedEventData): void {
  store.getState().failed(data.attachmentId, TRANSLATIONS_STAGE);
}
