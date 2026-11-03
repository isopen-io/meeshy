package me.meeshy.sdk.model.push

/** Un message nommé par un push : la conversation qui le porte et son identifiant. */
public data class PushMessageRef(val conversationId: String, val messageId: String)

/**
 * Ce que l'arrivée d'un push autorise à précharger, décidé en pur : le message à rapatrier, le post social à rapatrier,
 * l'accusé de remise à poster. Vide ⇒ le push n'écrit rien.
 */
public data class PushPrefetchPlan(
    val message: PushMessageRef? = null,
    val postId: String? = null,
    val deliveryReceipt: PushMessageRef? = null,
) {
    public val isEmpty: Boolean get() = message == null && postId == null && deliveryReceipt == null
}

/**
 * La loi du préchargement d'un push (miroir de `NotificationPayloadHelpers.messageArrivalTypes`,
 * `deliveryReceiptTypes` et de `NotificationService.socialPostTypes`, iOS).
 *
 * Seul un message qui ARRIVE chez ce destinataire (message, réponse, transfert, mention) est pré-enregistré : une
 * réaction porte un `messageId` mais désigne un message RÉAGI, souvent écrit par le destinataire lui-même, donc elle
 * n'écrit jamais. L'accusé de remise se dérive de la même table (une arrivée de message est toujours une remise), plus
 * les pushs de création et d'ajout à une conversation.
 */
public object PushPrefetchPolicy {
    private val MESSAGE_ARRIVAL_TYPES = setOf(
        "new_message", "message_reply", "reply", "message_forwarded", "user_mentioned",
    )
    private val CONVERSATION_JOINED_TYPES = setOf(
        "new_conversation", "new_conversation_direct", "new_conversation_group", "added_to_conversation",
    )
    private val SOCIAL_POST_TYPES = setOf(
        "post_like", "post_comment", "post_repost",
        "story_reaction", "status_reaction",
        "comment_like", "comment_reply", "comment_reaction",
        "story_new_comment", "story_thread_reply", "friend_story_comment",
        "friend_new_story", "friend_new_post", "friend_new_mood",
    )

    public fun announcesMessageArrival(type: String?): Boolean = type?.trim() in MESSAGE_ARRIVAL_TYPES

    public fun plan(payload: PushPayload): PushPrefetchPlan {
        val type = payload.type?.trim()?.takeIf { it.isNotEmpty() } ?: return PushPrefetchPlan()
        val ref = refOf(payload)
        return PushPrefetchPlan(
            message = ref.takeIf { type in MESSAGE_ARRIVAL_TYPES },
            postId = payload.postId?.takeIf { type in SOCIAL_POST_TYPES },
            deliveryReceipt = ref.takeIf { type in MESSAGE_ARRIVAL_TYPES || type in CONVERSATION_JOINED_TYPES },
        )
    }

    private fun refOf(payload: PushPayload): PushMessageRef? {
        val conversationId = payload.conversationId?.takeIf { it.isNotBlank() } ?: return null
        val messageId = payload.messageId?.takeIf { it.isNotBlank() } ?: return null
        return PushMessageRef(conversationId, messageId)
    }
}
