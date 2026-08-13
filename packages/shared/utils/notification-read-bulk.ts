import type {
  NotificationDeletedBulkScope,
  NotificationReadBulkContextKey,
  NotificationReadBulkScope,
} from '../types/notification.js';

/**
 * Ce qu'un client doit connaître d'une ligne de son cache pour rejouer le
 * prédicat d'un `notification:read-bulk`. Volontairement plus permissif que
 * `Notification` : le web tient des lignes React Query, iOS des lignes GRDB, et
 * la NSE des lignes reconstruites depuis un payload push — toutes portent au
 * moins ces deux champs, aucune ne porte la même classe.
 */
export type NotificationReadBulkCandidate = {
  readonly type?: string | null;
  readonly context?:
    | Partial<Record<NotificationReadBulkContextKey, string | null | undefined>>
    | null;
};

/**
 * Énoncé UNIQUE du prédicat d'un marquage en masse — celui que la gateway a
 * appliqué en base et que chaque client doit rejouer à l'identique sur son
 * cache. Deux réécritures locales dériveraient l'une de l'autre, et la ligne
 * resterait non lue sur un appareil et lue sur l'autre.
 *
 * Ne dit RIEN des compteurs : `notification:counts`, émis juste après, reste
 * autoritatif. Un cache partiel matche moins de lignes que le serveur n'en a
 * marquées — décrémenter d'après ce prédicat ferait dériver le badge.
 */
export const notificationMatchesReadBulkScope = (
  scope: NotificationReadBulkScope,
  notification: NotificationReadBulkCandidate
): boolean => {
  if (scope.kind === 'all') {
    return true;
  }

  if (scope.kind === 'context') {
    return notification.context?.[scope.contextKey] === scope.contextValue;
  }

  if (scope.kind === 'types') {
    return typeof notification.type === 'string' && scope.types.includes(notification.type);
  }

  // Scope annoncé par un serveur plus récent que ce client. Ne rien marquer est
  // le seul repli sûr : marquer trop retire de la cloche des lignes encore non
  // lues, alors que ne rien marquer laisse `notification:counts` recaler le
  // badge et le prochain refetch recaler les lignes.
  return false;
};

/**
 * Ce qu'un client doit connaître d'une ligne de son cache pour rejouer le
 * prédicat d'un `notification:deleted-bulk`. Même permissivité que son
 * homologue de lecture, sur l'autre champ : la purge interroge l'ÉTAT DE
 * LECTURE, pas le type ni le contexte.
 */
export type NotificationDeletedBulkCandidate = {
  readonly state?: { readonly isRead?: boolean | null } | null;
};

/**
 * Énoncé UNIQUE du prédicat d'une purge en masse — celui que la gateway a
 * appliqué en base (`deleteMany({ userId, isRead: true })`) et que chaque
 * client rejoue sur son cache.
 *
 * Ne touche à AUCUN compteur, et ici ce n'est pas une précaution mais une
 * conséquence : toute ligne matchée est lue, donc n'a jamais été comptée dans
 * `unread`. Tout décrément déduit d'ici serait un bug.
 */
export const notificationMatchesDeletedBulkScope = (
  scope: NotificationDeletedBulkScope,
  notification: NotificationDeletedBulkCandidate
): boolean => {
  if (scope.kind === 'read') {
    return notification.state?.isRead === true;
  }

  // Scope annoncé par un serveur plus récent que ce client. Ne rien retirer est
  // le seul repli sûr : retirer trop fait disparaître des lignes qui ne
  // reviendront qu'au prochain refetch complet.
  return false;
};
