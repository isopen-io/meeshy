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
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEvent
import me.meeshy.sdk.model.phonereachability.PhoneReachableWire
import me.meeshy.sdk.model.phonereachability.PhoneUnreachableWire
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Les deux événements DESCENDANTS du téléphone injoignable (#18737), sur la room `user:<lecteur>` :
 * `phone:unreachable` (l'état, et l'annonce quand mon canal est la SyncPill) et `phone:reachable` (l'état disparaît).
 * Une charge hors contrat n'atteint jamais [events]. Aucun événement montant : le signe de vie du téléphone est sa
 * connexion, son relevé de batterie ou `POST /me/device/alive`.
 *
 * Patron de [BatterySocketEventsManager] : ses routes, sur le MÊME [SocketEventRouter], au titre de [RealtimeBinding].
 */
@Singleton
class PhoneReachabilitySocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<PhoneReachabilityEvent>()

    /** L'état et les annonces des personnes qui me partagent l'injoignabilité de leur téléphone, dans l'ordre du fil. */
    val events: SharedFlow<PhoneReachabilityEvent> = _events.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.PHONE_UNREACHABLE, json, PhoneUnreachableWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.PHONE_UNREACHABLE, it) }
        },
        SocketInboundRoute.decoding(SocketEventNames.PHONE_REACHABLE, json, PhoneReachableWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.PHONE_REACHABLE, it) }
        },
    )

    private fun publish(event: String, value: PhoneReachabilityEvent) {
        SocketInboundRoute.run { _events.emitOrLog(event, value) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneReachabilitySocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: PhoneReachabilitySocketEventsManager): RealtimeBinding
}
