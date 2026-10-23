package me.meeshy.app.conversations

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState

/**
 * Pont temps reel de la liste : chaque trame socket se plie EN PLACE dans la ligne Room qu'elle
 * concerne ([ConversationLivePatcher]) - la liste observe Room, donc la ligne, l'apercu, le badge
 * et le tri changent aussitot, hors ligne comprise, sans aucune relecture reseau. Instancie par le
 * ViewModel, qui lui prete son [scope] : aucune coroutine ne survit a `onCleared`.
 *
 * Les patchs passent par UNE voie serialisee, dans l'ordre d'ARRIVEE : un `conversation:updated`
 * ne double jamais le `message:new` du meme message, suspendu dans son ecriture. La seule relecture
 * complete qui reste est le rattrapage d'une RECONNEXION (evenements manques que le socket ne
 * rejoue pas) et celle du tirer-pour-rafraichir.
 */
internal class ConversationListRealtimeBinder(
    private val scope: CoroutineScope,
    private val repository: ConversationRepository,
    private val messageSocketManager: MessageSocketManager,
    private val preferencesSocketManager: PreferencesSocketManager,
    private val starredStore: StarredMessagesStore,
    private val currentUserId: () -> String?,
    private val patcher: ConversationLivePatcher,
    private val connectionState: Flow<SocketConnectionState> = emptyFlow(),
) {

    private val lane = Channel<suspend () -> Unit>(Channel.UNLIMITED)

    /** Rattrapage de reconnexion, FUSIONE : une demande en attente suffit. */
    private val catchUpRequests = Channel<Unit>(Channel.CONFLATED)

    /** Lance les collecteurs de preferences distantes, la voie de patch et ses sources. */
    fun start() {
        scope.launch {
            // Preferences changees sur un AUTRE appareil (#4127) : l'ecriture Room suffit a repeindre.
            preferencesSocketManager.conversationPreferencesUpdated.collect { event ->
                repository.applyRemoteConversationPreferences(event)
            }
        }
        scope.launch { for (patch in lane) runSilently(patch) }
        scope.launch { for (request in catchUpRequests) runSilently { repository.refresh() } }
        scope.launch { watchReconnections() }
        scope.launch { messageSocketManager.messageReceived.collect { enqueue { patcher.applyMessage(it) } } }
        scope.launch { messageSocketManager.conversationUpdated.collect { enqueue { patcher.applyUpdated(it) } } }
        scope.launch {
            messageSocketManager.unreadUpdated.collect { enqueue { patcher.applyUnread(it.conversationId, it.unreadCount) } }
        }
        // La montante du couple (#4389) : conversation restauree ailleurs - on la RAMENE par id.
        scope.launch { messageSocketManager.conversationRestored.collect { enqueue { patcher.discover(it.conversationId) } } }
        scope.launch {
            messageSocketManager.conversationDeleted.collect { event ->
                ConversationPurge.onConversationDeleted(event)?.let(::purge)
            }
        }
        scope.launch {
            messageSocketManager.conversationClosed.collect { event ->
                ConversationPurge.onConversationClosed(event)?.let(::purge)
            }
        }
        scope.launch {
            messageSocketManager.participantLeft.collect { event ->
                val mine = ConversationPurge.onParticipantLeft(event, currentUserId())
                if (mine != null) purge(mine) else enqueue { patcher.applyLeft(event) }
            }
        }
        scope.launch {
            messageSocketManager.participantBanned.collect { event ->
                val me = currentUserId()
                if (!me.isNullOrBlank() && event.names(me) && event.conversationId.isNotBlank()) {
                    purge(event.conversationId)
                } else {
                    enqueue { patcher.applyBanned(event) }
                }
            }
        }
        scope.launch { messageSocketManager.participantJoined.collect { enqueue { patcher.applyJoined(it) } } }
        scope.launch { messageSocketManager.participantUnbanned.collect { enqueue { patcher.applyUnbanned(it) } } }
    }

    /** Une fois la socket tombee puis revenue, les evenements manques ne seront jamais rejoues. */
    private suspend fun watchReconnections() {
        var wasConnected = false
        var dropped = false
        connectionState.collect { state ->
            when (state) {
                SocketConnectionState.CONNECTED -> {
                    if (wasConnected && dropped) catchUpRequests.trySend(Unit)
                    wasConnected = true
                    dropped = false
                }
                else -> if (wasConnected) dropped = true
            }
        }
    }

    private fun enqueue(patch: suspend () -> Unit) {
        lane.trySend(patch)
    }

    /**
     * Retire une conversation disparue : nettoyage des favoris d'abord, local et synchrone, puis
     * retrait de la ligne Room (et du cache de ses messages) par la voie serialisee.
     */
    private fun purge(conversationId: String) {
        starredStore.removeConversation(conversationId)
        enqueue { patcher.remove(conversationId) }
    }

    /**
     * Une trame ne doit jamais tuer le process (un `conversation:updated` pendant un logout) :
     * l'echec reste silencieux, la prochaine emission du cache ou le tirer-pour-rafraichir
     * resynchronisera. L'annulation est relancee.
     */
    private suspend fun runSilently(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }
}
