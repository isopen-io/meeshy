package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.ConnectionType
import me.meeshy.sdk.model.NetworkPathSnapshot

/** Une arête du chemin réseau par défaut, vue depuis un appel en cours. */
enum class CallNetworkEdge {
    /** Plus aucun réseau par défaut. */
    Lost,

    /** Le réseau par défaut est revenu. */
    Restored,

    /** Le trafic change d'interface (Wi-Fi vers 4G et retour) : les adresses des candidats ICE sont mortes. */
    InterfaceChanged,
}

/** La lecture d'une arête entre deux photos successives du chemin (iOS `CallManager+NetworkMonitoring`). */
object CallNetworkEdgeLaw {
    fun edge(previous: NetworkPathSnapshot, next: NetworkPathSnapshot): CallNetworkEdge? = when {
        previous.isSatisfied && !next.isSatisfied -> CallNetworkEdge.Lost
        !previous.isSatisfied && next.isSatisfied -> CallNetworkEdge.Restored
        previous.isSatisfied && next.isSatisfied && changedInterface(previous, next) -> CallNetworkEdge.InterfaceChanged
        else -> null
    }

    private fun changedInterface(previous: NetworkPathSnapshot, next: NetworkPathSnapshot): Boolean {
        val before = previous.connectionType
        val after = next.connectionType
        return before != after && before != ConnectionType.UNKNOWN &&
            after != ConnectionType.UNKNOWN
    }
}
