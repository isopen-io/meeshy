/**
 * **LA BANNIÈRE DU WEB LEGACY — un LIAGE, plus une loi.**
 *
 * Les 233 lignes de règles qui vivaient ici sont remontées dans
 * `@meeshy/shared/utils/notification-banner` (#4454) : elles avaient DEUX
 * auteurs (ici et `NotificationBannerPresentation` côté iOS) et en gagnaient un
 * TROISIÈME avec `apps/web-v3`. Une règle écrite trois fois diverge trois fois ;
 * l'issue le dit en toutes lettres — « le lot commence par remonter la loi web,
 * pas par la recopier ».
 *
 * CE QUI RESTE ICI, ET RIEN D'AUTRE : les trois conventions de FORMULATION de
 * ce client — comment il nomme un acteur inconnu, comment il résume une pièce
 * jointe, ce qu'il dit quand le serveur n'a servi aucune phrase. Elles portent
 * des littéraux de langue et des types propres à cette application ; les
 * remonter aurait fait de la loi partagée un module d'interface déguisé.
 *
 * **L'API PUBLIQUE DE CE MODULE NE CHANGE PAS D'UN CARACTÈRE.** Ses appelants
 * — et ses seize témoins — ne voient aucune différence : c'est ce qui prouve
 * que le déplacement n'a rien changé au comportement.
 */

import {
  buildNotificationBanner as loiDeLaBanniere,
  buildNotificationBannerBody as loiDuCorps,
  buildNotificationHeadline as loiDuTitre,
  notificationBannerFraming,
  type ConventionsDuClient,
  type NotificationBanner,
} from '@meeshy/shared/utils/notification-banner';

import type { Notification } from '@/types/notification';

import {
  buildNotificationTitle,
  formatMessagePreview,
  getActorDisplayName,
} from './notification-helpers';

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

export { notificationBannerFraming };
export type { NotificationBanner };

/**
 * LES CONVENTIONS DE CE CLIENT, liées UNE fois. Les passer à chaque appel
 * aurait fait de chaque site d'appel une occasion d'en oublier une.
 */
const CONVENTIONS: ConventionsDuClient = {
  nomDeLActeur: (acteur) => getActorDisplayName(acteur as Notification['actor']),
  apercuDeMessage: (contenu, piecesJointes) =>
    formatMessagePreview(contenu, piecesJointes as unknown[] | undefined),
  titreDeRepli: (notification, t) => buildNotificationTitle(notification as Notification, t),
};

export function buildNotificationHeadline(
  notification: Notification,
  t: TranslateFunction,
  groupName?: string | null,
): string {
  return loiDuTitre(notification, t, CONVENTIONS, groupName);
}

export function buildNotificationBannerBody(
  notification: Notification,
  t: TranslateFunction,
): string | null {
  return loiDuCorps(notification, t, CONVENTIONS);
}

export {
  buildNotificationReactionBadge,
  buildNotificationThumbnail,
} from '@meeshy/shared/utils/notification-banner';

export function buildNotificationBanner(
  notification: Notification,
  t: TranslateFunction,
  options?: { readonly groupName?: string | null },
): NotificationBanner {
  return loiDeLaBanniere(notification, t, CONVENTIONS, options);
}
