package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.Runs
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.just
import io.mockk.mockk
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheReport
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [MediaCacheViewModel]: the initial scan (success + failure), refresh
 * stale-while-revalidate, optimistic clearing (all / per-category / already-empty inert), the
 * in-flight guard, failure rollback, and cancellation-safety.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MediaCacheViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun reportOf(vararg pairs: Pair<MediaCacheCategory, Long>) =
        MediaCacheReport.of(pairs.toMap())

    private fun storeReturning(vararg reports: MediaCacheReport): MediaCacheStore {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } returnsMany reports.toList()
        coEvery { store.clear(any()) } just Runs
        return store
    }

    @Test
    fun init_scanSuccess_populatesReport() = runTest(dispatcher) {
        val store = storeReturning(reportOf(MediaCacheCategory.IMAGES to 2048L))
        val sut = MediaCacheViewModel(store)

        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.isLoading).isFalse()
        assertThat(s.report?.bytesFor(MediaCacheCategory.IMAGES)).isEqualTo(2048L)
        assertThat(s.error).isNull()
    }

    @Test
    fun init_scanFailure_raisesScanError() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } throws RuntimeException("disk")
        val sut = MediaCacheViewModel(store)

        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.isLoading).isFalse()
        assertThat(s.report).isNull()
        assertThat(s.error).isEqualTo(MediaCacheError.SCAN)
    }

    @Test
    fun refresh_keepsPreviousReportVisibleAndClearsError() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } throws RuntimeException("first") andThenThrows RuntimeException("second")
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(MediaCacheError.SCAN)

        // A later successful scan replaces the report and drops the error.
        coEvery { store.report() } returns reportOf(MediaCacheCategory.AUDIO to 512L)
        sut.refresh()
        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.error).isNull()
        assertThat(s.report?.bytesFor(MediaCacheCategory.AUDIO)).isEqualTo(512L)
    }

    @Test
    fun refreshFailure_afterSuccess_keepsPriorReport() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } returns reportOf(MediaCacheCategory.IMAGES to 999L)
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        coEvery { store.report() } throws RuntimeException("boom")
        sut.refresh()
        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.error).isEqualTo(MediaCacheError.SCAN)
        assertThat(s.report?.bytesFor(MediaCacheCategory.IMAGES)).isEqualTo(999L)
    }

    @Test
    fun clearAll_onEmptyReport_isInert() = runTest(dispatcher) {
        val store = storeReturning(MediaCacheReport.EMPTY)
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clearAll()
        advanceUntilIdle()

        coVerify(exactly = 0) { store.clear(any()) }
    }

    @Test
    fun clearAll_deletesEveryNonEmptyCategoryAndReScans() = runTest(dispatcher) {
        val store = storeReturning(
            reportOf(MediaCacheCategory.IMAGES to 100L, MediaCacheCategory.VIDEO to 300L),
            MediaCacheReport.EMPTY,
        )
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clearAll()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            store.clear(setOf(MediaCacheCategory.IMAGES, MediaCacheCategory.VIDEO))
        }
        val s = sut.state.value
        assertThat(s.report?.isEmpty).isTrue()
        assertThat(s.isClearing).isFalse()
        assertThat(s.error).isNull()
    }

    @Test
    fun clear_singleCategory_onlyDeletesThatCategory() = runTest(dispatcher) {
        val store = storeReturning(
            reportOf(MediaCacheCategory.IMAGES to 100L, MediaCacheCategory.AUDIO to 200L),
            reportOf(MediaCacheCategory.AUDIO to 200L),
        )
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clear(MediaCacheCategory.IMAGES)
        advanceUntilIdle()

        coVerify(exactly = 1) { store.clear(setOf(MediaCacheCategory.IMAGES)) }
        assertThat(sut.state.value.report?.bytesFor(MediaCacheCategory.AUDIO)).isEqualTo(200L)
    }

    @Test
    fun clear_alreadyEmptyCategory_isInert() = runTest(dispatcher) {
        val store = storeReturning(reportOf(MediaCacheCategory.IMAGES to 100L))
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clear(MediaCacheCategory.AUDIO) // audio holds nothing
        advanceUntilIdle()

        coVerify(exactly = 0) { store.clear(any()) }
    }

    @Test
    fun clear_showsOptimisticZeroingWhileInFlight() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } returns reportOf(MediaCacheCategory.IMAGES to 100L)
        val gate = CompletableDeferred<Unit>()
        coEvery { store.clear(any()) } coAnswers { gate.await() }
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clear(MediaCacheCategory.IMAGES)
        runCurrent()

        val s = sut.state.value
        assertThat(s.clearing).containsExactly(MediaCacheCategory.IMAGES)
        assertThat(s.report?.bytesFor(MediaCacheCategory.IMAGES)).isEqualTo(0L)
        gate.complete(Unit)
    }

    @Test
    fun clear_whileInFlight_ignoresASecondRequest() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } returns
            reportOf(MediaCacheCategory.IMAGES to 100L, MediaCacheCategory.AUDIO to 100L)
        val gate = CompletableDeferred<Unit>()
        coEvery { store.clear(any()) } coAnswers { gate.await() }
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clear(MediaCacheCategory.IMAGES)
        runCurrent()
        sut.clear(MediaCacheCategory.AUDIO) // must be ignored — a clear is in flight
        runCurrent()

        gate.complete(Unit)
        advanceUntilIdle()

        coVerify(exactly = 1) { store.clear(any()) }
    }

    @Test
    fun clearFailure_rollsBackReportAndRaisesClearError() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } returns reportOf(MediaCacheCategory.IMAGES to 100L)
        coEvery { store.clear(any()) } throws RuntimeException("io")
        val sut = MediaCacheViewModel(store)
        advanceUntilIdle()

        sut.clear(MediaCacheCategory.IMAGES)
        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.error).isEqualTo(MediaCacheError.CLEAR)
        assertThat(s.report?.bytesFor(MediaCacheCategory.IMAGES)).isEqualTo(100L)
        assertThat(s.isClearing).isFalse()
    }

    @Test
    fun scanCancellation_isNotClassifiedAsAnError() = runTest(dispatcher) {
        val store = mockk<MediaCacheStore>()
        coEvery { store.report() } throws CancellationException("scope torn down")
        val sut = MediaCacheViewModel(store)

        advanceUntilIdle()

        assertThat(sut.state.value.error).isNull()
    }
}
