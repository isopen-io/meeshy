import {
  REPLACES_ACTOR_SUBJECT_FIELD,
  REPLACES_ACTOR_SUBJECT_VALUE,
  REPLACES_NOTIFICATION_FIELD,
  REPRODUCED_PUSH_FIELD,
  REPRODUCED_PUSH_VALUE,
} from '@meeshy/shared/types/reproduced-notification-push';
import { retractedNotificationOf, type RetractedNotification } from './retractedNotifications';

/**
 * La carte `data` du push NOMINAL d'une notification réécrite
 * (`NotificationService.pushReproducedNotification`).
 *
 * Les clés de routage sont celles du push de création, relues sur la ligne
 * RELUE — seule source du texte d'après. Deux de plus :
 *
 *  - `REPRODUCED_PUSH_FIELD` (#7342) : le push se DÉCLARE correction. Le web ne
 *    reçoit pas la révocation (`NOTIFICATION_REVOCATION_PUSH_PLATFORMS`), et
 *    sans cette déclaration son service worker prenait la version d'après pour
 *    un doublon de la bannière encore affichée — et l'écartait.
 *  - `REPLACES_NOTIFICATION_FIELD` : la bannière qu'il ANNULE, nommée par
 *    l'identité de la ligne. L'extension iOS la retire avant d'afficher ; c'est
 *    ce qui remplace la révocation silencieuse, dont APNs ne garantit ni
 *    l'ordre ni la livraison.
 *
 * Posés sans condition sur ce chemin : ce qu'ils affirment — « cette
 * notification existait déjà, voici son texte corrigé » — y est toujours vrai.
 * Décider s'il y a une bannière à remplacer appartient au client, le seul qui
 * voit sa barre de notifications.
 */
export function reproducedPushData(
  row: Readonly<Record<string, unknown>>,
  unreadBadge: number | undefined
): Readonly<Record<string, string>> & { readonly conversationId: string; readonly messageId: string } {
  const context = row.context !== null && typeof row.context === 'object' ? (row.context as Record<string, unknown>) : {};
  const read = (key: string): string => {
    const value = context[key];
    return typeof value === 'string' ? value : '';
  };
  const notificationId = typeof row.id === 'string' ? row.id : '';
  return {
    notificationId,
    ...(unreadBadge !== undefined ? { unreadCount: String(unreadBadge) } : {}),
    type: String(row.type ?? ''),
    conversationId: read('conversationId'),
    messageId: read('messageId'),
    postId: read('postId'),
    commentId: read('commentId'),
    parentCommentId: read('parentCommentId'),
    [REPRODUCED_PUSH_FIELD]: REPRODUCED_PUSH_VALUE,
    [REPLACES_NOTIFICATION_FIELD]: notificationId,
  };
}

/** Le transport rend un résultat par jeton : au moins un succès = une bannière posée. */
export function pushReachedADevice(results: unknown): boolean {
  return Array.isArray(results) && results.some((result) => (result as { success?: boolean } | null)?.success === true);
}

/**
 * La bannière PÉRIMÉE d'une ligne reproduite, telle que la révocation la lit.
 *
 * Ligne disparue entre la réécriture et l'annonce : on ne sait plus si un push
 * était parti, et la révocation est un signal silencieux sans effet là où rien
 * n'est affiché — on la croit livrée. Ligne présente : son propre
 * `delivery.pushSent` décide, et la révocation n'est qu'un REPLI, envoyé
 * seulement quand le remplacement n'a atteint aucun appareil.
 */
export function staleBannerOf(
  id: string,
  userId: string,
  row: Readonly<Record<string, unknown>> | null
): RetractedNotification {
  if (!row) return { id, userId, pushSent: true };
  return retractedNotificationOf({ id, userId, type: row.type, context: row.context, delivery: row.delivery });
}

/**
 * Les types dont le push REMPLACE la bannière du même acteur sur le même sujet
 * (`REPLACES_ACTOR_SUBJECT_FIELD`). Changer sa réaction retire une ligne et en
 * crée une autre : aucune identité commune à nommer, donc c'est le triplet
 * type · acteur · sujet qui désigne la bannière d'avant.
 */
const ACTOR_SUBJECT_REPLACING_TYPES: ReadonlySet<string> = new Set([
  'message_reaction',
  'post_like',
  'story_reaction',
  'status_reaction',
  'comment_like',
  'comment_reaction',
]);

export function actorSubjectReplacementPushField(type: string): Readonly<Record<string, string>> {
  return ACTOR_SUBJECT_REPLACING_TYPES.has(type) ? { [REPLACES_ACTOR_SUBJECT_FIELD]: REPLACES_ACTOR_SUBJECT_VALUE } : {};
}
