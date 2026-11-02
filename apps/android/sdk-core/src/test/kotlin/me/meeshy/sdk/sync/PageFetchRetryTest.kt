package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.Test

class PageFetchRetryTest {

    @Test
    fun `a page that fails twice is delivered on the third attempt after 1 s then 2 s`() = runTest {
        val calls = AtomicInteger()
        val waits = mutableListOf<Long>()
        val result = fetchPageWithRetry(waitMillis = { waits += it }) {
            if (calls.incrementAndGet() < 3) throw IOException("flaky") else "page"
        }
        assertThat(result.getOrNull()).isEqualTo("page")
        assertThat(waits).containsExactly(1_000L, 2_000L).inOrder()
    }

    @Test
    fun `a page that never answers is lost after three attempts`() = runTest {
        val calls = AtomicInteger()
        val result = fetchPageWithRetry(waitMillis = {}) { calls.incrementAndGet(); throw IOException("down") }
        assertThat(result.isFailure).isTrue()
        assertThat(calls.get()).isEqualTo(3)
    }

    @Test
    fun `at most four pages are in flight and a lost page leaves the others untouched`() = runTest {
        val inFlight = AtomicInteger()
        val peak = AtomicInteger()
        val delivered = fetchPagesInParallel(pages = (1..9).toList(), waitMillis = {}) { page ->
            peak.accumulateAndGet(inFlight.incrementAndGet()) { a, b -> maxOf(a, b) }
            delay(10)
            inFlight.decrementAndGet()
            if (page == 5) throw IOException("lost") else page * 10
        }
        assertThat(peak.get()).isEqualTo(4)
        assertThat(delivered.keys).containsExactly(1, 2, 3, 4, 6, 7, 8, 9)
        assertThat(delivered[3]).isEqualTo(30)
    }
}
