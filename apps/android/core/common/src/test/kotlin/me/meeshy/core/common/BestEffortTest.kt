package me.meeshy.core.common

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertThrows
import org.junit.Test

class BestEffortTest {
    private class Capture : ErrorRecording {
        val failures = mutableListOf<RecordedFailure>()
        override fun record(failure: RecordedFailure) { failures += failure }
    }

    @Test
    fun `rend la valeur quand l'operation reussit`() {
        val capture = Capture()
        assertThat(bestEffort("ok", recorder = capture) { 7 }).isEqualTo(7)
        assertThat(capture.failures).isEmpty()
    }

    @Test
    fun `relance la CancellationException sans l'enregistrer`() {
        val capture = Capture()
        assertThrows(CancellationException::class.java) {
            bestEffort<Unit>("cancel", recorder = capture) { throw CancellationException("stop") }
        }
        assertThat(capture.failures).isEmpty()
    }

    @Test
    fun `enregistre toute autre erreur et rend null`() {
        val capture = Capture()
        val result = bestEffort<String>("write", ErrorCategory.CACHE, capture) { error("boom") }
        assertThat(result).isNull()
        assertThat(capture.failures).containsExactly(
            RecordedFailure("write", ErrorCategory.CACHE, "IllegalStateException", "boom"),
        )
    }

    @Test
    fun `bestEffortOr rend le repli apres une erreur enregistree`() {
        val capture = Capture()
        val result = bestEffortOr<Int>("read", fallback = 3, recorder = capture) { error("x") }
        assertThat(result).isEqualTo(3)
        assertThat(capture.failures).hasSize(1)
    }

    @Test
    fun `un enregistreur defaillant ne casse pas le repli`() {
        val result = bestEffortOr<Int>("read", fallback = 1, recorder = ErrorRecording { throw IllegalStateException() }) { error("x") }
        assertThat(result).isEqualTo(1)
    }
}
