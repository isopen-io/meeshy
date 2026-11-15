import { createStore, type StoreApi } from 'zustand/vanilla';

import type { CallOutputRouting } from './call-button-glass';
import { browserPreferenceStorage, readDevicePreferences } from './call-devices';
import type { ShellAudioRoute } from './shell-call';

/**
 * **LA SORTIE AUDIO D'UN APPEL** (#8046, D5/D6) — l'identifiant de la sortie
 * choisie, que chaque `<audio>` de pair applique par `setSinkId`
 * (`call-media-elements.tsx`). Un magasin et non une lecture ponctuelle : un
 * pair qui arrive APRÈS le choix doit sortir sur le même casque. Il part de la
 * préférence de l'appareil, relue au premier chargement de la couche d'appel.
 *
 * Dans la coque, la sortie est une ROUTE native (écouteur, haut-parleur,
 * filaire, Bluetooth), que la feuille des appareils et la pilule relisent et
 * posent ici : « Sortie » s'allume d'après elle (P1.6, #17843).
 */

export type CallOutputState = { readonly sinkId: string | null; readonly route: ShellAudioRoute | null };

export type CallOutputStore = StoreApi<CallOutputState>;

export function createCallOutputStore(initial: string | null = null): CallOutputStore {
  return createStore<CallOutputState>(() => ({ sinkId: initial, route: null }));
}

export const callOutputStore: CallOutputStore = createCallOutputStore(readDevicePreferences(browserPreferenceStorage()).speaker);

/**
 * Où part le son (P1.6) : la route que la coque rapporte décide — filaire et Bluetooth sont des
 * appareils externes, le haut-parleur suit la loi du haut-parleur (`CallOutputButtonRule.kind(activeRoute:)`
 * d'Android). Hors coque, le navigateur n'a pas de haut-parleur : une sortie CHOISIE et branchée est un
 * appareil externe, le défaut du système ne l'est pas.
 */
export function callOutputRouting({ route, sinkChosen }: { readonly route: ShellAudioRoute | null; readonly sinkChosen: boolean }): CallOutputRouting {
  if (route !== null) return { isSpeaker: route === 'speaker', routesExternally: route === 'wired' || route === 'bluetooth' };
  return { isSpeaker: false, routesExternally: sinkChosen };
}
