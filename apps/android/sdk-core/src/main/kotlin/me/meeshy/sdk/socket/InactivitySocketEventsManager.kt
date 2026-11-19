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
import me.meeshy.sdk.model.inactivity.InactivityAlertWire
import me.meeshy.sdk.model.inactivity.InactivityClearedWire
import me.meeshy.sdk.model.inactivity.InactivityEvent
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Les deux événements DESCENDANTS de la vérification d'inactivité (#18738), sur la room `user:<Sang>` :
 * `inactivity:alert` (l'état, et l'annonce qui défile) et `inactivity:cleared` (l'état disparaît). Une charge hors
 * contrat n'atteint jamais [events]. Aucun événement montant : l'activité est la socket du téléphone suivi, et la
 * réponse `POST /me/wellness/ok`.
 *
 * Patron de [PhoneReachabilitySocketEventsManager] : ses routes, sur le MÊME [SocketEventRouter], au titre de [RealtimeBinding].
 */
@Singleton
class InactivitySocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<InactivityEvent>()

    /** L'état et les annonces des personnes qui me partagent leur vérification d'inactivité, dans l'ordre du fil. */
    val events: SharedFlow<InactivityEvent> = _events.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.INACTIVITY_ALERT, json, InactivityAlertWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.INACTIVITY_ALERT, it) }
        },
        SocketInboundRoute.decoding(SocketEventNames.INACTIVITY_CLEARED, json, InactivityClearedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.INACTIVITY_CLEARED, it) }
        },
    )

    private fun publish(event: String, value: InactivityEvent) {
        SocketInboundRoute.run { _events.emitOrLog(event, value) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface InactivitySocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: InactivitySocketEventsManager): RealtimeBinding
}
