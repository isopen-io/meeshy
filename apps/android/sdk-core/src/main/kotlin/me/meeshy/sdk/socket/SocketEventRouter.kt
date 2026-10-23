package me.meeshy.sdk.socket

import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.DefaultDispatcher
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Ce dont le routeur a besoin d'un transport : poser un écouteur par nom d'événement. */
fun interface SocketEventRegistrar {
    fun on(event: String, callback: (Array<Any>) -> Unit)
}

/**
 * Installe les routes entrantes d'une famille d'événements et les alimente par UNE voie série.
 *
 * Toutes les familles partagent le même routeur (singleton), donc la même [OrderedDeliveryLane] : l'ordre
 * relatif de `message:new` et de `message:edited` est celui de l'arrivée, même quand deux familles
 * différentes les portent. Un gestionnaire n'ajoute plus de `socketManager.on(...)` : il déclare ses
 * [SocketInboundRoute] et appelle [install]. Le routeur s'essaie sans socket (faux [SocketEventRegistrar]).
 */
@Singleton
class SocketEventRouter internal constructor(
    private val registrar: SocketEventRegistrar,
    dispatcher: CoroutineDispatcher,
) {
    @Inject
    constructor(
        socketManager: SocketManager,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(SocketEventRegistrar { event, callback -> socketManager.on(event, callback) }, dispatcher)

    private val lane = OrderedDeliveryLane(dispatcher)

    fun install(routes: List<SocketInboundRoute>) {
        routes.forEach { route ->
            registrar.on(route.event) { args ->
                try {
                    route.receive(args, lane)
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.e("Socket route [%s]: %s", route.event, failure.javaClass.simpleName)
                }
            }
        }
    }

    /** Ferme la voie série (fin de session de test ou de processus). */
    fun close() = lane.close()
}
