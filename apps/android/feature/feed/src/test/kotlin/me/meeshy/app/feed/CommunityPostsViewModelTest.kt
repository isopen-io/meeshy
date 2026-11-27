package me.meeshy.app.feed

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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #16879 — l'onglet Publications du détail d'une communauté (miroir de l'onglet iOS) : cache d'abord,
 * revalidation silencieuse, squelette sur cache vide seulement, échec dit seulement sans copie.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CommunityPostsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true) {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(null)
    }
    private val social = FakeProfileSocial()

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    private fun page(vararg ids: String, nextCursor: String? = null, hasMore: Boolean = false) =
        NetworkResult.Success(PostPage(ids.map { post(it) }, nextCursor, hasMore))

    private fun cache(
        held: CacheResult<UserPostsSnapshot> = CacheResult.Empty,
        written: MutableList<Pair<String, UserPostsSnapshot>> = mutableListOf(),
    ): UserPostsCacheRepository = mockk(relaxed = true) {
        coEvery { ticket() } returns null
        coEvery { cachedCommunity(any()) } returns held
        coEvery { persistCommunity(any(), any(), any()) } coAnswers { written += firstArg<String>() to secondArg<UserPostsSnapshot>() }
    }

    private fun viewModel(cache: UserPostsCacheRepository = cache()) =
        CommunityPostsViewModel(repository, mockk(relaxed = true), session, MeeshyConfig(), social.socket, cache)

    @Test
    fun `un cache vide montre le squelette jusqu'a la premiere page, puis la garde`() = runTest {
        val gate = CompletableDeferred<NetworkResult<PostPage>>()
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } coAnswers { gate.await() }
        val written = mutableListOf<Pair<String, UserPostsSnapshot>>()
        val vm = viewModel(cache(written = written))

        vm.bind("c1")
        assertThat(vm.state.value.showSkeleton).isTrue()

        gate.complete(page("a", "b", nextCursor = "k", hasMore = true))
        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(written.single().first).isEqualTo("c1")
        assertThat(written.single().second.nextCursor).isEqualTo("k")
    }

    @Test
    fun `une copie fraiche se peint sans squelette ni reseau`() = runTest {
        val vm = viewModel(cache(CacheResult.Fresh(UserPostsSnapshot(listOf(post("a"))), ageMillis = 1)))

        vm.bind("c1")

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a")
        coVerify(exactly = 0) { repository.getCommunityPostsPage(any(), any(), any()) }
    }

    @Test
    fun `une copie perimee se peint puis la premiere page la remplace en silence`() = runTest {
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } returns page("b")
        val vm = viewModel(cache(CacheResult.Stale(UserPostsSnapshot(listOf(post("a"))), ageMillis = 1)))

        vm.bind("c1")

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("b")
        assertThat(vm.state.value.failed).isFalse()
    }

    @Test
    fun `un echec sans copie est dit, un echec sur une copie peinte ne dit rien`() = runTest {
        coEvery { repository.getCommunityPostsPage(any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(code = "FORBIDDEN", message = "forbidden"))

        val cold = viewModel()
        cold.bind("c1")
        assertThat(cold.state.value.failed).isTrue()
        assertThat(cold.state.value.showSkeleton).isFalse()

        val warm = viewModel(cache(CacheResult.Stale(UserPostsSnapshot(listOf(post("a"))), ageMillis = 1)))
        warm.bind("c1")
        assertThat(warm.state.value.failed).isFalse()
        assertThat(warm.state.value.posts.map { it.id }).containsExactly("a")
    }

    @Test
    fun `une communaute sans publication est un vide, pas un echec`() = runTest {
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } returns page()
        val vm = viewModel()

        vm.bind("c1")

        assertThat(vm.state.value.isEmpty).isTrue()
        assertThat(vm.state.value.failed).isFalse()
    }

    @Test
    fun `reessayer relit la premiere page apres un echec`() = runTest {
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError(code = "NETWORK", message = "offline")),
            page("a"),
        )
        val vm = viewModel()
        vm.bind("c1")

        vm.retry()

        assertThat(vm.state.value.failed).isFalse()
        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a")
    }

    @Test
    fun `la page suivante part avec le curseur quand la fin approche`() = runTest {
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } returns page("a", nextCursor = "k", hasMore = true)
        coEvery { repository.getCommunityPostsPage("c1", "k", any()) } returns page("b")
        val vm = viewModel()
        vm.bind("c1")

        vm.loadMoreIfNeeded("a")

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une publication supprimee ailleurs quitte la liste`() = runTest {
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } returns page("a", "b")
        val vm = viewModel()
        vm.bind("c1")

        social.deletedFlow.emit(SocketPostDeletedData(postId = "a"))

        assertThat(vm.state.value.posts.map { it.id }).containsExactly("b")
    }

    @Test
    fun `relier la meme communaute ne relit rien`() = runTest {
        coEvery { repository.getCommunityPostsPage("c1", null, any()) } returns page("a")
        val vm = viewModel()

        vm.bind("c1")
        vm.bind("c1")
        vm.bind(" ")

        coVerify(exactly = 1) { repository.getCommunityPostsPage(any(), any(), any()) }
    }
}
