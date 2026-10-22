package me.meeshy.sdk.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.ConnectionType

/**
 * The BINARY reading of the network path — the Android analogue of iOS `NetworkMonitorProviding`.
 * "Am I online?" for the sync pill, the socket resume and the outbox network gate; the
 * qualitative reading (bad / good cellular, wifi) that drives the media auto-download is
 * [me.meeshy.sdk.media.NetworkConditionMonitor], derived from the SAME [NetworkPathSource].
 */
public interface NetworkMonitor {
    /**
     * `true` while a usable network is there. Debounced and de-duplicated: a cut shorter than
     * 500 ms is never published, a longer one is published once, and the return online is
     * published at once. Seeded synchronously from the current path — never "offline" before the
     * first system callback while a network is present.
     */
    public val isOnline: StateFlow<Boolean>

    /** Which interface carries the traffic. Not debounced. */
    public val connectionType: StateFlow<ConnectionType>
}

/**
 * Volatile [NetworkMonitor] — for tests and previews of the screens that read the network. No
 * debounce and no source: [simulateOffline] / [simulateOnline] flip the reading synchronously
 * (use [InMemoryNetworkPathSource] with [AndroidNetworkMonitor] to prove a debounce).
 */
public class InMemoryNetworkMonitor(
    initialOnline: Boolean = true,
    initialType: ConnectionType = if (initialOnline) ConnectionType.WIFI else ConnectionType.UNKNOWN,
) : NetworkMonitor {
    private val _isOnline = MutableStateFlow(initialOnline)
    private val _connectionType = MutableStateFlow(initialType)
    override val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()
    override val connectionType: StateFlow<ConnectionType> = _connectionType.asStateFlow()

    /** The device loses its network; the interface becomes unknown, as on iOS. */
    public fun simulateOffline() {
        _isOnline.value = false
        _connectionType.value = ConnectionType.UNKNOWN
    }

    /** The network is back; the interface is left as it was, as on iOS. */
    public fun simulateOnline() {
        _isOnline.value = true
    }

    /** Sets the interface the traffic goes through. */
    public fun simulateConnection(type: ConnectionType) {
        _connectionType.value = type
    }
}
