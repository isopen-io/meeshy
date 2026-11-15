/**
 * **UNE SEULE LIGNE BALAYÉE À LA FOIS** (#10580) — l'état partagé HORS des
 * lignes : qui est ouverte, et comment la refermer. Aucune ligne ne s'y
 * abonne, donc en ouvrir une ne re-rend pas la liste ; la précédente est
 * refermée par son propre rappel.
 *
 * Tant qu'une ligne est ouverte, deux écoutes en CAPTURE sur le document la
 * referment : un toucher hors d'elle (en-tête, barre d'onglets, autre ligne),
 * et un défilement — celui du conteneur de liste ne remonte pas jusqu'à
 * `window`. L'hôte de la liste appelle `dismissOpenRowSwipe` quand la vue
 * change (route, filtre, recherche).
 */
type OpenRow = { readonly element: Element; readonly close: () => void };

let openRow: OpenRow | null = null;

const onPointerDown = (event: Event): void => {
  const target = event.target;
  if (openRow === null || (target instanceof Node && openRow.element.contains(target))) return;
  openRow.close();
};

const onScroll = (): void => openRow?.close();

const listen = (): void => {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
};

const unlisten = (): void => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  document.removeEventListener('scroll', onScroll, { capture: true });
};

/** La ligne prend la place : celle qui l'occupait se referme d'abord. */
export function claimOpenRowSwipe(row: OpenRow): void {
  if (openRow?.element === row.element) {
    openRow = row;
    return;
  }
  const previous = openRow;
  openRow = row;
  if (previous === null) listen();
  previous?.close();
}

/** La ligne rend la place — sans effet si une autre l'a déjà prise. */
export function releaseOpenRowSwipe(element: Element): void {
  if (openRow?.element !== element) return;
  openRow = null;
  unlisten();
}

export function dismissOpenRowSwipe(): void {
  openRow?.close();
}
