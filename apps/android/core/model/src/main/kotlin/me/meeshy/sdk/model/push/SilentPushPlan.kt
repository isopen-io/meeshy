package me.meeshy.sdk.model.push

/**
 * Ce que le réveil d'un push doit synchroniser, décidé en pur. Les compteurs viennent de la charge (déjà des
 * entiers : FCM les transporte en chaînes, `PushPayload` les lit) et s'appliquent AVANT tout réseau.
 *
 * Une réaction porte le `messageId` du message RÉAGI : ses messages se rafraîchissent (le compteur de réactions),
 * mais la ligne de la liste n'avance pas — le dernier message de la conversation n'a pas changé.
 */
public data class SilentPushPlan(
    val bellUnread: Int? = null,
    val conversationUnread: Pair<String, Int>? = null,
    val refreshMessagesOf: String? = null,
    val refreshConversationList: Boolean = false,
) {
    public val needsNetwork: Boolean get() = refreshMessagesOf != null || refreshConversationList

    public val isEmpty: Boolean
        get() = bellUnread == null && conversationUnread == null && !needsNetwork

    public companion object {
        private val REACTION_TYPES = setOf("message_reaction", "reaction", "message_reacted")

        public fun of(payload: PushPayload): SilentPushPlan {
            val type = payload.type?.trim()
            val conversationId = payload.conversationId?.takeIf { it.isNotBlank() }
            val arrival = PushPrefetchPolicy.announcesMessageArrival(type)
            val reaction = type in REACTION_TYPES
            return SilentPushPlan(
                bellUnread = payload.unreadCount?.coerceAtLeast(0),
                conversationUnread = conversationId?.let { id ->
                    payload.conversationUnread?.let { id to it.coerceAtLeast(0) }
                },
                refreshMessagesOf = conversationId?.takeIf { arrival || reaction },
                refreshConversationList = arrival,
            )
        }
    }
}
