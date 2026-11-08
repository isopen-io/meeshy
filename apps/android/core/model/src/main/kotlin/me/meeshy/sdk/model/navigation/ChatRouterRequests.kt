package me.meeshy.sdk.model.navigation

/**
 * Ce qu'une conversation ramasse en s'ouvrant, ou quand une demande lui arrive à chaud : le message où atterrir, la
 * recherche à ouvrir, le contexte de réponse (story, humeur). Vide = rien à appliquer.
 */
public data class ChatRouterDelivery(
    val highlightMessageId: String? = null,
    val openSearch: Boolean = false,
    val replyContext: ReplyContextRequest? = null,
) {
    public val isEmpty: Boolean get() = highlightMessageId == null && !openSearch && replyContext == null
}

/**
 * **Les demandes du routeur au fil de discussion** (iOS `Router.pendingHighlightMessageId`, `pendingOpenSearch`,
 * `pendingReplyContext`), chacune SCOPÉE à une conversation : [consume] ne rend que celles de la conversation
 * qui ramasse et laisse intactes (ni consommées ni brûlées) celles qui visent une autre.
 *
 * Une demande sans conversation ([ANY_CONVERSATION]) est ramassée par la première conversation qui se présente
 * (entrée ancienne, non scopée).
 */
public data class ChatRouterRequests(
    val highlight: MessageJumpTarget? = null,
    val searchConversationId: String? = null,
    val replyContext: ReplyContextRequest? = null,
) {
    public fun requestHighlight(messageId: String, conversationId: String?): ChatRouterRequests =
        copy(highlight = messageId.takeIf { it.isNotBlank() }?.let { MessageJumpTarget(it, conversationId) })

    public fun requestSearch(conversationId: String?): ChatRouterRequests =
        copy(searchConversationId = conversationId ?: ANY_CONVERSATION)

    public fun requestReply(context: ReplyContextRequest): ChatRouterRequests = copy(replyContext = context)

    /** Y a-t-il quelque chose en attente pour [conversationId] ? */
    public fun hasPendingFor(conversationId: String): Boolean = peek(conversationId) != ChatRouterDelivery()

    public fun peek(conversationId: String): ChatRouterDelivery = ChatRouterDelivery(
        highlightMessageId = highlight?.takeIf { it.appliesTo(conversationId) }?.messageId,
        openSearch = searchConversationId?.let { it == ANY_CONVERSATION || it == conversationId } == true,
        replyContext = replyContext?.takeIf { it.conversationId == conversationId },
    )

    /** Rend les demandes de [conversationId] ET l'état sans elles ; celles d'une autre conversation restent. */
    public fun consume(conversationId: String): Pair<ChatRouterDelivery, ChatRouterRequests> {
        val delivery = peek(conversationId)
        if (delivery.isEmpty) return delivery to this
        return delivery to copy(
            highlight = if (delivery.highlightMessageId != null) null else highlight,
            searchConversationId = if (delivery.openSearch) null else searchConversationId,
            replyContext = if (delivery.replyContext != null) null else replyContext,
        )
    }

    public companion object {
        private const val ANY_CONVERSATION: String = ""
    }
}
