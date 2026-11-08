package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * « Republier » depuis le détail d'un post (#14456), comme `PostDetailView.toggleDetailRepost` sur iOS : le format suit
 * le post ouvert, le compteur et la marque bougent au geste, un refus les rend et le dit dans la langue du lecteur.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailRepostTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk<PostRepository>(relaxed = true).also { coEvery { it.knownPost(any()) } returns null }
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    private fun opened(type: String = "POST", reposts: Int = 3, repostedByMe: Boolean? = null): PostDetailViewModel {
        val post = ApiPost(id = "p1", type = type, content = "Bonjour", repostCount = reposts, isRepostedByMe = repostedByMe)
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post)
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        return PostDetailViewModel(
            repository, session, socialSocket, MeeshyConfig(), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()), mockk(relaxed = true),
            SavedStateHandle(mapOf("postId" to "p1")),
        )
    }

    @Test
    fun `an opened reel reposts as a reel`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(ApiPost(id = "new"))
        val vm = opened(type = "REEL")

        vm.repost()

        coVerify(exactly = 1) { repository.repost("p1", PostType.REEL, null, false) }
    }

    @Test
    fun `the counter and the mark move at the gesture, before the server answers`() = runTest {
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = opened(reposts = 3)

        vm.repost()

        assertThat(vm.state.value.post?.repostCount).isEqualTo(4)
        assertThat(vm.state.value.isReposted).isTrue()
        answer.complete(NetworkResult.Success(ApiPost(id = "new")))
    }

    @Test
    fun `a confirmed repost keeps the count and says so`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(ApiPost(id = "new"))
        val vm = opened(reposts = 3)

        vm.repost()

        assertThat(vm.state.value.post?.repostCount).isEqualTo(4)
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOSTED)
    }

    @Test
    fun `a refusal gives the counter and the mark back and says so in the reader's language`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("HTTP 500"))
        val vm = opened(reposts = 3)

        vm.repost()

        assertThat(vm.state.value.post?.repostCount).isEqualTo(3)
        assertThat(vm.state.value.isReposted).isFalse()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOST_FAILED)
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a post the reader already reposted opens marked`() = runTest {
        assertThat(opened(repostedByMe = true).state.value.isReposted).isTrue()
    }

    @Test
    fun `a shown notice is consumed`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(ApiPost(id = "new"))
        val vm = opened()
        vm.repost()

        vm.consumeNotice()

        assertThat(vm.state.value.notice).isNull()
    }
}
