import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import { callActions } from './call-actions';
import type { Facing } from './call-media';
import { browserColorSupport } from './video-effects';

/**
 * **LE ZOOM NUMÉRIQUE DE MA CAMÉRA** (#8441) — quand ma caméra n'a pas de
 * zoom, pincer ou toucher le cran RECADRE l'image ENVOYÉE (`LOCAL_ZOOM_RANGE`) :
 * le traitement des images (`video-effects-frames.ts`) en garde le centre,
 * et l'autre voit ce que je vois. Là où l'image envoyée ne peut pas être
 * recadrée (aucun traitement possible), le zoom n'est pas offert — jamais un
 * zoom de mon seul aperçu.
 *
 * Il tient pour l'appel et la caméra en cours ; se retourner, ou l'appel
 * suivant, repart de 1×. Le moteur lit `sentZoom` ; chaque réglage lui demande
 * de rafraîchir la piste envoyée.
 */

type SelfZoomState = { readonly callId: string | null; readonly facing: Facing; readonly value: number };

export const selfZoomStore = createStore<SelfZoomState>(() => ({ callId: null, facing: 'user', value: 1 }));

export const localZoomFor = (state: SelfZoomState, callId: string, facing: Facing): number => (state.callId === callId && state.facing === facing ? state.value : 1);

export const setLocalZoom = (callId: string, facing: Facing, value: number): void => selfZoomStore.setState({ callId, facing, value });

/** Le zoom qui s'applique à la caméra que le moteur envoie. */
export const sentZoom = (state: SelfZoomState, call: { readonly callId: string | null; readonly facing: Facing } | null): number => (call === null ? 1 : localZoomFor(state, call.callId ?? '', call.facing));

/** Le zoom numérique remis aux chunks du zoom, qui n'importent rien de l'écran d'appel — `sends` : l'image envoyée peut être recadrée. */
export type LocalZoom = { readonly value: number; readonly set: (value: number) => void; readonly sends?: boolean };

export function useLocalZoom(callId: string | null, facing: Facing): LocalZoom {
  const value = useStore(selfZoomStore, (state) => localZoomFor(state, callId ?? '', facing));
  return {
    value,
    sends: browserColorSupport(),
    set: (next) => {
      setLocalZoom(callId ?? '', facing, next);
      callActions.refreshEffects();
    },
  };
}
