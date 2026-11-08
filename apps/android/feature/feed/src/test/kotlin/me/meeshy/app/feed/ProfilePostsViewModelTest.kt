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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.profile.ProfilePostsEmptyKind
import me.meeshy.sdk.model.profile.ProfilePostsFilter
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfilePostsViewModelTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val posts: PostRepository = mockk(relaxed = true)
    private val cache: UserPostsCacheRepository = mockk(relaxed = true)
    private val users: UserRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun post(id: String, type: String = "POST") = ApiPost(id = id, type = type, content = "c$id", createdAt = "2026-01-0${id.last()}T10:00:00.000Z")

    private fun page(vararg p: ApiPost, cursor: String? = null, hasMore: Boolean = false) =
        NetworkResult.Success(PostPage(p.toList(), cursor, hasMore))

    private fun viewModel(cached: CacheResult<UserPostsSnapshot> = CacheResult.Empty): ProfilePostsViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        coEvery { cache.cached(any()) } returns cached
        coEvery { cache.ticket() } returns null
        coEvery { users.getUserStats(any()) } returns NetworkResult.Failure(ApiError("off"))
        return ProfilePostsViewModel(posts, cache, users, session, MeeshyConfig(), FeedbackToastCenter(), mockk(relaxed = true), FakeProfileSocial().socket, mockk(relaxed = true))
    }

    private fun snapshot(vararg p: ApiPost, cursor: String? = "c1", hasMore: Boolean = true) = UserPostsSnapshot(p.toList(), cursor, hasMore)

    @Test
    fun `cache vide le squelette paraît puis la page est peinte`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(post("p1"), post("p2"))
        val vm = viewModel()
        vm.bind("u1")
        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(s.showSkeleton).isFalse()
        assertThat(s.showsEndFooter).isTrue()
    }

    @Test
    fun `cache frais peint sans appeler le reseau`() = runTest {
        val vm = viewModel(CacheResult.Fresh(snapshot(post("p1")), 1_000))
        vm.bind("u1")
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1")
        coVerify(exactly = 0) { posts.getUserPostsPage(any(), any(), any()) }
    }

    @Test
    fun `cache perime peint puis revalide en silence en fusionnant sans rétrécir`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(post("p9"), post("p1"), cursor = "c9", hasMore = true)
        val vm = viewModel(CacheResult.Stale(snapshot(post("p1"), post("p2")), 600_000))
        vm.bind("u1")
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p9", "p1", "p2").inOrder()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `cache expire sert la valeur puis revalide`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(post("p1"))
        val vm = viewModel(CacheResult.Syncing(snapshot(post("p2"))))
        vm.bind("u1")
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
    }

    @Test
    fun `le filtre s'applique avant la fenetre`() = runTest {
        val reels = (1..8).map { post("r$it", "REEL") }
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(*reels.toTypedArray(), post("p1"), hasMore = false)
        val vm = viewModel()
        vm.bind("u1")
        vm.onEvent(ProfilePostsEvent.SelectFilter(ProfilePostsFilter.POSTS))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1")
        vm.onEvent(ProfilePostsEvent.SelectFilter(ProfilePostsFilter.POSTS))
        assertThat(vm.state.value.filter).isEqualTo(ProfilePostsFilter.ALL)
        assertThat(vm.state.value.posts).hasSize(5)
    }

    @Test
    fun `une carte pres de la fin agrandit la fenetre avant toute page reseau`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(*(1..12).map { post("p$it") }.toTypedArray(), cursor = "c", hasMore = true)
        val vm = viewModel()
        vm.bind("u1")
        assertThat(vm.state.value.posts).hasSize(5)
        vm.onEvent(ProfilePostsEvent.CardAppeared("p4"))
        assertThat(vm.state.value.posts).hasSize(10)
        coVerify(exactly = 1) { posts.getUserPostsPage(any(), any(), any()) }
    }

    @Test
    fun `fenetre epuisee la page suivante est demandee avec le curseur`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(post("p1"), post("p2"), cursor = "c1", hasMore = true)
        coEvery { posts.getUserPostsPage("u1", "c1", any()) } returns page(post("p3"), hasMore = false)
        val vm = viewModel()
        vm.bind("u1")
        vm.onEvent(ProfilePostsEvent.CardAppeared("p2"))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1", "p2", "p3").inOrder()
        assertThat(vm.state.value.showsEndFooter).isTrue()
    }

    @Test
    fun `l'echec d'une page laisse la liste et previent`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(post("p1"), cursor = "c1", hasMore = true)
        coEvery { posts.getUserPostsPage("u1", "c1", any()) } returns NetworkResult.Failure(ApiError("off"))
        val vm = viewModel()
        vm.bind("u1")
        vm.onEvent(ProfilePostsEvent.CardAppeared("p1"))
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("p1")
        assertThat(vm.state.value.isLoadingMore).isFalse()
        assertThat(vm.state.value.showsEndFooter).isFalse()
    }

    @Test
    fun `les compteurs serveur remplacent le derive`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(post("p1"), hasMore = false)
        val vm = viewModel()
        coEvery { users.getUserStats("u1") } returns NetworkResult.Success(UserStats(postsCount = 21, reelsCount = 8, storiesCount = 13))
        vm.bind("u1")
        assertThat(vm.state.value.counts.posts).isEqualTo(21)
        assertThat(vm.state.value.counts.stories).isEqualTo(13)
        assertThat(vm.state.value.counts.isApproximate).isFalse()
    }

    @Test
    fun `profil sans publication dit le vide`() = runTest {
        coEvery { posts.getUserPostsPage("u1", null, any()) } returns page(hasMore = false)
        val vm = viewModel()
        vm.bind("u1")
        assertThat(vm.state.value.empty).isEqualTo(ProfilePostsEmptyKind.NO_PUBLICATION)
    }
}
