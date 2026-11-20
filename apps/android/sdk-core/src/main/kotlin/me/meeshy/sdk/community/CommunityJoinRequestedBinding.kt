package me.meeshy.sdk.community

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CommunityJoinRequestedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.SocketInboundRoute.Companion.emitOrLog
import me.meeshy.sdk.socket.exposed
import timber.log.Timber

/**
 * `community:join-requested` (#19878, web `applyCommunityJoinRequestedEvent`) : une demande d'entrée vient
 * d'arriver dans une communauté que le lecteur anime. La passerelle ne la pose que sur la room personnelle des
 * administrateurs, des modérateurs et du créateur, et la charge ne nomme le demandeur que par son identifiant :
 * c'est une INVALIDATION. [requested] l'annonce, et l'écran Membres qui tient la liste la relit — la relecture
 * repasse par les gardes de la passerelle (blocage, compte fermé). Rien ne se relit ici : un événement sans
 * écouteur ne coûte aucune requête.
 */
@Singleton
class CommunityJoinRequestedBinding @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val subject = SocketInboundRoute.subject<CommunityJoinRequestedEvent>()
    private val installed = AtomicBoolean(false)

    /** Les demandes annoncées, dans l'ordre d'arrivée. */
    val requested: SharedFlow<CommunityJoinRequestedEvent> = subject.exposed()

    override fun attach() {
        if (!installed.compareAndSet(false, true)) return
        router.install(
            listOf(
                SocketInboundRoute.decoding(SocketEventNames.COMMUNITY_JOIN_REQUESTED, json, CommunityJoinRequestedEvent.serializer()) { event ->
                    if (event.communityId.isEmpty()) {
                        Timber.w("Socket route [%s] : charge écartée", SocketEventNames.COMMUNITY_JOIN_REQUESTED)
                    } else {
                        subject.emitOrLog(SocketEventNames.COMMUNITY_JOIN_REQUESTED, event)
                    }
                },
            ),
        )
    }

    /** La déconnexion OUBLIE le registre du transport : la session suivante réinstalle la route. */
    override fun detach() {
        installed.set(false)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CommunityJoinRequestedModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: CommunityJoinRequestedBinding): RealtimeBinding
}
