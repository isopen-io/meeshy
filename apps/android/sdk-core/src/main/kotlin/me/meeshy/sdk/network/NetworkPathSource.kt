package me.meeshy.sdk.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.NetworkPathSnapshot

/**
 * **The single source of the network path for the whole SDK** — the Android analogue of iOS
 * `NetworkPathSource`.
 *
 * Two network readings used to exist side by side, each watching the system on its own: the
 * qualitative one ([me.meeshy.sdk.media.NetworkConditionMonitor], for the media auto-download
 * policy) and, as soon as the sync pill, the socket resume and the outbox network gate need the
 * binary question "am I online?", a second one. Two watchers are two truths that can diverge —
 * the pill says "Offline" while the outbox believes it may send, or the reverse, a stuck queue
 * nobody can see. They are now two PROJECTIONS of this one flow: [NetworkMonitor] (binary,
 * debounced) and `NetworkConditionMonitor` (qualitative).
 *
 * The flow is a [StateFlow] so it carries both the iOS `current` (its value, always readable
 * synchronously, the seed of every reading) and the iOS `publisher` (its updates).
 */
public interface NetworkPathSource {
    /** The last known photo of the path. Never "unknown → offline": see [NetworkPathSnapshot.UNKNOWN]. */
    public val snapshot: StateFlow<NetworkPathSnapshot>
}

/**
 * Volatile [NetworkPathSource] — the test seam of the program. It drives the network without a
 * `ConnectivityManager`, so the sync pill, the socket resume and the outbox gate can be proven by
 * flipping [simulateOffline] / [simulateOnline] (or [publish] for a finer photo), over the real
 * [AndroidNetworkMonitor] debounce in virtual time, or through [InMemoryNetworkMonitor] when the
 * debounce is not the subject.
 */
public class InMemoryNetworkPathSource(
    initial: NetworkPathSnapshot = ONLINE_WIFI,
) : NetworkPathSource {
    private val _snapshot = MutableStateFlow(initial)
    override val snapshot: StateFlow<NetworkPathSnapshot> = _snapshot.asStateFlow()

    /** Publishes an arbitrary photo of the path. */
    public fun publish(snapshot: NetworkPathSnapshot) {
        _snapshot.value = snapshot
    }

    /** The device loses its default network. */
    public fun simulateOffline() {
        publish(NetworkPathSnapshot.OFFLINE)
    }

    /** The device gets back a satisfied, unmetered Wi-Fi path. */
    public fun simulateOnline() {
        publish(ONLINE_WIFI)
    }

    public companion object {
        public val ONLINE_WIFI: NetworkPathSnapshot = NetworkPathSnapshot(isSatisfied = true, usesWifi = true)
    }
}
