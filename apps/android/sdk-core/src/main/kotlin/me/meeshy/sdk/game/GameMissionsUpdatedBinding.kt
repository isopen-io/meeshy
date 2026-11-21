package me.meeshy.sdk.game

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
import me.meeshy.sdk.model.game.GameMissionsUpdatedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.SocketInboundRoute.Companion.emitOrLog
import me.meeshy.sdk.socket.exposed

/**
 * `game:missions-updated` (#16425, tranche Android de #17367) : un acte du Rêve du lecteur vient d'avancer ou de se
 * terminer, ou le coffre du jour de s'ouvrir. L'événement ne porte pas l'état — c'est une invalidation, émise dans la
 * seule room `user:<moi>` — : [updated] l'annonce, et celui qui en a l'usage relit le bloc `game` (le guet de l'acte qui
 * avance, iOS `ConversationActAdvanceWatch.missionsUpdated`). Rien ne se relit ici : un événement sans écouteur ne coûte
 * aucune requête.
 *
 * [MessageSocketManager][me.meeshy.sdk.socket.MessageSocketManager] est gelé (socket-routage-evenements-ordre-arrivee) :
 * cette route se déclare ici et s'installe par [SocketEventRouter.install].
 */
@Singleton
class GameMissionsUpdatedBinding @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val subject = SocketInboundRoute.subject<GameMissionsUpdatedEvent>()
    private val installed = AtomicBoolean(false)

    /** Les invalidations des actes du jour, dans l'ordre d'arrivée. */
    val updated: SharedFlow<GameMissionsUpdatedEvent> = subject.exposed()

    override fun attach() {
        if (!installed.compareAndSet(false, true)) return
        router.install(
            listOf(
                SocketInboundRoute.decoding(
                    SocketEventNames.GAME_MISSIONS_UPDATED,
                    json,
                    GameMissionsUpdatedEvent.serializer(),
                ) { event -> subject.emitOrLog(SocketEventNames.GAME_MISSIONS_UPDATED, event) },
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
internal abstract class GameMissionsUpdatedModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: GameMissionsUpdatedBinding): RealtimeBinding
}
