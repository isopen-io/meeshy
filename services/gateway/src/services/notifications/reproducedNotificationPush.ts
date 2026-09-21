import {
  REPRODUCED_PUSH_FIELD,
  REPRODUCED_PUSH_VALUE,
} from '@meeshy/shared/types/reproduced-notification-push';

/**
 * La carte `data` du push NOMINAL d'une notification réécrite
 * (`NotificationService.pushReproducedNotification`).
 *
 * Les clés de routage sont celles du push de création, relues sur la ligne
 * RELUE — seule source du texte d'après. Une de plus : le push se DÉCLARE
 * correction (`REPRODUCED_PUSH_FIELD`, #7342). iOS et Android n'en ont pas
 * besoin, un push de révocation retire d'abord la bannière d'avant ; le web ne
 * le reçoit pas (`NOTIFICATION_REVOCATION_PUSH_PLATFORMS`), et sans cette
 * déclaration son service worker prenait la version d'après pour un doublon
 * de la bannière encore affichée — et l'écartait.
 *
 * Posé sans condition sur ce chemin : ce qu'il affirme — « cette notification
 * existait déjà, voici son texte corrigé » — y est toujours vrai. Décider s'il
 * y a une bannière à remplacer appartient au client, le seul qui voit sa barre
 * de notifications.
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
  return {
    notificationId: typeof row.id === 'string' ? row.id : '',
    ...(unreadBadge !== undefined ? { unreadCount: String(unreadBadge) } : {}),
    type: String(row.type ?? ''),
    conversationId: read('conversationId'),
    messageId: read('messageId'),
    postId: read('postId'),
    commentId: read('commentId'),
    parentCommentId: read('parentCommentId'),
    [REPRODUCED_PUSH_FIELD]: REPRODUCED_PUSH_VALUE,
  };
}
