package me.meeshy.app.conversations

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager

/**
 * Pont temps reel de la liste : transforme les trames socket en relectures
 * (pompe CONFLATED) et en purges locales. Instancie par le ViewModel, qui lui
 * prete son [scope] : aucune coroutine ne survit a `onCleared`.
 */
internal class ConversationListRealtimeBinder(
    private val scope: CoroutineScope,
    private val repository: ConversationRepository,
    private val messageSocketManager: MessageSocketManager,
    private val preferencesSocketManager: PreferencesSocketManager,
    private val starredStore: StarredMessagesStore,
    private val currentUserId: () -> String?,
) {

    /**
     * Demandes de revalidation, FUSIONNEES. Un message entrant vaut TROIS trames
     * (`message:new`, `conversation:updated`, `conversation:unread-updated`) :
     * [Channel.CONFLATED] ne retient que la derniere demande en attente.
     *
     *  - Rien n'est retarde : le canal est vide au repos, une trame isolee part
     *    aussitot (pas de debounce).
     *  - Rien n'est perdu : une trame arrivee pendant une relecture laisse une
     *    relecture de queue.
     *
     * `trySend` ne suspend jamais : la dispatch des trames n'est pas freinee par
     * une requete reseau en cours.
     */
    private val refreshRequests = Channel<Unit>(Channel.CONFLATED)

    /** Demande une revalidation silencieuse ; fusionnee par [refreshRequests]. */
    fun requestRefresh() {
        refreshRequests.trySend(Unit)
    }

    /** Lance les collecteurs de preferences distantes puis la pompe et ses sources. */
    fun start() {
        scope.launch {
            // Preferences changees sur un AUTRE appareil (#4127) : l'ecriture Room
            // suffit a repeindre, aucune relecture reseau n'est demandee.
            preferencesSocketManager.conversationPreferencesUpdated.collect { event ->
                repository.applyRemoteConversationPreferences(event)
            }
        }
        scope.launch {
            // La pompe : une relecture a la fois ; toute trame arrivee entre-temps
            // s'est deja fondue dans l'unique demande retenue.
            launch {
                for (coalescedRequest in refreshRequests) {
                    refreshSilently()
                }
            }
            launch { messageSocketManager.unreadUpdated.collect { requestRefresh() } }
            launch { messageSocketManager.messageReceived.collect { requestRefresh() } }
            launch { messageSocketManager.conversationUpdated.collect { requestRefresh() } }
            launch {
                messageSocketManager.conversationDeleted.collect { event ->
                    ConversationPurge.onConversationDeleted(event)?.let(::purge)
                }
            }
            // La montante du couple (#4389) : conversation restauree ailleurs.
            launch { messageSocketManager.conversationRestored.collect { requestRefresh() } }
            launch {
                messageSocketManager.conversationClosed.collect { event ->
                    ConversationPurge.onConversationClosed(event)?.let(::purge)
                }
            }
            launch {
                messageSocketManager.participantLeft.collect { event ->
                    ConversationPurge.onParticipantLeft(event, currentUserId())?.let(::purge)
                }
            }
        }
    }

    /**
     * Retire une conversation disparue : nettoyage des favoris d'abord, local et
     * synchrone, puis relecture qui fait tomber la rangee. Un echec de relecture
     * reste silencieux ; l'annulation est relancee.
     */
    private fun purge(conversationId: String) {
        starredStore.removeConversation(conversationId)
        scope.launch { refreshSilently() }
    }

    /**
     * Relecture declenchee par un evenement socket : silencieuse par construction
     * (un `conversation:updated` pendant un logout ne doit jamais tuer le process).
     * Appelee par la seule pompe, qui la serialise.
     */
    private suspend fun refreshSilently() {
        try {
            repository.refresh()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Silencieux : la prochaine emission du cache ou le pull-to-refresh resynchronisera.
        }
    }
}
