package me.meeshy.app.feed

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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.SocketPostRepostedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.publication.PublicationNotice
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * « Republier » depuis une carte du fil (#14456), comme `FeedView.togglePostRepost` sur iOS : le format suit la carte,
 * le compteur et la marque bougent au geste, un refus les rend et le dit, un second geste en vol n'envoie rien.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedRepostTest {

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
    private val publications: PublicationOutbox = mockk(relaxed = true) {
        every { notices } returns MutableSharedFlow<PublicationNotice>()
    }
    private val feed = MutableStateFlow<CacheResult<List<ApiPost>>>(CacheResult.Empty)
    private val reposted = MutableSharedFlow<SocketPostRepostedData>(extraBufferCapacity = 8)

    private fun card(id: String, type: String = "POST", reposts: Int = 3, repostOf: ApiRepostOf? = null) =
        ApiPost(id = id, type = type, content = "Post $id", repostCount = reposts, repostOf = repostOf)

    private fun serve(vararg posts: ApiPost) {
        feed.value = CacheResult.Fresh(posts.toList(), 0L)
    }

    private fun viewModel(reader: MeeshyUser? = null): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow(reader)
        every { repository.feedHasMore } returns MutableStateFlow(true)
        every { repository.gestureRefusals } returns MutableSharedFlow()
        every { repository.feedStream(any(), any()) } returns feed
        every { socialSocket.postCreated } returns MutableSharedFlow()
        every { socialSocket.postDeleted } returns MutableSharedFlow()
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        every { socialSocket.postBookmarked } returns MutableSharedFlow()
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.postTranslationUpdated } returns MutableSharedFlow()
        every { socialSocket.mediaCaptionTranslationUpdated } returns MutableSharedFlow()
        every { socialSocket.postReactionAdded } returns MutableSharedFlow()
        every { socialSocket.postReactionRemoved } returns MutableSharedFlow()
        every { socialSocket.reconnected } returns kotlinx.coroutines.flow.emptyFlow()
        every { socialSocket.postUpdated } returns MutableSharedFlow()
        every { socialSocket.postReposted } returns reposted
        return FeedViewModel(
            repository, session, socialSocket, MeeshyConfig(), mockk(relaxed = true), mockk(relaxed = true),
            mockk(relaxed = true), publications,
        )
    }

    private fun FeedViewModel.shown(id: String) = state.value.posts.single { it.id == id }

    @Test
    fun `a reel card of the feed reposts as a reel`() = runTest {
        serve(card("r1", type = "REEL"))
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(card("new"))

        viewModel().repost("r1")

        coVerify(exactly = 1) { repository.repost("r1", PostType.REEL, null, false) }
    }

    @Test
    fun `a quote keeps the format of the quoted card`() = runTest {
        serve(card("p1", type = "POST"))
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(card("new"))
        val vm = viewModel()

        vm.beginQuote("p1")
        vm.onQuoteTextChange("à lire")
        vm.submitQuote()

        coVerify(exactly = 1) { repository.repost("p1", PostType.POST, "à lire", true) }
    }

    @Test
    fun `the counter and the mark move at the gesture, before the server answers`() = runTest {
        serve(card("p1", reposts = 3))
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = viewModel()

        vm.repost("p1")

        assertThat(vm.shown("p1").repostCount).isEqualTo(4)
        assertThat(vm.shown("p1").isReposted).isTrue()
        answer.complete(NetworkResult.Success(card("new")))
    }

    @Test
    fun `a refusal gives the counter and the mark back and says so`() = runTest {
        serve(card("p1", reposts = 3))
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("hors ligne"))
        val vm = viewModel()

        vm.repost("p1")

        assertThat(vm.shown("p1").repostCount).isEqualTo(3)
        assertThat(vm.shown("p1").isReposted).isFalse()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOST_FAILED)
    }

    @Test
    fun `a confirmed repost says so and is never counted twice once the feed catches up`() = runTest {
        serve(card("p1", reposts = 3))
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(card("new"))
        val vm = viewModel()

        vm.repost("p1")
        serve(card("p1", reposts = 4))

        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOSTED)
        assertThat(vm.shown("p1").repostCount).isEqualTo(4)
        assertThat(vm.shown("p1").isReposted).isTrue()
    }

    @Test
    fun `a second gesture while the first is in flight sends nothing more`() = runTest {
        serve(card("p1", reposts = 3))
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = viewModel()

        vm.repost("p1")
        vm.repost("p1")

        coVerify(exactly = 1) { repository.repost(any(), any(), any(), any()) }
        assertThat(vm.shown("p1").repostCount).isEqualTo(4)
        answer.complete(NetworkResult.Success(card("new")))
    }

    @Test
    fun `a repost of a share bumps the card the reader touched, and sends its root`() = runTest {
        serve(card("p1", reposts = 0, repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "root9")))
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(card("new"))
        val vm = viewModel()

        vm.repost("p1")

        coVerify(exactly = 1) { repository.repost("root9", PostType.POST, null, false) }
        assertThat(vm.shown("p1").repostCount).isEqualTo(1)
    }

    @Test
    fun `a friend's repost in story announced live joins the tray, never the feed`() = runTest {
        serve(card("p1"))
        val vm = viewModel()

        reposted.emit(SocketPostRepostedData(originalPostId = "s1", repost = card("rs", type = "STORY")))
        reposted.emit(SocketPostRepostedData(originalPostId = "s2", repost = card("rt", type = "STATUS")))

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1")
        assertThat(vm.state.value.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `a friend's repost into the feed announced live still lands at its head`() = runTest {
        serve(card("p1"))
        val vm = viewModel()

        reposted.emit(SocketPostRepostedData(originalPostId = "p0", repost = card("rp", type = "POST")))

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("rp", "p1").inOrder()
    }

    @Test
    fun `the quote composer of the feed shows the quoted text the card serves (#16001)`() = runTest {
        serve(QuotePrism.post("p1"), QuotePrism.share("s1"))
        val vm = viewModel(QuotePrism.reader)

        vm.beginQuote("p1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
        vm.cancelQuote()
        vm.beginQuote("s1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
    }
}
