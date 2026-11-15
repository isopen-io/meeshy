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
import me.meeshy.sdk.model.battery.BatteryChangedWire
import me.meeshy.sdk.model.battery.BatteryClearedWire
import me.meeshy.sdk.model.battery.BatteryEvent
import me.meeshy.sdk.model.battery.BatteryPullRequestedWire
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Les trois événements DESCENDANTS de la batterie des Proches (#14147), tous sur la room `user:<id>` :
 * - `battery:changed` / `battery:cleared` — l'état d'une personne, projeté pour MOI, et parfois une annonce à faire
 *   défiler dans la SyncPill ; une charge hors contrat n'atteint jamais [events] ;
 * - `battery:pull-requested` — à MOI émetteur : relever maintenant.
 *
 * Patron de [RelationSocketEventsManager] : ses routes, sur le MÊME [SocketEventRouter], attachées au titre de
 * [RealtimeBinding].
 */
@Singleton
class BatterySocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<BatteryEvent>()
    private val _pullRequested = SocketInboundRoute.subject<BatteryPullRequestedWire>()

    /** L'état et les annonces des personnes qui me partagent leur batterie, dans l'ordre du fil. */
    val events: SharedFlow<BatteryEvent> = _events.exposed()

    /** « Relève maintenant » : un Sang l'a demandé (qui, la passerelle ne le dit pas). */
    val pullRequested: SharedFlow<BatteryPullRequestedWire> = _pullRequested.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.BATTERY_CHANGED, json, BatteryChangedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.BATTERY_CHANGED, it) }
        },
        SocketInboundRoute.decoding(SocketEventNames.BATTERY_CLEARED, json, BatteryClearedWire.serializer()) { wire ->
            wire.served()?.let { publish(SocketEventNames.BATTERY_CLEARED, it) }
        },
        SocketInboundRoute.decoding(SocketEventNames.BATTERY_PULL_REQUESTED, json, _pullRequested),
    )

    private fun publish(event: String, value: BatteryEvent) {
        SocketInboundRoute.run { _events.emitOrLog(event, value) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatterySocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: BatterySocketEventsManager): RealtimeBinding
}
