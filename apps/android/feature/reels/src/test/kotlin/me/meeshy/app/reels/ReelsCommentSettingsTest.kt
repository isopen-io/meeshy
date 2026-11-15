package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostCommentSettingsRepository
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** #16541 — fermer ou rouvrir les commentaires d'un réel depuis son menu « … » : optimiste, puis confirmé ou remis. */
@OptIn(ExperimentalCoroutinesApi::class)
class ReelsCommentSettingsTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val settings: PostCommentSettingsRepository = mockk()
    private val postUpdated = MutableSharedFlow<SocketPostUpdatedData>(extraBufferCapacity = 8)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    private fun reel(commentsDisabled: Boolean = false, sourceClosed: Boolean = false) = ApiPost(
        id = "r1",
        type = "REEL",
        author = ApiAuthor(id = "me", username = "me"),
        commentsDisabled = commentsDisabled,
        repostOf = if (sourceClosed) ApiRepostOf(id = "src", commentsDisabled = true) else null,
        media = listOf(ApiPostMedia(id = "m1", mimeType = "video/mp4", fileUrl = "https://cdn.test/r1.mp4")),
    )

    private fun viewModel(post: ApiPost): ReelsViewModel {
        every { session.currentUserId } returns "me"
        every { session.currentUser } returns MutableStateFlow(null)
        every { socialSocket.postLiked } returns MutableSharedFlow<SocketPostLikedData>()
        every { socialSocket.postUnliked } returns MutableSharedFlow<SocketPostUnlikedData>()
        every { socialSocket.postBookmarked } returns MutableSharedFlow<SocketPostBookmarkedData>()
        every { socialSocket.postDeleted } returns MutableSharedFlow<SocketPostDeletedData>()
        every { socialSocket.postUpdated } returns postUpdated
        every { repository.feedCacheSnapshot } returns null
        coEvery { repository.getReelsPage(any(), any(), any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(post), nextCursor = null, hasMore = false))
        val reportRepository: ReportRepository = mockk(relaxed = true)
        return ReelsViewModel(
            repository, session, socialSocket, MeeshyConfig(), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()), reportRepository,
            commentSettings = settings,
        ).also { it.load() }
    }

    @Test
    fun `a reel served closed, or reposting a closed one, reads as closed`() = runTest {
        assertThat(viewModel(reel(commentsDisabled = true)).state.value.reels.single().commentsClosed).isTrue()
        val inherited = viewModel(reel(sourceClosed = true)).state.value.reels.single()
        assertThat(inherited.commentsDisabled).isFalse()
        assertThat(inherited.commentsClosed).isTrue()
    }

    @Test
    fun `closing flips the reel at once and keeps what the gateway applied`() = runTest {
        val answer = CompletableDeferred<NetworkResult<Boolean>>()
        coEvery { settings.setCommentsDisabled("r1", true) } coAnswers { answer.await() }
        val vm = viewModel(reel())

        vm.toggleComments("r1")
        assertThat(vm.state.value.reels.single().commentsClosed).isTrue()

        answer.complete(NetworkResult.Success(true))
        assertThat(vm.state.value.reels.single().commentsDisabled).isTrue()
    }

    @Test
    fun `a refusal reopens the reel`() = runTest {
        coEvery { settings.setCommentsDisabled("r1", true) } returns NetworkResult.Failure(ApiError(message = "no", code = "FORBIDDEN"))
        val vm = viewModel(reel())

        vm.toggleComments("r1")

        assertThat(vm.state.value.reels.single().commentsDisabled).isFalse()
        assertThat(vm.state.value.reels.single().commentsClosed).isFalse()
    }

    @Test
    fun `a live post update closes the reel's comments`() = runTest {
        val vm = viewModel(reel())

        postUpdated.tryEmit(SocketPostUpdatedData(reel(commentsDisabled = true)))

        assertThat(vm.state.value.reels.single().commentsClosed).isTrue()
    }
}
