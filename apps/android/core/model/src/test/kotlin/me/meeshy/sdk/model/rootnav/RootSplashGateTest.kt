package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RootSplashGateTest {

    private fun TestScope.gate() = RootSplashGate(elapsedMs = { currentTime }, pause = { kotlinx.coroutines.delay(it) })

    @Test
    fun `le rideau couvre au depart`() = runTest {
        assertThat(gate().phase.value).isEqualTo(SplashPhase.COVERING)
    }

    @Test
    fun `pret apres le plancher le rideau se leve aussitot puis disparait apres le fondu`() = runTest {
        val gate = gate()
        advanceTimeBy(500)
        val job = launch { gate.markReady() }
        runCurrent()
        assertThat(gate.phase.value).isEqualTo(SplashPhase.REVEALING)
        assertThat(gate.reveal).isEqualTo(SplashReveal.Ready)
        advanceTimeBy(RootSplashTiming.REVEAL_MS + 1)
        job.join()
        assertThat(gate.phase.value).isEqualTo(SplashPhase.GONE)
    }

    @Test
    fun `pret avant le plancher attend le reste du plancher`() = runTest {
        val gate = gate()
        advanceTimeBy(100)
        launch { gate.markReady() }
        runCurrent()
        assertThat(gate.phase.value).isEqualTo(SplashPhase.COVERING)
        advanceTimeBy(RootSplashTiming.FLOOR_MS - 100 + 1)
        assertThat(gate.phase.value).isEqualTo(SplashPhase.REVEALING)
    }

    @Test
    fun `le plafond leve le rideau quand le demarrage ne rend pas la main`() = runTest {
        val gate = gate()
        launch { gate.holdUntilCeiling() }
        advanceTimeBy(RootSplashTiming.CEILING_MS - 1)
        assertThat(gate.phase.value).isEqualTo(SplashPhase.COVERING)
        advanceTimeBy(2)
        assertThat(gate.phase.value).isEqualTo(SplashPhase.REVEALING)
        assertThat(gate.reveal).isEqualTo(SplashReveal.Ceiling)
    }

    @Test
    fun `la premiere sortie gagne et la seconde est inerte`() = runTest {
        val gate = gate()
        advanceTimeBy(500)
        launch { gate.markReady() }
        runCurrent()
        launch { gate.holdUntilCeiling() }
        advanceTimeBy(RootSplashTiming.CEILING_MS)
        assertThat(gate.reveal).isEqualTo(SplashReveal.Ready)
        assertThat(gate.phase.value).isEqualTo(SplashPhase.GONE)
    }

    @Test
    fun `les attentes restantes ne sont jamais negatives`() {
        assertThat(RootSplashTiming.remainingFloor(10_000)).isEqualTo(0)
        assertThat(RootSplashTiming.remainingCeiling(10_000)).isEqualTo(0)
        assertThat(RootSplashTiming.remainingFloor(100)).isEqualTo(300)
    }
}
