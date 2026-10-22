package me.meeshy.sdk.network

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.AndroidNetworkConditionMonitor
import me.meeshy.sdk.model.ConnectionType
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.NetworkPathSnapshot
import org.junit.Test

/**
 * The test seam of the network (nss-net-reachability): `simulateOffline` / `simulateOnline` drive
 * the whole pipeline — binary reading, interface type, qualitative reading — without a
 * `ConnectivityManager`, so the sync pill, the socket resume and the outbox gate can be proven
 * against it. Virtual time throughout.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NetworkPathSourceTest {

    private val cellular = NetworkPathSnapshot(isSatisfied = true, isConstrained = true, usesCellular = true)

    private fun TestScope.advance(millis: Long) {
        advanceTimeBy(millis)
        runCurrent()
    }

    private fun <T> TestScope.record(flow: StateFlow<T>): List<T> {
        val seen = mutableListOf<T>()
        backgroundScope.launch { flow.collect { seen.add(it) } }
        runCurrent()
        return seen
    }

    @Test
    fun `a fresh source is online on Wi-Fi, so nothing is blocked at launch`() {
        val source = InMemoryNetworkPathSource()

        assertThat(source.snapshot.value.isSatisfied).isTrue()
        assertThat(source.snapshot.value.connectionType).isEqualTo(ConnectionType.WIFI)
    }

    @Test
    fun `simulateOffline publishes the offline path`() {
        val source = InMemoryNetworkPathSource()

        source.simulateOffline()

        assertThat(source.snapshot.value).isEqualTo(NetworkPathSnapshot.OFFLINE)
    }

    @Test
    fun `simulateOnline brings a satisfied path back`() {
        val source = InMemoryNetworkPathSource(initial = NetworkPathSnapshot.OFFLINE)

        source.simulateOnline()

        assertThat(source.snapshot.value.isSatisfied).isTrue()
    }

    @Test
    fun `publish drives an arbitrary photo of the path`() {
        val source = InMemoryNetworkPathSource()

        source.publish(cellular)

        assertThat(source.snapshot.value).isEqualTo(cellular)
    }

    @Test
    fun `the monitor starts from the source and not from a fabricated offline`() = runTest {
        val monitor = AndroidNetworkMonitor(InMemoryNetworkPathSource(), backgroundScope)

        assertThat(monitor.isOnline.value).isTrue()
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.WIFI)
    }

    @Test
    fun `a source that really is offline gives an offline monitor at once`() = runTest {
        val monitor = AndroidNetworkMonitor(
            InMemoryNetworkPathSource(initial = NetworkPathSnapshot.OFFLINE),
            backgroundScope,
        )

        assertThat(monitor.isOnline.value).isFalse()
    }

    @Test
    fun `simulateOffline reaches the monitor only after 500 ms`() = runTest {
        val source = InMemoryNetworkPathSource()
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val seen = record(monitor.isOnline)

        source.simulateOffline()
        advance(499)
        assertThat(seen).containsExactly(true)

        advance(1)
        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `simulateOnline reaches the monitor without delay`() = runTest {
        val source = InMemoryNetworkPathSource()
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val seen = record(monitor.isOnline)
        source.simulateOffline()
        advance(600)

        source.simulateOnline()
        runCurrent()

        assertThat(seen).containsExactly(true, false, true).inOrder()
    }

    @Test
    fun `a flicker of the source does not flicker the monitor`() = runTest {
        val source = InMemoryNetworkPathSource()
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val seen = record(monitor.isOnline)

        repeat(5) {
            source.simulateOffline()
            advance(100)
            source.simulateOnline()
            advance(100)
        }

        assertThat(seen).containsExactly(true)
    }

    @Test
    fun `the interface type follows the source at once and falls back to unknown when offline`() = runTest {
        val source = InMemoryNetworkPathSource()
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val seen = record(monitor.connectionType)

        source.publish(cellular)
        runCurrent()
        source.simulateOffline()
        runCurrent()

        assertThat(seen)
            .containsExactly(ConnectionType.WIFI, ConnectionType.CELLULAR, ConnectionType.UNKNOWN)
            .inOrder()
    }

    @Test
    fun `the binary and the qualitative readings are two projections of the same source`() = runTest {
        val source = InMemoryNetworkPathSource()
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val condition = AndroidNetworkConditionMonitor(source, backgroundScope)

        source.simulateOffline()
        runCurrent()
        assertThat(condition.condition.value).isEqualTo(NetworkCondition.OFFLINE)
        assertThat(monitor.isOnline.value).isTrue()

        advance(500)
        assertThat(monitor.isOnline.value).isFalse()
        assertThat(condition.condition.value).isEqualTo(NetworkCondition.OFFLINE)

        source.simulateOnline()
        runCurrent()
        assertThat(monitor.isOnline.value).isTrue()
        assertThat(condition.condition.value).isEqualTo(NetworkCondition.WIFI)
    }

    @Test
    fun `the in-memory monitor flips synchronously, offline makes the interface unknown`() {
        val monitor = InMemoryNetworkMonitor()

        monitor.simulateOffline()
        assertThat(monitor.isOnline.value).isFalse()
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.UNKNOWN)

        monitor.simulateOnline()
        assertThat(monitor.isOnline.value).isTrue()
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.UNKNOWN)

        monitor.simulateConnection(ConnectionType.CELLULAR)
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.CELLULAR)
    }
}
