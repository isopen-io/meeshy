/**
 * **LA COQUE DÉMARRE SUR LA LISTE, COMME LA PWA** (#10353) — la PWA installée
 * s'ouvre sur `/chats` (`start_url`), la coque charge toujours `/`. Réécrite
 * avant le premier rendu, l'adresse de départ épargne à la coque le chunk et
 * le rendu vide de `home-shell`, qui ne redirigeait qu'après coup.
 *
 * **SANS COMPTE, ELLE DÉMARRE SUR LA CONNEXION** (#10784, directive porteur du
 * 2026-10-16) — la liste n'aurait fait que renvoyer à `/login` par la garde de
 * session, un écran et une redirection plus tard.
 */
export function shellStartHref(
  location: { readonly pathname: string; readonly search: string; readonly hash: string },
  target: { readonly listHref: string; readonly loginHref: string; readonly authenticated: boolean },
): string | null {
  if (location.pathname !== '/') return null;
  const start = target.authenticated ? target.listHref : target.loginHref;
  return `${start}${location.search}${location.hash}`;
}
