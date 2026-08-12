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
import me.meeshy.sdk.model.diagnostics.CrashDiagnostic
import me.meeshy.sdk.model.diagnostics.CrashKind
import me.meeshy.sdk.model.diagnostics.CrashReportFormatter
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [CrashReportViewModel]: the initial load (success + failure), the derived
 * empty/share state, optimistic clear (success + rollback), the inert-when-empty and in-flight
 * guards, and cancellation-safety.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CrashReportViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun diag(id: String, millis: Long, kind: CrashKind = CrashKind.EXCEPTION) =
        CrashDiagnostic(id = id, timestampMillis = millis, kind = kind, summary = "s-$id", details = "d-$id")

    private fun storeReturning(vararg reports: List<CrashDiagnostic>): CrashDiagnosticsStore {
        val store = mockk<CrashDiagnosticsStore>()
        coEvery { store.reports() } returnsMany reports.toList()
        coEvery { store.clear() } just Runs
        return store
    }

    @Test
    fun init_loadSuccess_populatesReportsInGivenOrder() = runTest(dispatcher) {
        val ordered = listOf(diag("new", 300L), diag("old", 100L))
        val sut = CrashReportViewModel(storeReturning(ordered))

        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.isLoading).isFalse()
        assertThat(s.reports.map { it.id }).containsExactly("new", "old").inOrder()
        assertThat(s.isEmpty).isFalse()
        assertThat(s.error).isNull()
    }

    @Test
    fun init_loadFailure_raisesLoadError() = runTest(dispatcher) {
        val store = mockk<CrashDiagnosticsStore>()
        coEvery { store.reports() } throws IllegalStateException("disk gone")
        val sut = CrashReportViewModel(store)

        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.isLoading).isFalse()
        assertThat(s.error).isEqualTo(CrashReportError.LOAD)
        assertThat(s.reports).isEmpty()
    }

    @Test
    fun emptyStore_isEmptyAndCannotClear() = runTest(dispatcher) {
        val sut = CrashReportViewModel(storeReturning(emptyList()))

        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.isEmpty).isTrue()
        assertThat(s.canClear).isFalse()
        assertThat(s.shareContent).isEmpty()
    }

    @Test
    fun shareContent_matchesPureFormatterOverLoadedReports() = runTest(dispatcher) {
        val reports = listOf(diag("a", 2L, CrashKind.ANR), diag("b", 1L, CrashKind.DISK))
        val sut = CrashReportViewModel(storeReturning(reports))

        advanceUntilIdle()

        assertThat(sut.state.value.shareContent).isEqualTo(CrashReportFormatter.formatAll(reports))
        assertThat(sut.state.value.canClear).isTrue()
    }

    @Test
    fun clear_optimisticallyEmptiesThenWipesStore() = runTest(dispatcher) {
        val store = storeReturning(listOf(diag("a", 1L)))
        val sut = CrashReportViewModel(store)
        advanceUntilIdle()

        sut.clear()
        // Optimistic: emptied synchronously before the disk wipe completes.
        assertThat(sut.state.value.reports).isEmpty()
        assertThat(sut.state.value.isClearing).isTrue()

        advanceUntilIdle()

        assertThat(sut.state.value.isClearing).isFalse()
        assertThat(sut.state.value.isEmpty).isTrue()
        coVerify(exactly = 1) { store.clear() }
    }

    @Test
    fun clear_whenWipeFails_rollsBackAndRaisesClearError() = runTest(dispatcher) {
        val reports = listOf(diag("a", 1L))
        val store = mockk<CrashDiagnosticsStore>()
        coEvery { store.reports() } returns reports
        coEvery { store.clear() } throws IllegalStateException("io")
        val sut = CrashReportViewModel(store)
        advanceUntilIdle()

        sut.clear()
        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.reports.map { it.id }).containsExactly("a")
        assertThat(s.isClearing).isFalse()
        assertThat(s.error).isEqualTo(CrashReportError.CLEAR)
    }

    @Test
    fun clear_whenEmpty_isInert() = runTest(dispatcher) {
        val store = storeReturning(emptyList())
        val sut = CrashReportViewModel(store)
        advanceUntilIdle()

        sut.clear()
        advanceUntilIdle()

        coVerify(exactly = 0) { store.clear() }
    }

    @Test
    fun clear_secondCallWhileInFlight_isIgnored() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val store = mockk<CrashDiagnosticsStore>()
        coEvery { store.reports() } returns listOf(diag("a", 1L))
        coEvery { store.clear() } coAnswers { gate.await() }
        val sut = CrashReportViewModel(store)
        advanceUntilIdle()

        sut.clear()
        runCurrent()
        sut.clear() // ignored: a wipe is already in flight
        runCurrent()

        gate.complete(Unit)
        advanceUntilIdle()

        coVerify(exactly = 1) { store.clear() }
    }

    @Test
    fun clear_cancellationExceptionRethrown_leavesNoError() = runTest(dispatcher) {
        val store = mockk<CrashDiagnosticsStore>()
        coEvery { store.reports() } returns listOf(diag("a", 1L))
        coEvery { store.clear() } throws CancellationException("scope torn down")
        val sut = CrashReportViewModel(store)
        advanceUntilIdle()

        sut.clear()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isNull()
    }
}
