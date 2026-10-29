package me.meeshy.app.feed

import androidx.work.WorkManager
import androidx.work.WorkRequest
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UnsentPublicationsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val publications: PublicationOutbox = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)
    private val network = me.meeshy.sdk.network.InMemoryNetworkMonitor(initialOnline = true)
    private val unsent = MutableStateFlow<List<UnsentPublication>>(emptyList())

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { publications.unsent() } returns unsent
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun failedPost(cmid: String = "cmid_p") = UnsentPublication(
        cmid = cmid,
        kind = UnsentPublicationKind.POST,
        text = "mes photos",
        mediaCount = 5,
        status = UnsentPublicationStatus.FAILED,
        createdAtMillis = 1L,
        failureReason = "Post refused: HTTP 415",
    )

    private fun viewModel() = UnsentPublicationsViewModel(publications, workManager, network)

    @Test
    fun `the list follows the publications the device still holds`() = runTest(dispatcher) {
        val vm = viewModel()

        vm.items.test {
            assertThat(awaitItem()).isEmpty()
            unsent.value = listOf(failedPost())
            assertThat(awaitItem().single().cmid).isEqualTo("cmid_p")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `drafts parked for posts confirmed while the app was away are released on open`() = runTest(dispatcher) {
        viewModel()

        coVerify(exactly = 1) { publications.releaseSettledDrafts() }
    }

    @Test
    fun `retrying a failed publication kicks the outbox, a vanished one does not`() = runTest(dispatcher) {
        coEvery { publications.retry("cmid_p") } returns true
        coEvery { publications.retry("gone") } returns false
        val vm = viewModel()

        vm.retry("cmid_p")
        vm.retry("gone")

        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `deleting is delegated to the explicit discard`() = runTest(dispatcher) {
        viewModel().discard("cmid_p")

        coVerify(exactly = 1) { publications.discard("cmid_p") }
    }

    @Test
    fun `reopening a failed post hands the composer its draft`() = runTest(dispatcher) {
        coEvery { publications.reopenPost("cmid_p") } returns
            PostComposerDraftSnapshot(text = "mes photos", visibility = "FRIENDS")
        val vm = viewModel()

        vm.reopened.test {
            vm.reopen("cmid_p")
            val draft = awaitItem()
            assertThat(draft.text).isEqualTo("mes photos")
            assertThat(draft.visibility).isEqualTo(FeedPostVisibility.FRIENDS)
        }
    }

    @Test
    fun `reopening a failed story opens the story composer, not the post one`() = runTest(dispatcher) {
        coEvery { publications.reopenPost("cmid_s") } returns null
        coEvery { publications.reopenStory("cmid_s") } returns
            me.meeshy.sdk.model.StoryComposerDraftSnapshot(slides = listOf(me.meeshy.sdk.model.StoryDraftSlideSnapshot(id = "s1", text = "ma story")), selectedId = "s1")
        val vm = viewModel()

        vm.reopenedStory.test {
            vm.reopen("cmid_s")
            awaitItem()
        }
        vm.reopened.test {
            vm.reopen("cmid_s")
            expectNoEvents()
        }
    }

    @Test
    fun `a publication that cannot be reopened opens nothing`() = runTest(dispatcher) {
        coEvery { publications.reopenPost("gone") } returns null
        coEvery { publications.reopenStory("gone") } returns null
        val vm = viewModel()

        vm.reopenedStory.test {
            vm.reopen("gone")
            expectNoEvents()
        }
    }

    @Test
    fun `the offline reading follows the connection`() = runTest(dispatcher) {
        val vm = viewModel()

        vm.offline.test {
            assertThat(awaitItem()).isFalse()
            network.simulateOffline()
            assertThat(awaitItem()).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
