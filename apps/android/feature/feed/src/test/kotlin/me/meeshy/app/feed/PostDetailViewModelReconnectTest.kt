package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
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
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La room du post se rejoue a la reconnexion, le post se relit, et editions / traductions arrivent en direct. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailViewModelReconnectTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val reconnected = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    private val postUpdated = MutableSharedFlow<SocketPostUpdatedData>(extraBufferCapacity = 8)
    private val translationUpdated = MutableSharedFlow<SocketPostTranslationUpdatedData>(extraBufferCapacity = 8)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    private fun opened(postId: String = "p1", reader: MeeshyUser? = null): PostDetailViewModel {
        coEvery { repository.knownPost(any()) } returns null
        every { session.currentUser } returns MutableStateFlow(reader)
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        every { socialSocket.reconnected } returns reconnected
        every { socialSocket.postUpdated } returns postUpdated
        every { socialSocket.postTranslationUpdated } returns translationUpdated
        return PostDetailViewModel(
            repository, session, socialSocket, MeeshyConfig(), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()), mockk(relaxed = true),
            SavedStateHandle(mapOf("postId" to postId)),
        )
    }

    @Test
    fun `a reconnection joins the room again and reads the post again`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(ApiPost(id = "p1", content = "avant", commentCount = 1))
        val vm = opened()
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(ApiPost(id = "p1", content = "apres", commentCount = 5))

        reconnected.tryEmit(Unit)

        verify(exactly = 2) { socialSocket.joinPostRoom("p1") }
        assertThat(vm.state.value.post?.content).isEqualTo("apres")
        assertThat(vm.state.value.post?.commentCount).isEqualTo(5)
    }

    @Test
    fun `a failed resync keeps the post on screen and says nothing`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(ApiPost(id = "p1", content = "avant"))
        val vm = opened()
        coEvery { repository.getPost("p1") } throws java.io.IOException("offline")

        reconnected.tryEmit(Unit)

        assertThat(vm.state.value.post?.content).isEqualTo("avant")
        assertThat(vm.state.value.loadFailure).isNull()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a blank route never resyncs`() = runTest {
        opened(postId = "")

        reconnected.tryEmit(Unit)

        coVerify(exactly = 0) { repository.getPost(any()) }
        verify(exactly = 0) { socialSocket.joinPostRoom(any()) }
    }

    @Test
    fun `the author's live edit shows in place and keeps my own heart`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(ApiPost(id = "p1", content = "avant", isLikedByMe = true))
        val vm = opened()

        postUpdated.tryEmit(SocketPostUpdatedData(ApiPost(id = "p1", content = "corrige", isLikedByMe = false)))

        assertThat(vm.state.value.post?.content).isEqualTo("corrige")
        assertThat(vm.state.value.post?.isLiked).isTrue()
    }

    @Test
    fun `an edit of another post is ignored`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(ApiPost(id = "p1", content = "avant"))
        val vm = opened()

        postUpdated.tryEmit(SocketPostUpdatedData(ApiPost(id = "p2", content = "autre")))

        assertThat(vm.state.value.post?.content).isEqualTo("avant")
    }

    @Test
    fun `a live translation lands on the open post`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(
            ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"),
        )
        val vm = opened(reader = MeeshyUser(id = "me", username = "me", systemLanguage = "fr", regionalLanguage = "en"))

        translationUpdated.tryEmit(
            SocketPostTranslationUpdatedData("p1", "en", ApiPostTranslationEntry(text = "Hello")),
        )

        assertThat(vm.state.value.detailLanguageStrip.map { it.code }).contains("en")
    }
}
