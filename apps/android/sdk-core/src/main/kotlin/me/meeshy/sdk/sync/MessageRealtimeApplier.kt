package me.meeshy.sdk.sync

import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.MessageDeletedEvent
import me.meeshy.sdk.model.sync.MessageMutation
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Les événements de MESSAGE du relais permanent (miroir de `relayMessageEvents`, iOS) : le message reçu
 * plie la ligne de liste (aperçu Prisme, auteur, heure, non-lu, découverte d'une conversation absente) ;
 * l'édition, la suppression et l'expiration recalculent l'aperçu quand le message touché en était le
 * dernier, et la suppression marque aussi la ligne de message en Room. Aucune de ces écritures n'émet
 * de GET sauf la découverte d'une conversation absente (et le message précédent d'un aperçu supprimé).
 * Toutes sont idempotentes : la conversation ouverte reçoit le même broadcast sans double effet.
 */
@Singleton
class MessageRealtimeApplier @Inject constructor(
    private val socket: MessageSocketManager,
    private val patcher: ConversationLivePatcher,
    private val messages: MessageRepository,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        registrar.relay(socket.messageReceived, OrderedEventLane.Family.MESSAGES) { patcher.applyMessage(it) }
        registrar.relay(socket.messageEdited, OrderedEventLane.Family.MESSAGES) { patcher.applyEdited(it) }
        registrar.relay(socket.messageDeleted, OrderedEventLane.Family.MESSAGES) {
            apply(MessageMutation.Deleted(it.conversationId, it.messageId, it.deletedAt))
        }
        registrar.relay(socket.messageExpired, OrderedEventLane.Family.MESSAGES) {
            apply(MessageMutation.Expired(it.conversationId, it.messageId))
        }
    }

    internal suspend fun apply(mutation: MessageMutation) {
        val now = Instant.now().toString()
        when (mutation) {
            is MessageMutation.Edited -> patcher.applyEdited(mutation.message)
            is MessageMutation.Deleted -> {
                messages.markDeleted(mutation.messageId, mutation.deletedAt ?: now)
                patcher.applyDeleted(MessageDeletedEvent(mutation.messageId, mutation.conversationId, mutation.deletedAt))
            }
            is MessageMutation.Expired -> {
                messages.markDeleted(mutation.messageId, now, expired = true)
                patcher.applyDeleted(MessageDeletedEvent(mutation.messageId, mutation.conversationId))
            }
        }
    }
}
