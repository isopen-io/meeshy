package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.purge.CachePurgeResult
import me.meeshy.sdk.cache.purge.CachePurgeService
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CachePurgeButtonState
import me.meeshy.sdk.model.mediacache.CachePurgeCellId
import me.meeshy.sdk.model.mediacache.CachePurgeReport
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SelectiveCachePurgeViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val photos = CachePurgeCellId(CacheDataKind.IMAGES, CacheDomain.POSTS)
    private val clips = CachePurgeCellId(CacheDataKind.VIDEOS, CacheDomain.STORIES)

    private fun reportOf(vararg cells: Pair<CachePurgeCellId, Long>, orphans: Long = 0L) =
        CachePurgeReport.of(cells.toMap(), orphans, cells.sumOf { it.second } + orphans)

    private fun serviceReturning(vararg reports: CachePurgeReport): CachePurgeService {
        val service = mockk<CachePurgeService>()
        coEvery { service.report() } returnsMany reports.toList()
        coEvery { service.purge(any(), any()) } returns CachePurgeResult(freedBytes = 700L)
        return service
    }

    private fun TestScope.measured(service: CachePurgeService): SelectiveCachePurgeViewModel {
        val sut = SelectiveCachePurgeViewModel(service)
        sut.onEvent(SelectiveCachePurgeEvent.Appeared)
        advanceTimeBy(SelectiveCachePurgeViewModel.MEASURE_DEBOUNCE_MILLIS + 1)
        runCurrent()
        return sut
    }

    @Test
    fun `a burst of requests triggers a single measure after 120 ms`() = runTest(dispatcher) {
        val service = serviceReturning(reportOf(photos to 500L))
        val sut = SelectiveCachePurgeViewModel(service)

        repeat(3) { sut.onEvent(SelectiveCachePurgeEvent.Appeared) }
        advanceTimeBy(100L)
        runCurrent()
        coVerify(exactly = 0) { service.report() }

        advanceTimeBy(30L)
        runCurrent()
        coVerify(exactly = 1) { service.report() }
        assertThat(sut.state.value.report).isNotNull()
    }

    @Test
    fun `a second measure keeps the previous report while it runs`() = runTest(dispatcher) {
        val gate = CompletableDeferred<CachePurgeReport>()
        val service = mockk<CachePurgeService>()
        var calls = 0
        coEvery { service.report() } coAnswers { if (calls++ == 0) reportOf(photos to 500L) else gate.await() }
        val sut = measured(service)

        sut.onEvent(SelectiveCachePurgeEvent.Appeared)
        advanceTimeBy(200L)
        runCurrent()

        assertThat(sut.state.value.isMeasuring).isTrue()
        assertThat(sut.state.value.report).isNotNull()
        gate.complete(reportOf(photos to 100L))
        advanceUntilIdle()
        assertThat(sut.state.value.isMeasuring).isFalse()
    }

    @Test
    fun `a cell that became empty leaves the selection after a measure`() = runTest(dispatcher) {
        val service = serviceReturning(reportOf(photos to 500L, clips to 300L), reportOf(photos to 500L))
        val sut = measured(service)
        sut.onEvent(SelectiveCachePurgeEvent.ToggleCell(clips))
        sut.onEvent(SelectiveCachePurgeEvent.ToggleCell(photos))
        assertThat(sut.state.value.selection.ids).containsExactly(photos, clips)

        sut.onEvent(SelectiveCachePurgeEvent.Appeared)
        advanceTimeBy(200L)
        runCurrent()

        assertThat(sut.state.value.selection.ids).containsExactly(photos)
    }

    @Test
    fun `the button reads up to the selected bytes then nothing selected`() = runTest(dispatcher) {
        val sut = measured(serviceReturning(reportOf(photos to 500L, clips to 300L)))
        assertThat(sut.state.value.button).isEqualTo(CachePurgeButtonState.NothingSelected)

        sut.onEvent(SelectiveCachePurgeEvent.ToggleAll)

        assertThat(sut.state.value.button).isEqualTo(CachePurgeButtonState.UpTo(800L))
    }

    @Test
    fun `purging asks for confirmation first and nothing is purged before`() = runTest(dispatcher) {
        val service = serviceReturning(reportOf(photos to 500L))
        val sut = measured(service)
        sut.onEvent(SelectiveCachePurgeEvent.RequestPurge)
        assertThat(sut.state.value.isConfirming).isFalse()

        sut.onEvent(SelectiveCachePurgeEvent.ToggleCell(photos))
        sut.onEvent(SelectiveCachePurgeEvent.RequestPurge)

        assertThat(sut.state.value.isConfirming).isTrue()
        coVerify(exactly = 0) { service.purge(any(), any()) }
    }

    @Test
    fun `confirming purges the selection remembers freed bytes and measures again`() = runTest(dispatcher) {
        val service = serviceReturning(reportOf(photos to 500L, orphans = 40L), reportOf(photos to 0L))
        val sut = measured(service)
        sut.onEvent(SelectiveCachePurgeEvent.ToggleCell(photos))
        sut.onEvent(SelectiveCachePurgeEvent.ToggleUnattributed)
        sut.onEvent(SelectiveCachePurgeEvent.RequestPurge)

        sut.onEvent(SelectiveCachePurgeEvent.ConfirmPurge)
        advanceTimeBy(200L)
        runCurrent()

        coVerify(exactly = 1) { service.purge(setOf(photos), true) }
        coVerify(exactly = 2) { service.report() }
        val state = sut.state.value
        assertThat(state.freedBytes).isEqualTo(700L)
        assertThat(state.isPurging).isFalse()
        assertThat(state.isConfirming).isFalse()
        assertThat(state.selection.ids).isEmpty()
        assertThat(state.hasSelection).isFalse()
    }

    @Test
    fun `a second confirm while purging is ignored`() = runTest(dispatcher) {
        val gate = CompletableDeferred<CachePurgeResult>()
        val service = mockk<CachePurgeService>()
        coEvery { service.report() } returns reportOf(photos to 500L)
        coEvery { service.purge(any(), any()) } coAnswers { gate.await() }
        val sut = measured(service)
        sut.onEvent(SelectiveCachePurgeEvent.ToggleCell(photos))

        sut.onEvent(SelectiveCachePurgeEvent.ConfirmPurge)
        runCurrent()
        sut.onEvent(SelectiveCachePurgeEvent.ConfirmPurge)
        runCurrent()

        assertThat(sut.state.value.isPurging).isTrue()
        coVerify(exactly = 1) { service.purge(any(), any()) }
        gate.complete(CachePurgeResult(10L))
        advanceUntilIdle()
    }

    @Test
    fun `a failing purge clears the spinner and flags the failure`() = runTest(dispatcher) {
        val service = mockk<CachePurgeService>()
        coEvery { service.report() } returns reportOf(photos to 500L)
        coEvery { service.purge(any(), any()) } throws IllegalStateException("io")
        val sut = measured(service)
        sut.onEvent(SelectiveCachePurgeEvent.ToggleCell(photos))

        sut.onEvent(SelectiveCachePurgeEvent.ConfirmPurge)
        runCurrent()

        assertThat(sut.state.value.isPurging).isFalse()
        assertThat(sut.state.value.purgeFailed).isTrue()
        assertThat(sut.state.value.freedBytes).isNull()
    }

    @Test
    fun `a kind header toggles all its purgeable cells`() = runTest(dispatcher) {
        val sut = measured(serviceReturning(reportOf(photos to 500L, CachePurgeCellId(CacheDataKind.IMAGES, CacheDomain.STORIES) to 5L)))

        sut.onEvent(SelectiveCachePurgeEvent.ToggleKind(CacheDataKind.IMAGES))
        assertThat(sut.state.value.selection.ids).hasSize(2)

        sut.onEvent(SelectiveCachePurgeEvent.ToggleKind(CacheDataKind.IMAGES))
        assertThat(sut.state.value.selection.ids).isEmpty()
    }
}
