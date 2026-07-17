package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
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
import me.meeshy.sdk.model.SocketPostCreatedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
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
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val postCreated = MutableSharedFlow<SocketPostCreatedData>(extraBufferCapacity = 64)
    private val postDeleted = MutableSharedFlow<SocketPostDeletedData>(extraBufferCapacity = 64)
    private val postLiked = MutableSharedFlow<SocketPostLikedData>(extraBufferCapacity = 64)
    private val postUnliked = MutableSharedFlow<SocketPostUnlikedData>(extraBufferCapacity = 64)
    private val config = MeeshyConfig()

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    private fun viewModel(hasMore: Boolean = true): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { repository.feedHasMore } returns MutableStateFlow(hasMore)
        every { socialSocket.postCreated } returns postCreated
        every { socialSocket.postDeleted } returns postDeleted
        every { socialSocket.postLiked } returns postLiked
        every { socialSocket.postUnliked } returns postUnliked
        return FeedViewModel(repository, session, socialSocket, config)
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
        every { socialSocket.postCreated } returns postCreated
        every { socialSocket.postDeleted } returns postDeleted
        every { socialSocket.postLiked } returns postLiked
        every { socialSocket.postUnliked } returns postUnliked
        return FeedViewModel(repository, session, socialSocket, config)
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

    // --- Realtime new-posts banner (post:created) ---

    @Test
    fun `a realtime post arrives at the head and raises the new-posts banner`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1"), post("2")), 0L)))

        postCreated.emit(SocketPostCreatedData(post("new")))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("new", "1", "2").inOrder()
        assertThat(s.newPostsCount).isEqualTo(1)
    }

    @Test
    fun `a realtime post already in the cache feed is ignored`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1"), post("2")), 0L)))

        postCreated.emit(SocketPostCreatedData(post("2")))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("1", "2").inOrder()
        assertThat(s.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `two realtime posts stack newest-first above the feed and count to two`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1")), 0L)))

        postCreated.emit(SocketPostCreatedData(post("a")))
        postCreated.emit(SocketPostCreatedData(post("b")))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("b", "a", "1").inOrder()
        assertThat(s.newPostsCount).isEqualTo(2)
    }

    @Test
    fun `acknowledgeNewPosts clears the banner count but keeps the post at the head`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1")), 0L)))
        postCreated.emit(SocketPostCreatedData(post("new")))

        vm.acknowledgeNewPosts()

        val s = vm.state.value
        assertThat(s.newPostsCount).isEqualTo(0)
        assertThat(s.posts.map { it.id }).containsExactly("new", "1").inOrder()
    }

    @Test
    fun `a realtime post survives a background feed re-emission`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Stale(listOf(post("1")), 0L),
        )
        val vm = viewModel(null, stream)
        postCreated.emit(SocketPostCreatedData(post("new")))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("new", "1").inOrder()

        // A refresh that does not yet carry the socket post must not erase it.
        stream.value = CacheResult.Fresh(listOf(post("1"), post("0")), 100L)

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("new", "1", "0").inOrder()
        assertThat(vm.state.value.newPostsCount).isEqualTo(1)
    }

    @Test
    fun `once the cache surfaces the realtime post it is not rendered twice`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Fresh(listOf(post("1")), 0L),
        )
        val vm = viewModel(null, stream)
        postCreated.emit(SocketPostCreatedData(post("new")))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("new", "1").inOrder()

        // The refresh now includes "new" — it must appear exactly once.
        stream.value = CacheResult.Fresh(listOf(post("new"), post("1")), 100L)

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("new", "1").inOrder()
    }

    @Test
    fun `refresh drops the realtime head and clears the banner`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1")), 0L)))
        postCreated.emit(SocketPostCreatedData(post("new")))
        assertThat(vm.state.value.newPostsCount).isEqualTo(1)

        vm.refresh()

        val s = vm.state.value
        assertThat(s.newPostsCount).isEqualTo(0)
        assertThat(s.posts.map { it.id }).containsExactly("1")
    }

    // --- Realtime post:deleted removal ---

    @Test
    fun `a realtime post-deleted removes the post from the displayed feed`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1"), post("2"), post("3")), 0L)))

        postDeleted.emit(SocketPostDeletedData(postId = "2"))

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("1", "3").inOrder()
    }

    @Test
    fun `a realtime post-deleted removes a buffered realtime post and lowers the banner count`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1")), 0L)))
        postCreated.emit(SocketPostCreatedData(post("new")))
        assertThat(vm.state.value.newPostsCount).isEqualTo(1)

        postDeleted.emit(SocketPostDeletedData(postId = "new"))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("1")
        assertThat(s.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `a post-deleted for a post the feed does not hold is inert`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1"), post("2")), 0L)))

        postDeleted.emit(SocketPostDeletedData(postId = "zzz"))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("1", "2").inOrder()
        assertThat(s.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `a deleted post stays hidden across a stale re-emission that still carries it`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Fresh(listOf(post("1"), post("2")), 0L),
        )
        val vm = viewModel(null, stream)
        postDeleted.emit(SocketPostDeletedData(postId = "2"))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("1")

        // Server lag: a background re-emission still carries the deleted post — the tombstone holds.
        stream.value = CacheResult.Stale(listOf(post("1"), post("2")), 100L)

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("1")
    }

    @Test
    fun `a post re-created after deletion reappears at the head`() = runTest {
        val vm = viewModel(null, flowOf(CacheResult.Fresh(listOf(post("1")), 0L)))
        postCreated.emit(SocketPostCreatedData(post("new")))
        postDeleted.emit(SocketPostDeletedData(postId = "new"))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("1")

        postCreated.emit(SocketPostCreatedData(post("new")))

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("new", "1").inOrder()
        assertThat(s.newPostsCount).isEqualTo(1)
    }

    // --- Realtime like sync (post:liked / post:unliked) ---

    private val me = MeeshyUser(id = "me", username = "me")

    private fun likedPost(id: String, count: Int, liked: Boolean) =
        ApiPost(id = id, content = "Post $id", likeCount = count, isLikedByMe = liked)

    @Test
    fun `a realtime post-liked updates the displayed like count live`() = runTest {
        val vm = viewModel(me, flowOf(CacheResult.Fresh(listOf(likedPost("1", count = 2, liked = false)), 0L)))

        postLiked.emit(SocketPostLikedData(postId = "1", userId = "other", likesCount = 7))

        val card = vm.state.value.posts.single()
        assertThat(card.likeCount).isEqualTo(7)
        assertThat(card.isLiked).isFalse()
    }

    @Test
    fun `a realtime post-liked by the viewer marks the post liked`() = runTest {
        val vm = viewModel(me, flowOf(CacheResult.Fresh(listOf(likedPost("1", count = 2, liked = false)), 0L)))

        postLiked.emit(SocketPostLikedData(postId = "1", userId = "me", likesCount = 3))

        val card = vm.state.value.posts.single()
        assertThat(card.likeCount).isEqualTo(3)
        assertThat(card.isLiked).isTrue()
    }

    @Test
    fun `a realtime post-unliked by the viewer clears the like`() = runTest {
        val vm = viewModel(me, flowOf(CacheResult.Fresh(listOf(likedPost("1", count = 4, liked = true)), 0L)))

        postUnliked.emit(SocketPostUnlikedData(postId = "1", userId = "me", likesCount = 3))

        val card = vm.state.value.posts.single()
        assertThat(card.likeCount).isEqualTo(3)
        assertThat(card.isLiked).isFalse()
    }

    @Test
    fun `a realtime post-liked by another user never flips the viewer's own like`() = runTest {
        val vm = viewModel(me, flowOf(CacheResult.Fresh(listOf(likedPost("1", count = 4, liked = true)), 0L)))

        postLiked.emit(SocketPostLikedData(postId = "1", userId = "other", likesCount = 9))

        val card = vm.state.value.posts.single()
        assertThat(card.likeCount).isEqualTo(9)
        assertThat(card.isLiked).isTrue()
    }

    @Test
    fun `the live like count survives a background feed re-emission`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Stale(listOf(likedPost("1", count = 2, liked = false)), 0L),
        )
        val vm = viewModel(me, stream)
        postLiked.emit(SocketPostLikedData(postId = "1", userId = "other", likesCount = 7))
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(7)

        // A stale server re-emission still reports the old count — the live overlay holds.
        stream.value = CacheResult.Fresh(listOf(likedPost("1", count = 2, liked = false)), 100L)

        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(7)
    }

    @Test
    fun `a later cache count is respected once the overlay is reconciled away`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Fresh(listOf(likedPost("1", count = 2, liked = false)), 0L),
        )
        val vm = viewModel(me, stream)
        postLiked.emit(SocketPostLikedData(postId = "1", userId = "other", likesCount = 5))
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(5)

        // The cache catches up to the overlay count → the overlay is released.
        stream.value = CacheResult.Fresh(listOf(likedPost("1", count = 5, liked = false)), 100L)
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(5)

        // A subsequent cache count is now authoritative — no stale overlay pins it.
        stream.value = CacheResult.Fresh(listOf(likedPost("1", count = 8, liked = false)), 200L)
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(8)
    }

    @Test
    fun `refresh drops a live like overlay`() = runTest {
        val stream = MutableStateFlow<CacheResult<List<ApiPost>>>(
            CacheResult.Fresh(listOf(likedPost("1", count = 2, liked = false)), 0L),
        )
        val vm = viewModel(me, stream)
        postLiked.emit(SocketPostLikedData(postId = "1", userId = "other", likesCount = 7))
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(7)

        vm.refresh()

        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(2)
    }
}
