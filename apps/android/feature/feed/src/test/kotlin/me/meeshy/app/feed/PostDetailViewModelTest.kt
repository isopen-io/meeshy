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
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
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
    private val postLiked = MutableSharedFlow<SocketPostLikedData>(extraBufferCapacity = 64)
    private val postUnliked = MutableSharedFlow<SocketPostUnlikedData>(extraBufferCapacity = 64)
    private val config = MeeshyConfig()

    private fun post(
        id: String = "p1",
        content: String? = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
        commentCount: Int? = null,
        likeCount: Int? = null,
        isLikedByMe: Boolean? = null,
    ) = ApiPost(
        id = id,
        content = content,
        translations = translations,
        originalLanguage = "fr",
        commentCount = commentCount,
        likeCount = likeCount,
        isLikedByMe = isLikedByMe,
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
        every { socialSocket.postLiked } returns postLiked
        every { socialSocket.postUnliked } returns postUnliked
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
        coEvery { repository.translatePost(any(), "de") } returns null

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en")))
        vm.onFlagTap("de")

        vm.state.test {
            assertThat(awaitItem().post?.content).isEqualTo("Hello")
        }
    }

    @Test
    fun `onFlagTap on a translatable language requests it and switches to the merged translation`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)
        val merged = post(
            content = "Bonjour",
            translations = mapOf(
                "en" to ApiPostTranslationEntry(text = "Hello"),
                "es" to ApiPostTranslationEntry(text = "Hola"),
                "de" to ApiPostTranslationEntry(text = "Hallo"),
            ),
        )
        coEvery { repository.translatePost(any(), "de") } returns merged

        // System=en, regional=de → German is a configured-but-absent (translatable) strip chip.
        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "de")))
        vm.onFlagTap("de")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.content).isEqualTo("Hallo")
            assertThat(s.post?.languageStrip?.first { it.code == "de" }?.isActive).isTrue()
            assertThat(s.translatingLanguages).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { repository.translatePost(any(), "de") }
    }

    @Test
    fun `onFlagTap on a translatable language that fails leaves the display unchanged`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)
        coEvery { repository.translatePost(any(), "de") } returns null

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "de")))
        vm.onFlagTap("de")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.content).isEqualTo("Hello")
            assertThat(s.translatingLanguages).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a second tap while a translation is in flight does not fire a duplicate request`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)
        val gate = CompletableDeferred<ApiPost?>()
        coEvery { repository.translatePost(any(), "de") } coAnswers { gate.await() }

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "de")))
        vm.onFlagTap("de")
        vm.onFlagTap("de")
        gate.complete(null)

        coVerify(exactly = 1) { repository.translatePost(any(), "de") }
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

    @Test
    fun `loading the post joins its realtime room`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post())

        viewModel()

        coVerify(exactly = 1) { socialSocket.joinPostRoom("p1") }
    }

    @Test
    fun `a blank route never joins a realtime room`() = runTest {
        viewModel(postId = null)

        coVerify(exactly = 0) { socialSocket.joinPostRoom(any()) }
    }

    @Test
    fun `a live post-liked from the viewer updates the count and marks isLiked`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(likeCount = 3, isLikedByMe = false))

        val vm = viewModel(currentUser = user(Prefs()))

        vm.state.test {
            val initial = awaitItem()
            assertThat(initial.post?.likeCount).isEqualTo(3)
            assertThat(initial.post?.isLiked).isFalse()
            postLiked.tryEmit(SocketPostLikedData(postId = "p1", userId = "me", likesCount = 4))
            val updated = awaitItem()
            assertThat(updated.post?.likeCount).isEqualTo(4)
            assertThat(updated.post?.isLiked).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live post-liked from someone else updates only the count`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(likeCount = 3, isLikedByMe = false))

        val vm = viewModel(currentUser = user(Prefs()))

        vm.state.test {
            assertThat(awaitItem().post?.likeCount).isEqualTo(3)
            postLiked.tryEmit(SocketPostLikedData(postId = "p1", userId = "someone-else", likesCount = 4))
            val updated = awaitItem()
            assertThat(updated.post?.likeCount).isEqualTo(4)
            assertThat(updated.post?.isLiked).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live post-unliked from the viewer updates the count and clears isLiked`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(likeCount = 4, isLikedByMe = true))

        val vm = viewModel(currentUser = user(Prefs()))

        vm.state.test {
            val initial = awaitItem()
            assertThat(initial.post?.likeCount).isEqualTo(4)
            assertThat(initial.post?.isLiked).isTrue()
            postUnliked.tryEmit(SocketPostUnlikedData(postId = "p1", userId = "me", likesCount = 3))
            val updated = awaitItem()
            assertThat(updated.post?.likeCount).isEqualTo(3)
            assertThat(updated.post?.isLiked).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live like event for another post never touches this post`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(likeCount = 3))

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.likeCount).isEqualTo(3)
            postLiked.tryEmit(SocketPostLikedData(postId = "other", userId = "x", likesCount = 99))
            postUnliked.tryEmit(SocketPostUnlikedData(postId = "other", userId = "x", likesCount = 0))
            expectNoEvents()
        }
    }

    @Test
    fun `a refresh replaces the live like overlay with the freshly fetched server truth`() = runTest {
        coEvery { repository.getPost("p1") } returnsMany listOf(
            NetworkResult.Success(post(likeCount = 3, isLikedByMe = false)),
            NetworkResult.Success(post(likeCount = 9, isLikedByMe = true)),
        )

        val vm = viewModel(currentUser = user(Prefs()))

        vm.state.test {
            assertThat(awaitItem().post?.likeCount).isEqualTo(3)
            postLiked.tryEmit(SocketPostLikedData(postId = "p1", userId = "me", likesCount = 4))
            assertThat(awaitItem().post?.likeCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }

        vm.refresh()
        assertThat(vm.state.value.post?.likeCount).isEqualTo(9)
        assertThat(vm.state.value.post?.isLiked).isTrue()
    }

    // --- Fire-and-forget view recording (mirror of iOS `.task { try? await viewPost(...) }`) ---

    @Test
    fun `opening the screen records a view exactly once`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post())
        coEvery { repository.viewPost("p1") } returns NetworkResult.Success(Unit)

        viewModel()

        coVerify(exactly = 1) { repository.viewPost("p1") }
    }

    @Test
    fun `a blank postId never records a view`() = runTest {
        viewModel(postId = null)

        coVerify(exactly = 0) { repository.viewPost(any()) }
    }

    @Test
    fun `a failed view record does not affect the loaded post`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(content = "Hi"))
        coEvery { repository.viewPost("p1") } returns NetworkResult.Failure(ApiError(message = "offline"))

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().post?.content).isEqualTo("Hi")
        }
    }

    // --- Author-only reach stats projection (isAuthor) ---

    @Test
    fun `the post author sees isAuthor true`() = runTest {
        coEvery { repository.getPost("p1") } returns
            NetworkResult.Success(post().copy(author = ApiAuthor(id = "me", username = "me")))

        val vm = viewModel(currentUser = user(Prefs()))

        vm.state.test {
            assertThat(awaitItem().post?.isAuthor).isTrue()
        }
    }

    @Test
    fun `a reader who is not the author sees isAuthor false`() = runTest {
        coEvery { repository.getPost("p1") } returns
            NetworkResult.Success(post().copy(author = ApiAuthor(id = "someone-else", username = "x")))

        val vm = viewModel(currentUser = user(Prefs()))

        vm.state.test {
            assertThat(awaitItem().post?.isAuthor).isFalse()
        }
    }

    // --- Repost / quote-repost (parity iOS `PostDetailView.toggleDetailRepost`, routed through
    //     the tested `RepostCommand` SSOT — which SURPASSES iOS by resolving the ROOT target and
    //     degrading a blank quote to a simple repost, neither of which iOS's post-detail does). ---

    private fun loadedVm(
        postId: String = "p1",
        loaded: ApiPost = post(),
        currentUser: MeeshyUser? = null,
    ): PostDetailViewModel {
        coEvery { repository.getPost(postId) } returns NetworkResult.Success(loaded)
        coEvery { repository.repost(any(), content = any(), isQuote = any()) } returns
            NetworkResult.Success(post(id = "repost-result"))
        return viewModel(postId = postId, currentUser = currentUser)
    }

    @Test
    fun `repost of an original post targets its own id with no content and flags it reposted`() = runTest {
        val vm = loadedVm(loaded = post(id = "p1", content = "Hello"))

        vm.repost()

        coVerify(exactly = 1) { repository.repost("p1", content = null, isQuote = false) }
        assertThat(vm.state.value.isReposted).isTrue()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `repost of a repost targets its recorded root, never the intermediate share`() = runTest {
        val share = post(id = "share1").copy(
            repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "root-post"),
        )
        val vm = loadedVm(loaded = share)

        vm.repost()

        coVerify(exactly = 1) { repository.repost("root-post", content = null, isQuote = false) }
    }

    @Test
    fun `repost of a repost with no recorded root falls back to the directly-reposted id`() = runTest {
        val share = post(id = "share1").copy(
            repostOf = ApiRepostOf(id = "direct-parent", originalRepostOfId = null),
        )
        val vm = loadedVm(loaded = share)

        vm.repost()

        coVerify(exactly = 1) { repository.repost("direct-parent", content = null, isQuote = false) }
    }

    @Test
    fun `a repost before the post has loaded is inert`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { gate.await() }

        val vm = viewModel()
        vm.repost()

        coVerify(exactly = 0) { repository.repost(any(), content = any(), isQuote = any()) }
        gate.complete(NetworkResult.Success(post()))
    }

    @Test
    fun `a repost failure reverts the reposted flag and surfaces the error`() = runTest {
        val vm = loadedVm()
        coEvery { repository.repost(any(), content = any(), isQuote = any()) } returns
            NetworkResult.Failure(ApiError("repost boom"))

        vm.repost()

        assertThat(vm.state.value.isReposted).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("repost boom")
    }

    @Test
    fun `a second repost while the first is in flight does not fire a duplicate`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post())
        coEvery { repository.repost(any(), content = any(), isQuote = any()) } coAnswers { gate.await() }
        val vm = viewModel()

        vm.repost()
        vm.repost()
        gate.complete(NetworkResult.Success(post()))

        coVerify(exactly = 1) { repository.repost(any(), content = any(), isQuote = any()) }
    }

    @Test
    fun `beginQuote opens the composer with the source author and a trimmed content preview`() = runTest {
        val vm = loadedVm(
            loaded = post(id = "p1", content = "  Bonjour le monde  ")
                .copy(author = ApiAuthor(id = "a1", displayName = "Alice")),
        )

        vm.beginQuote()

        val composer = vm.state.value.quoteComposer
        assertThat(composer).isNotNull()
        assertThat(composer?.postId).isEqualTo("p1")
        assertThat(composer?.sourceAuthorName).isEqualTo("Alice")
        assertThat(composer?.sourceContentPreview).isEqualTo("Bonjour le monde")
    }

    @Test
    fun `beginQuote before the post has loaded is inert`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { gate.await() }

        val vm = viewModel()
        vm.beginQuote()

        assertThat(vm.state.value.quoteComposer).isNull()
        gate.complete(NetworkResult.Success(post()))
    }

    @Test
    fun `onQuoteTextChange updates the open composer draft`() = runTest {
        val vm = loadedVm()
        vm.beginQuote()

        vm.onQuoteTextChange("my take")

        assertThat(vm.state.value.quoteComposer?.text).isEqualTo("my take")
    }

    @Test
    fun `cancelQuote closes the composer without reposting`() = runTest {
        val vm = loadedVm()
        vm.beginQuote()

        vm.cancelQuote()

        assertThat(vm.state.value.quoteComposer).isNull()
        coVerify(exactly = 0) { repository.repost(any(), content = any(), isQuote = any()) }
    }

    @Test
    fun `submitQuote reposts with the trimmed commentary, flags it a quote, and closes the composer`() = runTest {
        val vm = loadedVm(loaded = post(id = "p1"))
        vm.beginQuote()
        vm.onQuoteTextChange("  great post  ")

        vm.submitQuote()

        coVerify(exactly = 1) { repository.repost("p1", content = "great post", isQuote = true) }
        assertThat(vm.state.value.quoteComposer).isNull()
        assertThat(vm.state.value.isReposted).isTrue()
    }

    @Test
    fun `submitQuote of a repost targets the root, carrying the commentary`() = runTest {
        val share = post(id = "share1").copy(
            repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "root-post"),
        )
        val vm = loadedVm(loaded = share)
        vm.beginQuote()
        vm.onQuoteTextChange("nested quote")

        vm.submitQuote()

        coVerify(exactly = 1) { repository.repost("root-post", content = "nested quote", isQuote = true) }
    }

    @Test
    fun `submitQuote with blank commentary degrades to a simple repost`() = runTest {
        val vm = loadedVm(loaded = post(id = "p1"))
        vm.beginQuote()
        vm.onQuoteTextChange("   ")

        vm.submitQuote()

        coVerify(exactly = 1) { repository.repost("p1", content = null, isQuote = false) }
    }

    @Test
    fun `submitQuote with no composer open is inert`() = runTest {
        val vm = loadedVm()

        vm.submitQuote()

        coVerify(exactly = 0) { repository.repost(any(), content = any(), isQuote = any()) }
    }

    @Test
    fun `a submitQuote failure reverts the reposted flag and surfaces the error`() = runTest {
        val vm = loadedVm(loaded = post(id = "p1"))
        coEvery { repository.repost(any(), content = any(), isQuote = any()) } returns
            NetworkResult.Failure(ApiError("quote boom"))
        vm.beginQuote()
        vm.onQuoteTextChange("x")

        vm.submitQuote()

        assertThat(vm.state.value.isReposted).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("quote boom")
        assertThat(vm.state.value.quoteComposer).isNull()
    }
}
