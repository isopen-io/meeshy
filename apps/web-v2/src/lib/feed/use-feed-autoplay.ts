import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import { electActive, type SceneCandidate } from './autoplay-election';

/**
 * LE MAGASIN D'ÉLECTION DU FIL (#6898, § 5.3) — un `IntersectionObserver`
 * UNIQUE, posé par l'écran hôte (`routes/feed.tsx`, `routes/post.tsx`), élit
 * parmi les scènes enregistrées celle la plus proche du centre du scrollport
 * (miroir `FeedSceneAutoplay.swift:6-39` : une seule surface joue, muette).
 *
 * `zustand/vanilla`, motif `typing-store.ts` : ce fichier ne sait rien de la
 * vue. `useIsActiveScene` distribue un BOOLÉEN par carte — seules les deux
 * cartes dont l'élection bascule se re-rendent (Zero Unnecessary Re-render).
 */
export type FeedAutoplayState = { readonly activeId: string | null };
export type FeedAutoplayStoreApi = StoreApi<FeedAutoplayState>;

export function createFeedAutoplayStore(): FeedAutoplayStoreApi {
  return createStore<FeedAutoplayState>(() => ({ activeId: null }));
}

/** L'INSTANCE UNIQUE de l'application — un magasin partagé par tout écran
 * monté (motif `typingStore`/`outboxStore`). */
export const feedAutoplayStore: FeedAutoplayStoreApi = createFeedAutoplayStore();

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

const centerOf = (rect: { readonly top: number; readonly height: number }): number => rect.top + rect.height / 2;

const VISIBLE_THRESHOLD = 0.5;

/** Le délai sans `scroll` après lequel un navigateur SANS `scrollend`
 * (Safari, dont la WebView iOS de la coque) tient le défilement pour arrêté. */
const SCROLL_SETTLE_MS = 120;

export type UseFeedAutoplayRoot = {
  /** Enregistre (ou désenregistre, `node === null`) la boîte de scène d'une
   * publication. À poser via une réf de RAPPEL STABLE —
   * `useCallback((n) => registerScene(id, n), [registerScene, id])`, motif
   * `use-out-of-view.ts` — jamais un `RefObject` (qui ne voit pas la cible
   * réelle de chaque commit), et JAMAIS une fermeture inline : recréée à
   * chaque rendu, elle désinscrit puis réinscrit la cible à chaque bascule
   * d'élection, dont la notification relance l'élection — une boucle sans fin
   * mesurée pendant #6898 (deux vidéos alternant des centaines de fois par
   * seconde). */
  readonly registerScene: (id: string, node: Element | null) => void;
};

export function useFeedAutoplayRoot(root: RefObject<Element | null>, store: FeedAutoplayStoreApi = feedAutoplayStore): UseFeedAutoplayRoot {
  const nodes = useRef(new Map<string, Element>());
  const idOfNode = useRef(new Map<Element, string>());
  const distances = useRef(new Map<string, number>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const recompute = useCallback(() => {
    const candidates: SceneCandidate[] = Array.from(distances.current, ([id, distance]) => ({ id, distance }));
    const activeId = electActive({ candidates, reducedMotion: prefersReducedMotion(), hidden: isPageHidden() });
    if (store.getState().activeId !== activeId) store.setState({ activeId });
  }, [store]);

  // **LA DISTANCE SE REMESURE AU REPOS.** Un `IntersectionObserver` ne
  // notifie qu'au FRANCHISSEMENT d'un seuil : une carte ENTIÈREMENT visible
  // traverse l'écran sans une notification, et la distance relevée à son
  // entrée devient fausse — la vidéo élue était alors celle qui sortait par le
  // haut (revue-correction #6898). Quand le défilement S'ARRÊTE (`scrollend`,
  // un seul événement par geste ; délai relancé à défaut), les cartes visibles
  // sont remesurées — jamais un calcul par trame pendant le geste.
  const remeasure = useCallback(() => {
    const scrollport = root.current;
    const rootRect = scrollport === null ? { top: 0, height: window.innerHeight } : scrollport.getBoundingClientRect();
    for (const id of Array.from(distances.current.keys())) {
      const node = nodes.current.get(id);
      if (node !== undefined) distances.current.set(id, Math.abs(centerOf(node.getBoundingClientRect()) - centerOf(rootRect)));
    }
    recompute();
  }, [root, recompute]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = idOfNode.current.get(entry.target);
          if (id === undefined) continue;
          if (entry.intersectionRatio >= VISIBLE_THRESHOLD) {
            const rootRect = entry.rootBounds ?? { top: 0, height: 0 };
            distances.current.set(id, Math.abs(centerOf(entry.boundingClientRect) - centerOf(rootRect)));
          } else {
            distances.current.delete(id);
          }
        }
        recompute();
      },
      { root: root.current, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observerRef.current = observer;
    for (const node of nodes.current.values()) observer.observe(node);

    const onVisibility = (): void => recompute();
    document.addEventListener('visibilitychange', onVisibility);

    const scrollTarget: EventTarget = root.current ?? window;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const onScrollWithoutScrollEnd = (): void => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        remeasure();
      }, SCROLL_SETTLE_MS);
    };
    const settledEvent = 'onscrollend' in window ? 'scrollend' : 'scroll';
    const onSettled = settledEvent === 'scrollend' ? remeasure : onScrollWithoutScrollEnd;
    scrollTarget.addEventListener(settledEvent, onSettled, { passive: true });

    return () => {
      observer.disconnect();
      observerRef.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      scrollTarget.removeEventListener(settledEvent, onSettled);
      if (settleTimer !== null) clearTimeout(settleTimer);
    };
    // `recompute` et `remeasure` ne dépendent que de `store` et `root`,
    // stables pour la vie du composant — les lister rouvrirait l'observateur
    // à chaque bascule d'élection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const registerScene = useCallback(
    (id: string, node: Element | null) => {
      const previous = nodes.current.get(id);
      if (previous !== undefined) {
        observerRef.current?.unobserve(previous);
        idOfNode.current.delete(previous);
        nodes.current.delete(id);
        distances.current.delete(id);
      }
      if (node === null) {
        recompute();
        return;
      }
      nodes.current.set(id, node);
      idOfNode.current.set(node, id);
      observerRef.current?.observe(node);
    },
    [recompute],
  );

  return { registerScene };
}

/** Un BOOLÉEN par carte (miroir `PostSceneCardContainer`, `isActive` REÇU
 * jamais un état local) — la carte dont l'id n'égale pas `activeId` ne se
 * re-rend jamais quand une AUTRE carte est élue. */
export function useIsActiveScene(id: string, store: FeedAutoplayStoreApi = feedAutoplayStore): boolean {
  return useStore(store, (s) => s.activeId === id);
}
