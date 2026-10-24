/**
 * OÙ VA LE FOCUS QUAND UNE RANGÉE QUITTE LE FIL (#12632) — abandonner un envoi
 * retire la rangée qui portait le focus : sans relais, il retombait sur
 * `<body>` et un lecteur d'écran repartait du haut du document. La rangée
 * VOISINE (la précédente, sinon la suivante) le reprend si elle est
 * atteignable au clavier ; sinon le champ du composeur.
 */
export function focusTargetAfterRemoval(messageId: string, root: ParentNode = document): HTMLElement | null {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row]')];
  const index = rows.findIndex((row) => row.dataset.row === messageId);
  const neighbour = index < 0 ? undefined : (rows[index - 1] ?? rows[index + 1]);
  if (neighbour !== undefined && neighbour.tabIndex >= 0) return neighbour;
  return root.querySelector<HTMLElement>('[data-composer] textarea');
}
