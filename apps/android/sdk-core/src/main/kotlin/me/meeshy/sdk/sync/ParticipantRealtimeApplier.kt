package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.model.sync.ParticipantFold
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Les événements de PARTICIPANT du relais permanent : quand MOI je pars ou suis banni, la conversation
 * disparaît de Room (avec ses étoiles) ; quand un autre part, est banni ou change de rôle, l'effectif, le
 * roster et le rôle de la ligne sont mis à jour par [ParticipantFold]. Même voie que les messages, pour que
 * le compte de membres ne croise jamais un `conversation:updated`.
 */
@Singleton
class ParticipantRealtimeApplier @Inject constructor(
    private val socket: MessageSocketManager,
    private val patcher: ConversationLivePatcher,
    private val starred: StarredMessagesStore,
    private val session: SessionRepository,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        val lane = OrderedEventLane.Family.MESSAGES
        registrar.relay(socket.participantLeft, lane) { event ->
            val me = session.currentUser.value?.id
            if (!me.isNullOrBlank() && event.names(me) && event.conversationId.isNotBlank()) {
                purge(event.conversationId)
            } else {
                patcher.applyParticipant(event.conversationId) { ParticipantFold.left(it, event, me) }
            }
        }
        registrar.relay(socket.participantBanned, lane) { event ->
            val me = session.currentUser.value?.id
            if (!me.isNullOrBlank() && event.names(me) && event.conversationId.isNotBlank()) {
                purge(event.conversationId)
            } else {
                patcher.applyParticipant(event.conversationId) { ParticipantFold.banned(it, event, me) }
            }
        }
        registrar.relay(socket.participantJoined, lane) { patcher.applyJoined(it) }
        registrar.relay(socket.participantUnbanned, lane) { patcher.applyUnbanned(it) }
        registrar.relay(socket.participantRoleUpdated, lane) { event ->
            val me = session.currentUser.value?.id
            patcher.applyParticipant(event.conversationId) { row ->
                ParticipantFold.roleUpdated(row, event, me)
                    ?.let(ParticipantFold.Outcome::Updated) ?: ParticipantFold.Outcome.Unchanged
            }
        }
    }

    private suspend fun purge(conversationId: String) {
        starred.removeConversation(conversationId)
        patcher.remove(conversationId)
    }
}
