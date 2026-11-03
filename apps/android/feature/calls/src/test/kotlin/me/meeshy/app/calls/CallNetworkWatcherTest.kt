package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.NetworkPathSnapshot
import me.meeshy.sdk.model.call.CallNetworkEdge
import me.meeshy.sdk.network.InMemoryNetworkPathSource
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallNetworkWatcherTest {
    private val wifi = NetworkPathSnapshot(isSatisfied = true, usesWifi = true)
    private val cellular = NetworkPathSnapshot(isSatisfied = true, usesCellular = true)

    @Test
    fun `a Wi-Fi to LTE handoff is one interface edge`() = runTest {
        val source = InMemoryNetworkPathSource(wifi)
        val edges = mutableListOf<CallNetworkEdge>()
        CallNetworkWatcher(source).edges().onEach { edges += it }.launchIn(backgroundScope)
        runCurrent()

        source.publish(cellular)
        advanceTimeBy(1_000)
        runCurrent()

        assertThat(edges).containsExactly(CallNetworkEdge.InterfaceChanged)
    }

    @Test
    fun `lost then restored inside the window coalesce into the last edge only`() = runTest {
        val source = InMemoryNetworkPathSource(wifi)
        val edges = mutableListOf<CallNetworkEdge>()
        CallNetworkWatcher(source).edges().onEach { edges += it }.launchIn(backgroundScope)
        runCurrent()

        source.simulateOffline()
        runCurrent()
        advanceTimeBy(100)
        source.publish(cellular)
        advanceTimeBy(1_000)
        runCurrent()

        assertThat(edges).containsExactly(CallNetworkEdge.Restored)
    }

    @Test
    fun `a lasting loss and its later return are two edges`() = runTest {
        val source = InMemoryNetworkPathSource(wifi)
        val edges = mutableListOf<CallNetworkEdge>()
        CallNetworkWatcher(source).edges().onEach { edges += it }.launchIn(backgroundScope)
        runCurrent()

        source.simulateOffline()
        advanceTimeBy(2_000)
        runCurrent()
        source.publish(wifi)
        advanceTimeBy(2_000)
        runCurrent()

        assertThat(edges).containsExactly(CallNetworkEdge.Lost, CallNetworkEdge.Restored).inOrder()
    }

    @Test
    fun `the path already known when the call opens is not an edge`() = runTest {
        val source = InMemoryNetworkPathSource(wifi)
        val edges = mutableListOf<CallNetworkEdge>()
        CallNetworkWatcher(source).edges().onEach { edges += it }.launchIn(backgroundScope)

        advanceTimeBy(5_000)
        runCurrent()

        assertThat(edges).isEmpty()
    }
}
