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
import me.meeshy.sdk.model.phonecall.PhoneCallStartedWire
import me.meeshy.sdk.model.phonecall.PhoneCallEndedWire
import me.meeshy.sdk.model.phonecall.PhoneCallEvent
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Les deux événements DESCENDANTS d'« en appel » (#18753), sur la room `user:<Sang>` : `phone-call:started` (l'état, et
 * l'annonce qui défile) et `phone-call:ended` (l'état disparaît). Une charge hors contrat n'atteint jamais [events].
 * Aucun événement montant : le téléphone rapporte par `POST /me/device/call`.
 *
 * Patron de [InactivitySocketEventsManager] : ses routes, sur le MÊME [SocketEventRouter], au titre de [RealtimeBinding].
 */
@Singleton
class PhoneCallSocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<PhoneCallEvent>()

    /** L'état et les annonces des personnes qui me partagent « en appel », dans l'ordre du fil. */
    val events: SharedFlow<PhoneCallEvent> = _events.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.PHONE_CALL_STARTED, json, PhoneCallStartedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.PHONE_CALL_STARTED, it) }
        },
        SocketInboundRoute.decoding(SocketEventNames.PHONE_CALL_ENDED, json, PhoneCallEndedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.PHONE_CALL_ENDED, it) }
        },
    )

    private fun publish(event: String, value: PhoneCallEvent) {
        SocketInboundRoute.run { _events.emitOrLog(event, value) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneCallSocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: PhoneCallSocketEventsManager): RealtimeBinding
}
