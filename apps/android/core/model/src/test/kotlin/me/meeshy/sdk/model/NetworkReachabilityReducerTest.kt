package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * The binary online / offline reading of the network path (nss-net-reachability — port of iOS
 * `NetworkMonitor.isOfflinePublisher`: 500 ms debounce, duplicate suppression, and a seed taken
 * from the CURRENT path so "I don't know yet" is never published as "offline"). Virtual time:
 * every delay below is the scheduler's, never the wall clock's.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NetworkReachabilityReducerTest {

    private val wifi = NetworkPathSnapshot(isSatisfied = true, usesWifi = true)
    private val cellular = NetworkPathSnapshot(isSatisfied = true, isConstrained = true, usesCellular = true)
    private val offline = NetworkPathSnapshot.OFFLINE

    private fun TestScope.reading(path: StateFlow<NetworkPathSnapshot>): StateFlow<Boolean> =
        NetworkReachabilityReducer.isOnline(path, backgroundScope)

    private fun TestScope.record(reading: StateFlow<Boolean>): List<Boolean> {
        val seen = mutableListOf<Boolean>()
        backgroundScope.launch { reading.collect { seen.add(it) } }
        return seen
    }

    private suspend fun TestScope.advance(millis: Long) {
        advanceTimeBy(millis)
        runCurrent()
    }

    @Test
    fun `the reading is seeded from the current path before any callback fired`() = runTest {
        val reading = reading(MutableStateFlow(wifi))

        assertThat(reading.value).isTrue()
    }

    @Test
    fun `a path not evaluated yet is read online, never a fabricated offline`() = runTest {
        val reading = reading(MutableStateFlow(NetworkPathSnapshot.UNKNOWN))
        val seen = record(reading)

        runCurrent()
        advance(10_000)

        assertThat(reading.value).isTrue()
        assertThat(seen).containsExactly(true)
    }

    @Test
    fun `a device that really has no network starts offline at once, without waiting`() = runTest {
        val reading = reading(MutableStateFlow(offline))

        assertThat(reading.value).isFalse()
    }

    @Test
    fun `a cut shorter than 500 ms publishes nothing`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()

        path.value = offline
        advance(499)
        path.value = wifi
        advance(2_000)

        assertThat(seen).containsExactly(true)
    }

    @Test
    fun `a cut lasting 500 ms publishes offline, not a millisecond sooner`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()

        path.value = offline
        advance(499)
        assertThat(seen).containsExactly(true)

        advance(1)
        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `a long cut publishes offline exactly once`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()

        path.value = offline
        advance(5_000)
        path.value = NetworkPathSnapshot(isSatisfied = false, usesWifi = true)
        advance(5_000)

        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `a second offline snapshot does not restart the debounce clock`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()

        path.value = offline
        advance(300)
        path.value = NetworkPathSnapshot(isSatisfied = false, usesWifi = true)
        advance(200)

        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `the return online is published without any delay`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()
        path.value = offline
        advance(600)

        path.value = wifi
        runCurrent()

        assertThat(seen).containsExactly(true, false, true).inOrder()
    }

    @Test
    fun `moving between two connected paths publishes nothing`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()

        path.value = cellular
        advance(1_000)
        path.value = wifi
        advance(1_000)

        assertThat(seen).containsExactly(true)
    }

    @Test
    fun `two brief cuts in a row stay invisible`() = runTest {
        val path = MutableStateFlow(wifi)
        val seen = record(reading(path))
        runCurrent()

        repeat(3) {
            path.value = offline
            advance(400)
            path.value = wifi
            advance(400)
        }

        assertThat(seen).containsExactly(true)
    }

    @Test
    fun `the offline delay is the one given`() = runTest {
        val path = MutableStateFlow(wifi)
        val reading = NetworkReachabilityReducer.isOnline(path, backgroundScope, offlineDebounceMillis = 2_000)
        val seen = record(reading)
        runCurrent()

        path.value = offline
        advance(1_999)
        assertThat(seen).containsExactly(true)

        advance(1)
        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `the default offline delay is 500 ms like on iOS`() {
        assertThat(NetworkReachabilityReducer.OFFLINE_DEBOUNCE_MILLIS).isEqualTo(500L)
    }
}
