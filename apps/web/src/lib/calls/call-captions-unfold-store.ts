import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * **LES PHRASES RÉVÉLÉES D'UN APPEL** (L3.9, `docs/product/appels-vue-finale.md`) — miroir d'iOS
 * `revealedCaptions` et du jeu révélé d'Android (`CallCaptionsCapability`) : l'état « cette phrase
 * montre son autre langue » est tenu PAR IDENTIFIANT DE PHRASE, hors du composant qui la dessine.
 * Les sous-titres se démontent quand `(…)` les range ou que le Journal les relève, et reviennent
 * tels qu'on les a laissés. Borné (`CAPTION_REVEAL_LIMIT`, les plus anciennes s'oublient) et propre
 * à un appel : un autre appel repart de rien.
 */
export const CAPTION_REVEAL_LIMIT = 64;

/** Le jeu après un toucher sur `id` : il se replie s'il était révélé, sinon il passe en dernier ; la borne oublie les plus anciens. */
export function toggledReveals(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id].slice(-CAPTION_REVEAL_LIMIT);
}

type RevealState = { readonly callId: string; readonly ids: readonly string[]; readonly set: ReadonlySet<string> };

const NONE: ReadonlySet<string> = new Set();

export function createCaptionRevealStore() {
  const store = createStore<RevealState>(() => ({ callId: '', ids: [], set: NONE }));
  return {
    store,
    revealed: (callId: string): ReadonlySet<string> => {
      const state = store.getState();
      return state.callId === callId ? state.set : NONE;
    },
    toggle: (callId: string, id: string): void => {
      const state = store.getState();
      const ids = toggledReveals(state.callId === callId ? state.ids : [], id);
      store.setState({ callId, ids, set: new Set(ids) });
    },
  };
}

const reveals = createCaptionRevealStore();

/** Les phrases révélées de cet appel, et le toucher qui en bascule une ; l'identité de `toggle` ne change pas d'un rendu à l'autre. */
export function useCaptionReveals(callId: string): { readonly revealed: ReadonlySet<string>; readonly toggle: (id: string) => void } {
  const revealed = useStore(reveals.store, () => reveals.revealed(callId));
  return { revealed, toggle: (id) => reveals.toggle(callId, id) };
}
