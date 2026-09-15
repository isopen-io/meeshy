import { createStore } from 'zustand/vanilla';

/**
 * **« LES STORIES QUE JE VIENS DE VOIR », DE LA SESSION** (#5817,
 * revue-correction) — motif `reaction-store.ts`, et pour une raison de MÊME
 * nature : entre le moment où le lecteur ouvre une story et celui où la
 * passerelle la ressert avec `isViewedByMe: true`, il y a un aller-retour
 * réseau ET une invalidation de cache. Sans ce magasin, l'anneau de la tuile
 * reste ALLUMÉ pendant tout ce temps — puis s'éteint « tout seul », plus tard,
 * sans lien visible avec le geste. Or « chaque action de l'utilisateur reçoit
 * un retour instantané » n'est pas une préférence (§ Optimistic Updates du
 * CLAUDE.md racine) : REGARDER une story EST l'action, et l'anneau qui
 * s'éteint EST son retour.
 *
 * Ce magasin ne REMPLACE pas `isViewedByMe` : il le PRÉCÈDE. `groupStoriesByAuthor`
 * projette `isViewedByMe` quand la passerelle l'a servi, et ne retombe sur ces
 * identifiants-ci que pour une story dont la réponse n'est pas encore arrivée
 * (`lib/view/story-tray.ts`). Une seule vérité par story, jamais deux
 * verdicts à concilier à l'affichage.
 *
 * Portée : la SESSION courante, jamais le stockage local — la passerelle est
 * la mémoire durable de « vu », ce magasin n'en est que l'avance.
 */
export type StoryViewedStoreState = {
  readonly ids: ReadonlySet<string>;
  readonly markViewed: (postId: string) => void;
};

const EMPTY: ReadonlySet<string> = new Set<string>();

export const storyViewedStore = createStore<StoryViewedStoreState>((set) => ({
  ids: EMPTY,
  markViewed: (postId) =>
    set((state) => (state.ids.has(postId) ? state : { ids: new Set([...state.ids, postId]) })),
}));

/** L'accesseur PUR, hors composant — un site qui écrirait
 * `storyViewedStore.getState().ids` à la main serait la même ligne, dix fois. */
export function viewedStoryIds(): ReadonlySet<string> {
  return storyViewedStore.getState().ids;
}
