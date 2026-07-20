package me.meeshy.app.stories

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryCommentsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val commentAdded = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 8)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { commentAdded } returns this@StoryCommentsViewModelTest.commentAdded
    }

    private val me = MeeshyUser(id = "me", username = "me", displayName = "Me")

    private fun wire(id: String, content: String = "c-$id", createdAt: String? = null) =
        ApiPostComment(
            id = id,
            content = content,
            author = ApiAuthor(id = "u-$id", username = "name-$id"),
            createdAt = createdAt,
        )

    private fun viewModel(): StoryCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(me)
        return StoryCommentsViewModel(repo, session, socialSocket)
    }

    @Test
    fun load_success_populatesCommentsOldestFirst() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(
            listOf(wire("b", createdAt = "2026-06-20T11:00:00Z"), wire("a", createdAt = "2026-06-20T09:00:00Z")),
        )
        val vm = viewModel()

        vm.load("s1")

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isEmpty).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun load_emptySuccess_isEmptyWithoutError() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()

        vm.load("s1")

        assertThat(vm.state.value.isEmpty).isTrue()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun load_coldFailure_surfacesError() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Failure(ApiError("network down"))
        val vm = viewModel()

        vm.load("s1")

        assertThat(vm.state.value.errorMessage).isEqualTo("network down")
        assertThat(vm.state.value.comments).isEmpty()
        assertThat(vm.state.value.isEmpty).isFalse()
    }

    @Test
    fun load_coldException_surfacesMessage() = runTest {
        coEvery { repo.comments("s1") } throws RuntimeException("kaboom")
        val vm = viewModel()

        vm.load("s1")

        assertThat(vm.state.value.errorMessage).isEqualTo("kaboom")
    }

    @Test
    fun refreshFailure_keepsExistingComments_noError() = runTest {
        coEvery { repo.comments("s1") } returns
            NetworkResult.Success(listOf(wire("a", createdAt = "2026-06-20T09:00:00Z")))
        val vm = viewModel()
        vm.load("s1")
        assertThat(vm.state.value.comments).hasSize(1)

        coEvery { repo.comments("s1") } returns NetworkResult.Failure(ApiError("flaky"))
        vm.load("s1")

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun load_coldLoad_showsSkeletonThenList() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repo.comments("s1") } coAnswers { gate.await() }
        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().isLoading).isFalse() // idle
            vm.load("s1")
            assertThat(awaitItem().isLoading).isTrue() // cold skeleton
            gate.complete(NetworkResult.Success(listOf(wire("a", createdAt = "2026-06-20T09:00:00Z"))))
            val loaded = awaitItem()
            assertThat(loaded.isLoading).isFalse()
            assertThat(loaded.comments).hasSize(1)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun load_isReentrancySafe_whileInFlightForSameStory() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repo.comments("s1") } coAnswers { gate.await() }
        val vm = viewModel()

        vm.load("s1")
        vm.load("s1")
        gate.complete(NetworkResult.Success(emptyList()))

        coVerify(exactly = 1) { repo.comments("s1") }
    }

    @Test
    fun post_optimisticPending_thenSentOnAck() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        val gate = CompletableDeferred<NetworkResult<ApiPostComment>>()
        coEvery { repo.comment("s1", "hi") } coAnswers { gate.await() }
        val vm = viewModel()
        vm.load("s1")

        vm.post("hi")

        // optimistic row is shown immediately as Pending, with my name
        val pending = vm.state.value.comments.single()
        assertThat(pending.status).isEqualTo(StoryCommentStatus.Pending)
        assertThat(pending.content).isEqualTo("hi")
        assertThat(pending.authorName).isEqualTo("Me")

        gate.complete(NetworkResult.Success(wire("server1", content = "hi", createdAt = "2026-06-20T12:00:00Z")))

        val confirmed = vm.state.value.comments.single()
        assertThat(confirmed.id).isEqualTo("server1")
        assertThat(confirmed.status).isEqualTo(StoryCommentStatus.Sent)
    }

    @Test
    fun post_failure_marksRowFailed() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        coEvery { repo.comment("s1", "oops") } returns NetworkResult.Failure(ApiError("no net"))
        val vm = viewModel()
        vm.load("s1")

        vm.post("oops")

        assertThat(vm.state.value.comments.single().status).isEqualTo(StoryCommentStatus.Failed)
    }

    @Test
    fun post_blankContent_isIgnored() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("s1")

        vm.post("   ")

        assertThat(vm.state.value.comments).isEmpty()
        coVerify(exactly = 0) { repo.comment(any(), any()) }
    }

    @Test
    fun retry_resendsFailedComment_toSent() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        coEvery { repo.comment("s1", "again") } returns NetworkResult.Failure(ApiError("flaky"))
        val vm = viewModel()
        vm.load("s1")
        vm.post("again")
        val failed = vm.state.value.comments.single()
        assertThat(failed.status).isEqualTo(StoryCommentStatus.Failed)

        coEvery { repo.comment("s1", "again") } returns
            NetworkResult.Success(wire("server9", content = "again", createdAt = "2026-06-20T12:30:00Z"))
        vm.retry(failed.clientId!!)

        val sent = vm.state.value.comments.single()
        assertThat(sent.id).isEqualTo("server9")
        assertThat(sent.status).isEqualTo(StoryCommentStatus.Sent)
    }

    @Test
    fun retry_unknownClientId_isInert() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("s1")

        vm.retry("ghost")

        coVerify(exactly = 0) { repo.comment(any(), any()) }
    }

    @Test
    fun socketCommentForThisStory_appendsLive() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("s1")

        commentAdded.tryEmit(SocketCommentAddedData(postId = "s1", comment = wire("live1")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("live1")
    }

    @Test
    fun socketCommentForOtherStory_isIgnored() = runTest {
        coEvery { repo.comments("s1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("s1")

        commentAdded.tryEmit(SocketCommentAddedData(postId = "other", comment = wire("x")))

        assertThat(vm.state.value.comments).isEmpty()
    }

    @Test
    fun socketEchoOfAlreadyShownComment_isDeduped() = runTest {
        coEvery { repo.comments("s1") } returns
            NetworkResult.Success(listOf(wire("dup", createdAt = "2026-06-20T09:00:00Z")))
        val vm = viewModel()
        vm.load("s1")
        assertThat(vm.state.value.comments).hasSize(1)

        commentAdded.tryEmit(SocketCommentAddedData(postId = "s1", comment = wire("dup")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("dup")
    }
}
