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
import me.meeshy.sdk.model.MeeshyUser
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

    private fun post(id: String, liked: Boolean = false, likes: Int = 0) =
        ApiPost(id = id, content = "Post $id", isLikedByMe = liked, likeCount = likes)

    private fun page(vararg ids: String, cursor: String? = null, more: Boolean = false) =
        NetworkResult.Success(PostPage(ids.map { post(it) }, cursor, more))

    private fun viewModel(tag: String = "#Paris", cached: PostPage? = null): HashtagResultsViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { hashtags.cachedFirstPage(any()) } returns cached
        return HashtagResultsViewModel(hashtags, posts, session, MeeshyConfig(), SavedStateHandle(mapOf("tag" to tag)))
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

        vm.toggleLike("a")

        coVerify { posts.like("a") }
        assertThat(vm.state.value.posts.single().isLiked).isFalse()
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(0)
        assertThat(vm.state.value.errorMessage).isEqualTo("refus")
    }

    @Test
    fun `un coeur confirme reste pose`() = runTest {
        coEvery { hashtags.posts("paris", null, any()) } returns page("a")
        coEvery { posts.like("a") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        vm.toggleLike("a")

        assertThat(vm.state.value.posts.single().isLiked).isTrue()
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(1)
    }
}
