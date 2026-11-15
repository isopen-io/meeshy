package me.meeshy.sdk.network

import android.net.ConnectivityManager
import com.google.common.truth.Truth.assertThat
import io.mockk.verify
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
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The Android glue of the single network path (nss-net-reachability): the ONE default-network
 * callback, its seed, and the transitions wifi → cellular → loss as the platform delivers them,
 * read through the real [AndroidNetworkMonitor] debounce in virtual time. Real
 * `NetworkCapabilities` (Robolectric), a strict `ConnectivityManager` double.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidNetworkMonitorTest {

    private val wifi = capabilities(notMetered = true, wifi = true)
    private val cellular = capabilities(cellular = true)

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
    fun `the path is seeded from the active network, validated Wi-Fi reads online at once`() = runTest {
        val connectivity = FakeConnectivity(aNetwork(), wifi)
        val source = AndroidNetworkPathSource(connectivity.manager)
        val monitor = AndroidNetworkMonitor(source, backgroundScope)

        assertThat(monitor.isOnline.value).isTrue()
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.WIFI)
    }

    @Test
    fun `a device without any network starts offline at once`() = runTest {
        val source = AndroidNetworkPathSource(FakeConnectivity().manager)
        val monitor = AndroidNetworkMonitor(source, backgroundScope)

        assertThat(source.snapshot.value).isEqualTo(NetworkPathSnapshot.OFFLINE)
        assertThat(monitor.isOnline.value).isFalse()
    }

    @Test
    fun `a network whose capabilities cannot be read yet is online with low quality, never offline`() = runTest {
        val source = AndroidNetworkPathSource(FakeConnectivity(aNetwork(), initialCapabilities = null).manager)
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val condition = AndroidNetworkConditionMonitor(source, backgroundScope)

        assertThat(monitor.isOnline.value).isTrue()
        assertThat(condition.condition.value).isEqualTo(NetworkCondition.BAD_CELLULAR)
    }

    @Test
    fun `a network not validated yet does not read online`() = runTest {
        val connectivity = FakeConnectivity(aNetwork(), capabilities(validated = false, wifi = true))
        val monitor = AndroidNetworkMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)

        assertThat(monitor.isOnline.value).isFalse()
    }

    @Test
    fun `exactly one default network callback is registered for every reading`() = runTest {
        val connectivity = FakeConnectivity(aNetwork(), wifi)
        val source = AndroidNetworkPathSource(connectivity.manager)

        AndroidNetworkMonitor(source, backgroundScope)
        AndroidNetworkConditionMonitor(source, backgroundScope)

        verify(exactly = 1) {
            connectivity.manager.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>())
        }
    }

    @Test
    fun `a registration the system refuses leaves the seed in place and does not crash`() = runTest {
        val connectivity = FakeConnectivity(aNetwork(), wifi, registrationFailure = SecurityException("no permission"))

        val source = AndroidNetworkPathSource(connectivity.manager)

        assertThat(source.snapshot.value.isSatisfied).isTrue()
    }

    @Test
    fun `moving from Wi-Fi to cellular changes the interface at once and publishes nothing offline`() = runTest {
        val wifiNetwork = aNetwork()
        val connectivity = FakeConnectivity(wifiNetwork, wifi)
        val source = AndroidNetworkPathSource(connectivity.manager)
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val condition = AndroidNetworkConditionMonitor(source, backgroundScope)
        val online = record(monitor.isOnline)
        val types = record(monitor.connectionType)
        val conditions = record(condition.condition)

        val cellularNetwork = aNetwork()
        connectivity.callback.onAvailable(cellularNetwork)
        connectivity.callback.onCapabilitiesChanged(cellularNetwork, cellular)
        connectivity.callback.onLost(wifiNetwork)
        advance(2_000)

        assertThat(online).containsExactly(true)
        assertThat(types).containsExactly(ConnectionType.WIFI, ConnectionType.CELLULAR).inOrder()
        assertThat(conditions).containsExactly(NetworkCondition.WIFI, NetworkCondition.BAD_CELLULAR).inOrder()
    }

    @Test
    fun `the loss of the default network reads offline after 500 ms and unknown interface at once`() = runTest {
        val wifiNetwork = aNetwork()
        val connectivity = FakeConnectivity(wifiNetwork, wifi)
        val source = AndroidNetworkPathSource(connectivity.manager)
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val condition = AndroidNetworkConditionMonitor(source, backgroundScope)
        val online = record(monitor.isOnline)

        connectivity.callback.onLost(wifiNetwork)
        runCurrent()
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.UNKNOWN)
        assertThat(condition.condition.value).isEqualTo(NetworkCondition.OFFLINE)
        advance(499)
        assertThat(online).containsExactly(true)

        advance(1)
        assertThat(online).containsExactly(true, false).inOrder()
    }

    @Test
    fun `the network coming back is published online without delay`() = runTest {
        val wifiNetwork = aNetwork()
        val connectivity = FakeConnectivity(wifiNetwork, wifi)
        val monitor = AndroidNetworkMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)
        val online = record(monitor.isOnline)
        connectivity.callback.onLost(wifiNetwork)
        advance(600)

        connectivity.callback.onAvailable(wifiNetwork)
        connectivity.callback.onCapabilitiesChanged(wifiNetwork, wifi)
        runCurrent()

        assertThat(online).containsExactly(true, false, true).inOrder()
    }

    @Test
    fun `a cut shorter than 500 ms is never seen`() = runTest {
        val wifiNetwork = aNetwork()
        val connectivity = FakeConnectivity(wifiNetwork, wifi)
        val monitor = AndroidNetworkMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)
        val online = record(monitor.isOnline)

        connectivity.callback.onLost(wifiNetwork)
        advance(300)
        connectivity.callback.onAvailable(wifiNetwork)
        connectivity.callback.onCapabilitiesChanged(wifiNetwork, wifi)
        advance(2_000)

        assertThat(online).containsExactly(true)
    }

    @Test
    fun `the late loss of a network that is no longer the default one is ignored`() = runTest {
        val wifiNetwork = aNetwork()
        val cellularNetwork = aNetwork()
        val connectivity = FakeConnectivity(wifiNetwork, wifi)
        val monitor = AndroidNetworkMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)
        val online = record(monitor.isOnline)
        connectivity.callback.onAvailable(cellularNetwork)
        connectivity.callback.onCapabilitiesChanged(cellularNetwork, cellular)

        connectivity.callback.onLost(wifiNetwork)
        advance(2_000)

        assertThat(online).containsExactly(true)
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.CELLULAR)
    }

    @Test
    fun `a network that loses its validation, a captive portal, reads offline after the debounce`() = runTest {
        val wifiNetwork = aNetwork()
        val connectivity = FakeConnectivity(wifiNetwork, wifi)
        val monitor = AndroidNetworkMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)
        val online = record(monitor.isOnline)

        connectivity.callback.onCapabilitiesChanged(wifiNetwork, capabilities(validated = false, wifi = true))
        advance(500)

        assertThat(online).containsExactly(true, false).inOrder()
        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.WIFI)
    }

    @Test
    fun `ethernet reads as a wired interface and as an unmetered link`() = runTest {
        val connectivity = FakeConnectivity(aNetwork(), capabilities(notMetered = true, ethernet = true))
        val source = AndroidNetworkPathSource(connectivity.manager)
        val monitor = AndroidNetworkMonitor(source, backgroundScope)
        val condition = AndroidNetworkConditionMonitor(source, backgroundScope)

        assertThat(monitor.connectionType.value).isEqualTo(ConnectionType.WIRED)
        assertThat(condition.condition.value).isEqualTo(NetworkCondition.WIFI)
    }
}
