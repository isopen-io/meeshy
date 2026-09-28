/**
 * **LES FLÈCHES DANS UNE RANGÉE DE L'APPEL** (#8550) — sous le `(…)`, chaque
 * famille et chaque panneau est une rangée qui défile à l'HORIZONTALE. Au
 * clavier, ← et → vont au voisin (en boucle), Début et Fin aux bouts ; en
 * arabe, le sens s'inverse. Dans une rangée à choix unique
 * (`role="radiogroup"`), aller sur un choix le coche, comme un groupe de
 * radios natif.
 *
 * Le module vit avec l'écran d'appel ; les panneaux chargés à part reçoivent
 * `onRowKeyDown` en propriété, comme leur glyphe de Fermer : ils n'importent
 * rien de `call_overlay`.
 */

type Step = { readonly key: string; readonly index: number; readonly count: number; readonly rtl: boolean };

export function rowStep({ key, index, count, rtl }: Step): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const forward = (key === 'ArrowRight') !== rtl;
  if (index < 0) return forward ? 0 : count - 1;
  return (index + (forward ? 1 : -1) + count) % count;
}

export const ROW_ITEM = 'data-row-item';

type Wheel = { readonly deltaX: number; readonly deltaY: number; readonly scrollLeft: number; readonly maxScroll: number; readonly rtl: boolean };

/**
 * La molette d'une souris ne sait que le VERTICAL : sur une rangée qui
 * déborde, elle la fait défiler à l'horizontale (#8575). Un geste déjà
 * horizontal (pavé tactile, Maj+molette) reste au navigateur ; au bout de la
 * rangée, la main revient au défilement vertical. En arabe, `scrollLeft` part
 * de 0 vers le NÉGATIF.
 */
export function rowWheelDelta({ deltaX, deltaY, scrollLeft, maxScroll, rtl }: Wheel): number | null {
  if (maxScroll <= 0 || Math.abs(deltaX) >= Math.abs(deltaY) || deltaY === 0) return null;
  const travelled = rtl ? -scrollLeft : scrollLeft;
  const forward = deltaY > 0;
  if (forward ? travelled >= maxScroll - 1 : travelled <= 1) return null;
  return rtl ? -deltaY : deltaY;
}

type RowWheelEvent = { readonly deltaX: number; readonly deltaY: number; readonly currentTarget: EventTarget; readonly preventDefault: () => void };

export type RowWheelHandler = (event: RowWheelEvent) => void;

export const onRowWheel: RowWheelHandler = (event) => {
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) return;
  const rtl = typeof getComputedStyle === 'function' && getComputedStyle(row).direction === 'rtl';
  const delta = rowWheelDelta({ deltaX: event.deltaX, deltaY: event.deltaY, scrollLeft: row.scrollLeft, maxScroll: row.scrollWidth - row.clientWidth, rtl });
  if (delta === null) return;
  event.preventDefault();
  row.scrollLeft += delta;
};

type RowKeyEvent = { readonly key: string; readonly currentTarget: EventTarget; readonly preventDefault: () => void };

export type RowKeyHandler = (event: RowKeyEvent) => void;

export const onRowKeyDown: RowKeyHandler = (event) => {
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) return;
  const items = [...row.querySelectorAll<HTMLElement>(`[${ROW_ITEM}]:not([disabled])`)];
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  if (focused instanceof HTMLInputElement && focused.type === 'range') return;
  const index = items.findIndex((item) => item === focused);
  const rtl = typeof getComputedStyle === 'function' && getComputedStyle(row).direction === 'rtl';
  const next = rowStep({ key: event.key, index, count: items.length, rtl });
  const target = next === null ? undefined : items[next];
  if (target === undefined) return;
  event.preventDefault();
  target.focus();
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  if (row.getAttribute('role') === 'radiogroup' && target.getAttribute('aria-checked') !== 'true') target.click();
};
