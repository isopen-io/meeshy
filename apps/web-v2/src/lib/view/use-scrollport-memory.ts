import { useLayoutEffect, type RefObject } from 'react';

/**
 * LA MÉMOIRE DE SCROLLPORT (#5893, § 0 de la spécification) — le routeur
 * (`lib/router.tsx`) ne restaure que `window.scrollY`, qui vaut TOUJOURS 0
 * dans cette application : chaque écran confine son défilement dans SON
 * PROPRE scrollport (`<ul id="contenu">`, `overflow-y-auto`), jamais dans le
 * document. Un retour vers un écran REMONTE de zéro : `Screen key={routeKey}`
 * change à chaque navigation de route (`router.tsx`), donc l'écran quitté est
 * DÉMONTÉ, pas seulement masqué — son `useRef` repart d'un DOM neuf.
 *
 * `useScrollportMemory` mémorise et restaure la position d'UN scrollport,
 * keyée par l'ADRESSE COMPLÈTE (chemin + recherche) au moment du MONTAGE —
 * la même clé que le routeur emploie déjà pour `window.scrollY`
 * (`positions.current.set(currentHref, window.scrollY)`) — de sorte qu'un
 * retour littéral à la MÊME adresse (bouton flottant → `/feed` → retour)
 * retrouve la MÊME position.
 *
 * MODULE-LEVEL, comme `positions` dans `router.tsx` : la carte survit au
 * démontage de l'écran (c'est tout son intérêt) mais pas à un rechargement
 * complet du document. GÉNÉRIQUE PAR CONSTRUCTION — `lib/view/`, jamais
 * `lib/lens/` ni `lib/feed/` : tout écran à scrollport propre (la Lentille
 * elle-même y a le même défaut, non corrigé ici pour rester dans le
 * périmètre de ce lot) peut le réutiliser tel quel.
 */
const positions = new Map<string, number>();

/** La clé de mémoire — LUE au moment de l'appel, jamais mise en cache : un
 * paramètre de recherche qui change en place (`useSearch`) doit obtenir sa
 * PROPRE position, pas celle de l'adresse précédente. */
export function scrollportMemoryKeyOf(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname + window.location.search;
}

export function useScrollportMemory(ref: RefObject<HTMLElement | null>): void {
  const key = scrollportMemoryKeyOf();

  // `useLayoutEffect` — la position est reposée AVANT que le navigateur ne
  // peigne le scrollport neuf : un `useEffect` laisserait une image en haut
  // de liste avant de sauter à la position mémorisée (dimension 4, « une
  // image perdue pendant le geste »).
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return undefined;

    const saved = positions.get(key);
    if (saved !== undefined) node.scrollTop = saved;

    const onScroll = () => positions.set(key, node.scrollTop);
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      positions.set(key, node.scrollTop);
      node.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
