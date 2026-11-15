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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostHashtagRepository
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #12234 — dans les résultats d'un hashtag, « Repartager » republie et « Citer » ouvre le compositeur de citation,
 * comme dans le fil (iOS `HashtagResultsViewModel.toggleRepost`, #15934) : jamais un choix sans effet.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HashtagRepostTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val hashtags: PostHashtagRepository = mockk(relaxed = true)
    private val posts: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun post(id: String, type: String = "POST", reposts: Int = 2, repostOf: ApiRepostOf? = null) =
        ApiPost(id = id, type = type, content = "Post $id", repostCount = reposts, repostOf = repostOf, author = ApiAuthor(id = "a", displayName = "Ana"))

    private fun viewModel(vararg served: ApiPost, reader: MeeshyUser? = null): HashtagResultsViewModel {
        every { session.currentUser } returns MutableStateFlow(reader)
        every { hashtags.cachedFirstPage(any()) } returns null
        coEvery { hashtags.posts("paris", null, any()) } returns NetworkResult.Success(PostPage(served.toList(), null, false))
        return HashtagResultsViewModel(hashtags, posts, mockk(relaxed = true), session, MeeshyConfig(), SavedStateHandle(mapOf("tag" to "paris")), FakeProfileSocial().socket)
    }

    private fun HashtagResultsViewModel.card(id: String) = state.value.posts.single { it.id == id }

    @Test
    fun `Repartager republie au format de la carte et marque la carte au geste`() = runTest {
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { posts.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = viewModel(post("r1", type = "REEL"))

        vm.cards.repost("r1")

        assertThat(vm.card("r1").isReposted).isTrue()
        assertThat(vm.card("r1").repostCount).isEqualTo(3)
        coVerify(exactly = 1) { posts.repost("r1", PostType.REEL, null, false) }
        answer.complete(NetworkResult.Success(post("new")))
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOSTED)
    }

    @Test
    fun `un refus rend la marque et le compte et le dit`() = runTest {
        coEvery { posts.repost(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("x", httpStatus = 500))
        val vm = viewModel(post("p1"))

        vm.cards.repost("p1")

        assertThat(vm.card("p1").isReposted).isFalse()
        assertThat(vm.card("p1").repostCount).isEqualTo(2)
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOST_FAILED)
    }

    @Test
    fun `un second geste pendant l'envoi n'envoie rien de plus`() = runTest {
        val answer = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { posts.repost(any(), any(), any(), any()) } coAnswers { answer.await() }
        val vm = viewModel(post("p1"))

        vm.cards.repost("p1")
        vm.cards.repost("p1")

        coVerify(exactly = 1) { posts.repost(any(), any(), any(), any()) }
        answer.complete(NetworkResult.Success(post("new")))
    }

    @Test
    fun `Citer un repost ouvre le compositeur sur sa racine et publie vers elle avec le commentaire`() = runTest {
        coEvery { posts.repost(any(), any(), any(), any()) } returns NetworkResult.Success(post("new"))
        val share = post("p1", repostOf = ApiRepostOf(id = "root", content = "L'original", author = ApiAuthor(id = "c", username = "chloe")))
        val vm = viewModel(share)

        vm.cards.beginQuote("p1")
        assertThat(vm.state.value.quoteComposer?.sourceAuthorName).isEqualTo("chloe")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo("L'original")
        coVerify(exactly = 0) { posts.repost(any(), any(), any(), any()) }

        vm.cards.onQuoteTextChange("à lire")
        vm.cards.submitQuote()

        coVerify(exactly = 1) { posts.repost("root", PostType.POST, "à lire", true) }
        assertThat(vm.state.value.quoteComposer).isNull()
        assertThat(vm.card("p1").isReposted).isTrue()
    }

    @Test
    fun `fermer la citation n'envoie rien`() = runTest {
        val vm = viewModel(post("p1"))

        vm.cards.beginQuote("p1")
        vm.cards.cancelQuote()

        assertThat(vm.state.value.quoteComposer).isNull()
        coVerify(exactly = 0) { posts.repost(any(), any(), any(), any()) }
    }

    @Test
    fun `une issue dite est consommee`() = runTest {
        coEvery { posts.repost(any(), any(), any(), any()) } returns NetworkResult.Success(post("new"))
        val vm = viewModel(post("p1"))

        vm.cards.repost("p1")
        vm.cards.consumeNotice()

        assertThat(vm.state.value.notice).isNull()
    }

    @Test
    fun `Citer depuis un hashtag montre le texte que la carte sert (#16001)`() = runTest {
        val vm = viewModel(QuotePrism.post("p1"), QuotePrism.share("s1"), reader = QuotePrism.reader)

        vm.cards.beginQuote("p1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
        vm.cards.beginQuote("s1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
    }
}
