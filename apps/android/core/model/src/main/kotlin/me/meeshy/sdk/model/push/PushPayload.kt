package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.EndToEndRegime

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
    /** Le discriminant que la famille `friend_new_*` expédie à la place de `postType` (iOS `NotificationContentRouter`). */
    val contentType: String? = null,
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
    /** `direct` / `group` / ... : distingue message direct et de groupe pour la table du Focus. */
    val conversationType: String? = null,
    /** Titre de la conversation (groupe) : la gateway le sert déjà dans la langue du lecteur. */
    val conversationTitle: String? = null,
    val senderUsername: String? = null,
    val senderDisplayName: String? = null,
    val senderAvatar: String? = null,
    /** Le compte que la passerelle vise (#13567) ; absent d'une passerelle antérieure. */
    val recipientUserId: String? = null,
    /** Le média inline tel qu'il part sur le fil (`push-media-fields.ts`) : adresse, mime, durée, taille. */
    val attachmentUrl: String? = null,
    val attachmentMimeType: String? = null,
    val attachmentDurationMs: Long? = null,
    val attachmentFileSize: Long? = null,
    /** La photo de l'acteur, sous le nom que la passerelle lui donne pour iOS (`imageURL`). */
    val imageUrl: String? = null,
    /** Le mode servi de la conversation (`e2ee` / `server` / `hybrid`, #14669) ; absent pour le clair ou d'une passerelle antérieure. */
    val conversationEncryptionMode: String? = null,
) {
    /**
     * #13794 — la conversation que ce push apprend chiffrée de bout en bout, au même titre que la mémoire locale : le mode
     * servi ne peut qu'AJOUTER le bout en bout au registre, jamais l'en retirer (#12949). `null` pour tout autre mode.
     */
    val teachesEndToEndTo: String?
        get() = conversationId?.takeIf { EndToEndRegime.isEndToEnd(conversationEncryptionMode) }

    /**
     * Le média peut-il voyager jusqu'à la bannière ? Une protection déclarée
     * (`notificationLocKey` présent, drapeau de cycle de vie dans `effectFlags`) ou une
     * durée éphémère interdit pièce, image et transcription — miroir de
     * `NSEAttachmentPolicy.declaresProtection`.
     */
    val mediaMayTravel: Boolean
        get() = notificationLocKey == null &&
            ((effectFlags ?: 0) and LIFECYCLE_FLAGS_MASK) == 0 &&
            (ephemeralDuration ?: 0) <= 0

    /** La conversation est-elle directe (un à un) ? Inconnu ⇒ groupe, comme iOS. */
    val isDirectConversation: Boolean
        get() = conversationType.equals("direct", ignoreCase = true)

    public companion object {
        private const val LIFECYCLE_FLAGS_MASK = 0b111

        public fun decode(data: Map<String, String>): PushPayload {
            fun text(key: String): String? = data[key]?.takeIf { it.isNotBlank() }
            fun int(key: String): Int? = text(key)?.trim()?.toIntOrNull()
            fun long(key: String): Long? = text(key)?.trim()?.toLongOrNull()
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
                contentType = text("contentType"),
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
                conversationType = text("conversationType"),
                conversationTitle = text("conversationTitle"),
                senderUsername = text("senderUsername"),
                senderDisplayName = text("senderDisplayName"),
                senderAvatar = text("senderAvatar"),
                recipientUserId = text("recipientUserId"),
                attachmentUrl = text("attachmentUrl"),
                attachmentMimeType = text("attachmentMimeType"),
                attachmentDurationMs = long("attachmentDurationMs"),
                attachmentFileSize = long("attachmentFileSize"),
                imageUrl = text("imageURL"),
                conversationEncryptionMode = text("conversationEncryptionMode"),
            )
        }
    }
}
