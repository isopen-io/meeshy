package me.meeshy.sdk.network

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot

/**
 * A `ConnectivityManager` whose default network the test drives by hand: the seed it answers to
 * (`activeNetwork` + its capabilities) and the single callback it hands back, which the test then
 * invokes the way the platform does. Strict on purpose — any call the production code makes
 * beyond these (a second callback registered, say) fails the test.
 */
internal class FakeConnectivity(
    initialNetwork: Network? = null,
    initialCapabilities: NetworkCapabilities? = null,
    registrationFailure: Throwable? = null,
) {
    private val registeredCallback = slot<ConnectivityManager.NetworkCallback>()

    val manager: ConnectivityManager = mockk()

    /** The callback the code under test registered. */
    val callback: ConnectivityManager.NetworkCallback get() = registeredCallback.captured

    init {
        every { manager.activeNetwork } returns initialNetwork
        if (initialNetwork != null) {
            every { manager.getNetworkCapabilities(initialNetwork) } returns initialCapabilities
        }
        if (registrationFailure != null) {
            val failure: Throwable = registrationFailure
            every { manager.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) } throws failure
        } else {
            every { manager.registerDefaultNetworkCallback(capture(registeredCallback)) } just Runs
        }
    }
}

internal fun aNetwork(): Network = mockk()

internal fun capabilities(
    internet: Boolean = true,
    validated: Boolean = true,
    notMetered: Boolean = false,
    wifi: Boolean = false,
    cellular: Boolean = false,
    ethernet: Boolean = false,
): NetworkCapabilities {
    val builder = NetworkCapabilities.Builder()
    if (internet) builder.addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    if (validated) builder.addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    if (notMetered) builder.addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    if (wifi) builder.addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
    if (cellular) builder.addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
    if (ethernet) builder.addTransportType(NetworkCapabilities.TRANSPORT_ETHERNET)
    return builder.build()
}
