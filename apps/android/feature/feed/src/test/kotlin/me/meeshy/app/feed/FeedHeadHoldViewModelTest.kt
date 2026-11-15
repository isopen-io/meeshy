package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketPostCreatedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.FeedEngagementRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #16676 — le lecteur qui a quitté le haut du fil (ou le fil quitté l'écran) ne voit pas sa liste bouger : ce qui
 * arrive en tête attend, compté par la bannière, et entre quand il revient en haut, touche la bannière ou tire.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedHeadHoldViewModelTest {

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
    private val publications: PublicationOutbox = mockk(relaxed = true) { every { notices } returns MutableSharedFlow() }
    private val postCreated = MutableSharedFlow<SocketPostCreatedData>(extraBufferCapacity = 16)
    private val postDeleted = MutableSharedFlow<SocketPostDeletedData>(extraBufferCapacity = 16)

    private fun post(id: String, minute: Int = 0) =
        ApiPost(id = id, content = "Post $id", createdAt = "2026-11-08T10:%02d:00.000Z".format(minute))

    private fun viewModel(cache: MutableStateFlow<CacheResult<List<ApiPost>>>): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { repository.feedHasMore } returns MutableStateFlow(true)
        every { repository.gestureRefusals } returns MutableSharedFlow()
        every { repository.feedStream(any(), any()) } returns cache
        every { socialSocket.postCreated } returns postCreated
        every { socialSocket.postDeleted } returns postDeleted
        every { socialSocket.postReposted } returns MutableSharedFlow()
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        every { socialSocket.postBookmarked } returns MutableSharedFlow()
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.postTranslationUpdated } returns MutableSharedFlow()
        every { socialSocket.mediaCaptionTranslationUpdated } returns MutableSharedFlow()
        every { socialSocket.postReactionAdded } returns MutableSharedFlow()
        every { socialSocket.postReactionRemoved } returns MutableSharedFlow()
        every { socialSocket.postUpdated } returns MutableSharedFlow()
        every { socialSocket.reconnected } returns emptyFlow()
        return FeedViewModel(
            repository,
            session,
            socialSocket,
            MeeshyConfig(),
            mockk<ReportRepository>(relaxed = true),
            mockk<androidx.work.WorkManager>(relaxed = true),
            mockk<FeedEngagementRepository>(relaxed = true),
            publications,
        )
    }

    private fun shown(vm: FeedViewModel) = vm.state.value.posts.map { it.id }

    private fun readFeed() = MutableStateFlow<CacheResult<List<ApiPost>>>(CacheResult.Fresh(listOf(post("b", 20), post("a", 10)), 0L))

    @Test
    fun `a post arriving by the socket while the reader is away waits outside the list, counted`() = runTest {
        val vm = viewModel(readFeed())
        vm.holdHead(true)

        postCreated.emit(SocketPostCreatedData(post("new", 30)))

        assertThat(shown(vm)).containsExactly("b", "a").inOrder()
        assertThat(vm.state.value.newPostsCount).isEqualTo(1)
    }

    @Test
    fun `back at the top, the held post enters at the head`() = runTest {
        val vm = viewModel(readFeed())
        vm.holdHead(true)
        postCreated.emit(SocketPostCreatedData(post("new", 30)))

        vm.holdHead(false)

        assertThat(shown(vm)).containsExactly("new", "b", "a").inOrder()
    }

    @Test
    fun `a silent revalidation bringing a newer post holds it too`() = runTest {
        val cache = readFeed()
        val vm = viewModel(cache)
        vm.holdHead(true)

        cache.value = CacheResult.Fresh(listOf(post("c", 30), post("b", 20), post("a", 10)), 1L)

        assertThat(shown(vm)).containsExactly("b", "a").inOrder()
        assertThat(vm.state.value.newPostsCount).isEqualTo(1)
    }

    @Test
    fun `a held post deleted before it was seen leaves the banner`() = runTest {
        val vm = viewModel(readFeed())
        vm.holdHead(true)
        postCreated.emit(SocketPostCreatedData(post("new", 30)))

        postDeleted.emit(SocketPostDeletedData(postId = "new"))

        assertThat(vm.state.value.newPostsCount).isEqualTo(0)
        vm.holdHead(false)
        assertThat(shown(vm)).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `tapping the banner lets the held posts in even before the list reaches the top`() = runTest {
        val cache = readFeed()
        val vm = viewModel(cache)
        vm.holdHead(true)
        cache.value = CacheResult.Fresh(listOf(post("c", 30), post("b", 20), post("a", 10)), 1L)

        vm.acknowledgeNewPosts()

        assertThat(shown(vm)).containsExactly("c", "b", "a").inOrder()
        assertThat(vm.state.value.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `pulling to refresh lets the held posts in`() = runTest {
        coEvery { repository.refreshReporting() } returns null
        val cache = readFeed()
        val vm = viewModel(cache)
        vm.holdHead(true)
        cache.value = CacheResult.Fresh(listOf(post("c", 30), post("b", 20), post("a", 10)), 1L)

        vm.refresh()

        assertThat(shown(vm)).containsExactly("c", "b", "a").inOrder()
    }

    @Test
    fun `the first load always shows, even while the feed is held`() = runTest {
        val cache = MutableStateFlow<CacheResult<List<ApiPost>>>(CacheResult.Empty)
        val vm = viewModel(cache)
        vm.holdHead(true)

        cache.value = CacheResult.Fresh(listOf(post("b", 20), post("a", 10)), 0L)

        assertThat(shown(vm)).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `at the top nothing is held, an arrival shows at once`() = runTest {
        val vm = viewModel(readFeed())
        vm.holdHead(false)

        postCreated.emit(SocketPostCreatedData(post("new", 30)))

        assertThat(shown(vm)).containsExactly("new", "b", "a").inOrder()
    }
}
