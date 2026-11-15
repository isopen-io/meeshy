package me.meeshy.sdk.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.ConnectionType
import me.meeshy.sdk.model.NetworkPathSnapshot
import me.meeshy.sdk.model.NetworkReachabilityReducer
import timber.log.Timber

/**
 * [NetworkPathSource] backed by the Android [ConnectivityManager] — the ONE
 * `registerDefaultNetworkCallback` of the process. Every reading of the network (binary and
 * qualitative) derives from the snapshots it publishes; nothing else may register a network
 * callback.
 *
 * - **Seeded from the current path, synchronously**: the first value is read from
 *   `activeNetwork` + its capabilities, never fabricated. A network that is there but whose
 *   capabilities cannot be read yet is [NetworkPathSnapshot.UNKNOWN] (online, low quality), not
 *   "offline": the outbox network gate rejects what is queued while the device looks offline and
 *   arms no retry, so being born offline would block the queue for the whole session.
 * - **The default network only**: unlike a `registerNetworkCallback` over every internet-capable
 *   network (where a cellular radio reporting in the background would overwrite the Wi-Fi the
 *   traffic really uses), the default-network callback follows the network the app is actually
 *   routed through.
 * - Capabilities are read in `onCapabilitiesChanged`, not in `onAvailable`: the platform
 *   documents that a synchronous query from `onAvailable` may return null or stale information.
 * - Registered once, for the life of the process (a Hilt singleton): there is deliberately no
 *   unregister. `NetworkCallbackSingleSiteGuardTest` fails if a second site registers one.
 */
public class AndroidNetworkPathSource internal constructor(
    private val connectivity: ConnectivityManager,
) : NetworkPathSource {

    public constructor(context: Context) : this(
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager,
    )

    // Declared before [_snapshot]: reading the seed assigns it, and a later initializer would reset it.
    @Volatile
    private var defaultNetwork: Network? = null

    private val _snapshot = MutableStateFlow(readCurrentPath())
    override val snapshot: StateFlow<NetworkPathSnapshot> = _snapshot.asStateFlow()

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            defaultNetwork = network
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            defaultNetwork = network
            _snapshot.value = capabilities.toSnapshot()
        }

        override fun onLost(network: Network) {
            if (network != defaultNetwork) return
            defaultNetwork = null
            _snapshot.value = NetworkPathSnapshot.OFFLINE
        }
    }

    init {
        runCatching { connectivity.registerDefaultNetworkCallback(callback) }
            .onFailure { Timber.w(it, "Network path: the default network callback could not be registered") }
    }

    private fun readCurrentPath(): NetworkPathSnapshot = runCatching {
        val network = connectivity.activeNetwork
        defaultNetwork = network
        if (network == null) {
            NetworkPathSnapshot.OFFLINE
        } else {
            connectivity.getNetworkCapabilities(network)?.toSnapshot() ?: NetworkPathSnapshot.UNKNOWN
        }
    }.getOrElse { NetworkPathSnapshot.UNKNOWN }
}

private fun NetworkCapabilities.toSnapshot(): NetworkPathSnapshot = NetworkPathSnapshot.fromCapabilityFlags(
    hasInternet = hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
    isValidated = hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
    isNotMetered = hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
    hasWifi = hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
    hasCellular = hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
    hasEthernet = hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET),
)

/**
 * [NetworkMonitor] over a [NetworkPathSource]: the binary reading ([NetworkReachabilityReducer],
 * debounced) and the interface type are two projections of the same snapshots, so the pill, the
 * socket resume and the outbox gate can never contradict the media policy.
 */
public class AndroidNetworkMonitor(
    source: NetworkPathSource,
    scope: CoroutineScope,
    offlineDebounceMillis: Long = NetworkReachabilityReducer.OFFLINE_DEBOUNCE_MILLIS,
) : NetworkMonitor {

    override val isOnline: StateFlow<Boolean> =
        NetworkReachabilityReducer.isOnline(source.snapshot, scope, offlineDebounceMillis)

    override val connectionType: StateFlow<ConnectionType> =
        source.snapshot
            .map { it.connectionType }
            .distinctUntilChanged()
            .stateIn(scope, SharingStarted.Eagerly, source.snapshot.value.connectionType)
}
