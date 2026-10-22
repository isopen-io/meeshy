package me.meeshy.sdk.media

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.NetworkConditionResolver
import me.meeshy.sdk.model.NetworkPathSnapshot
import me.meeshy.sdk.network.NetworkPathSource

/**
 * The live network-quality seam (feature-parity §L) — the Android analogue of iOS
 * `NetworkConditionMonitor`. Exposes the current [NetworkCondition] as an observable
 * [StateFlow] so a media view can read the up-to-date link quality when deciding whether to
 * auto-download an attachment (via `MediaAutoDownloadDecider`).
 *
 * A stateless building block with an opaque output: the framework `NetworkCapabilities`
 * mapping is confined to `AndroidNetworkPathSource` (the single network callback of the
 * process), and the actual condition is resolved through the pure, fully-tested
 * [NetworkConditionResolver]. "When to consult it / whether to actually kick a download" is
 * product orchestration and stays app-side.
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
 * [NetworkConditionMonitor] derived from the single [NetworkPathSource]. It no longer registers
 * its own network callback: the qualitative reading and the binary one
 * ([me.meeshy.sdk.network.NetworkMonitor]) are two projections of the same snapshots, so they
 * cannot contradict each other. The capability mapping lives in
 * [NetworkPathSnapshot.fromCapabilityFlags] and the decision in the pure, fully-tested
 * [NetworkConditionResolver]; this class is a one-line projection, seeded from the CURRENT
 * snapshot.
 */
public class AndroidNetworkConditionMonitor(
    source: NetworkPathSource,
    scope: CoroutineScope,
) : NetworkConditionMonitor {

    override val condition: StateFlow<NetworkCondition> =
        source.snapshot
            .map { it.condition }
            .distinctUntilChanged()
            .stateIn(scope, SharingStarted.Eagerly, source.snapshot.value.condition)
}
