package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationEngagementRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.ConversationSocketEventsManager

/**
 * La Flamme de l'en-tête du fil (#13297, iOS `ConversationHeaderFlame`) : « N (M) 🔥 », ce que la
 * conversation a rapporté au lecteur. TOUT vient de la passerelle — l'instantané de la ligne de liste
 * (cache d'abord), la relecture `GET /conversations/{id}/engagement`, l'événement temps réel
 * `engagement:conversation-updated` — et le plus récent gagne, jamais l'inverse
 * ([ConversationEngagementSnapshot.isFresherThan]) : un cache relu après un événement ne fait pas
 * reculer la flamme. Rien n'est calculé côté client.
 *
 * [sent] annonce l'envoi d'un message DU lecteur dans ce fil : la flamme rejoue sa lueur.
 */
class ChatEngagementController @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val engagementRepository: ConversationEngagementRepository,
    private val socketEvents: ConversationSocketEventsManager,
) : ChatController {

    private val _snapshot = MutableStateFlow<ConversationEngagementSnapshot?>(null)

    /** L'instantané le plus récent connu, tel que servi (la relecture au jour civil se fait à l'affichage). */
    val snapshot: StateFlow<ConversationEngagementSnapshot?> = _snapshot.asStateFlow()

    private val _sent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** Un message du lecteur vient de partir dans ce fil. */
    val sent: SharedFlow<Unit> = _sent.asSharedFlow()

    override fun attach(host: ChatControllerHost) {
        val id = host.conversationId
        host.scope.launch {
            conversationRepository.conversationStream(id)
                .map { it?.viewerEngagement }
                .filterNotNull()
                .collect(::seed)
        }
        host.scope.launch {
            socketEvents.events
                .filterIsInstance<ConversationEngagementSnapshot>()
                .filter { it.conversationId == id }
                .collect(::seed)
        }
        host.scope.launch {
            try {
                (engagementRepository.fetch(id) as? NetworkResult.Success)?.let { seed(it.data) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
        host.scope.launch {
            var previous: OwnSendDetection.Tail? = null
            host.uiState
                .map { state -> state.messages.lastOrNull()?.let { OwnSendDetection.Tail(it.clientMessageId ?: it.messageId, it.isOutgoing) } }
                .distinctUntilChanged()
                .collect { tail ->
                    if (OwnSendDetection.isNewOwnSend(previous, tail)) _sent.tryEmit(Unit)
                    previous = tail
                }
        }
    }

    /** Installe [incoming] s'il est plus récent que ce qu'on tient — jamais un recul. */
    internal fun seed(incoming: ConversationEngagementSnapshot) {
        _snapshot.value = _snapshot.value.let { current ->
            if (current == null || incoming.isFresherThan(current) || incoming.sameMoment(current)) incoming else current
        }
    }

    private fun ConversationEngagementSnapshot.sameMoment(other: ConversationEngagementSnapshot) =
        day == other.day && totalPoints == other.totalPoints
}

/**
 * Un envoi du lecteur, vu depuis la queue du fil : une NOUVELLE dernière bulle, à lui, après une
 * première lecture. La clé est le `clientMessageId` quand il existe, pour que l'accusé qui remplace
 * l'id local par l'id serveur ne soit pas pris pour un second envoi.
 */
internal object OwnSendDetection {
    data class Tail(val key: String, val isOutgoing: Boolean)

    fun isNewOwnSend(previous: Tail?, current: Tail?): Boolean =
        previous != null && current != null && current.isOutgoing && current.key != previous.key
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatEngagementModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ChatEngagementController): ChatController
}

/** Aucune Flamme (tests, aperçus, contrôleur absent). */
internal val NO_ENGAGEMENT: StateFlow<ConversationEngagementSnapshot?> = MutableStateFlow(null)
internal val NO_SENT: SharedFlow<Unit> = MutableSharedFlow()
