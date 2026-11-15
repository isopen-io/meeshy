package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
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

@OptIn(ExperimentalCoroutinesApi::class)
class HashtagResultsViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val hashtags: PostHashtagRepository = mockk(relaxed = true)
    private val posts: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val social = FakeProfileSocial()

    private fun post(id: String, liked: Boolean = false, likes: Int = 0) =
        ApiPost(id = id, content = "Post $id", isLikedByMe = liked, likeCount = likes)

    private fun page(vararg ids: String, cursor: String? = null, more: Boolean = false) =
        NetworkResult.Success(PostPage(ids.map { post(it) }, cursor, more))

    private fun viewModel(tag: String = "#Paris", cached: PostPage? = null, reader: MeeshyUser? = null): HashtagResultsViewModel {
        every { session.currentUser } returns MutableStateFlow(reader)
        every { hashtags.cachedFirstPage(any()) } returns cached
        return HashtagResultsViewModel(hashtags, posts, mockk(relaxed = true), session, MeeshyConfig(), SavedStateHandle(mapOf("tag" to tag)), social.socket)
    }

    @Test
    fun `la premiere page remplit la liste du tag normalise`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns page("a", "b")

        val s = viewModel().state.value

        assertThat(s.tag).isEqualTo("paris")
        assertThat(s.posts.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(s.showSkeleton).isFalse()
        assertThat(s.loadFailed).isFalse()
    }

    @Test
    fun `le cache sert la liste tout de suite sans squelette meme si le reseau echoue`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns NetworkResult.Failure(ApiError("hors ligne"))
        val s = viewModel(cached = PostPage(listOf(post("c")), null, false)).state.value

        assertThat(s.posts.map { it.id }).containsExactly("c")
        assertThat(s.showSkeleton).isFalse()
        assertThat(s.loadFailed).isFalse()
    }

    @Test
    fun `un echec a froid sans cache propose de reessayer`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns NetworkResult.Failure(ApiError("boom"))

        val s = viewModel().state.value

        assertThat(s.loadFailed).isTrue()
        assertThat(s.posts).isEmpty()
    }

    @Test
    fun `la page suivante s ajoute sans doublon`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns page("a", "b", cursor = "c2", more = true)
        coEvery { hashtags.posts("paris", "c2", any()) } returns page("b", "c")
        val vm = viewModel()

        vm.loadMoreIfNeeded("b")

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `le coeur est optimiste puis revient en arriere si le serveur refuse`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns page("a")
        coEvery { posts.like("a") } returns NetworkResult.Failure(ApiError("refus"))
        val vm = viewModel()

        vm.cards.toggleLike("a")

        coVerify { posts.like("a") }
        assertThat(vm.state.value.posts.single().isLiked).isFalse()
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(0)
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.LIKE_FAILED)
    }

    @Test
    fun `un coeur confirme reste pose`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns page("a")
        coEvery { posts.like("a") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        vm.cards.toggleLike("a")

        assertThat(vm.state.value.posts.single().isLiked).isTrue()
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(1)
    }

    @Test
    fun `une traduction demandee d un drapeau arrive dans SA carte et seulement elle (#16004)`() = runTest {
        val english = ApiPost(id = "a", content = "Hello", originalLanguage = "en")
        coEvery { hashtags.posts("paris", null, any()) } returns NetworkResult.Success(PostPage(listOf(english, post("b")), null, false))
        coEvery { posts.requestTranslation("a", "de") } returns NetworkResult.Success(Unit)
        val vm = viewModel(reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr"))
        val untouched = vm.state.value.posts.single { it.id == "b" }

        vm.cards.onFlagTap("a", "de")
        social.translatedFlow.tryEmit(SocketPostTranslationUpdatedData("a", "de", ApiPostTranslationEntry(text = "Hallo")))

        assertThat(vm.state.value.posts.single { it.id == "a" }.content).isEqualTo("Hallo")
        assertThat(vm.state.value.posts.single { it.id == "b" }).isEqualTo(untouched)
    }
}
