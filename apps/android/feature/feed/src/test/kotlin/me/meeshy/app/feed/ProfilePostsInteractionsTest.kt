package me.meeshy.app.feed

import app.cash.turbine.test
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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostRepostedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.FeedEngagementRepository
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfilePostsInteractionsTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val posts: PostRepository = mockk(relaxed = true)
    private val cache: UserPostsCacheRepository = mockk(relaxed = true)
    private val users: UserRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val reports: ReportRepository = mockk(relaxed = true)
    private val engagement: FeedEngagementRepository = mockk(relaxed = true)
    private val social = FakeProfileSocial()

    private fun post(id: String, likes: Int = 5, liked: Boolean = false, author: String = "owner") = ApiPost(
        id = id, type = "POST", content = "c$id", createdAt = "2026-01-01T10:00:00.000Z",
        author = ApiAuthor(id = author), likeCount = likes, isLikedByMe = liked,
        bookmarkCount = 2, repostCount = 1,
    )

    private fun ok() = NetworkResult.Success(Unit)

    private fun viewModel(vararg served: ApiPost, reader: MeeshyUser? = null): ProfilePostsViewModel {
        every { session.currentUser } returns MutableStateFlow(reader)
        every { session.currentUserId } returns "me"
        coEvery { cache.cached(any()) } returns CacheResult.Empty
        coEvery { cache.ticket() } returns null
        coEvery { users.getUserStats(any()) } returns NetworkResult.Failure(ApiError("off"))
        coEvery { posts.getUserPostsPage("owner", null, any()) } returns NetworkResult.Success(PostPage(served.toList(), null, false))
        return ProfilePostsViewModel(posts, cache, users, session, MeeshyConfig(), FeedbackToastCenter(), reports, social.socket, engagement)
            .also { it.bind("owner") }
    }

    private fun ProfilePostsViewModel.card(id: String) = state.value.posts.first { it.id == id }

    @Test
    fun `un j'aime remplit le coeur et ajoute un au compteur avant la reponse`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.like("p1") } returns ok()
        vm.onEvent(ProfilePostsEvent.ToggleLike("p1"))
        assertThat(vm.card("p1").isLiked).isTrue()
        assertThat(vm.card("p1").likeCount).isEqualTo(6)
    }

    @Test
    fun `un j'aime refuse revient en arriere et previent`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.like("p1") } returns NetworkResult.Failure(ApiError("off"))
        vm.onEvent(ProfilePostsEvent.ToggleLike("p1"))
        assertThat(vm.card("p1").isLiked).isFalse()
        assertThat(vm.card("p1").likeCount).isEqualTo(5)
        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(ProfilePostsEffect.Notice(FeedNotice.LIKE_FAILED))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `retirer son j'aime appelle unlike et retire un cran`() = runTest {
        val vm = viewModel(post("p1", likes = 5, liked = true))
        coEvery { posts.unlike("p1") } returns ok()
        vm.onEvent(ProfilePostsEvent.ToggleLike("p1"))
        assertThat(vm.card("p1").likeCount).isEqualTo(4)
        coVerify(exactly = 1) { posts.unlike("p1") }
    }

    @Test
    fun `l'enregistrement est optimiste et son refus est repris`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.bookmark("p1") } returns NetworkResult.Failure(ApiError("off"))
        vm.onEvent(ProfilePostsEvent.ToggleBookmark("p1"))
        assertThat(vm.card("p1").isBookmarked).isFalse()
        assertThat(vm.card("p1").bookmarkCount).isEqualTo(2)
        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(ProfilePostsEffect.Notice(FeedNotice.BOOKMARK_FAILED))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `un repost confirme persiste et dit Repartage`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.repost(any(), any(), any(), any(), any()) } returns NetworkResult.Success(post("r1"))
        vm.onEvent(ProfilePostsEvent.Repost("p1"))
        assertThat(vm.card("p1").isReposted).isTrue()
        assertThat(vm.card("p1").repostCount).isEqualTo(2)
        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(ProfilePostsEffect.Notice(FeedNotice.REPOSTED))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `un repost refuse ne persiste pas et un second toucher n'envoie rien de plus`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.repost(any(), any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("off"))
        vm.onEvent(ProfilePostsEvent.Repost("p1"))
        assertThat(vm.card("p1").isReposted).isFalse()
        assertThat(vm.card("p1").repostCount).isEqualTo(1)
        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(ProfilePostsEffect.Notice(FeedNotice.REPOST_FAILED))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `un repost deja fait n'est pas rejoue`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.repost(any(), any(), any(), any(), any()) } returns NetworkResult.Success(post("r1"))
        vm.onEvent(ProfilePostsEvent.Repost("p1"))
        vm.onEvent(ProfilePostsEvent.Repost("p1"))
        coVerify(exactly = 1) { posts.repost(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `Citer ouvre le compositeur de citation, sans rien envoyer`() = runTest {
        val vm = viewModel(post("p1"))
        vm.onEvent(ProfilePostsEvent.BeginQuote("p1"))
        val dialog = vm.state.value.dialog as ProfilePostDialog.Quote
        assertThat(dialog.composer.postId).isEqualTo("p1")
        coVerify(exactly = 0) { posts.repost(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `Citer un repost montre sa racine`() = runTest {
        val share = post("p1").copy(
            repostOf = me.meeshy.sdk.model.ApiRepostOf(id = "root", content = "L'original", author = ApiAuthor(id = "c", displayName = "Chloé")),
        )
        val vm = viewModel(share)
        vm.onEvent(ProfilePostsEvent.BeginQuote("p1"))
        val composer = (vm.state.value.dialog as ProfilePostDialog.Quote).composer
        assertThat(composer.sourceAuthorName).isEqualTo("Chloé")
        assertThat(composer.sourceContentPreview).isEqualTo("L'original")
    }

    @Test
    fun `une citation publiee part vers la racine avec son commentaire et marque la carte`() = runTest {
        val share = post("p1").copy(repostOf = me.meeshy.sdk.model.ApiRepostOf(id = "root"))
        val vm = viewModel(share)
        coEvery { posts.repost(any(), any(), any(), any(), any()) } returns NetworkResult.Success(post("r1"))
        vm.onEvent(ProfilePostsEvent.BeginQuote("p1"))
        vm.onEvent(ProfilePostsEvent.QuoteTextChanged("à lire"))
        vm.onEvent(ProfilePostsEvent.SubmitQuote)
        coVerify(exactly = 1) { posts.repost("root", any(), "à lire", true, any()) }
        assertThat(vm.state.value.dialog).isNull()
        assertThat(vm.card("p1").isReposted).isTrue()
    }

    @Test
    fun `fermer la citation n'envoie rien`() = runTest {
        val vm = viewModel(post("p1"))
        vm.onEvent(ProfilePostsEvent.BeginQuote("p1"))
        vm.onEvent(ProfilePostsEvent.DismissDialog)
        assertThat(vm.state.value.dialog).isNull()
        coVerify(exactly = 0) { posts.repost(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `un partage ajoute un au compteur`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.share("p1") } returns ok()
        vm.onEvent(ProfilePostsEvent.Shared("p1"))
        assertThat(vm.card("p1").shareCount).isEqualTo(1)
    }

    @Test
    fun `le menu de mon post offre epingler et supprimer, celui d'autrui signaler`() {
        val mine = ProfilePostActionMenu.actions(isOwn = true, isBookmarked = false, hasText = true)
        val theirs = ProfilePostActionMenu.actions(isOwn = false, isBookmarked = false, hasText = true)
        assertThat(mine).containsAtLeast(PostAction.Pin, PostAction.Delete)
        assertThat(mine).doesNotContain(PostAction.Report)
        assertThat(theirs).contains(PostAction.Report)
        assertThat(theirs).containsNoneOf(PostAction.Pin, PostAction.Delete)
    }

    @Test
    fun `la propriete d'une carte vient de l'auteur servi et de la session`() {
        assertThat(ProfilePostActionMenu.isOwn("me", "me")).isTrue()
        assertThat(ProfilePostActionMenu.isOwn("other", "me")).isFalse()
        assertThat(ProfilePostActionMenu.isOwn(null, "me")).isFalse()
    }

    @Test
    fun `la suppression attend sa confirmation puis retire la carte`() = runTest {
        val vm = viewModel(post("p1"), post("p2"))
        coEvery { posts.delete("p1") } returns ok()
        vm.onEvent(ProfilePostsEvent.RequestDelete("p1"))
        assertThat(vm.state.value.dialog).isEqualTo(ProfilePostDialog.ConfirmDelete("p1"))
        coVerify(exactly = 0) { posts.delete(any()) }
        vm.onEvent(ProfilePostsEvent.ConfirmDelete)
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p2")
        assertThat(vm.state.value.dialog).isNull()
    }

    @Test
    fun `une suppression refusee remet la carte a sa place`() = runTest {
        val vm = viewModel(post("p1"), post("p2"))
        coEvery { posts.delete("p1") } returns NetworkResult.Failure(ApiError("off"))
        vm.onEvent(ProfilePostsEvent.RequestDelete("p1"))
        vm.onEvent(ProfilePostsEvent.ConfirmDelete)
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
    }

    @Test
    fun `annuler le dialogue ne supprime rien`() = runTest {
        val vm = viewModel(post("p1"))
        vm.onEvent(ProfilePostsEvent.RequestDelete("p1"))
        vm.onEvent(ProfilePostsEvent.DismissDialog)
        vm.onEvent(ProfilePostsEvent.ConfirmDelete)
        coVerify(exactly = 0) { posts.delete(any()) }
        assertThat(vm.state.value.posts).hasSize(1)
    }

    @Test
    fun `signaler passe par le motif choisi`() = runTest {
        val vm = viewModel(post("p1", author = "other"))
        coEvery { reports.reportPost("p1", ReportReason.SPAM, null) } returns ok()
        vm.onEvent(ProfilePostsEvent.RequestReport("p1"))
        vm.onEvent(ProfilePostsEvent.ConfirmReport(ReportReason.SPAM))
        coVerify(exactly = 1) { reports.reportPost("p1", ReportReason.SPAM, null) }
        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(ProfilePostsEffect.Notice(FeedNotice.REPORTED))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `epingler dit le succes ou l'echec`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.pinPost("p1") } returns NetworkResult.Failure(ApiError("off"))
        vm.onEvent(ProfilePostsEvent.Pin("p1"))
        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(ProfilePostsEffect.Notice(FeedNotice.PIN_FAILED))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `le total absolu d'une socket devient la base et l'echo de moi leve la surcharge`() = runTest {
        val vm = viewModel(post("p1"))
        coEvery { posts.like("p1") } returns ok()
        vm.onEvent(ProfilePostsEvent.ToggleLike("p1"))
        assertThat(vm.card("p1").likeCount).isEqualTo(6)
        social.likedFlow.tryEmit(SocketPostLikedData(postId = "p1", userId = "someone", likesCount = 9))
        assertThat(vm.card("p1").likeCount).isEqualTo(10)
        social.likedFlow.tryEmit(SocketPostLikedData(postId = "p1", userId = "me", likesCount = 10))
        assertThat(vm.card("p1").likeCount).isEqualTo(10)
        assertThat(vm.card("p1").isLiked).isTrue()
        social.unlikedFlow.tryEmit(SocketPostUnlikedData(postId = "p1", userId = "me", likesCount = 9))
        assertThat(vm.card("p1").likeCount).isEqualTo(9)
        assertThat(vm.card("p1").isLiked).isFalse()
    }

    @Test
    fun `un repost annonce deux fois n'est compte qu'une fois et rejoint la tete du profil consulte`() = runTest {
        val vm = viewModel(post("p1"))
        val repost = post("r1", author = "owner")
        val event = SocketPostRepostedData(originalPostId = "p1", repost = repost)
        social.repostedFlow.tryEmit(event)
        social.repostedFlow.tryEmit(event)
        assertThat(vm.card("p1").repostCount).isEqualTo(2)
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("r1", "p1").inOrder()
    }

    @Test
    fun `un repost d'une autre personne ne rejoint pas la liste`() = runTest {
        val vm = viewModel(post("p1"))
        social.repostedFlow.tryEmit(SocketPostRepostedData(originalPostId = "p1", repost = post("r1", author = "stranger")))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1")
        assertThat(vm.card("p1").repostCount).isEqualTo(2)
    }

    @Test
    fun `le toucher d'un post envoie un engagement d'ouverture a chaque fois`() = runTest {
        val vm = viewModel(post("p1"))
        vm.recordOpen("p1")
        vm.recordOpen("p1")
        coVerify(exactly = 2) { engagement.deliver(any()) }
    }

    @Test
    fun `les impressions partent en un seul lot vide a la sortie`() = runTest {
        val vm = viewModel(post("p1"), post("p2"), post("p3"))
        vm.onEvent(ProfilePostsEvent.Impression("p1"))
        vm.onEvent(ProfilePostsEvent.Impression("p2"))
        vm.onEvent(ProfilePostsEvent.Impression("p3"))
        coVerify(exactly = 0) { engagement.deliver(any()) }
        vm.flushImpressions()
        coVerify(exactly = 1, timeout = 3_000) { engagement.deliver(match { it.size == 3 }) }
    }

    @Test
    fun `Citer depuis le profil montre le texte que la carte sert (#16001)`() = runTest {
        val vm = viewModel(QuotePrism.post("p1"), QuotePrism.share("s1"), reader = QuotePrism.reader)

        vm.onEvent(ProfilePostsEvent.BeginQuote("p1"))
        assertThat((vm.state.value.dialog as ProfilePostDialog.Quote).composer.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
        vm.onEvent(ProfilePostsEvent.BeginQuote("s1"))
        assertThat((vm.state.value.dialog as ProfilePostDialog.Quote).composer.sourceContentPreview).isEqualTo(QuotePrism.SERVED)
    }

    @Test
    fun `une traduction poussee arrive dans SA carte de l onglet Publications et seulement elle (#16004)`() = runTest {
        val vm = viewModel(post("p1").copy(content = "Hello", originalLanguage = "en"), post("p2"),
            reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr"))
        val other = vm.card("p2")
        assertThat(vm.card("p1").content).isEqualTo("Hello")

        social.translatedFlow.tryEmit(SocketPostTranslationUpdatedData("p1", "fr", ApiPostTranslationEntry(text = "Bonjour")))

        assertThat(vm.card("p1").content).isEqualTo("Bonjour")
        assertThat(vm.card("p2")).isEqualTo(other)
    }
}
