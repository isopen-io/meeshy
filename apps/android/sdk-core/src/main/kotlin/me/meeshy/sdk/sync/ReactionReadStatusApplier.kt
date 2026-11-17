package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.model.ReactionLedger
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.isOwnEcho
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.reaction.ReactionRowStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Les RÉACTIONS et les ACCUSÉS de lecture du relais permanent (miroir de `relayMessageEvents`, iOS).
 *
 * Une réaction se range d'abord dans les lignes persistées du message (qui a réagi), et le compteur ne suit
 * que si ces lignes ont bougé : rejouer le même écho ne compte jamais deux fois. La conversation OUVERTE
 * garde la main sur ses réactions (son contrôleur ajoute l'animation et la feuille « qui a réagi ») : le
 * relais ne compte pas une seconde fois ce que l'écran compte déjà. Un accusé de lecture ne fait monter
 * que les coches de MES messages, jamais ne les baisse.
 */
@Singleton
class ReactionReadStatusApplier @Inject constructor(
    private val socket: MessageSocketManager,
    private val messages: MessageRepository,
    private val rows: ReactionRowStore,
    private val session: SessionRepository,
    private val openConversations: OpenConversationLookup,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        val lane = OrderedEventLane.Family.MESSAGES
        registrar.relay(socket.reactionAdded, lane) { react(it, adding = true) }
        registrar.relay(socket.reactionRemoved, lane) { react(it, adding = false) }
        registrar.relay(socket.readStatusUpdated, lane) { receipt(it) }
    }

    internal suspend fun react(event: ReactionUpdateEvent, adding: Boolean) {
        if (openConversations.isOpen(event.conversationId)) return
        val me = session.currentUser.value?.id
        val moved = rows.record(
            messageId = event.messageId,
            emoji = event.emoji,
            adding = adding,
            participantId = event.participantId,
            ownerUserId = event.userId,
            currentUserId = me,
            aggregate = event.aggregation?.let { ReactionLedger.Aggregate(it.count, it.participantIds) },
        )
        val ownEcho = event.isOwnEcho(me)
        val unknownRow = rows.rows(event.messageId) == null
        if (moved || (!ownEcho && unknownRow)) messages.applyReactionDelta(event.messageId, event.emoji, if (adding) 1 else -1)
    }

    internal suspend fun receipt(event: ReadStatusUpdatedEvent) {
        val me = session.currentUser.value?.id ?: return
        messages.applyReadStatusSummary(event.conversationId, event.summary, me)
    }
}
