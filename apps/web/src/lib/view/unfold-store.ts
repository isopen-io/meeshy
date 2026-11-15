import { createContext, useContext, useRef, useSyncExternalStore } from 'react';

/**
 * LES MESSAGES LONGS DÉPLIÉS D'UN FIL (#8147, refondu par #16464 — jumelle
 * iOS #16463, `LongMessageExpansionLaw`).
 *
 * Directive porteur 2026-11-06 : un toucher sur « Lire la suite » affiche le
 * message ENTIER, rendu comme un message ordinaire du mode courant — aucune
 * mise en avant —, et il le reste : rien ne le replie, plusieurs messages
 * peuvent l'être ensemble. Seule la réouverture de la conversation les rend
 * repliés.
 *
 * L'état vit donc avec la VUE du fil, jamais dans un magasin du module : le
 * fil (`ThreadModes`, le nœud des deux hôtes) crée une instance par
 * conversation ouverte et la pose dans `UnfoldStoreContext`. Hors de ce contexte (un hôte qui ne la
 * fournit pas), chaque texte tient la sienne, qui meurt avec lui.
 *
 * Le magasin tient aussi le HAUT du message qu'on vient de déplier : le
 * virtualiseur compense d'ordinaire une rangée qui grandit à cheval sur le
 * haut de l'écran (`thread-resize-compensation.ts`), ce qui ferait remonter
 * son extrait. `releasesTopHold` dit, une fois, que cette mesure-là est un
 * dépliage — la suite se déroule alors sous l'extrait, sans saut.
 *
 * Les clés sont celles des rangées du fil (`threadRowKeyOf`) : celles que le
 * virtualiseur remet à `shouldAdjustScrollPositionOnItemSizeChange`.
 */
type Listener = () => void;

export type UnfoldStore = {
  readonly isUnfolded: (key: string) => boolean;
  readonly unfold: (key: string) => void;
  readonly subscribe: (listener: Listener) => () => void;
  readonly releasesTopHold: (key: string) => boolean;
};

export function createUnfoldStore(): UnfoldStore {
  const listeners = new Set<Listener>();
  const unfolded = new Set<string>();
  const heldTops = new Set<string>();
  return {
    isUnfolded: (key) => unfolded.has(key),
    unfold: (key) => {
      if (unfolded.has(key)) return;
      unfolded.add(key);
      heldTops.add(key);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    releasesTopHold: (key) => heldTops.delete(key),
  };
}

export const UnfoldStoreContext = createContext<UnfoldStore | null>(null);

/** Ne réveille QUE la rangée dont le verdict bascule — jamais tout le fil. */
export function useUnfoldedRow(key: string): { readonly unfolded: boolean; readonly unfold: () => void } {
  const shared = useContext(UnfoldStoreContext);
  const own = useRef<UnfoldStore | null>(null);
  const store = shared ?? (own.current ??= createUnfoldStore());
  const unfolded = useSyncExternalStore(
    store.subscribe,
    () => store.isUnfolded(key),
    () => false,
  );
  return { unfolded, unfold: () => store.unfold(key) };
}
