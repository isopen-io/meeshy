package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportRequestBuilder
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.report.ReportRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [ReportUserViewModel]: it holds the reason + details as immutable UI
 * state, submits through the repository exactly once, marks the flow submitted on success, and
 * surfaces a retryable error on failure / inert (no-session) result. A double tap or a re-submit
 * after success must never fire a second report.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReportUserViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun sut(
        repo: ReportRepository,
        userId: String = "u1",
        username: String = "alice",
    ): ReportUserViewModel = ReportUserViewModel(
        reportRepository = repo,
        savedStateHandle = SavedStateHandle(
            mapOf(
                ReportUserViewModel.USER_ID_ARG to userId,
                ReportUserViewModel.USERNAME_ARG to username,
            ),
        ),
    )

    @Test
    fun `initial state defaults to spam with an empty note and a live submit button`() {
        val vm = sut(mockk(relaxed = true))
        val s = vm.state.value
        assertThat(s.selectedReason).isEqualTo(ReportReason.SPAM)
        assertThat(s.details).isEmpty()
        assertThat(s.reasons).isEqualTo(ReportReason.ordered)
        assertThat(s.canSubmit).isTrue()
        assertThat(vm.username).isEqualTo("alice")
    }

    @Test
    fun `selectReason updates the choice and clears a prior error`() = runTest {
        val repo = mockk<ReportRepository>()
        coEvery { repo.reportUser(any(), any(), any()) } returns null
        val vm = sut(repo)
        vm.submit()
        advanceUntilIdle()
        assertThat(vm.state.value.hasError).isTrue()

        vm.selectReason(ReportReason.IMPERSONATION)

        assertThat(vm.state.value.selectedReason).isEqualTo(ReportReason.IMPERSONATION)
        assertThat(vm.state.value.hasError).isFalse()
    }

    @Test
    fun `onDetailsChange caps input at the max length`() {
        val vm = sut(mockk(relaxed = true))
        vm.onDetailsChange("x".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH + 50))
        assertThat(vm.state.value.details).hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
        assertThat(vm.state.value.detailsCount).isEqualTo(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }

    @Test
    fun `submit reports the selected reason and marks the flow submitted`() = runTest {
        val repo = mockk<ReportRepository>()
        val reasonSlot = slot<ReportReason>()
        val detailsSlot = slot<String>()
        coEvery { repo.reportUser(eq("u1"), capture(reasonSlot), capture(detailsSlot)) } returns NetworkResult.Success(Unit)
        val vm = sut(repo)
        vm.selectReason(ReportReason.HARASSMENT)
        vm.onDetailsChange("not ok")

        vm.state.test {
            assertThat(awaitItem().canSubmit).isTrue() // initial
            vm.submit()
            assertThat(awaitItem().isSubmitting).isTrue() // in flight
            advanceUntilIdle()
            val done = awaitItem()
            assertThat(done.isSubmitted).isTrue()
            assertThat(done.isSubmitting).isFalse()
            assertThat(done.canSubmit).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(reasonSlot.captured).isEqualTo(ReportReason.HARASSMENT)
        assertThat(detailsSlot.captured).isEqualTo("not ok")
        coVerify(exactly = 1) { repo.reportUser(any(), any(), any()) }
    }

    @Test
    fun `submit surfaces a retryable error on network failure`() = runTest {
        val repo = mockk<ReportRepository>()
        coEvery { repo.reportUser(any(), any(), any()) } returns NetworkResult.Failure(ApiError("down"))
        val vm = sut(repo)

        vm.submit()
        advanceUntilIdle()

        val s = vm.state.value
        assertThat(s.hasError).isTrue()
        assertThat(s.isSubmitted).isFalse()
        assertThat(s.isSubmitting).isFalse()
        assertThat(s.canSubmit).isTrue() // retryable
    }

    @Test
    fun `submit surfaces an error when the repository is inert with no session`() = runTest {
        val repo = mockk<ReportRepository>()
        coEvery { repo.reportUser(any(), any(), any()) } returns null
        val vm = sut(repo)

        vm.submit()
        advanceUntilIdle()

        assertThat(vm.state.value.hasError).isTrue()
        assertThat(vm.state.value.isSubmitted).isFalse()
    }

    @Test
    fun `a second tap while submitting does not fire a second report`() = runTest {
        val repo = mockk<ReportRepository>()
        coEvery { repo.reportUser(any(), any(), any()) } returns NetworkResult.Success(Unit)
        val vm = sut(repo)

        vm.submit() // in flight (not yet resolved — dispatcher not advanced)
        vm.submit() // ignored: canSubmit is false while submitting
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.reportUser(any(), any(), any()) }
    }

    @Test
    fun `submitting again after success is a no-op`() = runTest {
        val repo = mockk<ReportRepository>()
        coEvery { repo.reportUser(any(), any(), any()) } returns NetworkResult.Success(Unit)
        val vm = sut(repo)

        vm.submit()
        advanceUntilIdle()
        vm.submit() // canSubmit false because isSubmitted
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.reportUser(any(), any(), any()) }
    }
}
