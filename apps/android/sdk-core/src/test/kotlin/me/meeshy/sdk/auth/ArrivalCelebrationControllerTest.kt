package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ArrivalCelebrationControllerTest {
    private class CountingPreload : ArrivalPreloading {
        var runs = 0
        override suspend fun run() {
            runs++
        }
    }

    private fun TestScope.controller(preload: ArrivalPreloading = CountingPreload()) =
        ArrivalCelebrationController(preload, this)

    @Test
    fun `begin lance la fete et la tient 2,6 secondes`() = runTest {
        val controller = controller()
        controller.begin("u1")
        runCurrent()
        assertThat(controller.isShowing.value).isTrue()

        advanceTimeBy(2_599)
        assertThat(controller.isShowing.value).isTrue()

        advanceTimeBy(2)
        runCurrent()
        assertThat(controller.isShowing.value).isFalse()
    }

    @Test
    fun `Continuer passe la fete sans arreter le prechargement`() = runTest {
        val preload = CountingPreload()
        val controller = controller(preload)
        controller.begin("u1")
        runCurrent()

        controller.dismiss()

        assertThat(controller.isShowing.value).isFalse()
        assertThat(preload.runs).isEqualTo(1)
        advanceTimeBy(5_000)
        assertThat(controller.isShowing.value).isFalse()
    }

    @Test
    fun `la deconnexion arrete la fete et autorise un nouveau prechargement`() = runTest {
        val preload = CountingPreload()
        val controller = controller(preload)
        controller.begin("u1")
        runCurrent()

        controller.clear()
        assertThat(controller.isShowing.value).isFalse()

        controller.begin("u1")
        runCurrent()
        assertThat(preload.runs).isEqualTo(2)
        assertThat(controller.isShowing.value).isTrue()
    }

    @Test
    fun `prepare precharge sans fete`() = runTest {
        val preload = CountingPreload()
        val controller = controller(preload)
        controller.prepare("u1")
        runCurrent()

        assertThat(preload.runs).isEqualTo(1)
        assertThat(controller.isShowing.value).isFalse()
    }

    @Test
    fun `un second begin pendant la fete ne la relance pas`() = runTest {
        val preload = CountingPreload()
        val controller = controller(preload)
        controller.begin("u1")
        runCurrent()
        advanceTimeBy(2_000)

        controller.begin("u1")
        advanceTimeBy(700)
        runCurrent()

        assertThat(controller.isShowing.value).isFalse()
        assertThat(preload.runs).isEqualTo(1)
    }
}
