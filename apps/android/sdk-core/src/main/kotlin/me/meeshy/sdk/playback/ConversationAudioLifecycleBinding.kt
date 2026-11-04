package me.meeshy.sdk.playback

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import me.meeshy.core.common.MainDispatcher
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocialSocketManager
import timber.log.Timber

/**
 * **Ce que la conversation retire ferme la lecture** (iOS `ConversationAudioCoordinator.wireSocketLifecycleHooks`) : un
 * message supprimé ou brûlé (`message:deleted`, `message:expired`) et une conversation supprimée, fermée ou rendue
 * obsolète (`conversation:deleted`, `-closed`, `-obsoleted`, relayés par les deux gestionnaires) sont remis au
 * [ConversationAudioCoordinator], qui décide s'il ferme la lecture ou retire seulement des pièces de la file.
 *
 * Ce n'est pas une écriture de cache : un branchement à part, sur le fil principal (le moteur n'obéit que là). Chaque
 * collecteur est isolé — une trame mal formée ne tue ni les autres ni la session.
 */
@Singleton
public class ConversationAudioLifecycleBinding internal constructor(
    private val messagesGone: Flow<String>,
    private val conversationsGone: Flow<String>,
    private val coordinator: ConversationAudioCoordinator,
    private val dispatcher: CoroutineDispatcher,
) : RealtimeBinding {

    @Inject
    public constructor(
        messages: MessageSocketManager,
        social: SocialSocketManager,
        coordinator: ConversationAudioCoordinator,
        @MainDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        messagesGone = merge(messages.messageDeleted.map { it.messageId }, messages.messageExpired.map { it.messageId }),
        conversationsGone = merge(messages.conversationDeleted.map { it.conversationId }, social.conversationDeleted.map { it.conversationId }),
        coordinator = coordinator,
        dispatcher = dispatcher,
    )

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + dispatcher).also { scope = it }
        live.launchSafely { messagesGone.collect { id -> safely { coordinator.onMessageDeleted(id) } } }
        live.launchSafely { conversationsGone.collect { id -> safely { coordinator.onConversationDeleted(id) } } }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    private inline fun safely(action: () -> Unit) {
        try {
            action()
        } catch (failure: Exception) {
            Timber.e(failure, "Lecteur audio : retrait d'une conversation mal traité")
        }
    }

    private fun CoroutineScope.launchSafely(block: suspend () -> Unit) {
        launch {
            try {
                block()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.e(failure, "Lecteur audio : écoute des retraits interrompue")
            }
        }
    }
}
