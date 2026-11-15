package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostCommentSettingsRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** #16541 — « Désactiver / Réactiver les commentaires » depuis le détail : optimiste, confirmé, ou remis sur un refus. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailCommentSettingsTest {

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

    private fun opened(post: ApiPost, reader: MeeshyUser = MeeshyUser(id = "me", username = "me")): PostDetailViewModel {
        coEvery { repository.knownPost(any()) } returns null
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post)
        every { session.currentUser } returns MutableStateFlow(reader)
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        every { socialSocket.reconnected } returns MutableSharedFlow()
        every { socialSocket.postUpdated } returns postUpdated
        every { socialSocket.postTranslationUpdated } returns MutableSharedFlow<SocketPostTranslationUpdatedData>()
        return PostDetailViewModel(
            repository, session, socialSocket, MeeshyConfig(), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()), mockk(relaxed = true),
            SavedStateHandle(mapOf("postId" to "p1")),
            commentSettings = settings,
        )
    }

    private val mine = ApiPost(id = "p1", content = "x", author = ApiAuthor(id = "me", username = "me"))

    @Test
    fun `closing flips the post before the gateway answers, then keeps the applied state`() = runTest {
        val answer = CompletableDeferred<NetworkResult<Boolean>>()
        coEvery { settings.setCommentsDisabled("p1", true) } coAnswers { answer.await() }
        val vm = opened(mine)

        vm.toggleComments()
        assertThat(vm.state.value.post?.commentsDisabled).isTrue()
        assertThat(vm.state.value.post?.commentsClosed).isTrue()

        answer.complete(NetworkResult.Success(true))
        assertThat(vm.state.value.post?.commentsDisabled).isTrue()
        assertThat(vm.state.value.notice).isNull()
    }

    @Test
    fun `a refusal puts the comments back open and says so`() = runTest {
        coEvery { settings.setCommentsDisabled("p1", true) } returns
            NetworkResult.Failure(ApiError(message = "Forbidden", code = "FORBIDDEN", httpStatus = 403))
        val vm = opened(mine)

        vm.toggleComments()

        assertThat(vm.state.value.post?.commentsDisabled).isFalse()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.COMMENT_SETTINGS_FAILED)
    }

    @Test
    fun `reopening a closed post sends false`() = runTest {
        coEvery { settings.setCommentsDisabled("p1", false) } returns NetworkResult.Success(false)
        val vm = opened(mine.copy(commentsDisabled = true))

        vm.toggleComments()

        assertThat(vm.state.value.post?.commentsDisabled).isFalse()
    }

    @Test
    fun `a broadcast that lands during the flight wins over the rollback`() = runTest {
        val answer = CompletableDeferred<NetworkResult<Boolean>>()
        coEvery { settings.setCommentsDisabled("p1", true) } coAnswers { answer.await() }
        val vm = opened(mine)

        vm.toggleComments()
        postUpdated.tryEmit(SocketPostUpdatedData(mine.copy(commentsDisabled = false, content = "edited")))
        answer.complete(NetworkResult.Failure(ApiError(message = "boom")))

        assertThat(vm.state.value.post?.commentsDisabled).isFalse()
        assertThat(vm.state.value.post?.content).isEqualTo("edited")
    }

    @Test
    fun `a moderator sees the toggle on someone else's post, an ordinary reader does not`() = runTest {
        coEvery { settings.setCommentsDisabled(any(), any()) } returns NetworkResult.Success(true)
        val theirs = ApiPost(id = "p1", content = "x", author = ApiAuthor(id = "other", username = "o"))
        val moderated = opened(theirs, reader = MeeshyUser(id = "me", username = "me", role = "MODERATOR")).state.value.post!!
        val ordinary = opened(theirs, reader = MeeshyUser(id = "me", username = "me", role = "USER")).state.value.post!!

        fun offered(post: FeedPostPresentation) = PostActionMenu.actions(
            PostActionContext(isOwn = post.isAuthor, isBookmarked = false, viewerRole = post.viewerRole, commentsDisabled = post.commentsDisabled, canToggleComments = true),
        )
        assertThat(offered(moderated)).contains(PostAction.DisableComments)
        assertThat(offered(ordinary)).doesNotContain(PostAction.DisableComments)
    }
}
