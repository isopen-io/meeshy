package me.meeshy.sdk.model

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * The interface the device is currently talking through — port of iOS
 * `NetworkMonitor.ConnectionType` (same four cases, same raw names).
 */
public enum class ConnectionType(public val rawValue: String) {
    WIFI("wifi"),
    CELLULAR("cellular"),
    WIRED("wired"),
    UNKNOWN("unknown"),
}

/**
 * Raw photo of the network path, without interpretation — port of iOS `NetworkPathSnapshot`.
 * Every reading of the network derives from it ([isSatisfied] for the binary online / offline
 * reading, [condition] for the qualitative one that drives the media auto-download policy,
 * [connectionType] for the interface), so two readings can never contradict each other: the
 * single `registerDefaultNetworkCallback` of the process publishes ONE snapshot and everything
 * else is a projection of it.
 */
public data class NetworkPathSnapshot(
    val isSatisfied: Boolean,
    val isConstrained: Boolean = false,
    val usesWifi: Boolean = false,
    val usesCellular: Boolean = false,
    val usesWired: Boolean = false,
) {
    /** Which interface carries the traffic — wifi first, then cellular, then wired. */
    public val connectionType: ConnectionType
        get() = when {
            usesWifi -> ConnectionType.WIFI
            usesCellular -> ConnectionType.CELLULAR
            usesWired -> ConnectionType.WIRED
            else -> ConnectionType.UNKNOWN
        }

    /**
     * The qualitative reading, through the single [NetworkConditionResolver]. Ethernet is read as
     * wifi: it is an unmetered fixed link, exactly as `AndroidNetworkConditionMonitor` mapped it
     * before the single source existed.
     */
    public val condition: NetworkCondition
        get() = NetworkConditionResolver.resolveFromFlags(
            isSatisfied = isSatisfied,
            isConstrained = isConstrained,
            usesWifi = usesWifi || usesWired,
            usesCellular = usesCellular,
        )

    public companion object {
        /** The device really has no default network. */
        public val OFFLINE: NetworkPathSnapshot = NetworkPathSnapshot(isSatisfied = false)

        /**
         * "I don't know yet" is NOT "offline": a path nobody evaluated blocks no send (a wrong
         * "offline" blocks and the block lasts; a wrong "online" costs one attempt that fails
         * fast and returns to the queue) yet allows no heavy media download (a wrong "good
         * network" spends the user's data plan). Online, constrained — it resolves to
         * [NetworkCondition.BAD_CELLULAR].
         */
        public val UNKNOWN: NetworkPathSnapshot = NetworkPathSnapshot(isSatisfied = true, isConstrained = true)

        /**
         * The Android capability mapping, flag-driven so it is proven without a
         * `ConnectivityManager`: reachable AND validated is "satisfied", a metered link is
         * "constrained", and each transport reports itself.
         */
        public fun fromCapabilityFlags(
            hasInternet: Boolean,
            isValidated: Boolean,
            isNotMetered: Boolean,
            hasWifi: Boolean,
            hasCellular: Boolean,
            hasEthernet: Boolean,
        ): NetworkPathSnapshot = NetworkPathSnapshot(
            isSatisfied = hasInternet && isValidated,
            isConstrained = !isNotMetered,
            usesWifi = hasWifi,
            usesCellular = hasCellular,
            usesWired = hasEthernet,
        )
    }
}

/**
 * The binary online / offline reading of the network path — port of iOS
 * `NetworkMonitor.isOfflinePublisher` plus its synchronous seed.
 *
 * - **Seeded from the current path**, synchronously: the reading never says "offline" before the
 *   first callback while a network is present, so the mutations queued at launch are not
 *   rejected by the outbox network gate (which arms no retry when it rejects).
 * - **A cut is published only if it lasts** [OFFLINE_DEBOUNCE_MILLIS]: a transient burst of path
 *   updates (a wifi → cellular handover, a flapping access point) never flickers the sync pill.
 * - **The return online is published at once** — there is no reason to make the user wait to be
 *   told the link is back.
 * - Duplicates are suppressed, so offline is published once per cut.
 */
public object NetworkReachabilityReducer {
    public const val OFFLINE_DEBOUNCE_MILLIS: Long = 500L

    @OptIn(FlowPreview::class)
    public fun isOnline(
        paths: StateFlow<NetworkPathSnapshot>,
        scope: CoroutineScope,
        offlineDebounceMillis: Long = OFFLINE_DEBOUNCE_MILLIS,
    ): StateFlow<Boolean> =
        paths
            .map { it.isSatisfied }
            .distinctUntilChanged()
            .debounce { online -> if (online) 0L else offlineDebounceMillis }
            .distinctUntilChanged()
            .stateIn(scope, SharingStarted.Eagerly, paths.value.isSatisfied)
}
