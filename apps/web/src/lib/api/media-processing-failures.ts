import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * LES PANNES DE TRAITEMENT D'UNE PIÈCE JOINTE, DITES PAR LE TEMPS RÉEL (#18537)
 * — `audio:transcription-failed` et `audio:translation-failed`.
 *
 * Le lecteur audio plein écran DESSINE déjà l'attente (« Transcription… »,
 * « Traduction… »), son plafond de SILENCE (`ON_DEMAND_STALL_MS`, 90 s) et la
 * phrase du refus (`AudioOnDemandNotice`). Le `notice` n'était servi que par un
 * refus de la REQUÊTE : un travail MIS EN FILE qui échouait ensuite n'avait
 * aucun chemin, alors que la passerelle le DIT en une seconde sur la room de la
 * conversation. Le lecteur attendait les 90 s, puis rendait la main sans un mot.
 *
 * `zustand/vanilla`, motif `typing-store.ts` : ce fichier ne sait rien de la vue
 * ni du socket — `realtime-media-processing-failed.ts` y écrit, et
 * `use-audio-on-demand.ts` s'y abonne par `zustand/react`. Réducteur PUR.
 *
 * **Le plafond de silence RESTE** : il garde le cas où RIEN n'arrive (socket
 * coupée, traducteur muet), qui n'est pas celui-ci. Les deux sont disjoints —
 * l'un lève l'attente sur une PREUVE de panne, l'autre sur son ABSENCE.
 */

/** La transcription de la pièce (`audio:transcription-failed`). */
export const TRANSCRIPTION_STAGE = 'transcription';

/**
 * LES VERSIONS TRADUITES DE LA PIÈCE — au PLURIEL, et c'est le contrat qui
 * l'impose : `audio:translation-failed` ne NOMME aucune langue cible, parce que
 * son producteur n'en reçoit pas (`MessageTranslationService` §
 * `audioTranslationError` : la tâche audio traite toutes les cibles d'un bloc,
 * et l'échec porte sur la PIÈCE). Nommer une langue ici serait la DEVINER.
 */
export const TRANSLATIONS_STAGE = 'translations';

export type MediaProcessingStage = typeof TRANSCRIPTION_STAGE | typeof TRANSLATIONS_STAGE;

export type MediaProcessingFailuresState = {
  /** `attachmentId → étages dont la panne est PROUVÉE par le temps réel`. */
  readonly byAttachment: Readonly<Record<string, readonly MediaProcessingStage[]>>;
  /** La passerelle a dit que cet étage a échoué. Idempotent — le traducteur peut rejouer une trame. */
  failed(attachmentId: string, stage: MediaProcessingStage): void;
  /**
   * Une demande NEUVE efface le verdict de la précédente — sans quoi le second
   * essai hériterait de la panne du premier et n'afficherait jamais son attente.
   */
  cleared(attachmentId: string, stage: MediaProcessingStage): void;
};

export type MediaProcessingFailuresApi = StoreApi<MediaProcessingFailuresState>;

const NO_STAGES: readonly MediaProcessingStage[] = [];

export function createMediaProcessingFailuresStore(): MediaProcessingFailuresApi {
  return createStore<MediaProcessingFailuresState>((set) => ({
    byAttachment: {},
    failed: (attachmentId, stage) =>
      set((state) => {
        if (attachmentId === '') return state;
        const current = state.byAttachment[attachmentId] ?? NO_STAGES;
        if (current.includes(stage)) return state;
        return { byAttachment: { ...state.byAttachment, [attachmentId]: [...current, stage] } };
      }),
    cleared: (attachmentId, stage) =>
      set((state) => {
        const current = state.byAttachment[attachmentId];
        if (current === undefined || !current.includes(stage)) return state;
        const kept = current.filter((s) => s !== stage);
        const next = { ...state.byAttachment };
        if (kept.length === 0) delete next[attachmentId];
        else next[attachmentId] = kept;
        return { byAttachment: next };
      }),
  }));
}

export const mediaProcessingFailures: MediaProcessingFailuresApi = createMediaProcessingFailuresStore();

/**
 * Les étages en panne d'UNE pièce. Rend TOUJOURS la même référence à vide : un
 * abonné `useStore` qui recevrait un tableau neuf à chaque rendu rendrait sans
 * fin (leçon du cycle 123 sur `preferredLanguages`).
 */
export function failedStagesOf(
  state: Pick<MediaProcessingFailuresState, 'byAttachment'>,
  attachmentId: string,
): readonly MediaProcessingStage[] {
  return state.byAttachment[attachmentId] ?? NO_STAGES;
}
