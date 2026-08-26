package me.meeshy.app.push

/**
 * Le push de CONTRÔLE `notification_revoked` — une bannière déjà livrée que le
 * serveur retire (réaction défaite, message / post / commentaire supprimé).
 * Data-only, donc TOUJOURS remis à `onMessageReceived`, app tuée comprise —
 * contrairement au push nominal, rendu par le système sans passer par l'app.
 *
 * Contrat (gateway `services/notifications/notificationRevocationPush.ts`,
 * partagé par iOS et le web) :
 *
 *   data.type            = "notification_revoked"
 *   data.notificationIds = "<id1>,<id2>,…"
 *   data.conversationIds = "<c1>,,<c3>"   — même ordre ; vide sans conversation ;
 *                                            absent si aucune ligne n'en porte
 *   data.types           = "new_message,message_reaction,…"  — même ordre ;
 *                          le TYPE de chaque ligne retirée, qui dit sous quel
 *                          index sa bannière a été posée. Absent d'un gateway
 *                          antérieur : on ne révoque alors QUE par notification.
 *
 * Pur et total : aucune dépendance Android, exécutable sur la JVM.
 */
data class NotificationRevocation(
    val notificationIds: List<String>,
    /** Alignée sur [notificationIds] quand présente ; `""` sans conversation. */
    val conversationIds: List<String>,
    /** Alignée sur [notificationIds] quand présente ; `""` quand le type est inconnu. */
    val types: List<String>,
) {
    /**
     * Les ids `NotificationManager` à annuler : celui de CHAQUE notification, et
     * celui d'une conversation UNIQUEMENT quand la ligne retirée est de ces
     * types qui indexent leur bannière par conversation
     * ([ConversationIndexedNotifications]).
     *
     * Sans cette condition, révoquer une réaction — qui porte le
     * `conversationId` du message réagi — annulait la bannière du DERNIER
     * message de cette conversation : un message valide, jamais lu, que plus
     * rien ne rappelle. Annuler un id absent, lui, est un no-op.
     *
     * Reste assumé, et seulement pour un ARRIVAGE de message : annuler la
     * conversation retire aussi la bannière d'un message PLUS RÉCENT du même
     * fil, puisque c'est le même index — c'est le prix du remplacement par
     * conversation, et il ne se paie plus que là où ce remplacement a lieu.
     */
    fun notificationManagerIds(): List<Int> {
        val byNotification = notificationIds.map(MessageNotificationId::forNotification)
        val byConversation = notificationIds.indices.mapNotNull { index ->
            MessageNotificationId.forConversation(
                type = types.getOrNull(index),
                conversationId = conversationIds.getOrNull(index),
            )
        }
        return (byNotification + byConversation).distinct()
    }
}

object NotificationRevocationParser {
    const val TYPE = "notification_revoked"

    /** `null` pour toute autre charge, ou une révocation sans id. */
    fun parse(data: Map<String, String>): NotificationRevocation? {
        if (data["type"] != TYPE) return null
        val ids = data["notificationIds"]?.split(',')?.filter { it.isNotEmpty() }.orEmpty()
        if (ids.isEmpty()) return null
        val conversations = data["conversationIds"]?.split(',').orEmpty()
        val types = data["types"]?.split(',').orEmpty()
        return NotificationRevocation(notificationIds = ids, conversationIds = conversations, types = types)
    }
}

/**
 * Les types de notification dont la bannière REMPLACE la précédente de la même
 * conversation — un vrai NOUVEL ARRIVAGE de message, le seul cas où l'écrasement
 * est le comportement voulu (une conversation = une bannière, la plus récente).
 *
 * Tout le reste porte pourtant un `conversationId` non vide dès que son objet
 * vit dans une conversation : le gateway pose
 * `data.conversationId = context.conversationId || ''` pour TOUS les types
 * (`NotificationService.createNotification`), réactions et mentions comprises.
 * Les indexer par conversation leur ferait partager l'index du message courant
 * — deux bannières qui s'écrasent, et une révocation qui détruit la mauvaise.
 *
 * Source des valeurs : `NotificationTypeEnum` (`packages/shared/types/notification.ts`),
 * produites par `createMessageNotification` (`new_message`) et
 * `createReplyNotification` (`message_reply`). Une MENTION n'en est pas : sa
 * bannière nomme la mention, pas le fil, et le serveur la révoque à part.
 */
object ConversationIndexedNotifications {
    private val TYPES = setOf("new_message", "message_reply")

    fun replacesBannerOfItsConversation(type: String?): Boolean = type != null && type in TYPES
}

/**
 * L'index `NotificationManager` d'une bannière — le SEUL site qui le calcule,
 * pour que l'affichage (`showNotification`) et la révocation annulent le même.
 *
 * La conversation d'abord, mais SEULEMENT pour un arrivage de message : sa
 * bannière remplace la précédente du même fil. Sinon la notification elle-même,
 * y compris quand la charge porte une conversation — sans quoi une réaction, un
 * commentaire ou une mention s'écraseraient mutuellement avec le message
 * courant. Un `notificationId` absent (charge d'un gateway antérieur) retombe
 * sur `0`, comme avant.
 */
object MessageNotificationId {
    fun of(type: String?, conversationId: String?, notificationId: String?): Int =
        forConversation(type, conversationId) ?: forNotification(notificationId)

    /** `null` quand ce type n'indexe PAS sa bannière par conversation. */
    fun forConversation(type: String?, conversationId: String?): Int? = conversationId
        ?.takeIf { it.isNotBlank() && ConversationIndexedNotifications.replacesBannerOfItsConversation(type) }
        ?.hashCode()

    fun forNotification(notificationId: String?): Int =
        notificationId?.takeIf { it.isNotBlank() }?.hashCode() ?: 0
}
