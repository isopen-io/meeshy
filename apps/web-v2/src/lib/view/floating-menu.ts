import type { GlyphName } from '@/components/glyphs';
import type { FloatingGlyphName } from '@/components/glyphs-floating';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { ROUTES } from '@/routes/route-table';

/**
 * **LA TABLE DES DESTINATIONS FLOTTANTES** (#6104, #6214) — miroir de
 * `apps/ios/Meeshy/Features/Main/Views/RootMenuLadderEntry.swift`.
 *
 * iOS porte ces entrées dans un `enum` dont `allCases` donne l'ordre, et dont
 * `RootMenuLadderEntryTests.swift:15-19` verrouille cet ordre. Ici c'est un
 * tableau gelé, gardé par le même témoin : **l'ordre est un fait de produit**,
 * pas une conséquence de l'écriture.
 *
 * **Pourquoi une table plutôt que du JSX dans le composant.** Trois
 * consommateurs en ont besoin et ils ne se chargent pas ensemble : l'échelle
 * (le chunk des menus), les huit écrans d'attente (chacun dans le chunk de sa
 * route), et le témoin qui prouve qu'aucune destination ne ment. Écrite dans
 * le composant, la liste aurait été recopiée dans les écrans — et ce dépôt sait
 * où cela mène : trois pastilles de non-lus, trois ronds de chrome, trois
 * dessins pour un rôle.
 *
 * **Le Flux et le profil ne sont PAS des barreaux**, et les distinguer est la
 * moitié du relevé d'iOS. Le Flux est le bouton de GAUCHE en entier ; le profil
 * s'ouvre au second tap sur l'avatar du bouton de droite
 * (`RootView.swift:1570-1579`). Une table qui les rangerait avec les six
 * inventerait deux portes que le produit n'a pas.
 */

/**
 * D'où vient le tracé. Les deux jeux ne se chargent pas de la même façon : le
 * SOCLE est toujours là, le jeu FLOTTANT voyage avec le chunk des menus. Un
 * simple `name: string` aurait laissé passer une faute de frappe jusqu'au
 * rendu ; l'union discriminée la fait rougir à la compilation.
 */
export type MenuGlyph =
  | { readonly set: 'socle'; readonly name: GlyphName }
  | { readonly set: 'flottant'; readonly name: FloatingGlyphName };

export type FloatingDestination = {
  /** L'identité de l'entrée — miroir du `case` iOS. */
  readonly key: string;
  /** La clé de `ROUTES`. Elle peut diverger de `key` : iOS ouvre les appels sur l'onglet d'un hub partagé. */
  readonly route: keyof typeof ROUTES;
  /**
   * Le NOM, par sa clé de catalogue d'interface (#6206) — jamais un texte : la
   * table est une donnée pure, chaque consommateur le traduit au rendu. Le
   * type n'admet que la famille `root.menu.*`, celle d'iOS.
   */
  readonly labelKey: Extract<InterfaceCatalogKey, `root.menu.${string}`>;
  /** Ce que l'écran d'attente promet. Une phrase qui manque fait passer « pas encore » pour « cassé ». */
  readonly promiseKey: Extract<InterfaceCatalogKey, `pending.${string}.promise`>;
  /** La teinte du barreau, reprise d'iOS à l'hexadécimal près. */
  readonly tint: string;
  readonly glyph: MenuGlyph;
};

/**
 * Chaque destination est une constante NOMMÉE, jamais une case de tableau.
 *
 * L'écran d'attente de chaque adresse en importe exactement une : par son
 * index, il aurait fallu écrire `MENU_LADDER[3]!` — un couplage à l'ordre, que
 * le témoin d'ordre a justement pour rôle de pouvoir changer, et un `!` que
 * `noUncheckedIndexedAccess` réclame sans rien garantir. Nommées, les huit se
 * découpent aussi : le chunk de `/calls` n'emporte pas les sept autres.
 */
export const LINKS_DESTINATION: FloatingDestination = {
  key: 'links',
  route: 'links',
  labelKey: 'root.menu.links',
  promiseKey: 'pending.links.promise',
  tint: '#F8B500',
  glyph: { set: 'socle', name: 'linkSimple' },
};

export const NOTIFICATIONS_DESTINATION: FloatingDestination = {
  key: 'notifications',
  route: 'notifications',
  labelKey: 'root.menu.notifications',
  promiseKey: 'pending.notifications.promise',
  tint: '#FF6B6B',
  glyph: { set: 'socle', name: 'bell' },
};

export const CALLS_DESTINATION: FloatingDestination = {
  key: 'calls',
  route: 'calls',
  labelKey: 'root.menu.calls',
  promiseKey: 'pending.calls.promise',
  tint: '#6366F1',
  glyph: { set: 'socle', name: 'phone' },
};

export const DISCOVER_DESTINATION: FloatingDestination = {
  key: 'discover',
  route: 'discover',
  labelKey: 'root.menu.discover',
  promiseKey: 'pending.discover.promise',
  tint: '#8B5CF6',
  glyph: { set: 'flottant', name: 'binoculars' },
};

export const COMMUNITIES_DESTINATION: FloatingDestination = {
  key: 'communities',
  route: 'communities',
  labelKey: 'root.menu.communities',
  promiseKey: 'pending.communities.promise',
  tint: '#2ECC71',
  glyph: { set: 'flottant', name: 'usersThree' },
};

export const SETTINGS_DESTINATION: FloatingDestination = {
  key: 'settings',
  route: 'settings',
  labelKey: 'root.menu.settings',
  promiseKey: 'pending.settings.promise',
  tint: '#64748B',
  glyph: { set: 'flottant', name: 'gear' },
};

/** Les SIX barreaux, dans l'ordre d'iOS. */
export const MENU_LADDER: readonly FloatingDestination[] = [
  LINKS_DESTINATION,
  NOTIFICATIONS_DESTINATION,
  CALLS_DESTINATION,
  DISCOVER_DESTINATION,
  COMMUNITIES_DESTINATION,
  SETTINGS_DESTINATION,
];

/** Le bouton de GAUCHE, en entier. */
export const FEED_DESTINATION: FloatingDestination = {
  key: 'feed',
  route: 'feed',
  labelKey: 'root.menu.feed',
  promiseKey: 'pending.feed.promise',
  tint: '#F87171',
  glyph: { set: 'flottant', name: 'stack' },
};

/** Ce que le second tap sur l'avatar ouvre. */
export const PROFILE_DESTINATION: FloatingDestination = {
  key: 'profile',
  route: 'profile',
  labelKey: 'root.menu.profile',
  promiseKey: 'pending.profile.promise',
  tint: '#4F46E5',
  glyph: { set: 'socle', name: 'user' },
};

/**
 * Les HUIT. C'est cette fonction que le témoin de la loi 4 interroge — et elle
 * existe précisément parce qu'une énumération centrée sur l'échelle oublie les
 * deux destinations qui n'en font pas partie, qui sont aussi les deux plus
 * fréquentées.
 */
export function allFloatingDestinations(): readonly FloatingDestination[] {
  return [FEED_DESTINATION, ...MENU_LADDER, PROFILE_DESTINATION];
}
