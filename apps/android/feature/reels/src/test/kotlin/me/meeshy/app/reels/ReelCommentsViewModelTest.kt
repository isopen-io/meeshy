package me.meeshy.app.reels

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
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Loading and optimistic-posting coverage for the reels comments sheet (issue #4815) —
 * mirrors `StoryCommentsViewModelTest`'s law, ported to [PostRepository.getComments] /
 * [PostRepository.addComment] since a REEL is a post like any other.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReelCommentsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val commentAdded = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 8)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { commentAdded } returns this@ReelCommentsViewModelTest.commentAdded
    }

    private val me = MeeshyUser(id = "me", username = "me", displayName = "Me")

    private fun wire(id: String, content: String = "c-$id", createdAt: String? = null) =
        ApiPostComment(
            id = id,
            content = content,
            author = ApiAuthor(id = "u-$id", username = "name-$id"),
            createdAt = createdAt,
        )

    private fun viewModel(): ReelCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(me)
        return ReelCommentsViewModel(repo, session, socialSocket)
    }

    // MARK: - Loading

    @Test
    fun load_success_populatesCommentsOldestFirst() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(
            listOf(wire("b", createdAt = "2026-06-20T11:00:00Z"), wire("a", createdAt = "2026-06-20T09:00:00Z")),
        )
        val vm = viewModel()

        vm.load("r1")

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isEmpty).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun load_emptySuccess_isEmptyWithoutError() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()

        vm.load("r1")

        assertThat(vm.state.value.isEmpty).isTrue()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun load_coldFailure_surfacesError() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Failure(ApiError("network down"))
        val vm = viewModel()

        vm.load("r1")

        assertThat(vm.state.value.errorMessage).isEqualTo("network down")
        assertThat(vm.state.value.comments).isEmpty()
    }

    @Test
    fun load_coldException_surfacesMessage() = runTest {
        coEvery { repo.getComments("r1") } throws RuntimeException("kaboom")
        val vm = viewModel()

        vm.load("r1")

        assertThat(vm.state.value.errorMessage).isEqualTo("kaboom")
    }

    @Test
    fun refreshFailure_keepsExistingComments_noError() = runTest {
        coEvery { repo.getComments("r1") } returns
            NetworkResult.Success(listOf(wire("a", createdAt = "2026-06-20T09:00:00Z")))
        val vm = viewModel()
        vm.load("r1")
        assertThat(vm.state.value.comments).hasSize(1)

        coEvery { repo.getComments("r1") } returns NetworkResult.Failure(ApiError("flaky"))
        vm.load("r1")

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun load_coldLoad_showsSkeletonThenList() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repo.getComments("r1") } coAnswers { gate.await() }
        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().isLoading).isFalse() // idle
            vm.load("r1")
            assertThat(awaitItem().isLoading).isTrue() // cold skeleton
            gate.complete(NetworkResult.Success(listOf(wire("a", createdAt = "2026-06-20T09:00:00Z"))))
            val loaded = awaitItem()
            assertThat(loaded.isLoading).isFalse()
            assertThat(loaded.comments).hasSize(1)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun load_isReentrancySafe_whileInFlightForSameReel() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repo.getComments("r1") } coAnswers { gate.await() }
        val vm = viewModel()

        vm.load("r1")
        vm.load("r1")
        gate.complete(NetworkResult.Success(emptyList()))

        coVerify(exactly = 1) { repo.getComments("r1") }
    }

    @Test
    fun load_switchingReel_resetsThePreviousReelsComments() = runTest {
        coEvery { repo.getComments("r1") } returns
            NetworkResult.Success(listOf(wire("a", createdAt = "2026-06-20T09:00:00Z")))
        val vm = viewModel()
        vm.load("r1")
        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")

        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repo.getComments("r2") } coAnswers { gate.await() }
        vm.load("r2")

        // The sheet reopened over a different reel: it goes back to a cold skeleton
        // rather than showing reel r1's leftover comments while r2's page loads.
        assertThat(vm.state.value.comments).isEmpty()
        assertThat(vm.state.value.isLoading).isTrue()
    }

    // MARK: - Pagination

    @Test
    fun load_fullFirstPage_setsHasMoreTrue() = runTest {
        val page = (1..20).map { wire("id$it") }
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(page)
        val vm = viewModel()

        vm.load("r1")

        assertThat(vm.state.value.hasMore).isTrue()
    }

    @Test
    fun load_partialFirstPage_setsHasMoreFalse() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(listOf(wire("a")))
        val vm = viewModel()

        vm.load("r1")

        assertThat(vm.state.value.hasMore).isFalse()
    }

    @Test
    fun loadMore_prependsTheOlderPageAheadOfTheCurrentList() = runTest {
        val firstPage = (1..20).map { wire("id$it", createdAt = "2026-06-20T10:00:00Z") }
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(firstPage)
        val olderPage = listOf(wire("older1", createdAt = "2026-06-20T09:00:00Z"))
        coEvery { repo.getComments("r1", "id20", 20) } returns NetworkResult.Success(olderPage)
        val vm = viewModel()
        vm.load("r1")
        assertThat(vm.state.value.hasMore).isTrue()

        vm.loadMore()

        assertThat(vm.state.value.comments.first().id).isEqualTo("older1")
        assertThat(vm.state.value.isLoadingMore).isFalse()
        assertThat(vm.state.value.comments).hasSize(21)
    }

    @Test
    fun loadMore_whenTheOlderPageIsItselfPartial_clearsHasMore() = runTest {
        val firstPage = (1..20).map { wire("id$it") }
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(firstPage)
        coEvery { repo.getComments("r1", "id20", 20) } returns NetworkResult.Success(listOf(wire("older1")))
        val vm = viewModel()
        vm.load("r1")

        vm.loadMore()

        assertThat(vm.state.value.hasMore).isFalse()
    }

    @Test
    fun loadMore_withNoMorePages_neverHitsTheNetwork() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(listOf(wire("a")))
        val vm = viewModel()
        vm.load("r1")
        assertThat(vm.state.value.hasMore).isFalse()

        vm.loadMore()

        coVerify(exactly = 1) { repo.getComments(any(), any(), any()) }
    }

    @Test
    fun loadMore_beforeAnyLoad_isInert() = runTest {
        val vm = viewModel()

        vm.loadMore()

        coVerify(exactly = 0) { repo.getComments(any(), any(), any()) }
    }

    @Test
    fun loadMore_aSecondTimeWhileTheFirstIsInFlight_isInert() = runTest {
        val firstPage = (1..20).map { wire("id$it") }
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(firstPage)
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repo.getComments("r1", "id20", 20) } coAnswers { gate.await() }
        val vm = viewModel()
        vm.load("r1")

        vm.loadMore()
        vm.loadMore()
        gate.complete(NetworkResult.Success(listOf(wire("older1"))))

        coVerify(exactly = 1) { repo.getComments("r1", "id20", 20) }
    }

    @Test
    fun loadMore_failure_keepsTheAlreadyShownPage() = runTest {
        val firstPage = (1..20).map { wire("id$it") }
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(firstPage)
        coEvery { repo.getComments("r1", "id20", 20) } returns NetworkResult.Failure(ApiError("flaky"))
        val vm = viewModel()
        vm.load("r1")

        vm.loadMore()

        assertThat(vm.state.value.comments).hasSize(20)
        assertThat(vm.state.value.isLoadingMore).isFalse()
    }

    // MARK: - Optimistic posting

    @Test
    fun post_optimisticPending_thenSentOnAck() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        val gate = CompletableDeferred<NetworkResult<ApiPostComment>>()
        coEvery { repo.addComment("r1", "hi", any(), any()) } coAnswers { gate.await() }
        val vm = viewModel()
        vm.load("r1")

        vm.post("hi")

        val pending = vm.state.value.comments.single()
        assertThat(pending.status).isEqualTo(ReelCommentStatus.Pending)
        assertThat(pending.content).isEqualTo("hi")
        assertThat(pending.authorName).isEqualTo("Me")

        gate.complete(NetworkResult.Success(wire("server1", content = "hi", createdAt = "2026-06-20T12:00:00Z")))

        val confirmed = vm.state.value.comments.single()
        assertThat(confirmed.id).isEqualTo("server1")
        assertThat(confirmed.status).isEqualTo(ReelCommentStatus.Sent)
    }

    @Test
    fun post_failure_marksRowFailed() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        coEvery { repo.addComment("r1", "oops", any(), any()) } returns NetworkResult.Failure(ApiError("no net"))
        val vm = viewModel()
        vm.load("r1")

        vm.post("oops")

        assertThat(vm.state.value.comments.single().status).isEqualTo(ReelCommentStatus.Failed)
    }

    @Test
    fun post_blankContent_isIgnored() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("r1")

        vm.post("   ")

        assertThat(vm.state.value.comments).isEmpty()
        coVerify(exactly = 0) { repo.addComment(any(), any(), any(), any()) }
    }

    @Test
    fun retry_resendsFailedComment_toSent() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        coEvery { repo.addComment("r1", "again", any(), any()) } returns NetworkResult.Failure(ApiError("flaky"))
        val vm = viewModel()
        vm.load("r1")
        vm.post("again")
        val failed = vm.state.value.comments.single()
        assertThat(failed.status).isEqualTo(ReelCommentStatus.Failed)

        coEvery { repo.addComment("r1", "again", any(), any()) } returns
            NetworkResult.Success(wire("server9", content = "again", createdAt = "2026-06-20T12:30:00Z"))
        vm.retry(failed.clientId!!)

        val sent = vm.state.value.comments.single()
        assertThat(sent.id).isEqualTo("server9")
        assertThat(sent.status).isEqualTo(ReelCommentStatus.Sent)
    }

    @Test
    fun retry_unknownClientId_isInert() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("r1")

        vm.retry("ghost")

        coVerify(exactly = 0) { repo.addComment(any(), any(), any(), any()) }
    }

    // MARK: - Realtime

    @Test
    fun socketCommentForThisReel_appendsLive() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("r1")

        commentAdded.tryEmit(SocketCommentAddedData(postId = "r1", comment = wire("live1")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("live1")
    }

    @Test
    fun socketCommentForOtherReel_isIgnored() = runTest {
        coEvery { repo.getComments("r1") } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.load("r1")

        commentAdded.tryEmit(SocketCommentAddedData(postId = "other", comment = wire("x")))

        assertThat(vm.state.value.comments).isEmpty()
    }

    @Test
    fun socketEchoOfAlreadyShownComment_isDeduped() = runTest {
        coEvery { repo.getComments("r1") } returns
            NetworkResult.Success(listOf(wire("dup", createdAt = "2026-06-20T09:00:00Z")))
        val vm = viewModel()
        vm.load("r1")
        assertThat(vm.state.value.comments).hasSize(1)

        commentAdded.tryEmit(SocketCommentAddedData(postId = "r1", comment = wire("dup")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("dup")
    }
}
