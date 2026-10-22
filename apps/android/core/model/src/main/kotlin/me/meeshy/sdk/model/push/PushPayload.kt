package me.meeshy.sdk.model.push

/**
 * La charge `data` d'un push FCM, decodee UNE seule fois. FCM ne transporte que des
 * chaines : nombres et booleens arrivent en texte. Une cle absente, vide ou illisible
 * donne `null`, jamais une exception ; les cles inconnues sont ignorees (tolerance
 * ascendante). Miroir de ce que `NotificationService.swift` lit dans `userInfo`.
 */
public data class PushPayload(
    val notificationId: String? = null,
    val type: String? = null,
    val conversationId: String? = null,
    val messageId: String? = null,
    val senderId: String? = null,
    val postId: String? = null,
    val postType: String? = null,
    val commentId: String? = null,
    val parentCommentId: String? = null,
    val callId: String? = null,
    val title: String? = null,
    val body: String? = null,
    val subtitle: String? = null,
    val notificationLocKey: String? = null,
    val firstAttachmentUrl: String? = null,
    val thumbnailUrl: String? = null,
    val ephemeralDuration: Int? = null,
    val effectFlags: Int? = null,
    val replacesNotificationId: String? = null,
    val replacesActorSubject: String? = null,
    val unreadCount: Int? = null,
    val conversationUnread: Int? = null,
    val createdAt: String? = null,
    val isVideo: Boolean? = null,
) {
    public companion object {
        public fun decode(data: Map<String, String>): PushPayload {
            fun text(key: String): String? = data[key]?.takeIf { it.isNotBlank() }
            fun int(key: String): Int? = text(key)?.trim()?.toIntOrNull()
            fun bool(key: String): Boolean? = when (text(key)?.trim()?.lowercase()) {
                "true", "1" -> true
                "false", "0" -> false
                else -> null
            }
            return PushPayload(
                notificationId = text("notificationId"),
                type = text("type"),
                conversationId = text("conversationId"),
                messageId = text("messageId"),
                senderId = text("senderId"),
                postId = text("postId"),
                postType = text("postType"),
                commentId = text("commentId"),
                parentCommentId = text("parentCommentId"),
                callId = text("callId"),
                title = text("title"),
                body = text("body"),
                subtitle = text("subtitle"),
                notificationLocKey = text("notificationLocKey"),
                firstAttachmentUrl = text("firstAttachmentUrl"),
                thumbnailUrl = text("thumbnailUrl"),
                ephemeralDuration = int("ephemeralDuration"),
                effectFlags = int("effectFlags"),
                replacesNotificationId = text("replacesNotificationId"),
                replacesActorSubject = text("replacesActorSubject"),
                unreadCount = int("unreadCount"),
                conversationUnread = int("conversationUnread"),
                createdAt = text("createdAt"),
                isVideo = bool("isVideo"),
            )
        }
    }
}
