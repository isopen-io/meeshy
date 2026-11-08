package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.arrivals
import timber.log.Timber

/**
 * Le relais PERMANENT (sans écran) entre la socket et le cache Room (miroir de `startSocketRelay`, iOS) :
 * armé par `RealtimeSessionCoordinator` à la connexion, il applique les mutations dans l'ordre d'ARRIVÉE,
 * conversation ouverte ou non, si bien que rouvrir une conversation hors ligne affiche déjà le dernier
 * message, l'aperçu et le non-lu. Il se désarme à la déconnexion (la file est fermée, ce qui attendait
 * est jeté) et jette tout événement arrivé sous un autre compte que l'actuel.
 *
 * Il ne connaît aucun événement : chaque famille arrive par un [RealtimeCacheApplier] contribué en `@IntoSet`.
 */
@Singleton
class ConversationRealtimeRelay internal constructor(
    private val appliers: Set<RealtimeCacheApplier>,
    private val scopeFactory: () -> CoroutineScope,
    private val isCurrent: (AccountTicket) -> Boolean,
) : RealtimeBinding {

    @Inject
    constructor(
        appliers: Set<@JvmSuppressWildcards RealtimeCacheApplier>,
        fence: AccountFence,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(appliers, { CoroutineScope(SupervisorJob() + io) }, fence::isCurrent)

    private val lock = Any()
    private var armed: Armed? = null

    private class Armed(val scope: CoroutineScope, val lane: OrderedEventLane)

    /** Le travail en file d'une famille, rendu à la main (barrière des tests). */
    internal suspend fun barrier(family: OrderedEventLane.Family) {
        val lane = synchronized(lock) { armed?.lane } ?: return
        lane.barrier(family)
    }

    override fun attach() {
        detach()
        val scope = scopeFactory()
        val lane = OrderedEventLane(scope)
        val registrar = object : RelayRegistrar {
            override fun <T> relay(flow: SharedFlow<T>, family: OrderedEventLane.Family, apply: suspend (T) -> Unit) {
                scope.launch {
                    flow.arrivals().collect { arrived ->
                        val ticket = arrived.ticket
                        lane.submit(family) {
                            if (ticket == null || isCurrent(ticket)) apply(arrived.value)
                        }
                    }
                }
            }
        }
        synchronized(lock) { armed = Armed(scope, lane) }
        appliers.forEach { applier ->
            try {
                applier.subscribe(registrar)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.e("Relais: applicateur %s en echec", applier.javaClass.simpleName)
            }
        }
    }

    override fun detach() {
        val previous = synchronized(lock) { armed.also { armed = null } } ?: return
        previous.lane.close()
        previous.scope.cancel()
    }
}
