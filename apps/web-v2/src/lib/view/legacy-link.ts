/**
 * **LES RÉGLAGES QUE LA V2.0 NE PORTE PAS ENCORE RESTENT ATTEIGNABLES** (#5563).
 *
 * « Un réglage qu'on ne trouve plus est un réglage perdu, pas un réglage
 * reporté. » Sécurité, réglages fins des médias et des messages, options de
 * notification et de confidentialité au-delà des bascules portées, export de
 * données, suppression de compte : chacun a une adresse dans le legacy, qui sert
 * la production.
 *
 * **L'origine est ABSOLUE** (`https://meeshy.me`) : une adresse relative
 * mènerait, sur staging (qui ne sert que la v2.0) et dans les coques Capacitor
 * (dont l'origine est locale), à la page introuvable de l'application.
 *
 * **Les onglets du legacy s'ouvrent par leur FRAGMENT** : sa page de réglages
 * lit l'onglet dans `location.hash` (`apps/web/app/settings/page.tsx`, écouteur
 * `hashchange`) ; la suppression de compte a sa page à elle
 * (`apps/web/app/account/deletion`), obligation réglementaire.
 */

export const LEGACY_ORIGIN = 'https://meeshy.me';

const PATHS = {
  security: '/settings#security',
  privacy: '/settings#privacy',
  notification: '/settings#notification',
  media: '/settings#media',
  message: '/settings#message',
  accountDeletion: '/account/deletion',
} as const;

export type LegacyDestination = keyof typeof PATHS;

export const LEGACY_DESTINATIONS = Object.keys(PATHS) as readonly LegacyDestination[];

export function legacyHref(destination: LegacyDestination): string {
  return `${LEGACY_ORIGIN}${PATHS[destination]}`;
}
