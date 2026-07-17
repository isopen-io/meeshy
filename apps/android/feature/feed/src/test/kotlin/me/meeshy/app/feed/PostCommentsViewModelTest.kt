package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val config = MeeshyConfig()

    private fun comment(id: String, content: String = "hi", parentId: String? = null) =
        ApiPostComment(id = id, content = content, parentId = parentId)

    private fun page(n: Int) = (1..n).map { comment("s$it") }

    private fun viewModel(
        postId: String? = "p1",
        user: MeeshyUser? = MeeshyUser(id = "me", username = "me"),
    ): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        val handle = SavedStateHandle(if (postId == null) emptyMap() else mapOf("postId" to postId))
        return PostCommentsViewModel(repository, session, config, handle)
    }

    @Test
    fun `loadInitial populates the comment list`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a"), comment("b")))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.map { it.id }).containsExactly("a", "b").inOrder()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.isEmpty).isFalse()
        }
    }

    @Test
    fun `loadInitial forwards the route postId`() = runTest {
        coEvery { repository.getComments("p42", null, any()) } returns NetworkResult.Success(emptyList())
        viewModel(postId = "p42")
        coVerify(exactly = 1) { repository.getComments("p42", null, any()) }
    }

    @Test
    fun `a blank postId never hits the network and shows empty`() = runTest {
        val vm = viewModel(postId = null)
        vm.state.test {
            val s = awaitItem()
            assertThat(s.isEmpty).isTrue()
            assertThat(s.showSkeleton).isFalse()
        }
        coVerify(exactly = 0) { repository.getComments(any(), any(), any()) }
    }

    @Test
    fun `cold load shows a skeleton until comments arrive`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repository.getComments("p1", null, any()) } coAnswers { gate.await() }

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            gate.complete(NetworkResult.Success(listOf(comment("a"))))
            val settled = awaitItem()
            assertThat(settled.showSkeleton).isFalse()
            assertThat(settled.comments).hasSize(1)
        }
    }

    @Test
    fun `empty result settles to the empty state`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.isEmpty).isTrue()
            assertThat(s.showSkeleton).isFalse()
        }
    }

    @Test
    fun `failure surfaces an error and no skeleton`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Failure(ApiError(message = "boom"))
        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.showSkeleton).isFalse()
        }
    }

    @Test
    fun `loadInitial is guarded after the first load`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel()
        vm.loadInitial()
        coVerify(exactly = 1) { repository.getComments("p1", null, any()) }
    }

    @Test
    fun `a full page enables load-more with the last id as cursor`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(page(20))
        val vm = viewModel()
        vm.state.test {
            assertThat(awaitItem().canLoadMore).isTrue()
        }
        coEvery { repository.getComments("p1", "s20", any()) } returns NetworkResult.Success(listOf(comment("x")))
        vm.loadMore()
        coVerify(exactly = 1) { repository.getComments("p1", "s20", any()) }
    }

    @Test
    fun `a short page does not enable load-more`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(page(3))
        val vm = viewModel()
        vm.state.test { assertThat(awaitItem().canLoadMore).isFalse() }
        vm.loadMore()
        coVerify(exactly = 0) { repository.getComments("p1", "s3", any()) }
    }

    @Test
    fun `submit optimistically prepends then confirms with the server row`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.addComment("p1", "Bonjour", any(), any()) } returns
            NetworkResult.Success(comment("real", content = "Bonjour"))
        val vm = viewModel()
        vm.submit("  Bonjour  ")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.first().id).isEqualTo("real")
            assertThat(s.comments.first().content).isEqualTo("Bonjour")
            assertThat(s.comments.map { it.id }).containsExactly("real", "a").inOrder()
        }
        coVerify(exactly = 1) { repository.addComment("p1", "Bonjour", null, null) }
    }

    @Test
    fun `submit rolls back the optimistic row on failure and surfaces an error`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.addComment("p1", any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "nope"))
        val vm = viewModel()
        vm.submit("hi")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.map { it.id }).containsExactly("a")
            assertThat(s.errorMessage).isEqualTo("nope")
        }
    }

    @Test
    fun `submit is inert for blank content`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.submit("   ")
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any()) }
    }

    @Test
    fun `submit is inert for a blank postId`() = runTest {
        val vm = viewModel(postId = null)
        vm.submit("hi")
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any()) }
    }
}
