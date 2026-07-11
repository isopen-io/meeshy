package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelTest {

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

    private fun viewModel(hasMore: Boolean = true): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { repository.feedHasMore } returns MutableStateFlow(hasMore)
        return FeedViewModel(repository, session, config)
    }

    @Test
    fun `shows skeleton on cold cache`() = runTest {
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Empty)

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.showSkeleton).isTrue()
            assertThat(s.posts).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows posts on fresh cache`() = runTest {
        val posts = listOf(post("1"), post("2"))
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Fresh(posts, 1000L))

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts).hasSize(2)
            assertThat(s.posts.map { it.id }).containsExactly("1", "2").inOrder()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.isSyncing).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows posts with syncing indicator on stale cache`() = runTest {
        val posts = listOf(post("1"))
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Stale(posts, 5000L))

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts).hasSize(1)
            assertThat(s.isSyncing).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `surfaces sync error to ui state`() = runTest {
        every { repository.feedStream(any(), captureLambda()) } answers {
            val onError = lambda<(Throwable) -> Unit>().captured
            onError(RuntimeException("timeout"))
            flowOf(CacheResult.Empty)
        }

        val vm = viewModel()
        vm.state.test {
            skipItems(1) // initial empty
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(vm.state.value.errorMessage).isEqualTo("timeout")
    }

    @Test
    fun `toggleLike delegates to repository`() = runTest {
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Empty)

        val vm = viewModel()
        vm.toggleLike("p1")

        coVerify(exactly = 1) { repository.toggleLike("p1") }
    }

    @Test
    fun `hasMore is reflected from repository`() = runTest {
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Fresh(listOf(post("1")), 0L))

        val vm = viewModel(hasMore = false)

        assertThat(vm.state.value.hasMore).isFalse()
    }

    @Test
    fun `loadMoreIfNeeded near the end delegates to repository`() = runTest {
        val posts = (1..6).map { post(it.toString()) }
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Fresh(posts, 0L))

        val vm = viewModel(hasMore = true)
        vm.loadMoreIfNeeded("6")

        coVerify(exactly = 1) { repository.loadMore() }
    }

    @Test
    fun `loadMoreIfNeeded far from the end is a no-op`() = runTest {
        val posts = (1..10).map { post(it.toString()) }
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Fresh(posts, 0L))

        val vm = viewModel(hasMore = true)
        vm.loadMoreIfNeeded("1")

        coVerify(exactly = 0) { repository.loadMore() }
    }

    @Test
    fun `loadMoreIfNeeded does nothing when no more pages remain`() = runTest {
        val posts = (1..6).map { post(it.toString()) }
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Fresh(posts, 0L))

        val vm = viewModel(hasMore = false)
        vm.loadMoreIfNeeded("6")

        coVerify(exactly = 0) { repository.loadMore() }
    }

    // --- Prisme language switch (onPostFlagTap) ---

    private val bilingualUser = MeeshyUser(
        id = "me",
        username = "me",
        systemLanguage = "en",
        regionalLanguage = "es",
    )

    private fun translatedPost(id: String) = ApiPost(
        id = id,
        content = "Bonjour",
        originalLanguage = "fr",
        translations = mapOf(
            "en" to ApiPostTranslationEntry(text = "Hello"),
            "es" to ApiPostTranslationEntry(text = "Hola"),
        ),
    )

    private fun viewModel(
        user: MeeshyUser?,
        stream: Flow<CacheResult<List<ApiPost>>>,
    ): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        every { repository.feedHasMore } returns MutableStateFlow(true)
        every { repository.feedStream(any(), any()) } returns stream
        return FeedViewModel(repository, session, config)
    }

    @Test
    fun `onPostFlagTap switches the post's displayed language`() = runTest {
        val vm = viewModel(bilingualUser, flowOf(CacheResult.Fresh(listOf(translatedPost("1")), 0L)))
        assertThat(vm.state.value.posts.single().content).isEqualTo("Hello")

        vm.onPostFlagTap("1", "es")

        assertThat(vm.state.value.posts.single().content).isEqualTo("Hola")
    }

    @Test
    fun `onPostFlagTap on the active language reverts to the default resolution`() = runTest {
        val vm = viewModel(bilingualUser, flowOf(CacheResult.Fresh(listOf(translatedPost("1")), 0L)))

        vm.onPostFlagTap("1", "es")
        assertThat(vm.state.value.posts.single().content).isEqualTo("Hola")

        vm.onPostFlagTap("1", "es")
        assertThat(vm.state.value.posts.single().content).isEqualTo("Hello")
    }

    @Test
    fun `onPostFlagTap on an unknown post is inert`() = runTest {
        val vm = viewModel(bilingualUser, flowOf(CacheResult.Fresh(listOf(translatedPost("1")), 0L)))

        vm.onPostFlagTap("does-not-exist", "es")

        assertThat(vm.state.value.posts.single().content).isEqualTo("Hello")
    }

    @Test
    fun `onPostFlagTap with a blank code is inert`() = runTest {
        val vm = viewModel(bilingualUser, flowOf(CacheResult.Fresh(listOf(translatedPost("1")), 0L)))

        vm.onPostFlagTap("1", "   ")

        assertThat(vm.state.value.posts.single().content).isEqualTo("Hello")
    }

    @Test
    fun `an active language override survives a feed stream re-emission`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Stale(listOf(translatedPost("1")), 0L),
        )
        val vm = viewModel(bilingualUser, stream)

        vm.onPostFlagTap("1", "es")
        assertThat(vm.state.value.posts.single().content).isEqualTo("Hola")

        // A background refresh delivers the same post afresh — the viewer's choice holds.
        stream.value = CacheResult.Fresh(listOf(translatedPost("1")), 0L)

        assertThat(vm.state.value.posts.single().content).isEqualTo("Hola")
    }
}
