/**
 * **LE PORTILLON DES MENUS FLOTTANTS** (#6104) — la seule partie de ce lot qui
 * reste au SOCLE, et elle y reste pour la raison que la coquille écrit déjà
 * pour la pastille de synchronisation : *« Seul `useSyncPillArmed` reste en
 * statique : il ne connaît ni glyphe, ni libellé, ni la loi de priorité, et
 * c'est sa réponse OUI qui la REND. »*
 *
 * Ce fichier ne connaît ni destination, ni teinte, ni géométrie : il répond à
 * une seule question, sur une chaîne. C'est ce qui permet à `shell.tsx` de
 * l'appeler à chaque rendu sans faire entrer les menus dans la première
 * peinture.
 */

/**
 * **Les routes qui portent les menus** — miroir d'`isDeepRoute`
 * (`Router.swift:274-276`), qui garde les boutons sur la racine et ses routes
 * de HUB, et les retire dès qu'on descend dans une conversation.
 *
 * Deux absences comptent autant que les présences :
 *
 * - **le fil** : deux disques de 52 posés sur une conversation couvrent des
 *   bulles. iOS les retire pour cette raison, et c'est aussi la doctrine du
 *   rail des stories de cette application — « un bouton flottant qui masque
 *   le contenu qu'il commande n'est pas un bouton flottant, c'est un
 *   obstacle » (`story-rail.tsx:193`).
 * - **les écrans sans session** : offrir « Réglages » et « Profil » à qui
 *   n'est pas connecté mène à la garde de session, c'est-à-dire à un contrôle
 *   qui ne fait pas ce qu'il annonce.
 *
 * La liste est FERMÉE et le défaut est l'absence : une route ajoutée demain
 * ne verra pas les menus apparaître sans qu'on l'ait décidé. L'inverse — une
 * liste d'exclusions — aurait fait surgir les boutons sur chaque nouvel écran,
 * et une apparition non voulue se remarque bien plus tard qu'une absence.
 */
const ROUTES_WITH_MENUS: ReadonlySet<string> = new Set([
  'list',
  'feed',
  'links',
  'notifications',
  'calls',
  'discover',
  'communities',
  'settings',
  'profile',
]);

export function showsFloatingMenus(routeKey: string): boolean {
  return ROUTES_WITH_MENUS.has(routeKey);
}
