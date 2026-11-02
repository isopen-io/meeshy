package me.meeshy.app.conversations

import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.conversation.ConversationListMessagePrefetcher
import me.meeshy.sdk.conversation.MessagePrefetchRequest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.chat.MessagePrefetchPlan
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocketManager

/**
 * Les trois déclencheurs de la passe de préchargement (iOS #10572) : le chargement de la
 * liste, le retour au premier plan et la reconnexion socket. La passe elle-même est
 * sérialisée par [ConversationListMessagePrefetcher] ; ici on ne fait que la demander,
 * sous le compte actif au moment de la demande.
 */
class ConversationListMessagePrefetchTriggers @Inject constructor(
    private val prefetcher: ConversationListMessagePrefetcher,
    private val foreground: AppForegroundSignal,
) {
    fun start(
        scope: CoroutineScope,
        session: SessionRepository,
        socketManager: SocketManager,
        conversations: () -> List<ApiConversation>,
    ) {
        fun requestPass() = schedule(session, conversations())
        scope.launch { foreground.entered.collect { requestPass() } }
        scope.launch {
            socketManager.connected.collect {
                prefetcher.armForNextReload()
                requestPass()
            }
        }
    }

    /** Le chargement de la liste : rejoue la passe sur les premières lignes. */
    fun onListLoaded(session: SessionRepository, conversations: List<ApiConversation>) {
        prefetcher.takeReloadArm()
        schedule(session, conversations)
    }

    private fun schedule(session: SessionRepository, conversations: List<ApiConversation>) {
        val ownerId = session.currentUserId.orEmpty()
        val candidates = MessagePrefetchPlan.targets(conversations)
        if (ownerId.isEmpty() || candidates.isEmpty()) return
        prefetcher.schedule(
            MessagePrefetchRequest(candidates, ownerId) { session.currentUserId == ownerId },
        )
    }
}
