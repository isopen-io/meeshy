package me.meeshy.sdk.model.push

/**
 * Le verrou PIN protège le CONTENU d'une bannière : miroir de `NSEAttachmentPolicy.sealingLockedConversation` (iOS).
 *
 * La charge d'une conversation verrouillée ne garde QUE ce qui route (conversation, message, contenu), date, compte et
 * nomme l'expéditeur, et DÉCLARE une protection ([LOCKED_LOC_KEY]) : texte, aperçu, média, avatar et actions la
 * respectent alors par [PushPayload.mediaMayTravel], sans connaître le verrou. Une liste d'ADMISSION, jamais
 * d'exclusion : une clé de contenu qu'une passerelle future ajoutera est refusée par défaut.
 */
public object PushConversationLockSeal {

    /** La clé du libellé d'une conversation verrouillée — la même que celle de la NSE iOS. */
    public const val LOCKED_LOC_KEY: String = "notification.locked_conversation"

    private const val LOC_KEY = "notificationLocKey"

    private val ADMITTED = setOf(
        "type", "notificationId", "conversationId", "conversationTitle", "conversationType", "messageId",
        "postId", "postType", "commentId", "parentCommentId", "route", "communityId", "contentId", "contentType",
        "senderId", "senderUsername", "senderDisplayName", "title",
        "unreadCount", "conversationUnread", "createdAt", "ephemeralDuration", "effectFlags",
        "replacesNotificationId", "replacesActorSubject", "recipientUserId", "conversationEncryptionMode",
    )

    public fun seal(data: Map<String, String>): Map<String, String> =
        data.filterKeys(ADMITTED::contains) + (LOC_KEY to LOCKED_LOC_KEY)

    public fun isSealed(payload: PushPayload): Boolean = payload.notificationLocKey == LOCKED_LOC_KEY
}
