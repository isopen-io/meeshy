import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type UseLoadMoreSentinelParams = {
  /** Le scrollport — `null` ⇒ le viewport (motif `useOutOfView`). */
  readonly root: RefObject<Element | null>;
  readonly rootMargin: string;
  /** `false` ⇒ AUCUN observateur n'est posé — la sentinelle d'une liste
   * `exhausted`/`error`/`loading-more` ne doit jamais redéclencher `onReach`. */
  readonly enabled: boolean;
  readonly onReach: () => void;
};

export type LoadMoreSentinel = {
  /** À poser sur la CIBLE observée (`ref={observe}`) — réf de RAPPEL, motif
   * `useOutOfView` : la sentinelle est un `<li>` conditionnel (état `idle`
   * seul) qui QUITTE le DOM dès qu'une page arrive. */
  readonly observe: (node: Element | null) => void;
};

/**
 * `useLoadMoreSentinel` (#6195) — le déclencheur de défilement infini de la
 * Lentille, miroir de `triggerLoadMoreIfNeeded` (iOS,
 * `ConversationListView.swift:1045-1060`) porté au navigateur par un
 * `IntersectionObserver` plutôt qu'un calcul de rang à chaque `onAppear` —
 * même choix que `useOutOfView` (#6103, § « délègue au navigateur »).
 *
 * GÉNÉRIQUE PAR CONSTRUCTION — `lib/view/`, jamais `lib/lens/` : le fil
 * (« messages plus anciens ») réutilisera ce hook tel quel (§8 de la
 * spécification #6195, « la forme retenue est celle que le fil copiera »).
 *
 * `onReach` est lu par une RÉF, jamais posé dans les dépendances de l'effet :
 * une fermeture neuve à chaque rendu de l'hôte (le motif de
 * `list.fetchNextPage()`) ne doit pas recréer l'observateur — seule la CIBLE,
 * la RACINE, la MARGE ou `enabled` le justifient.
 *
 * `enabled` REPASSANT À `true` alors que la cible intersecte ENCORE rejoue
 * `onReach` : l'observateur est RECRÉÉ (il est dans les dépendances), et son
 * callback initial redit l'intersection déjà vraie — le « keep loading »
 * qu'iOS obtient en rappelant `loadMore()` à chaque `onAppear` (celui-ci
 * court-circuitant lui-même sur `hasMore`, `:1047-1055`).
 */
export function useLoadMoreSentinel({ root, rootMargin, enabled, onReach }: UseLoadMoreSentinelParams): LoadMoreSentinel {
  const [target, setTarget] = useState<Element | null>(null);
  const onReachRef = useRef(onReach);
  onReachRef.current = onReach;

  useEffect(() => {
    if (target === null) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        if (enabled && entry.isIntersecting) onReachRef.current();
      },
      { root: root.current, rootMargin, threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [target, root, rootMargin, enabled]);

  const observe = useCallback((node: Element | null) => {
    setTarget(node);
  }, []);

  return { observe };
}
