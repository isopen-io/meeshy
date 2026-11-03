package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Test

class ShareStagingBudgetTest {
    private val mio = 1024L * 1024L

    @Test
    fun `the surplus is refused and nothing is reserved for it`() {
        val budget = ShareStagingBudget(maxBytes = 500 * mio, maxFiles = 20)
        assertThat(budget.reserveFile(300 * mio)).isTrue()
        assertThat(budget.reserveFile(300 * mio)).isFalse()
        assertThat(budget.reservedBytes).isEqualTo(300 * mio)
        assertThat(budget.refusalFor(300 * mio)).isInstanceOf(ShareStagingError.ByteBudgetExceeded::class.java)
    }

    @Test
    fun `the twenty first file is refused`() {
        val budget = ShareStagingBudget(maxBytes = 500 * mio, maxFiles = 20)
        repeat(20) { assertThat(budget.reserveFile(1)).isTrue() }
        assertThat(budget.reserveFile(1)).isFalse()
        assertThat(budget.refusalFor(1)).isEqualTo(ShareStagingError.FileCountExceeded(21, 20))
    }

    @Test
    fun `concurrent reservations never exceed the ceiling`() {
        val budget = ShareStagingBudget(maxBytes = 10, maxFiles = 100)
        val granted = AtomicInteger()
        val pool = Executors.newFixedThreadPool(8)
        repeat(50) { pool.execute { if (budget.reserveFile(1)) granted.incrementAndGet() } }
        pool.shutdown()
        pool.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)
        assertThat(granted.get()).isEqualTo(10)
        assertThat(budget.reservedBytes).isEqualTo(10)
    }

    @Test
    fun `releasing a failed copy gives its bytes and its slot back`() {
        val budget = ShareStagingBudget(maxBytes = 10, maxFiles = 1)
        assertThat(budget.reserveFile(10)).isTrue()
        budget.release(10, file = true)
        assertThat(budget.reserveFile(10)).isTrue()
    }

    @Test
    fun `defaults are the shared share ceilings`() {
        val budget = ShareStagingBudget()
        assertThat(budget.maxFiles).isEqualTo(ShareLimits.MAX_FILES)
        assertThat(budget.maxBytes).isEqualTo(ShareLimits.MAX_TOTAL_BYTES)
    }
}
