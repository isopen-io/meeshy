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
import me.meeshy.sdk.model.CommunityJoinRequestDecidedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.SocketInboundRoute.Companion.emitOrLog
import me.meeshy.sdk.socket.collectArrived
import me.meeshy.sdk.socket.exposed
import timber.log.Timber

/**
 * `community:join-request-decided` (#19949, web `community-join-request-live.ts`) : un intendant a
 * refusé la demande d'entrée du LECTEUR. L'événement réécrit la fiche tenue
 * ([CommunityCacheRepository.applyJoinRequestDecided]) : le détail ouvert passe de « Demande envoyée »
 * à « Demande refusée — nouvelle demande possible le … » sans relecture.
 *
 * La passerelle ne le pose que sur la room personnelle du demandeur, et la charge ne dit pas qui a
 * tranché : rien ici n'élargit ce que le lecteur sait déjà. Chaque événement s'applique sous le compte
 * auquel il est ARRIVÉ ([collectArrived]).
 */
@Singleton
class CommunityJoinRequestDecidedBinding internal constructor(
    private val router: SocketEventRouter,
    private val json: Json,
    io: CoroutineDispatcher,
    private val apply: suspend (CommunityJoinRequestDecidedEvent) -> Unit,
) : RealtimeBinding {

    @Inject
    constructor(
        router: SocketEventRouter,
        json: Json,
        @IoDispatcher io: CoroutineDispatcher,
        cache: CommunityCacheRepository,
    ) : this(router, json, io, cache::applyJoinRequestDecided)

    private val scope = CoroutineScope(SupervisorJob() + io)
    private val subject = SocketInboundRoute.subject<CommunityJoinRequestDecidedEvent>()
    private val events = subject.exposed()
    private val installed = AtomicBoolean(false)
    private var job: Job? = null

    override fun attach() {
        if (installed.compareAndSet(false, true)) {
            router.install(
                listOf(
                    SocketInboundRoute.decoding(SocketEventNames.COMMUNITY_JOIN_REQUEST_DECIDED, json, CommunityJoinRequestDecidedEvent.serializer()) { event ->
                        if (event.refusedUntil == null) {
                            Timber.w("Socket route [%s] : charge écartée", SocketEventNames.COMMUNITY_JOIN_REQUEST_DECIDED)
                        } else {
                            subject.emitOrLog(SocketEventNames.COMMUNITY_JOIN_REQUEST_DECIDED, event)
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

    private suspend fun applyGuarded(event: CommunityJoinRequestDecidedEvent) {
        try {
            apply(event)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "community:join-request-decided : écriture du cache en échec")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CommunityJoinRequestDecidedModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: CommunityJoinRequestDecidedBinding): RealtimeBinding
}
