package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationSyncCoordinatorTest {

    private class Clock(var now: Long = 100_000L) : CacheClock {
        override fun nowMillis() = now
    }

    private class Runner(var results: MutableList<Boolean> = mutableListOf()) : ConversationSyncRunner {
        var calls = 0
        var onRun: suspend () -> Unit = {}
        override suspend fun run(): Boolean {
            calls++
            onRun()
            return if (results.isEmpty()) true else results.removeAt(0)
        }
    }

    private class Harness(
        val runner: Runner = Runner(),
        val clock: Clock = Clock(),
        val foreground: MutableSharedFlow<Unit> = MutableSharedFlow(),
        val reconnect: MutableSharedFlow<Unit> = MutableSharedFlow(),
        val gaps: MutableSharedFlow<Unit> = MutableSharedFlow(),
        scope: kotlinx.coroutines.CoroutineScope,
    ) {
        val coordinator = ConversationSyncCoordinator(runner, clock, foreground, reconnect, gaps, scope)
    }

    @Test
    fun `deux declenchements a moins de 3 s ne produisent qu une synchro`() = runTest {
        val h = Harness(scope = backgroundScope)
        h.coordinator.sync()
        h.clock.now += 2_999
        h.coordinator.sync()
        assertThat(h.runner.calls).isEqualTo(1)
        h.clock.now += 1
        h.coordinator.sync()
        assertThat(h.runner.calls).isEqualTo(2)
    }

    @Test
    fun `un echec n alimente pas l anti-rafale`() = runTest {
        val h = Harness(runner = Runner(mutableListOf(false)), scope = backgroundScope)
        assertThat(h.coordinator.sync()).isFalse()
        h.coordinator.sync()
        assertThat(h.runner.calls).isEqualTo(2)
    }

    @Test
    fun `un rattrapage de reconnexion n est pas absorbe par l anti-rafale`() = runTest {
        val h = Harness(scope = backgroundScope)
        h.coordinator.sync()
        h.clock.now += 100
        h.coordinator.reconnected()
        assertThat(h.runner.calls).isEqualTo(2)
    }

    @Test
    fun `un rattrapage demande pendant une synchro en vol est rejoue apres elle`() = runTest {
        val h = Harness(scope = backgroundScope)
        val gate = CompletableDeferred<Unit>()
        h.runner.onRun = { if (h.runner.calls == 1) gate.await() }
        val first = backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { h.coordinator.sync() }
        assertThat(h.runner.calls).isEqualTo(1)
        h.coordinator.reconnected()
        assertThat(h.runner.calls).isEqualTo(1)
        gate.complete(Unit)
        first.join()
        assertThat(h.runner.calls).isEqualTo(2)
    }

    @Test
    fun `retour au premier plan, reconnexion et trou de sequence declenchent la synchro`() = runTest {
        val h = Harness(scope = backgroundScope)
        h.coordinator.attach()
        testScheduler.runCurrent()
        h.foreground.emit(Unit)
        testScheduler.runCurrent()
        assertThat(h.runner.calls).isEqualTo(1)
        h.clock.now += 5_000
        h.gaps.emit(Unit)
        testScheduler.runCurrent()
        assertThat(h.runner.calls).isEqualTo(2)
        h.clock.now += 100
        h.reconnect.emit(Unit)
        testScheduler.runCurrent()
        assertThat(h.runner.calls).isEqualTo(3)
        h.coordinator.detach()
    }
}
