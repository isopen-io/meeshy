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
import me.meeshy.sdk.model.CommunityMemberChange
import me.meeshy.sdk.model.CommunityMemberJoinedEvent
import me.meeshy.sdk.model.CommunityMemberLeftEvent
import me.meeshy.sdk.model.CommunityMemberRoleUpdatedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.SocketInboundRoute.Companion.emitOrLog
import me.meeshy.sdk.socket.collectArrived
import me.meeshy.sdk.socket.exposed
import timber.log.Timber

/**
 * L'effectif d'une communauté en temps réel (#18768, web `community-member-live.ts`) :
 * `community:member-joined`, `community:member-left` et `community:member-role-updated` réécrivent le
 * cache des communautés ([CommunityCacheRepository.applyMemberChange]) ; le détail, la liste et la
 * liste des membres, qui lisent ce cache, se ré-émettent d'eux-mêmes.
 *
 * La passerelle ne les envoie qu'aux membres actifs, au créateur et à la personne concernée : rien
 * ici n'élargit ce qu'un membre lit déjà. Une charge illisible (rôle inconnu, effectif négatif) est
 * écartée sans couper le flux. Chaque geste s'applique sous le compte auquel il est ARRIVÉ.
 */
@Singleton
class CommunityMemberBinding internal constructor(
    private val router: SocketEventRouter,
    private val json: Json,
    io: CoroutineDispatcher,
    private val viewerId: () -> String?,
    private val apply: suspend (CommunityMemberChange, String?) -> Unit,
) : RealtimeBinding {

    @Inject
    constructor(
        router: SocketEventRouter,
        json: Json,
        @IoDispatcher io: CoroutineDispatcher,
        session: SessionRepository,
        cache: CommunityCacheRepository,
    ) : this(router, json, io, { session.currentUserId }, cache::applyMemberChange)

    private val scope = CoroutineScope(SupervisorJob() + io)
    private val subject = SocketInboundRoute.subject<CommunityMemberChange>()
    private val changes = subject.exposed()
    private val installed = AtomicBoolean(false)
    private var job: Job? = null

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
        job?.cancel()
        job = scope.launch { changes.collectArrived(::applyGuarded) }
    }

    /** La déconnexion OUBLIE le registre du transport : la session suivante réinstalle les routes. */
    override fun detach() {
        installed.set(false)
        job?.cancel()
        job = null
    }

    private fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.COMMUNITY_MEMBER_JOINED, json, CommunityMemberJoinedEvent.serializer()) {
            deliver(SocketEventNames.COMMUNITY_MEMBER_JOINED, it.change)
        },
        SocketInboundRoute.decoding(SocketEventNames.COMMUNITY_MEMBER_LEFT, json, CommunityMemberLeftEvent.serializer()) {
            deliver(SocketEventNames.COMMUNITY_MEMBER_LEFT, it.change)
        },
        SocketInboundRoute.decoding(
            SocketEventNames.COMMUNITY_MEMBER_ROLE_UPDATED,
            json,
            CommunityMemberRoleUpdatedEvent.serializer(),
        ) {
            deliver(SocketEventNames.COMMUNITY_MEMBER_ROLE_UPDATED, it.change)
        },
    )

    private fun deliver(event: String, change: CommunityMemberChange?) {
        if (change == null) {
            Timber.w("Socket route [%s] : charge écartée", event)
            return
        }
        subject.emitOrLog(event, change)
    }

    private suspend fun applyGuarded(change: CommunityMemberChange) {
        try {
            apply(change, viewerId())
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "community:member-* : écriture du cache en échec")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CommunityMemberModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: CommunityMemberBinding): RealtimeBinding
}
