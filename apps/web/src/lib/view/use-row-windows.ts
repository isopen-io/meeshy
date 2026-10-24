import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { rowsInView, settleRange, type RowRange } from './row-window';

/**
 * LES FENÊTRES DE RANGÉES D'UN DÉFILEUR (#11228) — une par BLOC (une section
 * de la liste), sous UN seul écouteur de défilement et UNE seule passe par
 * image.
 *
 * Un écouteur par section aurait lu la géométrie section après section, et le
 * rendu déclenché par la première aurait forcé une mise en page avant la
 * lecture de la suivante. Ici, la passe lit TOUTES les têtes de section, puis
 * pose UN état — et seulement si une fenêtre a changé (`settleRange` rend la
 * même référence tant que le besoin y tient).
 *
 * La tête d'un bloc est la cale d'ancrage que `rowSlices` ouvre toujours :
 * l'appelant la marque de `ROW_ANCHOR_ATTRIBUTE`, l'identifiant du bloc pour valeur. Un bloc dont l'ancre n'est pas encore
 * montée reçoit une fenêtre d'ENTRÉE (le haut de la liste, une hauteur
 * d'écran), corrigée par la mesure avant la première peinture.
 *
 * La passe court aussi après CHAQUE rendu : une section qui se déplie, un rail
 * qui change de hauteur ou une page qui arrive déplacent les sections sans
 * aucun défilement. Elle ne pose un état que si une fenêtre a changé — la
 * boucle se referme d'elle-même.
 */

export type RowBlock = { readonly id: string; readonly count: number };

/** L'attribut de la cale de tête d'un bloc — sa valeur est l'identifiant du bloc. */
export const ROW_ANCHOR_ATTRIBUTE = 'data-row-anchor';

const NO_RANGES: ReadonlyMap<string, RowRange> = new Map();

const screenHeight = (): number => (typeof window === 'undefined' ? 0 : window.innerHeight);

export function useRowWindows(input: {
  readonly frame: RefObject<HTMLElement | null>;
  readonly blocks: readonly RowBlock[];
  readonly rowHeight: number;
  readonly marginPx: number;
  readonly extraRows: number;
}): (block: RowBlock) => RowRange {
  const { frame, blocks, rowHeight, marginPx, extraRows } = input;
  const [ranges, setRanges] = useState(NO_RANGES);
  const measured = useRef(ranges);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const entryRange = (count: number): RowRange => ({ start: 0, end: Math.min(count, Math.ceil(screenHeight() / rowHeight) + extraRows) });
  const rangeOf = (block: RowBlock): RowRange => ranges.get(block.id) ?? entryRange(block.count);

  const measure = () => {
    const element = frame.current;
    if (element === null) return;
    const frameTop = element.getBoundingClientRect().top;
    const viewport = element.clientHeight > 0 ? element.clientHeight : screenHeight();
    const anchors = new Map([...element.querySelectorAll<HTMLElement>(`[${ROW_ANCHOR_ATTRIBUTE}]`)].map((node) => [node.getAttribute(ROW_ANCHOR_ATTRIBUTE), node] as const));
    const previous = measured.current;
    const entries = blocksRef.current.map((block): readonly [string, RowRange] => {
      const current = previous.get(block.id) ?? entryRange(block.count);
      const anchor = anchors.get(block.id);
      if (anchor === undefined) return [block.id, current];
      const need = rowsInView({ top: anchor.getBoundingClientRect().top - frameTop, viewport, rowHeight, count: block.count, marginPx });
      return [block.id, settleRange(current, need, { count: block.count, extraRows })];
    });
    if (entries.length === previous.size && entries.every(([id, range]) => previous.get(id) === range)) return;
    const next: ReadonlyMap<string, RowRange> = new Map(entries);
    measured.current = next;
    setRanges(next);
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => {
    measureRef.current();
  });

  useEffect(() => {
    const element = frame.current;
    if (element === null) return undefined;
    const pending = { request: 0 };
    const schedule = () => {
      if (pending.request !== 0) return;
      pending.request = requestAnimationFrame(() => {
        pending.request = 0;
        measureRef.current();
      });
    };
    element.addEventListener('scroll', schedule, { passive: true });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    resize?.observe(element);
    return () => {
      element.removeEventListener('scroll', schedule);
      resize?.disconnect();
      cancelAnimationFrame(pending.request);
    };
  }, [frame]);

  return rangeOf;
}
