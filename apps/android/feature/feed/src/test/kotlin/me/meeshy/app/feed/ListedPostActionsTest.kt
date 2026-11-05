package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository
import org.junit.Test

/**
 * #13244 — les gestes du fil sur une liste paginée (favoris, « À proximité », publications d'un auteur, hashtag) : chacun
 * répond au geste, le serveur confirme, et un refus ne rend que ce que le geste a touché, en le disant.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ListedPostActionsTest {

    private val posts: PostRepository = mockk(relaxed = true)
    private val reports: ReportRepository = mockk(relaxed = true)
    private val refused = NetworkResult.Failure(ApiError("non", httpStatus = 500))

    private fun post(id: String, likes: Int = 3, liked: Boolean = false, comments: Int = 1) = ApiPost(
        id = id, content = "Post $id", likeCount = likes, isLikedByMe = liked, commentCount = comments, bookmarkCount = 0,
    )

    private class Subject(val list: MutableStateFlow<PostPageListState>, val actions: ListedPostActions) {
        fun post(id: String) = list.value.posts.single { it.id == id }
        val notice get() = actions.state.value.notice
    }

    private val pushed = MutableSharedFlow<SocketPostTranslationUpdatedData>(extraBufferCapacity = 8)

    private fun subject(vararg served: ApiPost, reader: MeeshyUser? = null): Subject {
        val list = MutableStateFlow(PostPageListState().appended(served.toList(), nextCursor = null, hasMore = false))
        val actions = ListedPostActions(CoroutineScope(UnconfinedTestDispatcher()), posts, reports, list, pushed) { reader }
        return Subject(list, actions)
    }

    @Test
    fun `aimer pose le coeur et le compte au geste, avant la reponse du serveur`() = runTest {
        val answer = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { posts.like("p1") } coAnswers { answer.await() }
        val s = subject(post("p1"))

        s.actions.toggleLike("p1")

        assertThat(s.post("p1").isLikedByMe).isTrue()
        assertThat(s.post("p1").likeCount).isEqualTo(4)
        answer.complete(NetworkResult.Success(Unit))
        assertThat(s.notice).isNull()
    }

    @Test
    fun `un coeur refuse revient en arriere et le dit, sans toucher les autres cartes`() = runTest {
        coEvery { posts.unlike("p1") } returns refused
        val s = subject(post("p1", liked = true), post("p2"))

        s.actions.toggleLike("p1")

        assertThat(s.post("p1").isLikedByMe).isTrue()
        assertThat(s.post("p1").likeCount).isEqualTo(3)
        assertThat(s.notice).isEqualTo(FeedNotice.LIKE_FAILED)
        coVerify(exactly = 0) { posts.like(any()) }
    }

    @Test
    fun `enregistrer pose la marque et un refus la rend`() = runTest {
        coEvery { posts.bookmark("p1") } returns refused
        val s = subject(post("p1"))

        s.actions.toggleBookmark("p1")

        coVerify(exactly = 1) { posts.bookmark("p1") }
        assertThat(s.post("p1").isBookmarkedByMe).isNotEqualTo(true)
        assertThat(s.notice).isEqualTo(FeedNotice.BOOKMARK_FAILED)
    }

    @Test
    fun `supprimer retire la carte avant le reseau et le dit`() = runTest {
        val answer = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { posts.delete("p2") } coAnswers { answer.await() }
        val s = subject(post("p1"), post("p2"), post("p3"))

        s.actions.delete("p2")

        assertThat(s.list.value.posts.map { it.id }).containsExactly("p1", "p3").inOrder()
        answer.complete(NetworkResult.Success(Unit))
        assertThat(s.notice).isEqualTo(FeedNotice.DELETED)
    }

    @Test
    fun `une suppression refusee remet la carte a sa place`() = runTest {
        coEvery { posts.delete("p2") } returns refused
        val s = subject(post("p1"), post("p2"), post("p3"))

        s.actions.delete("p2")

        assertThat(s.list.value.posts.map { it.id }).containsExactly("p1", "p2", "p3").inOrder()
        assertThat(s.notice).isEqualTo(FeedNotice.DELETE_FAILED)
    }

    @Test
    fun `signaler envoie le motif choisi et le confirme`() = runTest {
        coEvery { reports.reportPost("p1", ReportReason.SPAM, null) } returns NetworkResult.Success(Unit)
        val s = subject(post("p1"))

        s.actions.report("p1", ReportReason.SPAM)

        coVerify(exactly = 1) { reports.reportPost("p1", ReportReason.SPAM, null) }
        assertThat(s.notice).isEqualTo(FeedNotice.REPORTED)
    }

    @Test
    fun `un signalement perdu se dit`() = runTest {
        coEvery { reports.reportPost(any(), any(), any()) } returns refused
        val s = subject(post("p1"))

        s.actions.report("p1", ReportReason.HARASSMENT)

        assertThat(s.notice).isEqualTo(FeedNotice.REPORT_FAILED)
    }

    @Test
    fun `epingler marque la carte et le dit`() = runTest {
        coEvery { posts.pinPost("p1") } returns NetworkResult.Success(Unit)
        val s = subject(post("p1"))

        s.actions.pin("p1")

        assertThat(s.post("p1").isPinned).isTrue()
        assertThat(s.notice).isEqualTo(FeedNotice.PINNED)
    }

    @Test
    fun `un commentaire envoye fait suivre le compteur de la carte`() = runTest {
        val s = subject(post("p1", comments = 2))

        s.actions.onCommentSent("p1")

        assertThat(s.post("p1").commentCount).isEqualTo(3)
    }

    @Test
    fun `une issue dite une fois est consommee`() = runTest {
        coEvery { posts.pinPost("p1") } returns NetworkResult.Success(Unit)
        val s = subject(post("p1"))
        s.actions.pin("p1")

        s.actions.consumeNotice()

        assertThat(s.notice).isNull()
    }

    @Test
    fun `toucher le drapeau d une langue que la carte porte l y passe, le retoucher rend la main au Prisme`() = runTest {
        val english = post("p1").copy(
            content = "Hello",
            originalLanguage = "en",
            translations = mapOf("fr" to ApiPostTranslationEntry(text = "Bonjour")),
        )
        val s = subject(english, reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr"))

        s.actions.onFlagTap("p1", "en")
        assertThat(s.actions.state.value.languageOverrides).containsExactly("p1", "en")
        s.actions.onFlagTap("p1", "en")
        assertThat(s.actions.state.value.languageOverrides).isEmpty()
    }

    @Test
    fun `toucher une langue que la carte ne porte pas encore la demande au serveur`() = runTest {
        val s = subject(post("p1").copy(originalLanguage = "en"), reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr"))

        s.actions.onFlagTap("p1", "de")

        coVerify(exactly = 1) { posts.requestTranslation("p1", "de") }
    }

    private val french = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr")

    private fun hallo(postId: String) = SocketPostTranslationUpdatedData(postId, "de", ApiPostTranslationEntry(text = "Hallo"))

    @Test
    fun `la traduction demandee arrive dans SA carte, qui passe dans cette langue, et les autres ne bougent pas (#16004)`() = runTest {
        coEvery { posts.requestTranslation("p1", "de") } returns NetworkResult.Success(Unit)
        val s = subject(post("p1").copy(originalLanguage = "en"), post("p2"), reader = french)
        val other = s.post("p2")

        s.actions.onFlagTap("p1", "de")
        pushed.tryEmit(hallo("p1"))

        assertThat(s.post("p1").translations?.get("de")?.text).isEqualTo("Hallo")
        assertThat(s.actions.state.value.languageOverrides).containsExactly("p1", "de")
        assertThat(s.post("p2")).isEqualTo(other)
    }

    @Test
    fun `une traduction poussee sans demande se range dans la carte sans en changer la langue`() = runTest {
        val s = subject(post("p1").copy(originalLanguage = "en"), reader = french)

        pushed.tryEmit(hallo("p1"))

        assertThat(s.post("p1").translations?.get("de")?.text).isEqualTo("Hallo")
        assertThat(s.actions.state.value.languageOverrides).isEmpty()
    }

    @Test
    fun `une demande refusee par le serveur ne fait pas basculer la carte a une arrivee tardive`() = runTest {
        coEvery { posts.requestTranslation("p1", "de") } returns refused
        val s = subject(post("p1").copy(originalLanguage = "en"), reader = french)

        s.actions.onFlagTap("p1", "de")
        pushed.tryEmit(hallo("p1"))

        assertThat(s.actions.state.value.languageOverrides).isEmpty()
    }
}
