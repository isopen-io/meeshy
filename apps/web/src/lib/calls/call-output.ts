import { createStore, type StoreApi } from 'zustand/vanilla';

import { browserPreferenceStorage, readDevicePreferences } from './call-devices';

/**
 * **LA SORTIE AUDIO D'UN APPEL** (#8046, D5/D6) — l'identifiant de la sortie
 * choisie, que chaque `<audio>` de pair applique par `setSinkId`
 * (`call-media-elements.tsx`). Un magasin et non une lecture ponctuelle : un
 * pair qui arrive APRÈS le choix doit sortir sur le même casque. Il part de la
 * préférence de l'appareil, relue au premier chargement de la couche d'appel.
 */

export type CallOutputState = { readonly sinkId: string | null };

export type CallOutputStore = StoreApi<CallOutputState>;

export function createCallOutputStore(initial: string | null = null): CallOutputStore {
  return createStore<CallOutputState>(() => ({ sinkId: initial }));
}

export const callOutputStore: CallOutputStore = createCallOutputStore(readDevicePreferences(browserPreferenceStorage()).speaker);
