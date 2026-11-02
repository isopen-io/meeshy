import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * LA LISTE SE PARCOURT AU CLAVIER, UN ARRÊT DE TABULATION (#11227) — le
 * « roving tabindex » des listes composites (WAI-ARIA), celui que la liste
 * d'iOS tient d'office au clavier matériel et à VoiceOver.
 *
 * Avant, chaque rangée offrait à la tabulation son avatar, son lien et son
 * bouton d'actions : traverser cent conversations coûtait trois cents `Tab`.
 * Désormais :
 *
 *  - une rangée n'offre à la tabulation QUE son lien vers le fil
 *    (`data-row-primary`) ; ses autres contrôles restent dans l'arbre
 *    d'accessibilité, hors du parcours `Tab` ;
 *  - une fois qu'une rangée a eu le focus, elle seule tient l'arrêt : la liste
 *    entière n'est plus qu'un `Tab`, et on y revient là où on l'a quittée ;
 *  - haut et bas changent de rangée, Début et Fin vont aux bouts ;
 *  - droite et gauche passent d'un contrôle de la rangée à l'autre, dans le
 *    sens de l'écriture (l'arabe lit de droite à gauche).
 *
 * L'arrêt vit dans un MAGASIN, pas dans l'écran : les rangées sont mémoïsées
 * (`sameRowProps`), et seule la rangée qui gagne ou perd l'arrêt se re-rend.
 */

export type RowKeyMove =
  | { readonly kind: 'row'; readonly to: 'previous' | 'next' | 'first' | 'last' }
  | { readonly kind: 'control'; readonly step: 1 | -1 };

const ROW_KEYS: Readonly<Record<string, RowKeyMove>> = {
  ArrowDown: { kind: 'row', to: 'next' },
  ArrowUp: { kind: 'row', to: 'previous' },
  Home: { kind: 'row', to: 'first' },
  End: { kind: 'row', to: 'last' },
};

/** La loi pure : quelle touche fait quoi. `null` : la touche n'est pas au parcours. */
export function rowKeyMove(input: { readonly key: string; readonly rtl: boolean }): RowKeyMove | null {
  const row = ROW_KEYS[input.key];
  if (row !== undefined) return row;
  if (input.key !== 'ArrowRight' && input.key !== 'ArrowLeft') return null;
  const forward = input.key === (input.rtl ? 'ArrowLeft' : 'ArrowRight');
  return { kind: 'control', step: forward ? 1 : -1 };
}

export type RowRoving = {
  /** Cette rangée tient-elle l'arrêt ? Vrai pour toutes tant qu'aucune n'a eu le focus. */
  readonly holds: (id: string) => boolean;
  readonly focus: (id: string) => void;
  /** La rangée se démonte : si elle tenait l'arrêt, il se rend à toutes. */
  readonly release: (id: string) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => string | null;
};

export function createRowRoving(): RowRoving {
  const listeners = new Set<() => void>();
  const state: { active: string | null } = { active: null };
  const set = (next: string | null): void => {
    if (state.active === next) return;
    state.active = next;
    listeners.forEach((listener) => listener());
  };
  return {
    holds: (id) => state.active === null || state.active === id,
    focus: (id) => set(id),
    release: (id) => {
      if (state.active === id) set(null);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state.active,
  };
}

/** L'arrêt de la liste des conversations — une seule liste par écran. */
export const rowRoving = createRowRoving();

/** Le lien vers le fil d'une rangée, son seul arrêt de tabulation. */
export const ROW_PRIMARY_ATTRIBUTE = 'data-row-primary';

const PRIMARY = `[${ROW_PRIMARY_ATTRIBUTE}]`;
const CONTROLS = 'a[href], button:not([disabled])';

/** Les contrôles d'une rangée, dans l'ordre du document — ceux qu'un lecteur d'écran tait (doublons) exclus. */
const controlsOf = (row: HTMLElement): readonly HTMLElement[] =>
  [...row.querySelectorAll<HTMLElement>(CONTROLS)].filter((control) => control.closest('[aria-hidden="true"]') === null);

/** Une rangée INERTE est en train de quitter la liste (#11574) : le focus ne peut plus s'y poser. */
const reachable = (candidate: HTMLElement): boolean => candidate.querySelector(PRIMARY) !== null && candidate.closest('[inert]') === null;

const rowsAround = (row: HTMLElement): readonly HTMLElement[] => {
  const list = row.closest('#contenu') ?? row.parentElement;
  return list === null ? [row] : [...list.querySelectorAll<HTMLElement>('[data-row]')].filter(reachable);
};

const targetRow = (rows: readonly HTMLElement[], row: HTMLElement, to: 'previous' | 'next' | 'first' | 'last'): HTMLElement | undefined => {
  if (to === 'first') return rows[0];
  if (to === 'last') return rows.at(-1);
  const index = rows.indexOf(row);
  return rows[Math.min(rows.length - 1, Math.max(0, index + (to === 'next' ? 1 : -1)))];
};

/**
 * APPLIQUE UNE TOUCHE À LA RANGÉE QUI A LE FOCUS — rend `true` quand la touche
 * a été prise (l'appelant empêche alors son effet par défaut, le défilement).
 */
export function moveRowFocus(input: { readonly row: HTMLElement; readonly from: Element | null; readonly move: RowKeyMove }): boolean {
  const { row, from, move } = input;
  if (move.kind === 'row') {
    const next = targetRow(rowsAround(row), row, move.to)?.querySelector<HTMLElement>(PRIMARY);
    next?.focus();
    return next !== undefined && next !== null;
  }
  const controls = controlsOf(row);
  const index = controls.findIndex((control) => control === from || (from !== null && control.contains(from)));
  if (index < 0) return false;
  const next = controls[index + move.step];
  next?.focus();
  return next !== undefined;
}

/** Ce que la rangée lit d'une touche — la forme commune à l'événement React et à l'événement natif. */
type RowKeyEvent = {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly currentTarget: HTMLElement;
  readonly defaultPrevented: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly preventDefault: () => void;
};

/**
 * CE QUE LA RANGÉE POSE SUR ELLE ET SUR SON LIEN — `tabIndex` du lien (0 s'il
 * tient l'arrêt), le relevé du focus, et la touche du parcours. Une touche
 * venue d'un descendant PORTÉ ailleurs (le menu de la rangée est un portail,
 * dont les événements remontent l'arbre React) n'appartient pas au parcours.
 */
export function useRowRoving(id: string, roving: RowRoving = rowRoving) {
  const holds = useSyncExternalStore(roving.subscribe, () => roving.holds(id), () => true);
  useEffect(() => () => roving.release(id), [roving, id]);
  const onFocus = useCallback(() => roving.focus(id), [roving, id]);
  const onKeyDown = useCallback((event: RowKeyEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null || !event.currentTarget.contains(target)) return;
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const move = rowKeyMove({ key: event.key, rtl });
    if (move === null) return;
    if (moveRowFocus({ row: event.currentTarget, from: target, move })) event.preventDefault();
  }, []);
  return { tabIndex: holds ? 0 : -1, onFocus, onKeyDown } as const;
}
