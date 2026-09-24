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
 * **Pourquoi une table plutôt que du JSX dans le composant.** Deux
 * consommateurs en ont besoin et ils ne se chargent pas ensemble : l'échelle
 * (le chunk des menus) et le témoin qui prouve qu'aucune destination ne ment.
 * Écrite dans le composant, la liste aurait été recopiée ailleurs — et ce
 * dépôt sait où cela mène : trois pastilles de non-lus, trois ronds de
 * chrome, trois dessins pour un rôle.
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
  | { readonly set: 'flottant'; readonly name: FloatingGlyphName }
  /** Les trois traits de Meeshy (`BrandMark`) — le glyphe du disque de gauche posé sur le Flux (#6456). */
  | { readonly set: 'marque' };

export type FloatingDestination = {
  /** L'identité de l'entrée — miroir du `case` iOS. */
  readonly key: string;
  /** La clé de `ROUTES`. Elle peut diverger de `key` : iOS ouvre les appels sur l'onglet d'un hub partagé. */
  readonly route: keyof typeof ROUTES;
  /**
   * Le NOM, par sa clé de catalogue d'interface (#6206) — jamais un texte : la
   * table est une donnée pure, chaque consommateur le traduit au rendu. Le
   * type n'admet que la famille `root.menu.*`, celle d'iOS — et `admin.title`,
   * le nom que l'écran d'administration et la rangée des Réglages portent déjà
   * (#6458) : une clé `root.menu.admin` aurait été une seconde écriture du
   * même mot, libre de diverger dans l'une des sept langues.
   */
  readonly labelKey: Extract<InterfaceCatalogKey, `root.menu.${string}` | 'admin.title'>;
  /** La teinte du barreau, reprise d'iOS à l'hexadécimal près — ou un jeton de sa palette dérivée. */
  readonly tint: string;
  readonly glyph: MenuGlyph;
  /**
   * Le compteur VIVANT que le barreau porte en pastille — miroir de
   * `RootMenuLadderEntry.badge` (`RootMenuLadderEntry.swift:78-84`), et comme
   * lui DEUX : `unreadNotifications` sur « Notifications » (#6219), et
   * `pendingFriendRequests` sur « Découvrir » (#6321), arrivé avec sa source —
   * le panier des demandes reçues de `friend-requests.ts` (#6363). La table
   * reste pure : c'est l'échelle qui résout la valeur au rendu.
   */
  readonly badge?: 'unreadNotifications' | 'pendingFriendRequests';
};

/**
 * Chaque destination est une constante NOMMÉE, jamais une case de tableau —
 * un accès par index aurait fallu écrire `MENU_LADDER[3]!` : un couplage à
 * l'ordre, que le témoin d'ordre a justement pour rôle de pouvoir changer, et
 * un `!` que `noUncheckedIndexedAccess` réclame sans rien garantir.
 */
export const LINKS_DESTINATION: FloatingDestination = {
  key: 'links',
  route: 'links',
  labelKey: 'root.menu.links',
  tint: '#F8B500',
  glyph: { set: 'socle', name: 'linkSimple' },
};

export const NOTIFICATIONS_DESTINATION: FloatingDestination = {
  key: 'notifications',
  route: 'notifications',
  labelKey: 'root.menu.notifications',
  tint: '#FF6B6B',
  glyph: { set: 'socle', name: 'bell' },
  badge: 'unreadNotifications',
};

export const CALLS_DESTINATION: FloatingDestination = {
  key: 'calls',
  route: 'calls',
  labelKey: 'root.menu.calls',
  tint: '#6366F1',
  glyph: { set: 'socle', name: 'phone' },
};

export const DISCOVER_DESTINATION: FloatingDestination = {
  key: 'discover',
  route: 'discover',
  labelKey: 'root.menu.discover',
  tint: '#8B5CF6',
  glyph: { set: 'flottant', name: 'binoculars' },
  badge: 'pendingFriendRequests',
};

export const COMMUNITIES_DESTINATION: FloatingDestination = {
  key: 'communities',
  route: 'communities',
  labelKey: 'root.menu.communities',
  tint: '#2ECC71',
  glyph: { set: 'flottant', name: 'usersThree' },
};

export const SETTINGS_DESTINATION: FloatingDestination = {
  key: 'settings',
  route: 'settings',
  labelKey: 'root.menu.settings',
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

/**
 * **L'ESPACE D'ADMINISTRATION** (#6458) — une EXTENSION WEB assumée : iOS n'a
 * pas d'administration, et `RootMenuLadderEntry.swift` n'a donc pas ce `case`.
 *
 * - **Le nom** est `admin.title`, celui de l'écran et de la rangée des
 *   Réglages ; **le glyphe** est `key`, celui de la même rangée — « même mot,
 *   même icône » (dimension 6), et zéro octet de plus : `key` vit au socle.
 * - **La teinte** est un jeton de la palette dérivée d'iOS, l'indigo profond de
 *   la marque : la famille de la rangée des Réglages (`--color-ios-brand`),
 *   assez sombre pour ne pas se confondre avec « Appels » (indigo 500) au coin
 *   de l'œil.
 * - **La place** est la DERNIÈRE, et c'est une décision écrite dans
 *   `decisions.md` : les six barreaux d'iOS gardent leur rang, donc leur place
 *   sous le doigt, et la destination la plus rare est la plus lointaine.
 */
export const ADMIN_DESTINATION: FloatingDestination = {
  key: 'admin',
  route: 'admin',
  labelKey: 'admin.title',
  tint: 'var(--ios-indigo-800)',
  glyph: { set: 'socle', name: 'key' },
};

/**
 * **L'échelle que CE lecteur voit.** Sans le droit, `MENU_LADDER` lui-même —
 * la même référence, les six d'iOS ; avec le droit servi, les six puis
 * l'administration. Le barreau n'est jamais monté puis masqué : un lien caché
 * resterait dans le parcours de tabulation.
 */
export function menuLadderFor({ canAccessAdmin }: { readonly canAccessAdmin: boolean }): readonly FloatingDestination[] {
  return canAccessAdmin ? [...MENU_LADDER, ADMIN_DESTINATION] : MENU_LADDER;
}

/** Le bouton de GAUCHE, hors du Flux. */
export const FEED_DESTINATION: FloatingDestination = {
  key: 'feed',
  route: 'feed',
  labelKey: 'root.menu.feed',
  tint: '#F87171',
  glyph: { set: 'flottant', name: 'stack' },
};

/**
 * **Le bouton de GAUCHE, sur le Flux** (#6456) — il ramène aux conversations.
 * Le glyphe est la marque : iOS peint `AnimatedLogoView` dans ce disque quand
 * `showFeed` est vrai (`RootView.swift:1620-1625`) ; le nom reprend les
 * valeurs de `tab.conversations` d'iOS dans les sept langues.
 */
export const CONVERSATIONS_DESTINATION: FloatingDestination = {
  key: 'conversations',
  route: 'list',
  labelKey: 'root.menu.conversations',
  tint: '#F87171',
  glyph: { set: 'marque' },
};

/**
 * **OÙ LE TAP DU DISQUE DE GAUCHE MÈNE** — `showFeed.toggle()`
 * (`RootView.swift:1557-1565`). Sur le Flux, aux conversations ; partout
 * ailleurs où les disques paraissent, au Flux. Le nom et le glyphe se lisent
 * sur la destination rendue : ils disent où l'on va, jamais où l'on est.
 */
export function feedDiscDestination(routeKey: string): FloatingDestination {
  return routeKey === FEED_DESTINATION.route ? CONVERSATIONS_DESTINATION : FEED_DESTINATION;
}

/** Ce que le second tap sur l'avatar ouvre. */
export const PROFILE_DESTINATION: FloatingDestination = {
  key: 'profile',
  route: 'profile',
  labelKey: 'root.menu.profile',
  tint: '#4F46E5',
  glyph: { set: 'socle', name: 'user' },
};

/**
 * Les DIX. C'est cette fonction que le témoin de la loi 4 interroge — et elle
 * existe précisément parce qu'une énumération centrée sur l'échelle oublie les
 * destinations qui n'en font pas partie : les deux faces du disque de gauche,
 * le profil, et celle qui n'y paraît que pour qui administre.
 */
export function allFloatingDestinations(): readonly FloatingDestination[] {
  return [FEED_DESTINATION, CONVERSATIONS_DESTINATION, ...MENU_LADDER, ADMIN_DESTINATION, PROFILE_DESTINATION];
}
