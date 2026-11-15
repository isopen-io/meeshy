package me.meeshy.sdk.network

import android.net.NetworkCapabilities
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.AndroidNetworkConditionMonitor
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.NetworkConditionResolver
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The media auto-download consumers of `NetworkConditionMonitor` must behave exactly as before the
 * single network source: for EVERY combination of capabilities (internet, validated, not metered,
 * wifi, cellular, ethernet — 64 sets), the condition read through the new pipeline is the one the
 * former `AndroidNetworkConditionMonitor.resolve` produced straight from the capabilities.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NetworkConditionMonitorParityTest {

    private fun everyCapabilitySet(): List<NetworkCapabilities> = (0 until 64).map { bits ->
        fun bit(index: Int) = bits and (1 shl index) != 0
        capabilities(
            internet = bit(0),
            validated = bit(1),
            notMetered = bit(2),
            wifi = bit(3),
            cellular = bit(4),
            ethernet = bit(5),
        )
    }

    /** The mapping `AndroidNetworkConditionMonitor` applied to the capabilities before the refactor. */
    private fun legacyCondition(caps: NetworkCapabilities): NetworkCondition =
        NetworkConditionResolver.resolveFromFlags(
            isSatisfied = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            isConstrained = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
            usesWifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET),
            usesCellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
        )

    @Test
    fun `the seeded condition is the former one for every set of capabilities`() = runTest {
        everyCapabilitySet().forEach { caps ->
            val connectivity = FakeConnectivity(aNetwork(), caps)
            val monitor = AndroidNetworkConditionMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)

            assertWithMessage("seed for $caps")
                .that(monitor.condition.value)
                .isEqualTo(legacyCondition(caps))
        }
    }

    @Test
    fun `the condition delivered by the callback is the former one for every set of capabilities`() = runTest {
        val network = aNetwork()
        val connectivity = FakeConnectivity(network, capabilities(wifi = true))
        val monitor = AndroidNetworkConditionMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)
        runCurrent()

        everyCapabilitySet().forEach { caps ->
            connectivity.callback.onCapabilitiesChanged(network, caps)
            runCurrent()

            assertWithMessage("callback for $caps")
                .that(monitor.condition.value)
                .isEqualTo(legacyCondition(caps))
        }
    }

    @Test
    fun `the loss of the network still reads offline`() = runTest {
        val network = aNetwork()
        val connectivity = FakeConnectivity(network, capabilities(wifi = true))
        val monitor = AndroidNetworkConditionMonitor(AndroidNetworkPathSource(connectivity.manager), backgroundScope)
        runCurrent()

        connectivity.callback.onLost(network)
        runCurrent()

        assertWithMessage("after the loss").that(monitor.condition.value).isEqualTo(NetworkCondition.OFFLINE)
    }
}
