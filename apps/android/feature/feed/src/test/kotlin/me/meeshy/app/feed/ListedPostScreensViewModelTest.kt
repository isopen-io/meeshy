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
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
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
    private val me = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr")
    private val social = FakeProfileSocial()

    private fun post(id: String, author: String = "ana") =
        ApiPost(id = id, content = "Post $id", likeCount = 1, author = ApiAuthor(id = author), isBookmarkedByMe = true)

    private fun signedIn() {
        every { session.currentUser } returns MutableStateFlow(me)
    }

    private fun bookmarks(vararg served: ApiPost): BookmarksViewModel {
        signedIn()
        coEvery { posts.getBookmarksPage(null, any()) } returns NetworkResult.Success(BookmarkPage(served.toList(), null, false))
        return BookmarksViewModel(posts, reports, session, MeeshyConfig(), social.socket)
    }

    private fun userPosts(vararg served: ApiPost): UserPostsViewModel {
        signedIn()
        coEvery { posts.getUserPostsPage("ana", null, any()) } returns NetworkResult.Success(PostPage(served.toList(), null, false))
        return UserPostsViewModel(posts, reports, session, MeeshyConfig(), SavedStateHandle(mapOf("userId" to "ana")), social.socket)
    }

    private fun nearby(vararg served: ApiPost): NearbyViewModel {
        signedIn()
        coEvery { posts.getNearbyPage(any(), any(), any(), null, any()) } returns NetworkResult.Success(PostPage(served.toList(), null, false))
        return NearbyViewModel(posts, reports, session, MeeshyConfig(), social.socket).also { it.loadNearby(48.85, 2.35) }
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

    private val english = post("p1").copy(content = "Hello", originalLanguage = "en")

    private fun hallo(postId: String = "p1") =
        SocketPostTranslationUpdatedData(postId, "de", ApiPostTranslationEntry(text = "Hallo"))

    /** Toucher « de » sur p1, puis la traduction arrive : p1 la sert, p2 n'a pas bougé (#16004). */
    private fun assertTranslationLandsOnItsCard(vm: () -> List<FeedPostPresentation>, cards: ListedPostCardActions) {
        coEvery { posts.requestTranslation("p1", "de") } returns NetworkResult.Success(Unit)
        val untouched = vm().single { it.id == "p2" }

        cards.onFlagTap("p1", "de")
        assertThat(vm().single { it.id == "p1" }.content).isEqualTo("Hello")
        social.translatedFlow.tryEmit(hallo())

        assertThat(vm().single { it.id == "p1" }.content).isEqualTo("Hallo")
        assertThat(vm().single { it.id == "p1" }.isTranslated).isTrue()
        assertThat(vm().single { it.id == "p2" }).isEqualTo(untouched)
    }

    @Test
    fun `une traduction demandee depuis les favoris arrive dans SA carte et seulement elle`() = runTest {
        val vm = bookmarks(english, post("p2"))
        assertTranslationLandsOnItsCard({ vm.state.value.posts }, vm.cards)
    }

    @Test
    fun `une traduction demandee depuis les publications d un auteur arrive dans SA carte et seulement elle`() = runTest {
        val vm = userPosts(english, post("p2"))
        assertTranslationLandsOnItsCard({ vm.state.value.posts }, vm.cards)
    }

    @Test
    fun `une traduction demandee depuis A proximite arrive dans SA carte et seulement elle`() = runTest {
        val vm = nearby(english, post("p2"))
        assertTranslationLandsOnItsCard({ vm.state.value.posts }, vm.cards)
    }

    @Test
    fun `une traduction poussee pour un post absent de la liste ne touche aucune carte`() = runTest {
        val vm = bookmarks(english, post("p2"))
        val before = vm.state.value.posts

        social.translatedFlow.tryEmit(hallo(postId = "ailleurs"))

        assertThat(vm.state.value.posts).isEqualTo(before)
    }
}
