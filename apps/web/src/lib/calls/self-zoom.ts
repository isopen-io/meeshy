import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import type { Facing } from './call-media';

/**
 * **LE ZOOM NUMÉRIQUE DE MON APERÇU** (#8441) — quand ma caméra n'a pas de
 * zoom, pincer ou toucher le cran agrandit mon image À L'ÉCRAN seulement
 * (`LOCAL_ZOOM_RANGE`) : rien ne change dans ce qui part. Il tient pour
 * l'appel et la caméra en cours ; se retourner, ou l'appel suivant, repart de
 * 1×.
 */

type SelfZoomState = { readonly callId: string | null; readonly facing: Facing; readonly value: number };

export const selfZoomStore = createStore<SelfZoomState>(() => ({ callId: null, facing: 'user', value: 1 }));

export const localZoomFor = (state: SelfZoomState, callId: string, facing: Facing): number => (state.callId === callId && state.facing === facing ? state.value : 1);

export const setLocalZoom = (callId: string, facing: Facing, value: number): void => selfZoomStore.setState({ callId, facing, value });

/** Le zoom d'aperçu remis aux chunks du zoom, qui n'importent rien de l'écran d'appel. */
export type LocalZoom = { readonly value: number; readonly set: (value: number) => void };

export function useLocalZoom(callId: string | null, facing: Facing): LocalZoom {
  const value = useStore(selfZoomStore, (state) => localZoomFor(state, callId ?? '', facing));
  return { value, set: (next) => setLocalZoom(callId ?? '', facing, next) };
}
