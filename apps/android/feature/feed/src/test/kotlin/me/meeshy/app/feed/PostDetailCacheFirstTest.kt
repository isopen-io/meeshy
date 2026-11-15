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
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.MeeshyUser
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
 * #14467 — hors ligne, le fil montre la carte depuis son cache ; le détail qu'on en ouvre doit la montrer aussi, tout de
 * suite, puis se revalider en silence. L'écran d'absence ne paraît que sur un cache vide.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailCacheFirstTest {

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
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    private val offline = NetworkResult.Failure(ApiError("Unable to resolve host", "NETWORK"))

    private fun opened(known: ApiPost?): PostDetailViewModel {
        coEvery { repository.knownPost("p1") } returns known
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
    fun `offline, the detail shows the card the device knows, with no skeleton and no error`() = runTest {
        coEvery { repository.getPost("p1") } returns offline

        val state = opened(known = ApiPost(id = "p1", content = "Recette 13921 disposition")).state.value

        assertThat(state.post?.content).isEqualTo("Recette 13921 disposition")
        assertThat(state.showSkeleton).isFalse()
        assertThat(state.errorMessage).isNull()
        assertThat(state.loadFailure).isNull()
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun `the known card is on screen before the network answers`() = runTest {
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { answer.await() }

        val vm = opened(known = ApiPost(id = "p1", content = "Connu"))

        assertThat(vm.state.value.post?.content).isEqualTo("Connu")
        assertThat(vm.state.value.showSkeleton).isFalse()
        answer.complete(NetworkResult.Success(ApiPost(id = "p1", content = "Frais")))
        assertThat(vm.state.value.post?.content).isEqualTo("Frais")
    }

    @Test
    fun `the known card is revalidated in silence`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(ApiPost(id = "p1", content = "Frais", likeCount = 4))

        val state = opened(known = ApiPost(id = "p1", content = "Connu", likeCount = 1)).state.value

        coVerify(exactly = 1) { repository.getPost("p1") }
        assertThat(state.post?.content).isEqualTo("Frais")
        assertThat(state.post?.likeCount).isEqualTo(4)
    }

    @Test
    fun `an empty cache offline still says the connection is the cause`() = runTest {
        coEvery { repository.getPost("p1") } returns offline

        val state = opened(known = null).state.value

        assertThat(state.post).isNull()
        assertThat(state.loadFailure).isEqualTo(ContentFetchFailure.NETWORK)
    }

    @Test
    fun `a pull to refresh that fails over a known card still tells the reader`() = runTest {
        coEvery { repository.getPost("p1") } returns offline
        val vm = opened(known = ApiPost(id = "p1", content = "Connu"))

        vm.refresh()

        assertThat(vm.state.value.post?.content).isEqualTo("Connu")
        assertThat(vm.state.value.errorMessage).isNotNull()
    }
}
