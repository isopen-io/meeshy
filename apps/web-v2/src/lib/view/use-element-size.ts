import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `useElementSize` — LA TAILLE RÉELLE (`ResizeObserver`) d'un élément
 * observé, PAR RÉF DE RAPPEL (motif `use-out-of-view.ts` : voir son
 * doc-comment sur pourquoi une réf de rappel plutôt qu'un `RefObject`).
 *
 * Existe parce que la boîte de scène (`feed-scene-surface.tsx`, #6898) doit
 * ajuster son contenu par CALCUL EXACT (`fitScene`, `lib/canvas/fit.ts`),
 * pas par une astuce CSS `aspect-ratio` + flex — MESURÉ comme ambigu :
 * un élément flex sans largeur/hauteur EXPLICITE et sans taille de CONTENU
 * propre (le cas d'une boîte de scène, dont le contenu est lui-même en
 * pourcentage) se résout en 0×0 dans Chromium, faute d'ancre pour dériver
 * l'un des deux axes de `aspect-ratio` (§ 5.7 de la spécification
 * `scenes-fil`, gate rouge avant ce correctif).
 */
export function useElementSize(): readonly [(node: Element | null) => void, { readonly width: number; readonly height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const nodeRef = useRef<Element | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const observe = useCallback((node: Element | null) => {
    if (observerRef.current !== null && nodeRef.current !== null) observerRef.current.unobserve(nodeRef.current);
    nodeRef.current = node;
    if (node === null) return;
    if (observerRef.current === null) {
      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        const { width, height } = entry.contentRect;
        setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
      });
    }
    const rect = node.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    observerRef.current.observe(node);
  }, []);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  return [observe, size] as const;
}
