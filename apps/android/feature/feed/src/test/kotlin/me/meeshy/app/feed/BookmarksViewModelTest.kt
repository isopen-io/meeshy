package me.meeshy.app.feed

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
import me.meeshy.sdk.post.BookmarkPage
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BookmarksViewModelTest {

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
        NetworkResult.Success(BookmarkPage(ids.map { post(it) }, nextCursor, hasMore))

    private fun viewModel(cache: UserPostsCacheRepository = bookmarksCache()): BookmarksViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        return BookmarksViewModel(repository, mockk(relaxed = true), session, config, FakeProfileSocial().socket, cache)
    }

    @Test
    fun `loadInitial populates posts from the first page`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns page("a", "b", hasMore = false)

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
    fun `cold load shows a skeleton until the first page arrives`() = runTest {
        val gate = CompletableDeferred<NetworkResult<BookmarkPage>>()
        coEvery { repository.getBookmarksPage(null, any()) } coAnswers { gate.await() }

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
        coEvery { repository.getBookmarksPage(null, any()) } returns
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
        coEvery { repository.getBookmarksPage(null, any()) } returns page(hasMore = false)

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
        coEvery { repository.getBookmarksPage(null, any()) } returns page("a", hasMore = false)

        val vm = viewModel()
        vm.loadInitial()

        coVerify(exactly = 1) { repository.getBookmarksPage(any(), any()) }
    }

    @Test
    fun `loadMoreIfNeeded fetches and appends the next page near the tail`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns
            page("a", "b", "c", nextCursor = "c2", hasMore = true)
        coEvery { repository.getBookmarksPage("c2", any()) } returns
            page("d", "e", hasMore = false)

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id })
                .containsExactly("a", "b", "c", "d", "e").inOrder()
        }
        coVerify(exactly = 1) { repository.getBookmarksPage("c2", any()) }
    }

    @Test
    fun `loadMoreIfNeeded is inert when no further pages remain`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns
            page("a", "b", "c", nextCursor = null, hasMore = false)

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        coVerify(exactly = 1) { repository.getBookmarksPage(any(), any()) }
    }

    @Test
    fun `loadMoreIfNeeded is inert when the post is far from the tail`() = runTest {
        val ids = (0 until 10).map { "a$it" }
        coEvery { repository.getBookmarksPage(null, any()) } returns
            NetworkResult.Success(BookmarkPage(ids.map { post(it) }, "c2", true))

        val vm = viewModel()
        vm.loadMoreIfNeeded("a0")

        coVerify(exactly = 1) { repository.getBookmarksPage(any(), any()) }
    }

    @Test
    fun `removeBookmark optimistically drops the post and persists it`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns page("a", "b", "c", hasMore = false)
        coEvery { repository.removeBookmark("b") } returns NetworkResult.Success(Unit)

        val vm = viewModel()
        vm.removeBookmark("b")

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id }).containsExactly("a", "c").inOrder()
        }
        coVerify(exactly = 1) { repository.removeBookmark("b") }
    }

    @Test
    fun `removeBookmark rolls the post back when the network fails`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns page("a", "b", "c", hasMore = false)
        coEvery { repository.removeBookmark("b") } returns NetworkResult.Failure(ApiError("nope"))

        val vm = viewModel()
        vm.removeBookmark("b")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts.map { it.id }).containsExactly("a", "b", "c").inOrder()
            assertThat(s.errorMessage).isEqualTo("nope")
        }
    }

    @Test
    fun `removeBookmark is inert for a post not in the list`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns page("a", hasMore = false)

        val vm = viewModel()
        vm.removeBookmark("zzz")

        coVerify(exactly = 0) { repository.removeBookmark(any()) }
    }

    @Test
    fun `refresh resets the list and reloads the first page`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returnsMany
            listOf(page("a", "b", hasMore = false), page("x", hasMore = false))

        val vm = viewModel()
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id }).containsExactly("x")
        }
        coVerify(exactly = 2) { repository.getBookmarksPage(null, any()) }
    }

    private fun snapshot(vararg ids: String, cursor: String? = null, hasMore: Boolean = false) =
        UserPostsSnapshot(ids.map { post(it) }, cursor, hasMore)

    @Test
    fun `a fresh disk copy paints the saved posts with no skeleton and no network call`() = runTest {
        val vm = viewModel(bookmarksCache(CacheResult.Fresh(snapshot("a", "b"), ageMillis = 1_000)))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(s.showSkeleton).isFalse()
        coVerify(exactly = 0) { repository.getBookmarksPage(any(), any()) }
    }

    @Test
    fun `a stale disk copy paints at once, then the first page replaces it and is written back`() = runTest {
        val gate = CompletableDeferred<NetworkResult<BookmarkPage>>()
        coEvery { repository.getBookmarksPage(null, any()) } coAnswers { gate.await() }
        val written = mutableListOf<UserPostsSnapshot>()

        val vm = viewModel(bookmarksCache(CacheResult.Stale(snapshot("a", "old"), ageMillis = 999_999), written))

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a", "old").inOrder()
        assertThat(vm.state.value.showSkeleton).isFalse()
        gate.complete(page("a", "new", nextCursor = "c2", hasMore = true))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a", "new").inOrder()
        assertThat(written.last().posts.map { it.id }).containsExactly("a", "new").inOrder()
        assertThat(written.last().nextCursor).isEqualTo("c2")
    }

    @Test
    fun `offline with a disk copy keeps the rows and says nothing`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns NetworkResult.Failure(ApiError("offline"))

        val vm = viewModel(bookmarksCache(CacheResult.Stale(snapshot("a"), ageMillis = 999_999)))

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `an empty disk shows the skeleton until the first page, which is then written`() = runTest {
        val gate = CompletableDeferred<NetworkResult<BookmarkPage>>()
        coEvery { repository.getBookmarksPage(null, any()) } coAnswers { gate.await() }
        val written = mutableListOf<UserPostsSnapshot>()

        val vm = viewModel(bookmarksCache(written = written))

        assertThat(vm.state.value.showSkeleton).isTrue()
        gate.complete(page("a", hasMore = false))
        assertThat(written.last().posts.map { it.id }).containsExactly("a")
    }

    @Test
    fun `un-saving writes the shorter list to disk at once, and a refused un-save writes it back`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns page("a", "b", hasMore = false)
        coEvery { repository.removeBookmark("b") } returns NetworkResult.Failure(ApiError("nope"))
        val written = mutableListOf<UserPostsSnapshot>()
        val vm = viewModel(bookmarksCache(written = written))

        vm.removeBookmark("b")

        assertThat(written.map { s -> s.posts.map { it.id } }.takeLast(2))
            .containsExactly(listOf("a"), listOf("a", "b")).inOrder()
    }
}
