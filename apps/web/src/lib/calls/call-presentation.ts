import type { ActiveCall } from './call-store';

/**
 * **L'APPEL PAR-DESSUS TOUT PLEIN ÉCRAN** (#8727, jumelle de #8725 —
 * `CallWindowPresenter.swift`, `CallPlaybackInterruptionBinding.swift`).
 *
 * iOS ratait l'appel sous un plein écran parce qu'UIKit ne présente qu'un
 * modal par présentateur. Le web a ses propres « présentateurs » :
 *
 * - l'EMPILEMENT : la visionneuse de médias se pose à `z-index: 1000`, au-dessus
 *   de l'écran d'appel (200) — la couche d'appel se pose donc au-dessus de tout
 *   ce qui vit dans la page (`CALL_LAYER_Z`) ;
 * - la COUCHE SUPÉRIEURE du navigateur : une feuille ouverte par `showModal()`
 *   ou un élément en plein écran (`requestFullscreen`) passent au-dessus de
 *   tout z-index, et une modale rend INERTE le reste du document. La couche
 *   d'appel, un `<dialog>`, se rouvre alors en modale (`presentationModeFor`)
 *   — la dernière modale ouverte est au-dessus et seule vivante — et le plein
 *   écran étranger se quitte. Réduire l'appel la rend à la page : la feuille
 *   d'en dessous redevient vivante, intacte ;
 * - la LECTURE : ce qui joue hors de la couche d'appel se met en pause à
 *   l'arrivée de l'appel (`interruptPlayback`) ; la story gèle sa minuterie
 *   tant que l'appel vit (`useCallFreezesStory`).
 */

/** Au-dessus de la visionneuse de médias (`media-viewer.css`, 1000) et de la bannière in-app (1050). */
export const CALL_LAYER_Z = 1100;

/** L'écran d'appel couvre l'écran : à la sonnerie, à la fin, et quand il n'est pas réduit. */
export function callCoversScreen(call: Pick<ActiveCall, 'phase' | 'display'> | null): boolean {
  if (call === null) return false;
  return call.phase.kind === 'incoming' || call.phase.kind === 'ended' || call.display === 'full';
}

export type CallPresentationMode = 'modal' | 'inline';

export function presentationModeFor({ covers, foreignModalOpen }: { readonly covers: boolean; readonly foreignModalOpen: boolean }): CallPresentationMode {
  return covers && foreignModalOpen ? 'modal' : 'inline';
}

type Playable = { readonly paused: boolean; readonly pause: () => void };

/** Met en pause ce qui joue hors de la couche d'appel ; rend le nombre d'éléments interrompus. */
export function interruptPlayback<T extends Playable>(elements: Iterable<T>, isCallMedia: (element: T) => boolean): number {
  return [...elements].filter((element) => !element.paused && !isCallMedia(element)).map((element) => element.pause()).length;
}
