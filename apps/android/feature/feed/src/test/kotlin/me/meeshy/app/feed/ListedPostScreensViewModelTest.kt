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
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.BookmarkPage
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #13244 — les favoris, « À proximité » et les publications d'un auteur exposent les gestes du fil par `cards`, comme
 * `FeedViewModel` : le cœur, l'enregistrement, la suppression et le signalement atteignent le serveur et bougent la carte.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ListedPostScreensViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val posts: PostRepository = mockk(relaxed = true)
    private val reports: ReportRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val me = MeeshyUser(id = "me", username = "moi")

    private fun post(id: String, author: String = "ana") =
        ApiPost(id = id, content = "Post $id", likeCount = 1, author = ApiAuthor(id = author), isBookmarkedByMe = true)

    private fun signedIn() {
        every { session.currentUser } returns MutableStateFlow(me)
    }

    private fun bookmarks(vararg served: ApiPost): BookmarksViewModel {
        signedIn()
        coEvery { posts.getBookmarksPage(null, any()) } returns NetworkResult.Success(BookmarkPage(served.toList(), null, false))
        return BookmarksViewModel(posts, reports, session, MeeshyConfig())
    }

    private fun userPosts(vararg served: ApiPost): UserPostsViewModel {
        signedIn()
        coEvery { posts.getUserPostsPage("ana", null, any()) } returns NetworkResult.Success(PostPage(served.toList(), null, false))
        return UserPostsViewModel(posts, reports, session, MeeshyConfig(), SavedStateHandle(mapOf("userId" to "ana")))
    }

    private fun nearby(vararg served: ApiPost): NearbyViewModel {
        signedIn()
        coEvery { posts.getNearbyPage(any(), any(), any(), null, any()) } returns NetworkResult.Success(PostPage(served.toList(), null, false))
        return NearbyViewModel(posts, reports, session, MeeshyConfig()).also { it.loadNearby(48.85, 2.35) }
    }

    @Test
    fun `aimer depuis les favoris aime le post`() = runTest {
        coEvery { posts.like("p1") } returns NetworkResult.Success(Unit)
        val vm = bookmarks(post("p1"))

        vm.cards.toggleLike("p1")

        coVerify(exactly = 1) { posts.like("p1") }
        assertThat(vm.state.value.posts.single().isLiked).isTrue()
        assertThat(vm.state.value.posts.single().likeCount).isEqualTo(2)
    }

    @Test
    fun `une carte des favoris est enregistree, et la desenregistrer la retire de la liste`() = runTest {
        coEvery { posts.removeBookmark("p1") } returns NetworkResult.Success(Unit)
        val vm = bookmarks(post("p1").copy(isBookmarkedByMe = null), post("p2"))
        assertThat(vm.state.value.posts.first().isBookmarked).isTrue()

        vm.cards.toggleBookmark("p1")

        coVerify(exactly = 1) { posts.removeBookmark("p1") }
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `son propre post des favoris s epingle et se supprime, celui d autrui se signale`() = runTest {
        val vm = bookmarks(post("mine", author = "me"), post("theirs"))

        assertThat(vm.state.value.posts.map { it.isAuthor }).containsExactly(true, false).inOrder()
    }

    @Test
    fun `aimer depuis les publications d un auteur aime le post`() = runTest {
        coEvery { posts.like("p1") } returns NetworkResult.Success(Unit)
        val vm = userPosts(post("p1"))

        vm.cards.toggleLike("p1")

        assertThat(vm.state.value.posts.single().isLiked).isTrue()
    }

    @Test
    fun `supprimer son post depuis ses publications le retire et le dit`() = runTest {
        coEvery { posts.delete("p1") } returns NetworkResult.Success(Unit)
        val vm = userPosts(post("p1", author = "me"), post("p2", author = "me"))

        vm.cards.delete("p1")

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p2")
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.DELETED)
    }

    @Test
    fun `aimer et signaler depuis A proximite atteignent le serveur`() = runTest {
        coEvery { posts.like("p1") } returns NetworkResult.Success(Unit)
        coEvery { reports.reportPost("p1", ReportReason.SPAM, null) } returns NetworkResult.Success(Unit)
        val vm = nearby(post("p1"))

        vm.cards.toggleLike("p1")
        vm.cards.report("p1", ReportReason.SPAM)

        assertThat(vm.state.value.posts.single().isLiked).isTrue()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPORTED)
    }

    @Test
    fun `Citer depuis A proximite ouvre le compositeur sur la carte`() = runTest {
        val vm = nearby(post("p1"))

        vm.cards.beginQuote("p1")

        assertThat(vm.state.value.quoteComposer?.postId).isEqualTo("p1")
    }
}
