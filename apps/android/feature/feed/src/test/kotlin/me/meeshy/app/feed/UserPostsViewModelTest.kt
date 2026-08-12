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
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UserPostsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val config = MeeshyConfig()

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    private fun page(vararg ids: String, nextCursor: String? = null, hasMore: Boolean = false) =
        NetworkResult.Success(PostPage(ids.map { post(it) }, nextCursor, hasMore))

    private fun viewModel(userId: String? = "u1"): UserPostsViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        val handle = SavedStateHandle(if (userId == null) emptyMap() else mapOf("userId" to userId))
        return UserPostsViewModel(repository, session, config, handle)
    }

    @Test
    fun `loadInitial populates posts from the first page`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns page("a", "b", hasMore = false)

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts.map { it.id }).containsExactly("a", "b").inOrder()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.hasMore).isFalse()
            assertThat(s.errorMessage).isNull()
        }
    }

    @Test
    fun `loadInitial forwards the route userId to the repository`() = runTest {
        coEvery { repository.getUserPostsPage("u42", null, any()) } returns page("a", hasMore = false)

        viewModel(userId = "u42")

        coVerify(exactly = 1) { repository.getUserPostsPage("u42", null, any()) }
    }

    @Test
    fun `a blank userId never hits the network`() = runTest {
        viewModel(userId = null)

        coVerify(exactly = 0) { repository.getUserPostsPage(any(), any(), any()) }
    }

    @Test
    fun `cold load shows a skeleton until the first page arrives`() = runTest {
        val gate = CompletableDeferred<NetworkResult<PostPage>>()
        coEvery { repository.getUserPostsPage("u1", null, any()) } coAnswers { gate.await() }

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            gate.complete(page("a"))
            val settled = awaitItem()
            assertThat(settled.showSkeleton).isFalse()
            assertThat(settled.posts.map { it.id }).containsExactly("a")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadInitial failure surfaces the error and hides the skeleton`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns
            NetworkResult.Failure(ApiError("boom"))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.posts).isEmpty()
        }
    }

    @Test
    fun `an empty first page shows the empty state, not a skeleton`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns page(hasMore = false)

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts).isEmpty()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.hasMore).isFalse()
        }
    }

    @Test
    fun `loadInitial is guarded once the list has loaded`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns page("a", hasMore = false)

        val vm = viewModel()
        vm.loadInitial()

        coVerify(exactly = 1) { repository.getUserPostsPage(any(), any(), any()) }
    }

    @Test
    fun `loadMoreIfNeeded fetches and appends the next page near the tail`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns
            page("a", "b", "c", nextCursor = "c2", hasMore = true)
        coEvery { repository.getUserPostsPage("u1", "c2", any()) } returns
            page("d", "e", hasMore = false)

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id })
                .containsExactly("a", "b", "c", "d", "e").inOrder()
        }
        coVerify(exactly = 1) { repository.getUserPostsPage("u1", "c2", any()) }
    }

    @Test
    fun `loadMoreIfNeeded is inert when no further pages remain`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns
            page("a", "b", "c", nextCursor = null, hasMore = false)

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        coVerify(exactly = 1) { repository.getUserPostsPage(any(), any(), any()) }
    }

    @Test
    fun `loadMoreIfNeeded is inert when the post is far from the tail`() = runTest {
        val ids = (0 until 10).map { "a$it" }
        coEvery { repository.getUserPostsPage("u1", null, any()) } returns
            NetworkResult.Success(PostPage(ids.map { post(it) }, "c2", true))

        val vm = viewModel()
        vm.loadMoreIfNeeded("a0")

        coVerify(exactly = 1) { repository.getUserPostsPage(any(), any(), any()) }
    }

    @Test
    fun `refresh resets the list and reloads the first page`() = runTest {
        coEvery { repository.getUserPostsPage("u1", null, any()) } returnsMany
            listOf(page("a", "b", hasMore = false), page("x", hasMore = false))

        val vm = viewModel()
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id }).containsExactly("x")
        }
        coVerify(exactly = 2) { repository.getUserPostsPage("u1", null, any()) }
    }
}
