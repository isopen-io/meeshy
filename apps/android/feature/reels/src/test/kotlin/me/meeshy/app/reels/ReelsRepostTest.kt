package me.meeshy.app.reels

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
import me.meeshy.app.feed.QuoteComposerState
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * « Republier » depuis le lecteur de réels (#14456), comme `ReelsViewModel.repost` sur iOS : un réel repart EN RÉEL et
 * vise l'original quand il en republie un autre ; le compteur et la marque bougent au geste et un refus les rend.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReelsRepostTest {

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

    private fun reel(id: String, reposts: Int = 2, repostOf: ApiRepostOf? = null, repostedByMe: Boolean? = null) = ApiPost(
        id = id,
        type = "REEL",
        repostCount = reposts,
        repostOf = repostOf,
        isRepostedByMe = repostedByMe,
        media = listOf(ApiPostMedia(id = "m-$id", mimeType = "video/mp4", fileUrl = "https://cdn.test/$id.mp4")),
    )

    private fun loaded(vararg reels: ApiPost, reader: MeeshyUser? = null): ReelsViewModel {
        every { session.currentUserId } returns "me"
        every { session.currentUser } returns MutableStateFlow(reader)
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        every { socialSocket.postBookmarked } returns MutableSharedFlow()
        every { socialSocket.postDeleted } returns MutableSharedFlow()
        every { repository.feedCacheSnapshot } returns null
        coEvery { repository.getReelsPage(any(), any(), any()) } returns
            NetworkResult.Success(PostPage(posts = reels.toList(), nextCursor = null, hasMore = false))
        return ReelsViewModel(
            repository, session, socialSocket, MeeshyConfig(), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()), mockk(relaxed = true),
        ).also { it.load() }
    }

    private fun ReelsViewModel.shown(id: String) = state.value.reels.single { it.id == id }

    @Test
    fun `a reel reposts as a reel`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(ApiPost(id = "new"))
        val vm = loaded(reel("r1"))

        vm.repost("r1")

        coVerify(exactly = 1) { repository.repost("r1", PostType.REEL, null, false) }
    }

    @Test
    fun `a reel that republishes another reposts the original`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(ApiPost(id = "new"))
        val share = reel("r1", repostOf = ApiRepostOf(id = "share0", type = "REEL", originalRepostOfId = "orig"))
        val vm = loaded(share)

        vm.repost("r1")

        coVerify(exactly = 1) { repository.repost("orig", PostType.REEL, null, false) }
    }

    @Test
    fun `the counter and the mark move at the gesture, before the server answers`() = runTest {
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = loaded(reel("r1", reposts = 2))

        vm.repost("r1")

        assertThat(vm.shown("r1").repostCount).isEqualTo(3)
        assertThat(vm.shown("r1").isReposted).isTrue()
        answer.complete(NetworkResult.Success(ApiPost(id = "new")))
    }

    @Test
    fun `a refusal gives the counter and the mark back`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("x", httpStatus = 500))
        val vm = loaded(reel("r1", reposts = 2))

        vm.repost("r1")

        assertThat(vm.shown("r1").repostCount).isEqualTo(2)
        assertThat(vm.shown("r1").isReposted).isFalse()
    }

    @Test
    fun `a second gesture while the first is in flight sends nothing more`() = runTest {
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = loaded(reel("r1", reposts = 2))

        vm.repost("r1")
        vm.repost("r1")

        coVerify(exactly = 1) { repository.repost(any(), any(), any(), any()) }
        assertThat(vm.shown("r1").repostCount).isEqualTo(3)
        answer.complete(NetworkResult.Success(ApiPost(id = "new")))
    }

    @Test
    fun `a reel the reader already reposted shows marked`() = runTest {
        assertThat(loaded(reel("r1", repostedByMe = true)).shown("r1").isReposted).isTrue()
    }

    @Test
    fun `quoting a reel opens the quote composer on that reel, nothing sent yet`() = runTest {
        val vm = loaded(reel("r1").copy(content = "Ma légende", author = ApiAuthor(id = "a", displayName = "Ana")))

        vm.beginQuote("r1")

        assertThat(vm.state.value.quoteComposer).isEqualTo(
            QuoteComposerState(postId = "r1", sourceAuthorName = "Ana", sourceContentPreview = "Ma légende"),
        )
        coVerify(exactly = 0) { repository.repost(any(), any(), any(), any()) }
    }

    @Test
    fun `quoting a reel that republishes another shows the root`() = runTest {
        val share = reel(
            "r1",
            repostOf = ApiRepostOf(id = "orig", type = "REEL", content = "L'original", author = ApiAuthor(id = "c", username = "chloe")),
        )
        val vm = loaded(share)

        vm.beginQuote("r1")

        assertThat(vm.state.value.quoteComposer?.sourceAuthorName).isEqualTo("chloe")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo("L'original")
    }

    @Test
    fun `a quote from the reels player reposts the root as a reel with its commentary`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(ApiPost(id = "new"))
        val vm = loaded(reel("r1", reposts = 2, repostOf = ApiRepostOf(id = "share0", type = "REEL", originalRepostOfId = "orig")))

        vm.beginQuote("r1")
        vm.onQuoteTextChange("à voir")
        vm.submitQuote()

        coVerify(exactly = 1) { repository.repost("orig", PostType.REEL, "à voir", true) }
        assertThat(vm.state.value.quoteComposer).isNull()
        assertThat(vm.shown("r1").repostCount).isEqualTo(3)
        assertThat(vm.shown("r1").isReposted).isTrue()
    }

    @Test
    fun `cancelling the quote sends nothing`() = runTest {
        val vm = loaded(reel("r1"))

        vm.beginQuote("r1")
        vm.cancelQuote()

        assertThat(vm.state.value.quoteComposer).isNull()
        coVerify(exactly = 0) { repository.repost(any(), any(), any(), any()) }
    }

    /**
     * #16001 — prisme `['fr', 'en']`, source anglaise traduite en français (langue d'origine au rang 2, leçon 261) : la carte
     * du réel cité sert le français, le compositeur aussi — y compris quand le réel en republie un autre.
     */
    @Test
    fun `quoting from the reels player shows the quoted text in the reader's language`() = runTest {
        val reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr", regionalLanguage = "en")
        val french = mapOf("fr" to ApiPostTranslationEntry(text = "Ma légende"))
        val original = reel("r1").copy(content = "My caption", originalLanguage = "en", translations = french)
        val share = reel(
            "r2",
            repostOf = ApiRepostOf(id = "orig", type = "REEL", content = "My caption", originalLanguage = "en", translations = french),
        )
        val vm = loaded(original, share, reader = reader)

        vm.beginQuote("r1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo("Ma légende")
        vm.cancelQuote()
        vm.beginQuote("r2")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo("Ma légende")
    }
}
