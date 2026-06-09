package me.meeshy.sdk.cache

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import org.junit.Test

class CacheFirstFlowTest {

    private val shortPolicy = CachePolicy(freshForMillis = 1_000L, keepForMillis = 10_000L)

    @Test
    fun `emits Empty then syncs cold cache`() = runTest {
        val source = FakeSource<List<String>>(initialData = null, initialSyncedAt = null)
        source.nextRevalidate = { source.pushData(listOf("a"), clock = 1_000L) }

        cacheFirstFlow(shortPolicy, source, FakeClock(2_000L)).test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            // After revalidation, Room emits → Fresh
            assertThat(awaitItem()).isEqualTo(CacheResult.Fresh(listOf("a"), 1_000L))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits Fresh when age within freshForMillis`() = runTest {
        val source = FakeSource(initialData = listOf("x"), initialSyncedAt = 9_000L)

        cacheFirstFlow(shortPolicy, source, FakeClock(9_500L)).test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Fresh(listOf("x"), 500L))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits Stale then triggers revalidation within keepForMillis`() = runTest {
        val source = FakeSource(initialData = listOf("y"), initialSyncedAt = 1_000L)
        source.nextRevalidate = { source.pushData(listOf("y2"), clock = 8_000L) }

        cacheFirstFlow(shortPolicy, source, FakeClock(8_000L)).test {
            val first = awaitItem()
            assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
            assertThat((first as CacheResult.Stale).value).isEqualTo(listOf("y"))
            // Background revalidate triggers Fresh
            assertThat(awaitItem()).isEqualTo(CacheResult.Fresh(listOf("y2"), 0L))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits Syncing with stale data when age exceeds keepForMillis`() = runTest {
        val source = FakeSource(initialData = listOf("z"), initialSyncedAt = 1_000L)
        var revalidated = false
        source.nextRevalidate = { revalidated = true }

        cacheFirstFlow(shortPolicy, source, FakeClock(100_000L)).test {
            val first = awaitItem()
            assertThat(first).isInstanceOf(CacheResult.Syncing::class.java)
            assertThat((first as CacheResult.Syncing).value).isEqualTo(listOf("z"))
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(revalidated).isTrue()
    }

    @Test
    fun `onRevalidateError called on revalidation failure`() = runTest {
        val source = FakeSource<List<String>>(initialData = null, initialSyncedAt = null)
        val error = RuntimeException("network down")
        source.nextRevalidate = { throw error }

        val errors = mutableListOf<Throwable>()
        cacheFirstFlow(shortPolicy, source, FakeClock(1_000L), onRevalidateError = { errors += it }).test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(errors).containsExactly(error)
    }

    // ── Fakes ──────────────────────────────────────────────────────────────────

    private class FakeClock(private val fixedMillis: Long) : CacheClock {
        override fun nowMillis(): Long = fixedMillis
    }

    private class FakeSource<T>(
        initialData: T?,
        initialSyncedAt: Long?,
    ) : SwrCacheSource<T> {

        private val _data = MutableStateFlow(initialData)
        private val _syncedAt = MutableStateFlow(initialSyncedAt)

        var nextRevalidate: (suspend () -> Unit)? = null

        fun pushData(value: T, clock: Long) {
            _data.value = value
            _syncedAt.value = clock
        }

        override fun observe(): Flow<T?> = _data
        override fun lastSyncedAt(): Flow<Long?> = _syncedAt
        override suspend fun revalidate() {
            nextRevalidate?.invoke()
        }
    }
}
