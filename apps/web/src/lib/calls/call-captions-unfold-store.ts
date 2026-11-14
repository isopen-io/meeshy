import { useCallback } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { CaptionsMode } from './call-captions';
import { callStore } from './call-store';

/**
 * **LES PHRASES RÉVÉLÉES D'UN APPEL** (L3.9, `docs/product/appels-vue-finale.md`) — miroir d'iOS
 * `CallCaptionsReveals` (un ensemble PAR SURFACE, tenu par `CallView`) et d'Android
 * (`CallCaptionsState.revealed`, `CallJournalView.revealed`) : l'état « cette phrase montre son
 * autre langue » est tenu PAR IDENTIFIANT DE PHRASE, hors du composant qui la dessine. La bande se
 * démonte quand `(…)` la range ou que le Journal la relève, le journal quand on le ferme : chacun
 * revient tel qu'on l'a laissé. Toucher une phrase dans une surface ne la révèle pas dans l'autre
 * (#17678).
 *
 * Borné (`CAPTION_REVEAL_LIMIT` par surface, les plus anciennes s'oublient) et propre à UN appel :
 * couper les sous-titres replie la bande (iOS et Android), la fin de l'appel libère tout.
 */
export const CAPTION_REVEAL_LIMIT = 64;

export type CaptionSurface = 'band' | 'journal';

/** Le jeu après un toucher sur `id` : il se replie s'il était révélé, sinon il passe en dernier ; la borne oublie les plus anciens. */
export function toggledReveals(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id].slice(-CAPTION_REVEAL_LIMIT);
}

type Surfaces<T> = Readonly<Record<CaptionSurface, T>>;

type RevealState = { readonly callId: string; readonly ids: Surfaces<readonly string[]>; readonly sets: Surfaces<ReadonlySet<string>> };

/** Ce que le magasin lit de l'appel en cours : lequel, et si ses sous-titres sont coupés. */
export type RevealedCall = { readonly callId: string | null; readonly captionsMode: CaptionsMode } | null;

const NONE: ReadonlySet<string> = new Set();

const setOf = (ids: readonly string[]): ReadonlySet<string> => (ids.length === 0 ? NONE : new Set(ids));

const stateOf = (callId: string, ids: Surfaces<readonly string[]>): RevealState => ({ callId, ids, sets: { band: setOf(ids.band), journal: setOf(ids.journal) } });

const NOTHING: Surfaces<readonly string[]> = { band: [], journal: [] };

const EMPTY = stateOf('', NOTHING);

/** Ce que l'appel laisse des phrases révélées : rien quand il finit ou qu'un autre commence, une bande repliée quand ses sous-titres sont coupés. */
function revealsAfter(state: RevealState, call: RevealedCall): RevealState {
  if (state.ids.band.length === 0 && state.ids.journal.length === 0) return state;
  if (call === null || (call.callId ?? '') !== state.callId) return EMPTY;
  return call.captionsMode === 'off' && state.ids.band.length > 0 ? stateOf(state.callId, { ...state.ids, band: [] }) : state;
}

export function createCaptionRevealStore() {
  const store = createStore<RevealState>(() => EMPTY);
  return {
    store,
    revealed: (callId: string, surface: CaptionSurface): ReadonlySet<string> => {
      const state = store.getState();
      return state.callId === callId ? state.sets[surface] : NONE;
    },
    toggle: (callId: string, surface: CaptionSurface, id: string): void => {
      const state = store.getState();
      const ids = state.callId === callId ? state.ids : NOTHING;
      store.setState(stateOf(callId, { ...ids, [surface]: toggledReveals(ids[surface], id) }), true);
    },
    follow: (call: RevealedCall): void => {
      const state = store.getState();
      const next = revealsAfter(state, call);
      if (next !== state) store.setState(next, true);
    },
  };
}

const reveals = createCaptionRevealStore();

callStore.subscribe((state) => reveals.follow(state.call));

/** Les phrases révélées de cette surface de cet appel, et le toucher qui en bascule une ; `toggle` ne change qu'avec l'appel ou la surface. */
export function useCaptionReveals(callId: string, surface: CaptionSurface): { readonly revealed: ReadonlySet<string>; readonly toggle: (id: string) => void } {
  const revealed = useStore(reveals.store, () => reveals.revealed(callId, surface));
  const toggle = useCallback((id: string) => reveals.toggle(callId, surface, id), [callId, surface]);
  return { revealed, toggle };
}
