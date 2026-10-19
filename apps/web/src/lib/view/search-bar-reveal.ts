import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * LA BARRE DE RECHERCHE SUIT LE SENS DU DÉFILEMENT (#11036). Défiler vers le
 * BAS l'escamote ; un défilement vers le HAUT, même partiel, la ramène. Près de
 * la tête de liste, elle est toujours là. Miroir iOS :
 * `ConversationSearchBarScrollLaw` (`ConversationSearchCommunitiesBand.swift`).
 *
 * `depth` = distance défilée depuis la tête (`scrollTop`). `anchor` retient le
 * point extrême atteint dans le sens courant : le point le plus BAS tant que la
 * barre est escamotée, le plus HAUT tant qu'elle est là. Une bascule exige un
 * déplacement d'au moins `SEARCH_BAR_HYSTERESIS` depuis cet extrême, ce qui
 * absorbe le frémissement du doigt et le rebond.
 */
export const SEARCH_BAR_TOP_ZONE = 30;
export const SEARCH_BAR_HYSTERESIS = 12;

export type SearchBarScrollState = { readonly hidden: boolean; readonly anchor: number };

export function initialSearchBarScroll(): SearchBarScrollState {
  return { hidden: false, anchor: 0 };
}

export function nextSearchBarScroll(state: SearchBarScrollState, depth: number): SearchBarScrollState {
  if (depth <= SEARCH_BAR_TOP_ZONE) return { hidden: false, anchor: depth };
  if (state.hidden) {
    return state.anchor - depth >= SEARCH_BAR_HYSTERESIS
      ? { hidden: false, anchor: depth }
      : { hidden: true, anchor: Math.max(state.anchor, depth) };
  }
  return depth - state.anchor >= SEARCH_BAR_HYSTERESIS
    ? { hidden: true, anchor: depth }
    : { hidden: false, anchor: Math.min(state.anchor, depth) };
}

/** Une recherche en cours (focus ou texte) tient la barre à l'écran. */
export function searchBarHidden({
  scrolledAway,
  focused,
  query,
}: {
  readonly scrolledAway: boolean;
  readonly focused: boolean;
  readonly query: string;
}): boolean {
  return scrolledAway && !focused && query === '';
}

/**
 * La bande des communautés vit au focus, champ VIDE : dès le premier caractère
 * elle se replie pour laisser voir les résultats, et revient quand le champ est
 * vidé. Miroir `ConversationSearchCommunitiesBandLaw.drawsBand` (iOS).
 */
export function searchCommunitiesShown({ focused, query }: { readonly focused: boolean; readonly query: string }): boolean {
  return focused && query === '';
}

/**
 * Écoute passive du scrollport : l'état de la loi vit dans une référence, et
 * le composant ne se re-rend qu'à la BASCULE — jamais à chaque événement.
 */
export function useSearchBarScrolledAway(frame: RefObject<HTMLElement | null>): boolean {
  const [scrolledAway, setScrolledAway] = useState(false);
  const law = useRef<SearchBarScrollState>(initialSearchBarScroll());

  useEffect(() => {
    const node = frame.current;
    if (node === null) return undefined;
    const onScroll = () => {
      const next = nextSearchBarScroll(law.current, node.scrollTop);
      const toggled = next.hidden !== law.current.hidden;
      law.current = next;
      if (toggled) setScrolledAway(next.hidden);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [frame]);

  return scrolledAway;
}
