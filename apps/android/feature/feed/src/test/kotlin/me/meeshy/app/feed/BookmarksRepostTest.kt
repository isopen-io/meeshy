package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
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
import me.meeshy.sdk.post.BookmarkPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #12234 — dans les favoris, « Repartager » republie et « Citer » ouvre le compositeur de citation sur la racine
 * (iOS `BookmarksViewModel.toggleRepost`, #15934) : jamais un choix sans effet.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BookmarksRepostTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun post(id: String, type: String = "REEL", repostOf: ApiRepostOf? = null) =
        ApiPost(id = id, type = type, content = "Post $id", repostCount = 1, repostOf = repostOf, isBookmarkedByMe = true)

    private fun viewModel(vararg served: ApiPost, reader: MeeshyUser? = null): BookmarksViewModel {
        every { session.currentUser } returns MutableStateFlow(reader)
        coEvery { repository.getBookmarksPage(null, any()) } returns NetworkResult.Success(BookmarkPage(served.toList(), null, false))
        return BookmarksViewModel(repository, mockk(relaxed = true), session, MeeshyConfig())
    }

    private fun BookmarksViewModel.card(id: String) = state.value.posts.single { it.id == id }

    @Test
    fun `Repartager republie le reel enregistre et le marque`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(post("new"))
        val vm = viewModel(post("r1"))

        vm.cards.repost("r1")

        coVerify(exactly = 1) { repository.repost("r1", PostType.REEL, null, false) }
        assertThat(vm.card("r1").isReposted).isTrue()
        assertThat(vm.card("r1").repostCount).isEqualTo(2)
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOSTED)
    }

    @Test
    fun `un refus rend la carte et le dit`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("x", httpStatus = 500))
        val vm = viewModel(post("r1"))

        vm.cards.repost("r1")

        assertThat(vm.card("r1").isReposted).isFalse()
        assertThat(vm.card("r1").repostCount).isEqualTo(1)
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPOST_FAILED)
    }

    @Test
    fun `Citer ouvre le compositeur sur la racine et publie vers elle`() = runTest {
        coEvery { repository.repost(any(), any(), any(), any()) } returns NetworkResult.Success(post("new"))
        val share = post("r1", repostOf = ApiRepostOf(id = "root", content = "L'original", author = ApiAuthor(id = "c", displayName = "Chloé")))
        val vm = viewModel(share)

        vm.cards.beginQuote("r1")
        assertThat(vm.state.value.quoteComposer?.sourceAuthorName).isEqualTo("Chloé")
        vm.cards.onQuoteTextChange("à revoir")
        vm.cards.submitQuote()

        coVerify(exactly = 1) { repository.repost("root", PostType.REEL, "à revoir", true) }
        assertThat(vm.state.value.quoteComposer).isNull()
    }

    @Test
    fun `Citer depuis les favoris montre le texte que la carte sert (#16001)`() = runTest {
        val vm = viewModel(QuotePrism.post("p1"), QuotePrism.share("s1"), reader = QuotePrism.reader)

        vm.cards.beginQuote("p1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
        vm.cards.beginQuote("s1")
        assertThat(vm.state.value.quoteComposer?.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
    }
}
