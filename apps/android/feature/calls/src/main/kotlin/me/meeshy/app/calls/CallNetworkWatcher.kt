package me.meeshy.app.calls

import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.NetworkPathSnapshot
import me.meeshy.sdk.model.call.CallNetworkEdge
import me.meeshy.sdk.model.call.CallNetworkEdgeLaw
import me.meeshy.sdk.network.NetworkPathSource
import javax.inject.Inject

/**
 * Les arêtes du réseau par défaut pendant un appel (Wi-Fi vers 4G, perte, retour — iOS
 * `CallManager+NetworkMonitoring`). Il ne lit AUCUN `NetworkCallback` de son cru : le processus n'en
 * enregistre qu'un, derrière [NetworkPathSource], et cette classe en est une projection.
 *
 * Les arêtes qui tombent dans la même fenêtre ([COALESCE_WINDOW_MS]) se COALESCENT en une seule, la
 * dernière : une coupure dont les arêtes perdu/retour battent deux fois en quelques centaines de
 * millisecondes ne réarme qu'une relance.
 */
class CallNetworkWatcher @Inject constructor(private val source: NetworkPathSource) {

    @OptIn(FlowPreview::class)
    fun edges(): Flow<CallNetworkEdge> = flow {
        var previous: NetworkPathSnapshot? = null
        source.snapshot.collect { next ->
            val before = previous
            previous = next
            if (before != null) CallNetworkEdgeLaw.edge(before, next)?.let { emit(it) }
        }
    }.debounce(COALESCE_WINDOW_MS)

    companion object {
        const val COALESCE_WINDOW_MS = 400L
    }
}
