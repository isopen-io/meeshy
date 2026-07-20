package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
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
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailViewModelTest {

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
    private val commentAdded = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 64)
    private val commentDeleted = MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 64)
    private val config = MeeshyConfig()

    private fun post(
        id: String = "p1",
        content: String? = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
        commentCount: Int? = null,
    ) = ApiPost(
        id = id,
        content = content,
        translations = translations,
        originalLanguage = "fr",
        commentCount = commentCount,
    )

    private val bilingual = post(
        translations = mapOf(
            "en" to ApiPostTranslationEntry(text = "Hello"),
            "es" to ApiPostTranslationEntry(text = "Hola"),
        ),
    )

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun user(prefs: Prefs) = MeeshyUser(
        id = "me",
        username = "me",
        systemLanguage = prefs.systemLanguage,
        regionalLanguage = prefs.regionalLanguage,
        customDestinationLanguage = prefs.customDestinationLanguage,
    )

    private fun viewModel(
        postId: String? = "p1",
        currentUser: MeeshyUser? = null,
    ): PostDetailViewModel {
        every { session.currentUser } returns MutableStateFlow(currentUser)
        every { socialSocket.commentAdded } returns commentAdded
        every { socialSocket.commentDeleted } returns commentDeleted
        val handle = SavedStateHandle(if (postId == null) emptyMap() else mapOf("postId" to postId))
        return PostDetailViewModel(repository, session, socialSocket, config, handle)
    }

    @Test
    fun `loadInitial populates the post`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(content = "Hi"))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.id).isEqualTo("p1")
            assertThat(s.post?.content).isEqualTo("Hi")
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.notFound).isFalse()
            assertThat(s.errorMessage).isNull()
        }
    }

    @Test
    fun `loadInitial forwards the route postId to the repository`() = runTest {
        coEvery { repository.getPost("p42") } returns NetworkResult.Success(post(id = "p42"))

        viewModel(postId = "p42")

        coVerify(exactly = 1) { repository.getPost("p42") }
    }

    @Test
    fun `a blank postId never hits the network and marks not-found`() = runTest {
        val vm = viewModel(postId = null)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.notFound).isTrue()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.post).isNull()
        }
        coVerify(exactly = 0) { repository.getPost(any()) }
    }

    @Test
    fun `cold load shows a skeleton until the post arrives`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { gate.await() }

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            gate.complete(NetworkResult.Success(post()))
            val settled = awaitItem()
            assertThat(settled.showSkeleton).isFalse()
            assertThat(settled.post?.id).isEqualTo("p1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadInitial failure surfaces the error and hides the skeleton`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Failure(ApiError("boom"))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.post).isNull()
            assertThat(s.notFound).isFalse()
        }
    }

    @Test
    fun `loadInitial is guarded once the post has loaded`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post())

        val vm = viewModel()
        vm.loadInitial()

        coVerify(exactly = 1) { repository.getPost("p1") }
    }

    @Test
    fun `refresh re-fetches the post`() = runTest {
        coEvery { repository.getPost("p1") } returnsMany listOf(
            NetworkResult.Success(post(content = "old")),
            NetworkResult.Success(post(content = "new")),
        )

        val vm = viewModel()
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().post?.content).isEqualTo("new")
        }
        coVerify(exactly = 2) { repository.getPost("p1") }
    }

    @Test
    fun `refresh on a blank postId is inert`() = runTest {
        val vm = viewModel(postId = null)
        vm.refresh()

        coVerify(exactly = 0) { repository.getPost(any()) }
    }

    @Test
    fun `onFlagTap switches the displayed language to a translation`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)

        // System=en, regional=es → default resolution shows English; both are strip chips.
        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "es")))
        vm.onFlagTap("es")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.content).isEqualTo("Hola")
            assertThat(s.post?.languageStrip?.first { it.code == "es" }?.isActive).isTrue()
        }
    }

    @Test
    fun `onFlagTap on the already-active language reverts to the default resolution`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "es")))
        vm.onFlagTap("es")
        vm.onFlagTap("es")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.content).isEqualTo("Hello")
            assertThat(s.post?.languageStrip?.first { it.code == "en" }?.isActive).isTrue()
        }
    }

    @Test
    fun `onFlagTap before the post has loaded is inert`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { gate.await() }

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en")))
        vm.onFlagTap("es")

        vm.state.test {
            assertThat(awaitItem().post).isNull()
            gate.complete(NetworkResult.Success(bilingual))
            // The tap on the not-yet-loaded post left no override, so the default stands.
            assertThat(awaitItem().post?.content).isEqualTo("Hello")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `onFlagTap with a content-less language keeps the default resolution`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en")))
        vm.onFlagTap("de")

        vm.state.test {
            assertThat(awaitItem().post?.content).isEqualTo("Hello")
        }
    }

    @Test
    fun `a live comment-added on this post resyncs the badge to the authoritative count`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(commentCount = 3))

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.commentCount).isEqualTo(3)
            commentAdded.tryEmit(
                SocketCommentAddedData(postId = "p1", comment = ApiPostComment(id = "c1"), commentCount = 4),
            )
            assertThat(awaitItem().post?.commentCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live comment-deleted on this post resyncs the badge to the authoritative count`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(commentCount = 3))

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.commentCount).isEqualTo(3)
            commentDeleted.tryEmit(
                SocketCommentDeletedData(postId = "p1", commentId = "c1", commentCount = 2),
            )
            assertThat(awaitItem().post?.commentCount).isEqualTo(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live comment event for another post never touches this badge`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(commentCount = 3))

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.commentCount).isEqualTo(3)
            commentAdded.tryEmit(
                SocketCommentAddedData(postId = "other", comment = ApiPostComment(id = "x"), commentCount = 99),
            )
            commentDeleted.tryEmit(
                SocketCommentDeletedData(postId = "other", commentId = "x", commentCount = 0),
            )
            expectNoEvents()
        }
    }

    @Test
    fun `a blank route never subscribes to the comment room`() = runTest {
        val vm = viewModel(postId = null)

        vm.state.test {
            assertThat(awaitItem().notFound).isTrue()
            commentAdded.tryEmit(
                SocketCommentAddedData(postId = "", comment = ApiPostComment(id = "x"), commentCount = 5),
            )
            expectNoEvents()
        }
    }

    @Test
    fun `a negative authoritative count is clamped to zero`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(commentCount = 1))

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.commentCount).isEqualTo(1)
            commentDeleted.tryEmit(
                SocketCommentDeletedData(postId = "p1", commentId = "c1", commentCount = -4),
            )
            assertThat(awaitItem().post?.commentCount).isEqualTo(0)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a refresh replaces the live badge with the freshly fetched server truth`() = runTest {
        coEvery { repository.getPost("p1") } returnsMany listOf(
            NetworkResult.Success(post(commentCount = 3)),
            NetworkResult.Success(post(commentCount = 8)),
        )

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.commentCount).isEqualTo(3)
            // A live event moves the badge off the initial fetch value…
            commentAdded.tryEmit(
                SocketCommentAddedData(postId = "p1", comment = ApiPostComment(id = "c1"), commentCount = 4),
            )
            assertThat(awaitItem().post?.commentCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }

        // …then a manual refresh re-establishes the server-authoritative count, dropping the overlay.
        vm.refresh()
        assertThat(vm.state.value.post?.commentCount).isEqualTo(8)
    }
}
