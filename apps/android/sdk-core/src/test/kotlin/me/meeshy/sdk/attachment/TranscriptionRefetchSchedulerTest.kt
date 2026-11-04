package me.meeshy.sdk.attachment

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TranscriptionRefetchSchedulerTest {

    private class Recorder(private val outcome: suspend () -> Boolean = { true }) {
        val calls = mutableListOf<Triple<String, String, Int>>()
        suspend fun refresh(conversationId: String, messageId: String, limit: Int): Boolean {
            calls += Triple(conversationId, messageId, limit)
            return outcome()
        }
    }

    private fun scheduler(recorder: Recorder) = TranscriptionRefetchScheduler(refresh = recorder::refresh)

    @Test
    fun `nothing is read before five seconds`() = runTest {
        val recorder = Recorder()

        scheduler(recorder).schedule("c1", listOf("m1"), this)
        advanceTimeBy(4_999L)
        runCurrent()

        assertThat(recorder.calls).isEmpty()
        advanceUntilIdle()
    }

    @Test
    fun `one read per message at five seconds, over a window of five`() = runTest {
        val recorder = Recorder()

        scheduler(recorder).schedule("c1", listOf("m1", "m2"), this)
        advanceTimeBy(5_000L)
        runCurrent()

        assertThat(recorder.calls).containsExactly(Triple("c1", "m1", 5), Triple("c1", "m2", 5)).inOrder()
    }

    @Test
    fun `it never loops, however long the wait`() = runTest {
        val recorder = Recorder(outcome = { false })

        scheduler(recorder).schedule("c1", listOf("m1"), this)
        advanceTimeBy(10 * 60_000L)
        advanceUntilIdle()

        assertThat(recorder.calls).hasSize(1)
    }

    @Test
    fun `cancelling before five seconds reads nothing`() = runTest {
        val recorder = Recorder()

        val job = scheduler(recorder).schedule("c1", listOf("m1"), this)!!
        advanceTimeBy(2_000L)
        job.cancel()
        advanceUntilIdle()

        assertThat(recorder.calls).isEmpty()
    }

    @Test
    fun `no message to read gives no job`() = runTest {
        assertThat(scheduler(Recorder()).schedule("c1", emptyList(), this)).isNull()
        assertThat(scheduler(Recorder()).schedule("c1", listOf("  "), this)).isNull()
    }

    @Test
    fun `a failing read does not stop the next ones`() = runTest {
        var first = true
        val recorder = Recorder(outcome = {
            if (first) {
                first = false
                error("réseau")
            }
            true
        })

        scheduler(recorder).schedule("c1", listOf("m1", "m2"), this)
        advanceTimeBy(5_000L)
        runCurrent()

        assertThat(recorder.calls.map { it.second }).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `the same message twice is read once`() = runTest {
        val recorder = Recorder()

        scheduler(recorder).schedule("c1", listOf("m1", "m1"), this)
        advanceTimeBy(5_000L)
        runCurrent()

        assertThat(recorder.calls).hasSize(1)
    }
}
