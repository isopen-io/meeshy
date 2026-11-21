package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.BookmarkPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #19426 — la liste OUVERTE des publications enregistrées suit les événements de post que le disque reçoit déjà
 * (`PostEngagementBinding`), sans quoi sa prochaine écriture rendrait au disque ce que le temps réel venait d'en retirer ;
 * et elle n'écrit que sous le compte qui l'a chargée.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BookmarksLiveTest {

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
    private val social = FakeProfileSocial()
    private val written = mutableListOf<UserPostsSnapshot>()

    private fun post(id: String) = ApiPost(id = id, content = "Post $id", likeCount = 3, commentCount = 1, isLikedByMe = false)

    private fun served(vararg ids: String) = NetworkResult.Success(BookmarkPage(ids.map { post(it) }, null, false))

    private fun viewModel(cache: UserPostsCacheRepository = bookmarksCache(written = written)): BookmarksViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        return BookmarksViewModel(repository, mockk(relaxed = true), session, MeeshyConfig(), social.socket, cache)
    }

    private fun BookmarksViewModel.ids() = state.value.posts.map { it.id }

    private fun lastWrittenIds() = written.last().posts.map { it.id }

    @Test
    fun `a post deleted live leaves the open list, and the next write does not bring it back`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns served("a", "b", "c")
        coEvery { repository.removeBookmark("c") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        social.deletedFlow.emit(SocketPostDeletedData(postId = "b"))
        vm.removeBookmark("c")

        assertThat(vm.ids()).containsExactly("a")
        assertThat(lastWrittenIds()).containsExactly("a")
    }

    @Test
    fun `a post un-saved on another device leaves the open list, and the next write does not bring it back`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns served("a", "b", "c")
        coEvery { repository.removeBookmark("c") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        social.bookmarkedFlow.emit(SocketPostBookmarkedData(postId = "b", bookmarked = false, bookmarkCount = 0))
        vm.removeBookmark("c")

        assertThat(vm.ids()).containsExactly("a")
        assertThat(lastWrittenIds()).containsExactly("a")
    }

    @Test
    fun `live counts reach the open list, and the next write keeps them`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns served("a", "b")
        coEvery { repository.removeBookmark("b") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        social.likedFlow.emit(SocketPostLikedData(postId = "a", userId = "someone", likesCount = 9))
        social.commentAddedFlow.emit(SocketCommentAddedData(postId = "a", comment = ApiPostComment(id = "k"), commentCount = 6))
        vm.removeBookmark("b")

        val kept = written.last().posts.single()
        assertThat(kept.likeCount).isEqualTo(9)
        assertThat(kept.isLikedByMe).isFalse()
        assertThat(kept.commentCount).isEqualTo(6)
    }

    @Test
    fun `a refused un-save puts the post back in its place without resurrecting a post deleted meanwhile`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns served("a", "b", "c")
        val refusal = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repository.removeBookmark("b") } coAnswers { refusal.await() }
        val vm = viewModel()

        vm.removeBookmark("b")
        social.deletedFlow.emit(SocketPostDeletedData(postId = "a"))
        refusal.complete(NetworkResult.Failure(ApiError("nope")))

        assertThat(vm.ids()).containsExactly("b", "c").inOrder()
        assertThat(lastWrittenIds()).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `a first page whose account closed while it was in flight is written under the account it left with`() = runTest {
        val first = AccountTicket(ownerId = "me", generation = 1)
        var signedIn: AccountTicket? = first
        val tickets = mutableListOf<AccountTicket?>()
        val page = CompletableDeferred<NetworkResult<BookmarkPage>>()
        coEvery { repository.getBookmarksPage(null, any()) } coAnswers { page.await() }
        viewModel(bookmarksCache(written = written, tickets = tickets, account = { signedIn }))

        signedIn = AccountTicket(ownerId = "other", generation = 2)
        page.complete(served("a"))

        assertThat(tickets).containsExactly(first)
    }

    @Test
    fun `an un-save writes under the account that loaded the list, not whoever is signed in now`() = runTest {
        val first = AccountTicket(ownerId = "me", generation = 1)
        var signedIn: AccountTicket? = first
        val tickets = mutableListOf<AccountTicket?>()
        coEvery { repository.removeBookmark("a") } returns NetworkResult.Success(Unit)
        val held = CacheResult.Fresh(UserPostsSnapshot(listOf(post("a"), post("b")), null, false), ageMillis = 1_000)
        val vm = viewModel(bookmarksCache(held, written, tickets, account = { signedIn }))

        signedIn = AccountTicket(ownerId = "other", generation = 2)
        vm.removeBookmark("a")

        assertThat(tickets).containsExactly(first)
    }

    @Test
    fun `a post saved elsewhere while the list is open stops its writes until a first page answers`() = runTest {
        coEvery { repository.getBookmarksPage(null, any()) } returns served("a", "b")
        coEvery { repository.removeBookmark("b") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        social.bookmarkedFlow.emit(SocketPostBookmarkedData(postId = "z", bookmarked = true, bookmarkCount = 1))
        vm.removeBookmark("b")

        assertThat(written.map { s -> s.posts.map { it.id } }).containsExactly(listOf("a", "b"))
        coEvery { repository.getBookmarksPage(null, any()) } returns served("z", "a")
        vm.refresh()
        assertThat(lastWrittenIds()).containsExactly("z", "a").inOrder()
    }
}
