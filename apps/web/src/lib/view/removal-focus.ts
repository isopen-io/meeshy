/**
 * OÙ VA LE FOCUS QUAND UNE RANGÉE QUITTE LE FIL (#12632) — abandonner un envoi
 * retire la rangée qui portait le focus : sans relais, il retombait sur
 * `<body>` et un lecteur d'écran repartait du haut du document. La rangée
 * VOISINE (la précédente, sinon la suivante) le reprend si elle est
 * atteignable au clavier ; sinon le champ du composeur.
 *
 * Plusieurs rangées qui partent ensemble (#12634, une sélection masquée
 * « pour moi ») : la voisine est la plus proche qui RESTE, avant la première
 * qui part, sinon après.
 */
export function focusTargetAfterRemovals(messageIds: ReadonlySet<string>, root: ParentNode = document): HTMLElement | null {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row]')];
  const index = rows.findIndex((row) => messageIds.has(row.dataset.row ?? ''));
  const staying = (row: HTMLElement) => !messageIds.has(row.dataset.row ?? '') && row.tabIndex >= 0;
  const neighbour = index < 0 ? undefined : (rows.slice(0, index).reverse().find(staying) ?? rows.slice(index + 1).find(staying));
  return neighbour ?? root.querySelector<HTMLElement>('[data-composer] textarea');
}

export function focusTargetAfterRemoval(messageId: string, root: ParentNode = document): HTMLElement | null {
  return focusTargetAfterRemovals(new Set([messageId]), root);
}
