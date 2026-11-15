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
import me.meeshy.sdk.model.CommunityUpdatedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.collectArrived
import me.meeshy.sdk.socket.exposed
import timber.log.Timber

/**
 * `community:updated` (#18439, iOS `CommunityUpdateChannel`) : une communauté renommée ou réglée par
 * son créateur se met à jour chez chaque membre, écran ouvert ou non. L'événement réécrit le cache
 * des communautés ([CommunityCacheRepository.applyUpdate]) ; la liste et le détail, qui lisent ce cache,
 * se ré-émettent d'eux-mêmes — aucune relance réseau.
 *
 * La passerelle ne l'envoie qu'aux membres actifs et au créateur (room personnelle) : rien ici
 * n'élargit ce qu'un membre lit déjà. Chaque événement s'applique sous le compte auquel il est
 * ARRIVÉ ([collectArrived]), jamais sous celui qui s'est connecté entre-temps.
 */
@Singleton
class CommunityUpdateBinding internal constructor(
    private val router: SocketEventRouter,
    private val json: Json,
    io: CoroutineDispatcher,
    private val apply: suspend (CommunityUpdatedEvent) -> Unit,
) : RealtimeBinding {

    @Inject
    constructor(
        router: SocketEventRouter,
        json: Json,
        @IoDispatcher io: CoroutineDispatcher,
        cache: CommunityCacheRepository,
    ) : this(router, json, io, cache::applyUpdate)

    private val scope = CoroutineScope(SupervisorJob() + io)
    private val subject = SocketInboundRoute.subject<CommunityUpdatedEvent>()
    private val events = subject.exposed()
    private val installed = AtomicBoolean(false)
    private var job: Job? = null

    override fun attach() {
        if (installed.compareAndSet(false, true)) {
            router.install(listOf(SocketInboundRoute.decoding(SocketEventNames.COMMUNITY_UPDATED, json, subject)))
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

    private suspend fun applyGuarded(event: CommunityUpdatedEvent) {
        try {
            apply(event)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "community:updated : écriture du cache en échec")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CommunityUpdateModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: CommunityUpdateBinding): RealtimeBinding
}
