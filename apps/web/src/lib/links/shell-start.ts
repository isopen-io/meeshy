/**
 * **LA COQUE DÉMARRE SUR LA LISTE, COMME LA PWA** (#10353) — la PWA installée
 * s'ouvre sur `/chats` (`start_url`), la coque charge toujours `/`. Réécrite
 * avant le premier rendu, l'adresse de départ épargne à la coque le chunk et
 * le rendu vide de `home-shell`, qui ne redirigeait qu'après coup.
 */
export function shellStartHref(
  location: { readonly pathname: string; readonly search: string; readonly hash: string },
  listHref: string,
): string | null {
  return location.pathname === '/' ? `${listHref}${location.search}${location.hash}` : null;
}
