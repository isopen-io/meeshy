package me.meeshy.sdk.media

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.NetworkConditionResolver

/**
 * The live network-quality seam (feature-parity §L) — the Android analogue of iOS
 * `NetworkConditionMonitor`. Exposes the current [NetworkCondition] as an observable
 * [StateFlow] so a media view can read the up-to-date link quality when deciding whether to
 * auto-download an attachment (via `MediaAutoDownloadDecider`).
 *
 * A stateless building block with an opaque output: the framework `NetworkCapabilities`
 * mapping is confined to [AndroidNetworkConditionMonitor], and the actual condition is
 * resolved through the pure, fully-tested [NetworkConditionResolver]. "When to consult it /
 * whether to actually kick a download" is product orchestration and stays app-side.
 */
public interface NetworkConditionMonitor {
    /** The current resolved network condition, updated as connectivity changes. */
    public val condition: StateFlow<NetworkCondition>
}

/** Volatile [NetworkConditionMonitor] — for tests and previews. */
public class InMemoryNetworkConditionMonitor(
    initial: NetworkCondition = NetworkCondition.WIFI,
) : NetworkConditionMonitor {
    private val _condition = MutableStateFlow(initial)
    override val condition: StateFlow<NetworkCondition> = _condition.asStateFlow()

    /** Drives a condition change (test/preview only). */
    public fun set(condition: NetworkCondition) {
        _condition.value = condition
    }
}

/**
 * [NetworkConditionMonitor] backed by the Android [ConnectivityManager]. Bridges the default
 * network's [NetworkCapabilities] onto the four connectivity flags the pure
 * [NetworkConditionResolver] consumes; all decision logic lives in that SSOT, so this class
 * is a thin, coverage-exempt glue shim.
 */
public class AndroidNetworkConditionMonitor(
    context: Context,
    scope: CoroutineScope,
) : NetworkConditionMonitor {

    private val connectivity =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override val condition: StateFlow<NetworkCondition> =
        callbackFlow {
            fun emitCurrent() {
                val caps = connectivity.activeNetwork?.let(connectivity::getNetworkCapabilities)
                trySend(resolve(caps))
            }

            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = emitCurrent()
                override fun onLost(network: Network) = emitCurrent()
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    trySend(resolve(caps))
                }
                override fun onUnavailable() = emitCurrent()
            }

            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivity.registerNetworkCallback(request, callback)
            emitCurrent()
            awaitClose { connectivity.unregisterNetworkCallback(callback) }
        }.stateIn(scope, SharingStarted.Eagerly, resolveDefault())

    private fun resolveDefault(): NetworkCondition =
        resolve(connectivity.activeNetwork?.let(connectivity::getNetworkCapabilities))

    private fun resolve(caps: NetworkCapabilities?): NetworkCondition {
        if (caps == null) return NetworkCondition.OFFLINE
        return NetworkConditionResolver.resolveFromFlags(
            isSatisfied = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            isConstrained = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
            usesWifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET),
            usesCellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
        )
    }
}
