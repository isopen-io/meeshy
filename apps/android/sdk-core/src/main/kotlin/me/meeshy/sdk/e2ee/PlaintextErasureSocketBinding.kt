package me.meeshy.sdk.e2ee

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.collectArrived
import timber.log.Timber

/**
 * **Un effacement reçu fil FERMÉ vide aussi le coffre** (#14655). `MessageDeltaApplier.apply` n'est branché que sur le
 * fil ouvert : cette liaison de session inscrit dans la file durable, pour TOUTE conversation, ce que la passerelle dit
 * effacé — suppression pour tous (son écho, pour une suppression lancée ici), expiration, masquage pour moi, vue unique
 * purgée ou ouverte par moi, conversation supprimée pour moi ou fermée pour tous. Elle ne touche pas aux lignes : le fil
 * ouvert les applique, le suivant les relit.
 *
 * Modèle de menace : appareil volé qui garderait le texte d'un message que tout le monde croit parti. Un serveur
 * compromis peut ANNONCER un effacement et faire ainsi retirer un clair local : une suppression authentifiée par
 * libsignal reste à décider (iOS #13060).
 */
@Singleton
internal class PlaintextErasureSocketBinding internal constructor(
    private val events: SharedFlow<ConversationSocketEvent>,
    private val conversationsDeleted: SharedFlow<ConversationDeletedSocketEvent>,
    private val conversationsClosed: SharedFlow<ConversationClosedSocketEvent>,
    private val ledger: PlaintextErasureLedger,
    private val viewer: () -> String?,
    private val scope: CoroutineScope,
) : RealtimeBinding {

    @Inject
    constructor(
        conversationEvents: ConversationSocketEventsManager,
        messageSocket: MessageSocketManager,
        ledger: PlaintextErasureLedger,
        session: SessionRepository,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(
        conversationEvents.events,
        messageSocket.conversationDeleted,
        messageSocket.conversationClosed,
        ledger,
        { session.currentUserId },
        CoroutineScope(SupervisorJob() + io),
    )

    private var jobs: List<Job> = emptyList()

    override fun attach() {
        detach()
        jobs = listOf(
            scope.launch { events.collectArrived { event -> erased(event).takeIf { it.isNotEmpty() }?.let { guarded { ledger.recordNamed(it) } } } },
            scope.launch { conversationsDeleted.collectArrived { guarded { ledger.recordConversation(it.conversationId) } } },
            scope.launch { conversationsClosed.collectArrived { guarded { ledger.recordConversation(it.conversationId) } } },
        )
    }

    override fun detach() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    private fun erased(event: ConversationSocketEvent): List<String> = when (event) {
        is MessageRemoved -> listOf(event.messageId)
        is MessageHiddenForMeEvent -> event.messages.map { it.messageId }
        is MessageViewOncePurgedEvent -> listOf(event.messageId)
        is MessageConsumedEvent -> viewer()?.takeIf { event.userId == it || event.participantId == it }?.let { listOf(event.messageId) }.orEmpty()
        else -> emptyList()
    }.filter { it.isNotBlank() }

    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w("e2ee plaintext erasure not recorded: %s", failure.javaClass.simpleName)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PlaintextErasureSocketModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: PlaintextErasureSocketBinding): RealtimeBinding
}
