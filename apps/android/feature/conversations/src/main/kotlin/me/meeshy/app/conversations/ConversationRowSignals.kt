package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.presence.ConversationHere
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.socket.ConversationViewingBinding
import me.meeshy.sdk.theme.otherParticipantUserId
import javax.inject.Inject

/**
 * Les signaux vivants que la liste lit pour CHAQUE ligne sans qu'aucune ligne ne s'abonne :
 * la synchro en attente (outbox), l'écran ouvert du pair (`viewing:*`) et l'appel en cours.
 * Un instantané immuable, jamais un flux : la ligne reste une projection.
 */
@Immutable
data class ConversationRowSignals(
    /** Conversations dont une mutation (épingle, muet, archive, section) n'est pas encore livrée. */
    val pendingSync: Set<String> = emptySet(),
    /** Qui a l'écran de quelle conversation ouvert — uniquement ce que la passerelle annonce. */
    val viewers: ConversationViewers = ConversationViewers(),
    /** Conversations où un appel est en cours et rejoignable. Vide tant qu'aucune source ne le sert. */
    val callInProgress: Set<String> = emptySet(),
) {
    fun hasPendingSync(conversationId: String): Boolean = conversationId in pendingSync

    fun hasCallInProgress(conversationId: String): Boolean = conversationId in callInProgress

    /**
     * Le pair d'une conversation DIRECTE est-il à l'écran de CETTE conversation ? Un groupe n'a
     * pas de pair unique : [ConversationHere.ABSENT]. Aucune présence fabriquée : sans annonce
     * du serveur pour ce pair, personne n'est ici.
     */
    fun peerHere(conversation: ApiConversation, currentUserId: String?): ConversationHere {
        if (conversation.type != "direct") return ConversationHere.ABSENT
        val peerId = conversation.otherParticipantUserId(currentUserId) ?: return ConversationHere.ABSENT
        return viewers.here(peerId, conversation.id)
    }
}

/** Assemble les [ConversationRowSignals] depuis leurs sources ; construit par Hilt, injecté au ViewModel. */
class ConversationListRowSignals @Inject constructor(
    private val outbox: OutboxRepository,
    private val viewingBinding: ConversationViewingBinding,
) {
    fun observe(): Flow<ConversationRowSignals> = combine(
        outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS),
        viewingBinding.viewers,
    ) { pending, viewers ->
        ConversationRowSignals(pendingSync = pending, viewers = viewers)
    }
}
