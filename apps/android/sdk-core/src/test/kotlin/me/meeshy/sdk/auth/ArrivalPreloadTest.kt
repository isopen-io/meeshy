package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ArrivalPreloadTest {
    private class Recorder {
        val ran = mutableListOf<String>()
        fun step(name: String, fail: Boolean = false) = ArrivalPreloadStep {
            ran += name
            if (fail) error("reseau")
        }
    }

    @Test
    fun `l'echec d'une etape n'interrompt ni les autres ni la fete`() = runTest {
        val recorder = Recorder()
        val preload = ArrivalPreload(setOf(recorder.step("fil", fail = true), recorder.step("amis")))
        val controller = ArrivalCelebrationController(preload, this)

        controller.begin("u1")
        runCurrent()

        assertThat(recorder.ran).containsExactly("fil", "amis")
        assertThat(controller.isShowing.value).isTrue()
    }

    @Test
    fun `un seul prechargement par utilisateur`() = runTest {
        val recorder = Recorder()
        val controller = ArrivalCelebrationController(ArrivalPreload(setOf(recorder.step("fil"))), this)

        controller.begin("u1")
        controller.prepare("u1")
        controller.begin("u1")
        runCurrent()
        assertThat(recorder.ran).hasSize(1)

        controller.prepare("u2")
        runCurrent()
        assertThat(recorder.ran).hasSize(2)
    }

    @Test
    fun `l'annulation traverse le prechargement`() = runTest {
        val preload = ArrivalPreload(setOf(ArrivalPreloadStep { throw CancellationException("stop") }))
        var cancelled = false
        try {
            preload.run()
        } catch (_: CancellationException) {
            cancelled = true
        }
        assertThat(cancelled).isTrue()
    }

    @Test
    fun `sans etape le prechargement est vide`() = runTest {
        ArrivalPreload(emptySet()).run()
    }

}
