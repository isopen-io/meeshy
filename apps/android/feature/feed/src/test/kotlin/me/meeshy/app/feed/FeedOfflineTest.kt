package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.publication.PublicationNotice
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

/**
 * #14263 — hors ligne, le fil montre ce qu'il garde, avec un bandeau discret « Hors ligne », jamais « Impossible de
 * charger le fil » par-dessus des publications lisibles. Seul un fil vide montre l'état d'erreur.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedOfflineTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { postCreated } returns MutableSharedFlow()
        every { postDeleted } returns MutableSharedFlow()
        every { postLiked } returns MutableSharedFlow()
        every { postUnliked } returns MutableSharedFlow()
        every { postBookmarked } returns MutableSharedFlow()
        every { commentAdded } returns MutableSharedFlow()
        every { commentDeleted } returns MutableSharedFlow()
        every { postTranslationUpdated } returns MutableSharedFlow()
        every { mediaCaptionTranslationUpdated } returns MutableSharedFlow()
        every { postUpdated } returns MutableSharedFlow()
        every { postReposted } returns MutableSharedFlow()
    }
    private val publications: PublicationOutbox = mockk(relaxed = true) {
        every { notices } returns MutableSharedFlow<PublicationNotice>()
    }

    private fun keptFeed(vararg ids: String): (onSyncError: (Throwable) -> Unit) -> Flow<CacheResult<List<ApiPost>>> = { onSyncError ->
        flow {
            emit(if (ids.isEmpty()) CacheResult.Empty else CacheResult.Stale(ids.map { ApiPost(id = it, content = "Post $it") }, 600_000L))
            onSyncError(IOException("offline"))
        }
    }

    private fun viewModel(
        network: InMemoryNetworkMonitor,
        feed: (onSyncError: (Throwable) -> Unit) -> Flow<CacheResult<List<ApiPost>>>,
    ): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { repository.feedHasMore } returns MutableStateFlow(true)
        every { repository.feedStream(any(), any()) } answers { feed(secondArg()) }
        return FeedViewModel(
            repository, session, socialSocket, MeeshyConfig(), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
            publications, network,
        )
    }

    @Test
    fun `offline, the kept feed is read under a discreet offline band, without the load error`() = runTest {
        val vm = viewModel(InMemoryNetworkMonitor(initialOnline = false), keptFeed("p1", "p2"))

        val state = vm.state.value
        assertThat(state.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(state.isOffline).isTrue()
        assertThat(state.loadFailed).isFalse()
        assertThat(state.notice).isNull()
    }

    @Test
    fun `the offline band leaves as soon as the network is back`() = runTest {
        val network = InMemoryNetworkMonitor(initialOnline = false)
        val vm = viewModel(network, keptFeed("p1"))

        network.simulateOnline()

        assertThat(vm.state.value.isOffline).isFalse()
    }

    @Test
    fun `offline with nothing kept, the feed still says it could not load`() = runTest {
        val vm = viewModel(InMemoryNetworkMonitor(initialOnline = false), keptFeed())

        assertThat(vm.state.value.posts).isEmpty()
        assertThat(vm.state.value.loadFailed).isTrue()
    }

    @Test
    fun `online, a failed reload over a readable feed is told once by its notice`() = runTest {
        val vm = viewModel(InMemoryNetworkMonitor(initialOnline = true), keptFeed("p1"))

        assertThat(vm.state.value.isOffline).isFalse()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.LOAD_FAILED)
    }
}
