package me.meeshy.sdk.community

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
import me.meeshy.sdk.model.CommunityDeletedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.SocketInboundRoute.Companion.emitOrLog
import me.meeshy.sdk.socket.collectArrived
import me.meeshy.sdk.socket.exposed
import timber.log.Timber

/**
 * `community:deleted` (#19592, web `community-deleted-live.ts`) : une communauté supprimée par son
 * créateur ou désactivée par l'équipe quitte aussitôt l'écran de ses membres. L'événement réécrit le
 * cache des communautés ([CommunityCacheRepository.applyDeleted]) : la liste se ré-émet sans elle, et
 * le détail ouvert repart à froid, relit, et dessine le refus de la passerelle.
 *
 * La passerelle ne l'envoie qu'aux membres actifs et au créateur (room personnelle), et la charge ne
 * nomme personne : rien ici n'élargit ce qu'un membre lit déjà. Chaque événement s'applique sous le
 * compte auquel il est ARRIVÉ ([collectArrived]).
 */
@Singleton
class CommunityDeletedBinding internal constructor(
    private val router: SocketEventRouter,
    private val json: Json,
    io: CoroutineDispatcher,
    private val apply: suspend (CommunityDeletedEvent) -> Unit,
) : RealtimeBinding {

    @Inject
    constructor(
        router: SocketEventRouter,
        json: Json,
        @IoDispatcher io: CoroutineDispatcher,
        cache: CommunityCacheRepository,
    ) : this(router, json, io, cache::applyDeleted)

    private val scope = CoroutineScope(SupervisorJob() + io)
    private val subject = SocketInboundRoute.subject<CommunityDeletedEvent>()
    private val events = subject.exposed()
    private val installed = AtomicBoolean(false)
    private var job: Job? = null

    override fun attach() {
        if (installed.compareAndSet(false, true)) {
            router.install(
                listOf(
                    SocketInboundRoute.decoding(SocketEventNames.COMMUNITY_DELETED, json, CommunityDeletedEvent.serializer()) { event ->
                        if (event.disappearedId == null) {
                            Timber.w("Socket route [%s] : charge écartée", SocketEventNames.COMMUNITY_DELETED)
                        } else {
                            subject.emitOrLog(SocketEventNames.COMMUNITY_DELETED, event)
                        }
                    },
                ),
            )
        }
        job?.cancel()
        job = scope.launch { events.collectArrived(::applyGuarded) }
    }

    /** La déconnexion OUBLIE le registre du transport : la session suivante réinstalle la route. */
    override fun detach() {
        installed.set(false)
        job?.cancel()
        job = null
    }

    private suspend fun applyGuarded(event: CommunityDeletedEvent) {
        try {
            apply(event)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "community:deleted : écriture du cache en échec")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CommunityDeletedModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: CommunityDeletedBinding): RealtimeBinding
}
