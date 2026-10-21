import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';

import { prefersReducedMotion } from './reduced-motion';
import { trackVisibleRows, type VisibleRows } from './visible-rows';

/**
 * UNE REMONTÉE EN TÊTE S'ANIME (#11207) — la technique FLIP (First, Last,
 * Invert, Play), bornée à ce qui se voit.
 *
 * Une conversation qui reçoit un message remonte en tête de liste. Sans
 * animation, elle SAUTE, et chaque rangée qu'elle a dépassée saute d'un cran
 * avec elle : l'œil perd la rangée qu'il lisait. iOS anime ce changement
 * d'ordre (`List` + `withAnimation`) ; le web le rejoue :
 *
 * 1. FIRST — au RENDU qui change l'ordre, donc avant que le DOM ne soit
 *    réordonné, on lit la position des seules rangées VISIBLES
 *    (`trackVisibleRows`, la marge comprise).
 * 2. LAST — après le commit (`useLayoutEffect`, avant la peinture), on relit
 *    ces mêmes nœuds.
 * 3. INVERT + PLAY — chaque rangée qui a bougé ET qui reste dans la fenêtre
 *    part de son ancienne place (`translateY(écart)`) et rejoint la nouvelle,
 *    par une animation du compositeur (`element.animate`) : aucun style
 *    laissé derrière, aucun rendu React.
 *
 * Une rangée qui arrive d'au-delà de l'écran n'a pas de « avant » : elle
 * paraît à sa place, les autres lui font de la place en glissant.
 *
 * D'UNE SECTION À L'AUTRE (#11342) — « Aujourd'hui », « Hier »… sont des
 * parents distincts : la conversation d'hier qui reçoit un message est
 * DÉMONTÉE puis remontée en tête d'aujourd'hui, et son ancien nœud ne mesure
 * plus rien. Le « après » se relit donc sur le nœud MONTÉ sous le même
 * `data-row` : la rangée glisse depuis sa place d'avant quand elle était à
 * l'écran, et entre en FONDU quand elle ne l'était pas — seule celle qui a
 * DÉPASSÉ les autres (`reorderClimbers`) : une rangée qui descend, ou qu'un
 * filtre rapproche du haut, ne se met pas en scène.
 *
 * COUPÉ sous `prefers-reduced-motion` (la liste change d'ordre sans
 * mouvement) et pendant un DÉFILEMENT ACTIF : la liste suit le doigt, une
 * rangée qui glisserait à contre-sens sous lui serait une saccade de plus.
 *
 * Le `<li>` porte l'animation : la scène de la Lentille écrit le `transform`
 * de son PREMIER ENFANT, le balayage pose `translate` et l'appui `scale` —
 * aucune des quatre ne se connaît.
 */

export const REORDER_FLIP_DURATION_MS = 320;
/** Un défilement vu il y a moins que ça est encore ACTIF. */
export const REORDER_SCROLL_SETTLE_MS = 160;
const REORDER_OVERSCAN_PX = 240;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const MIN_SHIFT_PX = 0.5;

export type RowBox = { readonly top: number; readonly bottom: number };
export type FlipStep = { readonly id: string; readonly dy: number };

const isShown = (box: RowBox, viewport: RowBox): boolean => box.bottom > viewport.top && box.top < viewport.bottom;

/**
 * LA LOI PURE : quelles rangées s'animent, et de combien. Une rangée s'anime
 * si elle était DANS la fenêtre avant, si elle y est encore après, et si elle
 * a bougé d'au moins un demi-pixel. Une rangée venue de la marge (ou y
 * partant) ne glisse pas : elle traverserait l'écran, et un focus posé
 * pendant ce glissement ferait défiler la liste vers elle.
 */
export function planReorderFlip(input: {
  readonly before: ReadonlyMap<string, RowBox>;
  readonly after: ReadonlyMap<string, RowBox>;
  readonly viewport: RowBox;
}): readonly FlipStep[] {
  const { before, after, viewport } = input;
  const shown = (box: RowBox): boolean => isShown(box, viewport);
  return [...after].flatMap(([id, box]) => {
    const was = before.get(id);
    if (was === undefined || !shown(was) || !shown(box)) return [];
    const dy = was.top - box.top;
    return Math.abs(dy) >= MIN_SHIFT_PX ? [{ id, dy }] : [];
  });
}

/**
 * QUI A DÉPASSÉ QUELQU'UN — sur les seules rangées présentes avant ET après,
 * celles dont le rang a baissé. Une remontée en tête n'en compte qu'une ; un
 * filtre qui retire des rangées garde l'ordre relatif des autres, et n'en
 * compte aucune.
 */
export function reorderClimbers(previous: readonly string[], next: readonly string[]): ReadonlySet<string> {
  const nextIds = new Set(next);
  const previousIds = new Set(previous);
  const rankBefore = new Map(previous.filter((id) => nextIds.has(id)).map((id, rank) => [id, rank] as const));
  const kept = next.filter((id) => previousIds.has(id));
  return new Set(kept.filter((id, rank) => rank < (rankBefore.get(id) ?? rank)));
}

type Snapshot = ReadonlyMap<string, { readonly node: HTMLElement; readonly box: RowBox }>;

const EMPTY: Snapshot = new Map();

const snapshotOf = (rows: VisibleRows | null): Snapshot =>
  rows === null
    ? EMPTY
    : new Map(
        rows.current().flatMap((node) => {
          const id = node.dataset.row;
          if (id === undefined) return [];
          const { top, bottom } = node.getBoundingClientRect();
          return [[id, { node, box: { top, bottom } }] as const];
        }),
      );

/** Ni réduction des animations, ni défilement actif : la liste peut glisser. */
const mayGlide = (lastScrollAt: number): boolean =>
  !prefersReducedMotion() && performance.now() - lastScrollAt >= REORDER_SCROLL_SETTLE_MS;

const play = (node: HTMLElement, dy: number): void => {
  if (typeof node.animate !== 'function') return;
  node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }], {
    duration: REORDER_FLIP_DURATION_MS,
    easing: EASING,
  });
};

const fadeIn = (node: HTMLElement): void => {
  if (typeof node.animate !== 'function') return;
  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REORDER_FLIP_DURATION_MS, easing: EASING });
};

const boxOf = (node: HTMLElement): RowBox => {
  const { top, bottom } = node.getBoundingClientRect();
  return { top, bottom };
};

/**
 * LES NŒUDS MONTÉS DES RANGÉES CHERCHÉES — un seul parcours du défileur, et
 * seulement quand une rangée a changé de parent ou en a dépassé d'autres.
 */
const mountedRows = (frame: HTMLElement, wanted: ReadonlySet<string>): ReadonlyMap<string, HTMLElement> =>
  wanted.size === 0
    ? new Map()
    : new Map(
        [...frame.querySelectorAll<HTMLElement>('[data-row]')].flatMap((node) => {
          const id = node.dataset.row;
          return id !== undefined && wanted.has(id) ? [[id, node] as const] : [];
        }),
      );

/**
 * `order` : les rangées dans l'ordre affiché — seule la suite de leurs `id`
 * compte. Un rendu au même ordre (nouvelle identité de tableau, mêmes `id`)
 * ne mesure ni n'anime rien.
 */
export function useListReorderFlip(frame: RefObject<HTMLElement | null>, order: readonly { readonly id: string }[]): void {
  const rowsRef = useRef<VisibleRows | null>(null);
  const lastScrollAt = useRef(Number.NEGATIVE_INFINITY);
  const signature = useMemo(() => order.map((row) => row.id).join('\n'), [order]);
  const committed = useRef(signature);
  const committedOrder = useRef<readonly string[]>(order.map((row) => row.id));

  useEffect(() => {
    const element = frame.current;
    if (element === null) return undefined;
    const rows = trackVisibleRows(element, { selector: '[data-row]', overscanPx: REORDER_OVERSCAN_PX });
    rowsRef.current = rows;
    const onScroll = () => {
      lastScrollAt.current = performance.now();
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      rows.stop();
      rowsRef.current = null;
    };
  }, [frame]);

  /**
   * FIRST — lu PENDANT le rendu qui change l'ordre : c'est le seul instant où
   * le DOM porte encore l'ancien. Une lecture de géométrie au rendu, bornée
   * aux rangées visibles et faite une fois par changement d'ordre — jamais
   * par rendu, et jamais quand rien ne glissera (réduction des animations,
   * défilement actif) : ces changements-là ne lisent aucune géométrie.
   */
  const before = useMemo(() => (mayGlide(lastScrollAt.current) ? snapshotOf(rowsRef.current) : EMPTY), [signature]);

  useLayoutEffect(() => {
    if (committed.current === signature) return;
    committed.current = signature;
    const previousOrder = committedOrder.current;
    const nextOrder = signature === '' ? [] : signature.split('\n');
    committedOrder.current = nextOrder;
    const element = frame.current;
    if (element === null || before.size === 0 || !mayGlide(lastScrollAt.current)) return;
    const box = element.getBoundingClientRect();
    const viewport = { top: box.top, bottom: box.bottom };
    const climbers = reorderClimbers(previousOrder, nextOrder);
    const remounted = [...before].flatMap(([id, { node }]) => (node.isConnected ? [] : [id]));
    const entering = [...climbers].filter((id) => before.get(id) === undefined);
    const found = mountedRows(element, new Set([...remounted, ...entering]));
    const nodeOf = (id: string): HTMLElement | undefined => {
      const was = before.get(id)?.node;
      return was !== undefined && was.isConnected ? was : found.get(id);
    };
    const after = new Map(
      [...before.keys()].flatMap((id) => {
        const node = nodeOf(id);
        return node === undefined ? [] : [[id, boxOf(node)] as const];
      }),
    );
    const plan = planReorderFlip({ before: new Map([...before].map(([key, was]) => [key, was.box])), after, viewport });
    for (const { id, dy } of plan) {
      const node = nodeOf(id);
      if (node !== undefined) play(node, dy);
    }
    const unseenBefore = (id: string): boolean => {
      const was = before.get(id)?.box;
      return was === undefined || !isShown(was, viewport);
    };
    for (const id of climbers) {
      const node = nodeOf(id);
      if (node !== undefined && unseenBefore(id) && isShown(boxOf(node), viewport)) fadeIn(node);
    }
  }, [signature, before, frame]);
}
