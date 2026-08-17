'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Sentinelle de pagination de la liste de conversations — EXTRACTION, jamais
 * un second mécanisme (REV-4/B2).
 *
 * L'`IntersectionObserver` du scroll infini vivait en effet inline dans
 * `ConversationList.tsx`, et observait un `<div>` rendu par `renderContent`.
 * Drapeau Lentille ON, `renderContent` n'est plus rendu : l'observateur
 * restait armé sur une cible qui n'existait plus — la pagination automatique
 * (et le bouton « Charger plus ») disparaissaient. Le remède n'est PAS
 * d'écrire une seconde sentinelle dans la peau Lentille : c'est de sortir
 * CELLE-CI de `renderContent` pour qu'elle serve les deux chemins.
 *
 * REF PAR CALLBACK, pas `useRef` (leçon REV-4/B1 — l'ordre des effets React).
 * L'ancienne version lisait `loadMoreTriggerRef.current` dans un effet dont
 * les dépendances ne mentionnaient pas le nœud : si la cible apparaissait
 * APRÈS le premier effet — exactement ce que fait le point de montage
 * Lentille, chargé en `next/dynamic` donc monté un tick plus tard —
 * l'observateur n'observait jamais rien, en silence. Une ref par callback
 * publie le nœud dans l'état : l'effet se ré-exécute quand la cible
 * apparaît, disparaît, ou change.
 *
 * Les cotes (`threshold`, `rootMargin`) sont celles d'avant l'extraction, au
 * chiffre près — ce hook ne change AUCUN comportement observable, il change
 * seulement QUI peut porter la cible.
 */
export interface UseLoadMoreSentinelOptions {
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore?: () => void;
}

const SENTINEL_THRESHOLD = 0.1;
const SENTINEL_ROOT_MARGIN = '50px';

export function useLoadMoreSentinel({
  hasMore,
  isLoadingMore,
  onLoadMore,
}: UseLoadMoreSentinelOptions): (element: HTMLDivElement | null) => void {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  const sentinelRef = useCallback((element: HTMLDivElement | null) => {
    setSentinel(element);
  }, []);

  useEffect(() => {
    if (!sentinel) return;
    if (!onLoadMore || !hasMore || isLoadingMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: SENTINEL_THRESHOLD, rootMargin: SENTINEL_ROOT_MARGIN }
    );

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
    };
  }, [sentinel, onLoadMore, hasMore, isLoadingMore]);

  return sentinelRef;
}
