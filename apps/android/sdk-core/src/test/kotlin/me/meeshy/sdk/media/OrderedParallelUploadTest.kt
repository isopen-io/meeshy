package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class OrderedParallelUploadTest {
    @Test
    fun `results come back in the order of the inputs, not of completion`() = runTest {
        val out = OrderedParallelUpload.run(listOf(300L, 100L, 200L)) { _, wait -> delay(wait); wait }

        assertThat(out).containsExactly(300L, 100L, 200L).inOrder()
    }

    @Test
    fun `no more than the parallelism bound run at once`() = runTest {
        val running = AtomicInteger()
        val peak = AtomicInteger()

        OrderedParallelUpload.run((1..10).toList(), parallelism = 3) { _, _ ->
            peak.accumulateAndGet(running.incrementAndGet(), ::maxOf)
            delay(50)
            running.decrementAndGet()
        }

        assertThat(peak.get()).isEqualTo(3)
    }

    @Test
    fun `the bound never exceeds four whatever the caller asks`() = runTest {
        val running = AtomicInteger()
        val peak = AtomicInteger()

        OrderedParallelUpload.run((1..12).toList(), parallelism = 99) { _, _ ->
            peak.accumulateAndGet(running.incrementAndGet(), ::maxOf)
            delay(50)
            running.decrementAndGet()
        }

        assertThat(peak.get()).isEqualTo(OrderedParallelUpload.MAX_PARALLELISM)
    }

    @Test
    fun `the first failure cancels the siblings and surfaces`() = runTest {
        val cancelled = CompletableDeferred<Boolean>()
        val siblingStarted = CompletableDeferred<Unit>()

        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                OrderedParallelUpload.run(listOf(0, 1)) { index, _ ->
                    if (index == 0) {
                        siblingStarted.await()
                        error("boom")
                    }
                    try {
                        siblingStarted.complete(Unit)
                        delay(10_000)
                    } catch (e: kotlinx.coroutines.CancellationException) {
                        cancelled.complete(true)
                        throw e
                    }
                }
            }
        }

        assertThat(cancelled.await()).isTrue()
    }
}
