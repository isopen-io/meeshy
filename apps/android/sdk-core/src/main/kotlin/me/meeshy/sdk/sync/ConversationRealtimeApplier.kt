package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationEventApplier
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.model.sync.ConversationFold
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Les événements de CONVERSATION du relais permanent (miroir de `relayConversationEvents`, iOS) : titre,
 * avatar, bannière et aperçu se plient dans la ligne sans GET ; `deleted` / `closed` / `obsoleted` retirent la
 * ligne ET le cache de ses messages (et ses étoiles) ; `restored` relit par id ; `unread-updated` pose le
 * compteur absolu du serveur. Tout passe par la voie des MESSAGES : un `unread-updated` ne dépasse jamais le
 * `message:new` ni le `conversation:updated` arrivés avant lui. Idempotent, conversation ouverte ou non.
 */
@Singleton
class ConversationRealtimeApplier @Inject constructor(
    private val socket: MessageSocketManager,
    private val patcher: ConversationLivePatcher,
    private val events: ConversationEventApplier,
    private val starred: StarredMessagesStore,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        val lane = OrderedEventLane.Family.MESSAGES
        registrar.relay(socket.conversationUpdated, lane) { events.applyUpdated(it) }
        registrar.relay(socket.unreadUpdated, lane) { patcher.applyUnread(it.conversationId, it.unreadCount, it.bridge) }
        registrar.relay(socket.conversationRestored, lane) { events.applyRestored(it) }
        registrar.relay(socket.conversationDeleted, lane) { purge(ConversationFold.removedBy(it)) }
        registrar.relay(socket.conversationClosed, lane) { purge(ConversationFold.removedBy(it)) }
        registrar.relay(socket.conversationObsoleted, lane) { purge(ConversationFold.removedBy(it)) }
    }

    private suspend fun purge(conversationId: String?) {
        if (conversationId == null) return
        starred.removeConversation(conversationId)
        patcher.remove(conversationId)
    }
}
