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
 *
 * **Le legacy ne sert QUE la production — jamais staging (#6354, D-67).**
 * `LEGACY_ORIGIN` est une constante ABSOLUE, posée une fois pour toutes ; un
 * build dont la passerelle (`apiConfig.base`) n'est pas celle de production
 * pointerait donc, sans garde, vers la production RÉELLE — mesuré sur
 * l'émulateur Android d'une coque de staging : la rangée « Supprimer le
 * compte » ouvrait `https://meeshy.me/account/deletion`, potentiellement sous
 * un tout autre compte que celui de staging. `legacyReachable` est le SEUL
 * test : un appelant qui rendrait `legacyHref` sans le consulter d'abord
 * rejoue le défaut. Il n'existe pas de legacy de staging à offrir à la place
 * (`legacy.staging.meeshy.me` / `app.staging.meeshy.me` /
 * `v1.staging.meeshy.me` ne répondent pas) : la seule réponse fail-closed est
 * de ne rendre AUCUN lien hors production.
 */

import { PRODUCTION_ORIGIN } from '@/lib/api/config';

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

/**
 * Prend `apiConfig.base` en PARAMÈTRE plutôt que de le lire — même motif que
 * `resolveApiConfig(env)` : une loi pure, testable sans construction.
 */
export function legacyReachable(apiBase: string): boolean {
  return apiBase === PRODUCTION_ORIGIN;
}
