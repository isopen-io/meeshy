import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { markProgrammaticScroll } from './programmatic-scroll';
import { prefersReducedMotion } from './reduced-motion';
import { ROW_EXIT_CURVE, ROW_EXIT_MS } from './row-exit-motion';

/**
 * **LES VOISINES D'UNE RANGÉE QUI SORT GLISSENT DEPUIS LÀ OÙ L'ŒIL LES VOYAIT**
 * (#12634, revue adversariale).
 *
 * La première forme du lot posait `transition: transform` sur les `<li>` : elle
 * suivait le changement de `row.start`, et rien d'autre. Or un fil se lit calé
 * EN BAS — et là, la hauteur perdue par la rangée qui sort fait rabattre
 * `scrollTop` d'autant par le navigateur. Mesuré au navigateur
 * (`scripts/check-thread-row-exit.mjs`) : les rangées du dessus descendaient de
 * 191 px en deux images, celles du dessous descendaient puis remontaient en
 * glissant (272 px parcourus pour 0 px nets).
 *
 * Le glissement est donc un FLIP mesuré À L'ÉCRAN : la position de la liste
 * dans l'écran (`frameTop`, qui porte le rabat du défilement) PLUS la place de
 * la rangée dans la liste (`start`). Après chaque rendu qui change la
 * disposition, chaque rangée repart de là où elle était PEINTE et rejoint sa
 * place — un écart nul ne joue rien, ce qui est exactement le cas des rangées
 * qui ne bougent pas à l'écran.
 *
 * Il ne joue que pendant une sortie ou un retour (`settling`), jamais sous
 * « Réduire les animations », et jamais pour un simple défilement : seul un
 * rendu dont les places ou la hauteur totale changent se rejoue
 * (`layoutMoved`). Un défilement entre deux rendus remet la position de la
 * liste à jour, pour qu'il ne passe jamais pour un glissement.
 *
 * ## POURQUOI PAS `flip.ts` NI `list-reorder-flip.ts`
 *
 * Tous deux jouent `translate(écart) → none` : sur un `<li>` virtualisé, dont
 * le `transform` EN LIGNE porte sa place (`translateY(start)`), `none`
 * l'enverrait en tête de liste le temps de l'animation. Et ils mesurent au
 * rendu qui change l'ordre, quand le virtualiseur, lui, re-mesure en
 * plusieurs rendus (ResizeObserver) : chaque rendu reprend donc ici la rangée
 * là où son animation la tient. Les images clés portent la place absolue
 * (`translateY(start + écart) → translateY(start)`).
 *
 * ## UN FIL CALÉ EN BAS LE RESTE
 *
 * À la sortie, le navigateur rabat lui-même le défilement. Au RETOUR d'une
 * rangée refusée, le fil grandit sous l'écran : le lecteur se retrouvait
 * au-dessus du bas, puis la première frappe d'un pair le réancrait d'un coup
 * (`use-thread-typing.ts`). Un fil calé en bas qui grandit se recale donc en
 * bas (`holdsEnd`), AVANT la mesure — et ce recalage se joue comme le reste :
 * les rangées du dessus remontent en glissant.
 */

export type SettleFrame = {
  readonly frameTop: number;
  readonly starts: ReadonlyMap<string, number>;
  readonly total: number;
  /** Le défileur était-il calé en bas à ce rendu ? */
  readonly atEnd: boolean;
};

export type SettleRow = { readonly key: string; readonly start: number };

/** L'écart à rattraper : où la rangée était peinte, moins où elle est désormais, à l'écran. */
export function settleOffset(params: {
  readonly previousFrameTop: number;
  readonly previousTop: number;
  readonly frameTop: number;
  readonly start: number;
}): number {
  return params.previousFrameTop + params.previousTop - (params.frameTop + params.start);
}

/** La disposition a-t-elle changé — une rangée présente aux deux rendus déplacée dans la liste, ou la hauteur totale ? */
export function layoutMoved(previous: SettleFrame, next: SettleFrame): boolean {
  if (previous.total !== next.total) return true;
  return [...next.starts].some(([key, start]) => {
    const before = previous.starts.get(key);
    return before !== undefined && before !== start;
  });
}

/** Un fil calé en bas qui grandit pendant un retour se recale en bas ; un fil remonté ne bouge pas. */
export function holdsEnd(previous: SettleFrame, total: number): boolean {
  return previous.atEnd && total > previous.total;
}

const atEndOf = (scroller: HTMLElement | null): boolean =>
  scroller !== null && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1;

const playing = new WeakMap<Element, Animation>();

function replay(li: HTMLElement, params: { readonly previous: SettleFrame; readonly next: SettleFrame }): void {
  const key = li.dataset.rowKey ?? '';
  const start = params.next.starts.get(key);
  const before = params.previous.starts.get(key);
  if (start === undefined || before === undefined || typeof li.animate !== 'function') return;
  const tracked = playing.get(li);
  const running = tracked !== undefined && tracked.playState !== 'finished' && tracked.playState !== 'idle' ? tracked : undefined;
  /* Une rangée déjà en vol est peinte là où son animation la tient — on
     repart de CE point, jamais de sa place d'avant, sinon elle sauterait. */
  const previousTop = running === undefined ? before : li.getBoundingClientRect().top - params.next.frameTop;
  running?.cancel();
  playing.delete(li);
  const offset = settleOffset({ previousFrameTop: params.previous.frameTop, previousTop, frameTop: params.next.frameTop, start });
  if (Math.abs(offset) < 0.5) return;
  const animation = li.animate([{ transform: `translateY(${start + offset}px)` }, { transform: `translateY(${start}px)` }], {
    duration: ROW_EXIT_MS,
    easing: ROW_EXIT_CURVE,
  });
  playing.set(li, animation);
}

export function useRowSettle(params: {
  readonly list: RefObject<HTMLElement | null>;
  readonly scroller: () => HTMLElement | null;
  readonly settling: boolean;
  readonly rows: readonly SettleRow[];
  readonly total: number;
}): void {
  const { list, scroller, settling, rows, total } = params;
  const memory = useRef<SettleFrame | null>(null);

  useLayoutEffect(() => {
    const element = list.current;
    if (!settling || element === null || prefersReducedMotion()) {
      memory.current = null;
      return;
    }
    const previous = memory.current;
    const scrollElement = scroller();
    if (previous !== null && scrollElement !== null && holdsEnd(previous, total)) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
      markProgrammaticScroll(scrollElement, scrollElement.scrollTop);
    }
    const next: SettleFrame = {
      frameTop: element.getBoundingClientRect().top,
      starts: new Map(rows.map((row) => [row.key, row.start])),
      total,
      atEnd: atEndOf(scrollElement),
    };
    memory.current = next;
    if (previous === null || !layoutMoved(previous, next)) return;
    element.querySelectorAll<HTMLElement>(':scope > li[data-row-key]').forEach((li) => replay(li, { previous, next }));
  });

  useEffect(() => {
    const element = list.current;
    if (!settling || element === null) return undefined;
    const onScroll = () => {
      const current = memory.current;
      if (current !== null) memory.current = { ...current, frameTop: element.getBoundingClientRect().top, atEnd: atEndOf(scroller()) };
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [list, scroller, settling]);
}
