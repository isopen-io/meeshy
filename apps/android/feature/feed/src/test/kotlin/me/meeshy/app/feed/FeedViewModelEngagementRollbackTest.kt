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
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.GestureRefusal
import me.meeshy.sdk.post.PostGesture
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.publication.PublicationNotice
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #14749 — la file d'envoi a perdu un j'aime ou un favori pour de bon : le retour arrière est fait par le dépôt, le fil
 * DIT l'échec (iOS `feed.like.error` / `feed.bookmark.error`) ou la limite du jour, et confirme un favori ajouté.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelEngagementRollbackTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val refusals = MutableSharedFlow<GestureRefusal>(extraBufferCapacity = 8)
    private val repository: PostRepository = mockk(relaxed = true)

    private fun viewModel(feed: List<ApiPost> = emptyList()): FeedViewModel {
        val socialSocket: SocialSocketManager = mockk(relaxed = true)
        every { repository.gestureRefusals } returns refusals
        every { repository.feedHasMore } returns MutableStateFlow(true)
        every { repository.feedStream(any(), any()) } returns
            if (feed.isEmpty()) flowOf(CacheResult.Empty) else flowOf(CacheResult.Fresh(feed, 1000L))
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
        every { socialSocket.reconnected } returns emptyFlow()
        every { socialSocket.postUpdated } returns MutableSharedFlow()
        every { socialSocket.postReposted } returns MutableSharedFlow()
        val session: SessionRepository = mockk(relaxed = true) { every { currentUser } returns MutableStateFlow<MeeshyUser?>(null) }
        val publications: PublicationOutbox = mockk(relaxed = true) {
            every { notices } returns MutableSharedFlow<PublicationNotice>()
        }
        return FeedViewModel(repository, session, socialSocket, MeeshyConfig(), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), publications)
    }

    @Test
    fun `a like the queue gave up on tells the reader it could not be liked`() = runTest {
        val vm = viewModel()

        refusals.emit(GestureRefusal("p1", PostGesture.LIKE, "Refused: HTTP 404 POST_NOT_FOUND"))

        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.LIKE_FAILED)
    }

    @Test
    fun `a bookmark the queue gave up on tells the reader it could not be saved`() = runTest {
        val vm = viewModel()

        refusals.emit(GestureRefusal("p1", PostGesture.BOOKMARK, null))

        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.BOOKMARK_FAILED)
    }

    @Test
    fun `a like refused for the daily limit says the limit instead of a plain failure`() = runTest {
        val vm = viewModel()

        refusals.emit(GestureRefusal("p1", PostGesture.LIKE, "Refused: HTTP 429 DAILY_REACTION_LIMIT"))

        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.DAILY_REACTION_LIMIT)
    }

    @Test
    fun `saving a post that was not saved confirms it was added to bookmarks`() = runTest {
        coEvery { repository.toggleBookmark("p1") } returns true
        val vm = viewModel(listOf(ApiPost(id = "p1", content = "a", isBookmarkedByMe = false)))

        vm.toggleBookmark("p1")

        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.BOOKMARKED)
    }

    @Test
    fun `removing a saved post confirms nothing`() = runTest {
        coEvery { repository.toggleBookmark("p1") } returns true
        val vm = viewModel(listOf(ApiPost(id = "p1", content = "a", isBookmarkedByMe = true)))

        vm.toggleBookmark("p1")

        assertThat(vm.state.value.notice).isNull()
    }

    @Test
    fun `a notice maps to a message the reader can read`() {
        assertThat(FeedNotice.BOOKMARKED.messageRes()).isNotEqualTo(0)
        assertThat(FeedNotice.DAILY_REACTION_LIMIT.messageRes()).isNotEqualTo(0)
        assertThat(FeedNotice.DAILY_REACTION_LIMIT.isError).isTrue()
        assertThat(FeedNotice.BOOKMARKED.isError).isFalse()
    }
}
