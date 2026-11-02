package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.ConversationNewEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.withAccountTicket
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.arrivals
import me.meeshy.sdk.socket.exposed
import timber.log.Timber

/**
 * `conversation:new` (#13795, iOS `ConversationListViewModel+SocketEvents`, `conversationNew`) : une conversation
 * créée — par moi, ou qui m'accueille — entre dans le cache de la liste sans rafraîchissement, que l'écran de liste soit
 * ouvert ou non. La liste lit Room : la ligne mémorisée à son mode de chiffrement SERVI et à sa place d'ordre.
 *
 * [MessageSocketManager] est gelé (socket-routage-evenements-ordre-arrivee) : cette famille déclare sa route et
 * l'installe sur le MÊME [SocketEventRouter], donc la même voie série.
 *
 * Barrière de compte, en trois temps : l'annonce se juge sous le compte auquel elle est ARRIVÉE (son ticket), pas celui
 * qui est connecté quand le collecteur la reprend ; elle doit NOMMER ce compte parmi ses participants ; et la lecture
 * comme l'écriture sont refusées par [ConversationRepository.learnCreated] dès que ce compte n'est plus le courant.
 */
@Singleton
class ConversationCreatedBinding @Inject internal constructor(
    private val router: SocketEventRouter,
    private val json: Json,
    private val repository: ConversationRepository,
    private val owner: OutboxOwnerSource,
    @IoDispatcher io: CoroutineDispatcher,
) : RealtimeBinding {

    private val scope = CoroutineScope(SupervisorJob() + io)
    private val subject = SocketInboundRoute.subject<ConversationNewEvent>()
    private val events = subject.exposed()
    private val installed = AtomicBoolean(false)
    private var job: Job? = null

    override fun attach() {
        if (installed.compareAndSet(false, true)) {
            router.install(listOf(SocketInboundRoute.decoding(SocketEventNames.CONVERSATION_NEW, json, subject)))
        }
        job?.cancel()
        job = scope.launch {
            events.arrivals().collect { arrived ->
                val account = arrived.ticket?.ownerId ?: owner.currentOwnerId()
                if (!arrived.value.concerns(account)) return@collect
                try {
                    withAccountTicket(arrived.ticket) { repository.learnCreated(arrived.value.conversationId) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "conversation:new : écriture du cache en échec")
                }
            }
        }
    }

    /** La déconnexion OUBLIE le registre du transport : la session suivante réinstalle la route. */
    override fun detach() {
        installed.set(false)
        job?.cancel()
        job = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ConversationCreatedModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: ConversationCreatedBinding): RealtimeBinding
}
