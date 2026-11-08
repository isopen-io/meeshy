package me.meeshy.app.feed

import androidx.work.WorkManager
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.PublicationCancelOutcome
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Ce que le fil dit des gestes sur une publication en attente (iOS `StuckPublicationRetry`, `withdrawPendingPublication`). */
@OptIn(ExperimentalCoroutinesApi::class)
class PendingPublicationFeedbackTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val publications: PublicationOutbox = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        io.mockk.every { publications.unsent() } returns MutableStateFlow(emptyList())
        io.mockk.every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() =
        UnsentPublicationsViewModel(publications, mockk<WorkManager>(relaxed = true), InMemoryNetworkMonitor(initialOnline = true), session, MeeshyConfig())

    @Test
    fun `a retry says it started, and says when it could not`() = runTest(dispatcher) {
        coEvery { publications.retry("c1") } returns false
        val vm = viewModel()

        vm.feedback.test {
            vm.retry("c1")
            assertThat(awaitItem()).isEqualTo(PendingFeedback.RETRY_STARTED)
            assertThat(awaitItem()).isEqualTo(PendingFeedback.RETRY_FAILED)
        }
    }

    @Test
    fun `a retry that goes through only says it started`() = runTest(dispatcher) {
        coEvery { publications.retry("c1") } returns true
        val vm = viewModel()

        vm.feedback.test {
            vm.retry("c1")
            assertThat(awaitItem()).isEqualTo(PendingFeedback.RETRY_STARTED)
            expectNoEvents()
        }
    }

    @Test
    fun `canceling the sending says whether it was withdrawn or had just left`() = runTest(dispatcher) {
        coEvery { publications.cancel("a") } returns PublicationCancelOutcome.REMOVED
        coEvery { publications.cancel("b") } returns PublicationCancelOutcome.CANCEL_REQUESTED
        coEvery { publications.cancel("c") } returns PublicationCancelOutcome.ALREADY_SENT
        coEvery { publications.cancel("d") } returns PublicationCancelOutcome.FAILED
        val vm = viewModel()

        vm.feedback.test {
            listOf("a", "b", "c", "d").forEach { vm.cancelSend(it) }
            assertThat(listOf(awaitItem(), awaitItem(), awaitItem(), awaitItem())).containsExactly(
                PendingFeedback.WITHDRAWN,
                PendingFeedback.WITHDRAWN,
                PendingFeedback.ALREADY_SENT,
                PendingFeedback.WITHDRAW_FAILED,
            ).inOrder()
        }
        assertThat(PendingFeedback.ALREADY_SENT.isError).isTrue()
        assertThat(PendingFeedback.WITHDRAWN.isError).isFalse()
    }

    @Test
    fun `opening the composer brings a stuck post back as a draft and says so`() = runTest(dispatcher) {
        coEvery { publications.recoverStuckPost(any()) } returns PostComposerDraftSnapshot(text = "bloqué")
        val vm = viewModel()
        var opened = 0

        vm.feedback.test {
            vm.openComposerRecovering { opened++ }
            assertThat(awaitItem()).isEqualTo(PendingFeedback.DRAFT_RECOVERED)
        }
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `opening the composer with nothing stuck opens it without a word`() = runTest(dispatcher) {
        coEvery { publications.recoverStuckPost(any()) } returns null
        val vm = viewModel()
        var opened = 0

        vm.feedback.test {
            vm.openComposerRecovering { opened++ }
            expectNoEvents()
        }
        assertThat(opened).isEqualTo(1)
    }
}
