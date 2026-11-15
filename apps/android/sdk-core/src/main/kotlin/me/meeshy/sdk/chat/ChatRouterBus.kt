package me.meeshy.sdk.chat

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.navigation.ChatRouterDelivery
import me.meeshy.sdk.model.navigation.ChatRouterRequests
import me.meeshy.sdk.model.navigation.ReplyContextRequest

/**
 * Le bus des demandes du routeur au fil de discussion (iOS `Router.pending*`) : ce qu'un écran pose pour une
 * conversation précise (atterrir sur un message, ouvrir la recherche, répondre à une story ou une humeur).
 * [state] est lu par un fil DÉJÀ visible, qui applique la demande à chaud ; [consume] la rend UNE fois, et
 * seulement à la conversation visée.
 */
@Singleton
public class ChatRouterBus @Inject constructor() {
    private val _state = MutableStateFlow(ChatRouterRequests())
    public val state: StateFlow<ChatRouterRequests> = _state.asStateFlow()

    public fun requestHighlight(messageId: String, conversationId: String?): Unit =
        _state.update { it.requestHighlight(messageId, conversationId) }

    public fun requestSearch(conversationId: String?): Unit = _state.update { it.requestSearch(conversationId) }

    public fun requestReply(context: ReplyContextRequest): Unit = _state.update { it.requestReply(context) }

    /** Rend les demandes de [conversationId] et les retire, en une transition atomique ; celles d'une autre restent. */
    public fun consume(conversationId: String): ChatRouterDelivery {
        while (true) {
            val before = _state.value
            val (delivery, after) = before.consume(conversationId)
            if (delivery.isEmpty || _state.compareAndSet(before, after)) return delivery
        }
    }
}
