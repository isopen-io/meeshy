/**
 * LE PIÈGE À FOCUS D'UNE COUCHE MODALE (#6221) — loi PURE : `Tab` depuis le
 * DERNIER élément focalisable revient au PREMIER, `Shift+Tab` depuis le
 * premier revient au dernier. Le calcul d'INDEX est ici ; le DOM (lister les
 * éléments focalisables, poser `inert` sur `#root`) reste à l'appelant
 * (`media-viewer.tsx`), même dispositif que `roving-menu.ts` sépare déjà la
 * mécanique du placement.
 */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return 0;
  const delta = backwards ? -1 : 1;
  return ((current + delta) % count + count) % count;
}
