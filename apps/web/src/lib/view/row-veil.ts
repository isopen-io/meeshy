import type { ReturnFlight } from './message-menu-lift';

/**
 * LA RANGÉE PRESSÉE S'EFFACE LE TEMPS DU MENU, ET UNE SEULE FOIS (#11206).
 *
 * L'effacement vit sur l'ÉLÉMENT, pas dans le menu qui l'a posé : la rangée ne
 * réapparaît qu'à l'arrivée du fantôme qui y redescend, et un second menu peut
 * s'ouvrir sur la même rangée AVANT cette arrivée (Échap puis `ContextMenu`,
 * clic sur le voile puis clic droit). Lu dans le menu, l'effacement prenait
 * alors `'0'` pour l'opacité d'origine : le premier retour rendait la rangée
 * visible SOUS le second menu (le message vu deux fois), et le second la
 * rendait à `'0'` — effacée pour de bon.
 *
 * Ici, l'opacité d'origine est lue une fois, par le PREMIER qui efface ; chaque
 * menu tient la rangée tant qu'il vit ou que son fantôme vole ; la rangée
 * réapparaît quand plus personne ne la tient. Un menu qui s'ouvre pose aussi
 * les fantômes encore en vol : une seule copie du message à l'écran.
 */
type Veil = {
  readonly original: string;
  readonly holders: number;
  readonly flights: readonly ReturnFlight[];
};

const veils = new WeakMap<HTMLElement, Veil>();

function unhold(row: HTMLElement): void {
  const veil = veils.get(row);
  if (veil === undefined) return;
  if (veil.holders > 1) {
    veils.set(row, { ...veil, holders: veil.holders - 1 });
    return;
  }
  veils.delete(row);
  row.style.opacity = veil.original;
}

export type RowVeil = {
  /** L'opacité de la rangée AVANT tout effacement — celle qu'un clone doit
   * porter, même quand un menu précédent tient encore la rangée à `'0'`. */
  readonly original: string;
  /** Sans fantôme, la rangée est rendue tout de suite ; avec, à son arrivée.
   * Appeler la libération plus d'une fois est sans effet. */
  readonly release: (flight: ReturnFlight | null) => void;
};

/** Efface `row` le temps d'un menu. */
export function veilRow(row: HTMLElement): RowVeil {
  const current = veils.get(row);
  const original = current?.original ?? row.style.opacity;
  veils.set(row, { original, holders: (current?.holders ?? 0) + 1, flights: [] });
  current?.flights.forEach((flight) => flight.land());
  row.style.opacity = '0';
  const released = { done: false };
  const release = (flight: ReturnFlight | null): void => {
    if (released.done) return;
    released.done = true;
    if (flight === null) {
      unhold(row);
      return;
    }
    const veil = veils.get(row);
    if (veil !== undefined) veils.set(row, { ...veil, flights: [...veil.flights, flight] });
    void flight.landed.then(() => {
      const landed = veils.get(row);
      if (landed !== undefined) veils.set(row, { ...landed, flights: landed.flights.filter((other) => other !== flight) });
      unhold(row);
    });
  };
  return { original, release };
}
