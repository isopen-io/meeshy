import { useSyncExternalStore } from 'react';

/**
 * COMBIEN DE COUCHES MODALES RECOUVRENT L'ÉCRAN (W14, #7372).
 *
 * Le suivi de lecture (`use-read-tracking.ts`) marquait lu pendant qu'une
 * visionneuse plein écran ou une feuille recouvrait le fil : la sentinelle de
 * bas de fil reste « intersectante » sous la couche — l'`IntersectionObserver`
 * ne connaît que la géométrie du défilement, pas ce qui est posé PAR-DESSUS.
 * Un utilisateur qui agrandit une photo n'a rien lu de ce qu'elle cache.
 *
 * ## POURQUOI UN REGISTRE, ET PAS UN BOOLÉEN PASSÉ PAR L'ÉCRAN
 *
 * Un `isModalOpen` calculé dans `routes/thread.tsx` ne peut voir QUE les
 * couches dont l'écran tient l'état — les deux feuilles de `useMessageMenu`.
 * La VISIONNEUSE, elle, est ouverte par `components/attachment-blocks.tsx`
 * (`openIndex`, état LOCAL d'une bulle), et l'écran ne la connaît pas : le
 * défaut que nomme le titre de #7372 survivrait au correctif. Chaque couche
 * future rouvrirait le même trou, en silence.
 *
 * Le registre est donc alimenté à l'UNIQUE endroit que toute couche modale
 * traverse déjà — `useBackDismiss` (`use-back-dismiss.ts`), dont le
 * doc-comment porte exactement cette vocation : « TOUTE couche modale future
 * (feuille, menu, visionneuse de média) partage la MÊME loi plutôt que d'en
 * réécrire une jumelle ». Feuilles, menu du message, menus flottants, actions
 * de rangée et visionneuse y passent ; ce qui s'y branchera demain est compté
 * sans qu'une ligne soit ajoutée ici.
 *
 * Un COMPTEUR, pas un drapeau : deux couches peuvent se superposer (une
 * feuille de réactions ouverte au-dessus des détails d'un message), et la
 * fermeture de la première ne doit pas déclarer l'écran découvert.
 */
let openLayers = 0;

const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

/** Déclare une couche modale montée. Rend la fonction qui la retire. */
export function openModalLayer(): () => void {
  openLayers += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openLayers -= 1;
    notify();
  };
}

export function modalLayersOpen(): boolean {
  return openLayers > 0;
}

export function subscribeModalLayers(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * `true` dès qu'une couche modale recouvre l'écran. `useSyncExternalStore`
 * plutôt qu'un état miroir : le compteur vit HORS de React (il est écrit par
 * l'effet de mise en page de `useBackDismiss`, avant la peinture), et un
 * miroir se désynchroniserait le temps d'un rendu — c'est-à-dire le temps
 * qu'il faut à une sentinelle déjà visible pour marquer lu.
 */
export function useModalLayersOpen(): boolean {
  return useSyncExternalStore(subscribeModalLayers, modalLayersOpen, () => false);
}
