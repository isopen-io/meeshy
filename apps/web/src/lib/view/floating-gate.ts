import { splitPaneOf } from './split-query';

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

/**
 * **OÙ LES MENUS SE POSENT** (#10117). La liste ci-dessus répond pour UN écran
 * plein cadre. Dans le cadre côte à côte (dès 1024 px, `split-query.ts`), la
 * liste reste montée à gauche du fil : les disques vivent dans SA colonne, sur
 * `/chats` comme sur `/c/:id`. Une conversation ouverte ne les retire donc
 * plus, et ils ne se posent jamais sur le volet du fil — ni sur son en-tête,
 * ni sur son composeur, la raison pour laquelle le téléphone les retire.
 *
 * `screen` : la coquille les pose sur la fenêtre (`shell.tsx`) ;
 * `list-column` : le cadre les pose dans la colonne de la liste
 * (`routes/split-frame.tsx`) ; `null` : nulle part. Une seule règle pour les
 * deux hôtes, celle qui décide du cadre : jamais deux couches à la fois.
 */
export type FloatingMenusHost = 'screen' | 'list-column';

export function floatingMenusHost(frame: {
  readonly routeKey: string;
  readonly wide: boolean;
  readonly guest: boolean;
}): FloatingMenusHost | null {
  if (splitPaneOf(frame) !== null) return 'list-column';
  return showsFloatingMenus(frame.routeKey) ? 'screen' : null;
}

/**
 * **UN VOLET DES RÉGLAGES EST UN ÉCRAN PROFOND** (#10748) — `/settings?volet=…`
 * (packs, sécurité…) porte son propre en-tête et son retour ; les deux disques
 * y recouvraient la ligne de solde de la vitrine à 390 px. Même doctrine que
 * le fil (`Router.swift:274-276`) : un bouton flottant qui masque le contenu
 * qu'il commande est un obstacle. La clé rendue sort de la liste fermée.
 */
export function floatingMenusRouteKey(route: { readonly key: string; readonly search: { get(name: string): string | null } }): string {
  return route.key === 'settings' && route.search.get('volet') !== null ? 'settings:volet' : route.key;
}
