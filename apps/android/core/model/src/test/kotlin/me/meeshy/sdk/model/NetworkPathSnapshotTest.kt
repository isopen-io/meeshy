package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The raw photo of the network path and the two readings derived from it (nss-net-reachability —
 * port of iOS `NetworkPathSnapshot`, `NetworkMonitor.connectionType(for:)` and
 * `NetworkConditionMonitor.resolve(snapshot:)`). The capability mapping that feeds it from the
 * Android `NetworkCapabilities` is pinned against the mapping `AndroidNetworkConditionMonitor`
 * used before the single source existed, for EVERY combination of capabilities.
 */
class NetworkPathSnapshotTest {

    private data class Flags(
        val internet: Boolean,
        val validated: Boolean,
        val notMetered: Boolean,
        val wifi: Boolean,
        val cellular: Boolean,
        val ethernet: Boolean,
    )

    private val everyCapabilitySet: List<Flags> = (0 until 64).map { bits ->
        fun bit(index: Int) = bits and (1 shl index) != 0
        Flags(bit(0), bit(1), bit(2), bit(3), bit(4), bit(5))
    }

    private fun snapshot(flags: Flags) = NetworkPathSnapshot.fromCapabilityFlags(
        hasInternet = flags.internet,
        isValidated = flags.validated,
        isNotMetered = flags.notMetered,
        hasWifi = flags.wifi,
        hasCellular = flags.cellular,
        hasEthernet = flags.ethernet,
    )

    /** The mapping `AndroidNetworkConditionMonitor.resolve` carried before the refactor. */
    private fun legacyCondition(flags: Flags): NetworkCondition =
        NetworkConditionResolver.resolveFromFlags(
            isSatisfied = flags.internet && flags.validated,
            isConstrained = !flags.notMetered,
            usesWifi = flags.wifi || flags.ethernet,
            usesCellular = flags.cellular,
        )

    @Test
    fun `the condition is the same as before the refactor for every set of capabilities`() {
        everyCapabilitySet.forEach { flags ->
            assertThat(snapshot(flags).condition).isEqualTo(legacyCondition(flags))
        }
    }

    @Test
    fun `a path is satisfied only when it reaches the internet AND is validated`() {
        everyCapabilitySet.forEach { flags ->
            assertThat(snapshot(flags).isSatisfied).isEqualTo(flags.internet && flags.validated)
        }
    }

    @Test
    fun `the binary and the qualitative readings never disagree about being offline`() {
        everyCapabilitySet.forEach { flags ->
            val snapshot = snapshot(flags)
            assertThat(snapshot.condition == NetworkCondition.OFFLINE).isEqualTo(!snapshot.isSatisfied)
        }
    }

    @Test
    fun `a metered link is constrained`() {
        assertThat(snapshot(Flags(true, true, false, true, false, false)).isConstrained).isTrue()
        assertThat(snapshot(Flags(true, true, true, true, false, false)).isConstrained).isFalse()
    }

    @Test
    fun `the connection type prefers wifi, then cellular, then wired`() {
        val all = NetworkPathSnapshot(isSatisfied = true, usesWifi = true, usesCellular = true, usesWired = true)
        val cellularAndWired = all.copy(usesWifi = false)
        val wiredOnly = all.copy(usesWifi = false, usesCellular = false)

        assertThat(all.connectionType).isEqualTo(ConnectionType.WIFI)
        assertThat(cellularAndWired.connectionType).isEqualTo(ConnectionType.CELLULAR)
        assertThat(wiredOnly.connectionType).isEqualTo(ConnectionType.WIRED)
    }

    @Test
    fun `a path without any known interface has an unknown connection type`() {
        assertThat(NetworkPathSnapshot(isSatisfied = true).connectionType).isEqualTo(ConnectionType.UNKNOWN)
        assertThat(NetworkPathSnapshot.OFFLINE.connectionType).isEqualTo(ConnectionType.UNKNOWN)
    }

    @Test
    fun `the offline path resolves to offline`() {
        assertThat(NetworkPathSnapshot.OFFLINE.isSatisfied).isFalse()
        assertThat(NetworkPathSnapshot.OFFLINE.condition).isEqualTo(NetworkCondition.OFFLINE)
    }

    @Test
    fun `the unknown path is online but of low quality, so it blocks no send and spends no data plan`() {
        assertThat(NetworkPathSnapshot.UNKNOWN.isSatisfied).isTrue()
        assertThat(NetworkPathSnapshot.UNKNOWN.condition).isEqualTo(NetworkCondition.BAD_CELLULAR)
    }

    @Test
    fun `ethernet counts as wifi for the quality reading`() {
        val wired = NetworkPathSnapshot(isSatisfied = true, usesWired = true)

        assertThat(wired.condition).isEqualTo(NetworkCondition.WIFI)
        assertThat(wired.connectionType).isEqualTo(ConnectionType.WIRED)
    }

    @Test
    fun `connection type raw names match iOS`() {
        assertThat(ConnectionType.entries.map { it.rawValue })
            .containsExactly("wifi", "cellular", "wired", "unknown").inOrder()
    }
}
