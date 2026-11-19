package me.meeshy.sdk.socket

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
import me.meeshy.sdk.model.fall.FallClearedWire
import me.meeshy.sdk.model.fall.FallDetectedWire
import me.meeshy.sdk.model.fall.FallEvent
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Les deux événements DESCENDANTS de la chute détectée (#18748), sur la room `user:<Sang>` : `fall:detected` (l'état,
 * et l'annonce qui défile) et `fall:cleared` (l'état disparaît, avec sa raison). Une charge hors contrat n'atteint
 * jamais [events]. Aucun événement montant : l'iPhone rapporte par `POST /me/health/fall`.
 *
 * Patron d'[InactivitySocketEventsManager] : ses routes, sur le MÊME [SocketEventRouter], au titre de [RealtimeBinding].
 */
@Singleton
class FallSocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<FallEvent>()

    val events: SharedFlow<FallEvent> = _events.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.FALL_DETECTED, json, FallDetectedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.FALL_DETECTED, it) }
        },
        SocketInboundRoute.decoding(SocketEventNames.FALL_CLEARED, json, FallClearedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.FALL_CLEARED, it) }
        },
    )

    private fun publish(event: String, value: FallEvent) {
        SocketInboundRoute.run { _events.emitOrLog(event, value) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FallSocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: FallSocketEventsManager): RealtimeBinding
}
