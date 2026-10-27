package me.meeshy.app.community

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityListViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val repository: CommunityRepository = mockk(relaxed = true)
    private val stream = MutableSharedFlow<CacheResult<List<ApiCommunity>>>(replay = 1)

    private fun api(id: String, name: String = id) = ApiCommunity(id = id, name = name, memberCount = 3)

    private fun page(vararg ids: String, hasMore: Boolean = false) =
        NetworkResult.Success(PagedResult(ids.map { api(it) }, Pagination(hasMore = hasMore)))

    private fun viewModel(): CommunityListViewModel {
        every { cache.list(any()) } returns stream
        return CommunityListViewModel(cache, repository)
    }

    @Test
    fun `a cold cache shows the skeleton until the first page lands`() = runTest {
        val vm = viewModel()
        assertThat(vm.state.value.showSkeleton).isTrue()

        stream.emit(CacheResult.Fresh(listOf(api("a"), api("b")), 0))

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.communities.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `cached communities show at once while the network revalidates`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Syncing(listOf(api("a"))))

        assertThat(vm.state.value.communities.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `an empty settled cache is the empty state, not a skeleton`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Fresh(emptyList(), 0))

        assertThat(vm.state.value.showEmpty).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `a cold failure shows the error state and a retry reloads`() = runTest {
        val onError = slot<(Throwable) -> Unit>()
        every { cache.list(capture(onError)) } returns stream
        val vm = CommunityListViewModel(cache, repository)

        onError.captured(RuntimeException("offline"))
        assertThat(vm.state.value.showError).isTrue()

        coEvery { cache.refreshList() } returns true
        vm.retry()
        stream.emit(CacheResult.Fresh(listOf(api("a")), 0))

        assertThat(vm.state.value.showError).isFalse()
        assertThat(vm.state.value.communities).hasSize(1)
    }

    @Test
    fun `a failure behind a populated list stays silent`() = runTest {
        val onError = slot<(Throwable) -> Unit>()
        every { cache.list(capture(onError)) } returns stream
        val vm = CommunityListViewModel(cache, repository)
        stream.emit(CacheResult.Stale(listOf(api("a")), 1))

        onError.captured(RuntimeException("offline"))

        assertThat(vm.state.value.showError).isFalse()
        assertThat(vm.state.value.communities).hasSize(1)
    }

    @Test
    fun `a full first page offers more and loadMore appends without duplicates`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Fresh((1..20).map { api("c$it") }, 0))
        assertThat(vm.state.value.hasMore).isTrue()
        coEvery { repository.listPaged(null, 20, 20) } returns page("c20", "x1", hasMore = false)

        vm.loadMore()

        assertThat(vm.state.value.communities.map { it.id }.takeLast(2)).containsExactly("c20", "x1").inOrder()
        assertThat(vm.state.value.communities).hasSize(21)
        assertThat(vm.state.value.hasMore).isFalse()
        assertThat(vm.state.value.isLoadingMore).isFalse()
    }

    @Test
    fun `a short first page offers no more`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Fresh(listOf(api("a")), 0))

        vm.loadMore()

        assertThat(vm.state.value.hasMore).isFalse()
        coVerify(exactly = 0) { repository.listPaged(any(), any(), any()) }
    }

    @Test
    fun `a query under two characters never reaches the server`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Fresh(listOf(api("a")), 0))

        vm.onQueryChange("a")
        dispatcher.scheduler.advanceUntilIdle()

        coVerify(exactly = 0) { repository.listPaged(any(), any(), any()) }
        assertThat(vm.state.value.communities.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a query of two characters searches after the typing delay and clearing it restores the list`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Fresh(listOf(api("a")), 0))
        coEvery { repository.listPaged("club", 0, 20) } returns page("found")

        vm.onQueryChange("club")
        dispatcher.scheduler.advanceUntilIdle()
        assertThat(vm.state.value.communities.map { it.id }).containsExactly("found")

        vm.onQueryChange("")
        assertThat(vm.state.value.communities.map { it.id }).containsExactly("a")
    }

    @Test
    fun `pull to refresh re-reads the first page and settles`() = runTest {
        val vm = viewModel()
        stream.emit(CacheResult.Fresh(listOf(api("a")), 0))
        coEvery { cache.refreshList() } returns true

        vm.refresh()

        coVerify(exactly = 1) { cache.refreshList() }
        assertThat(vm.state.value.isRefreshing).isFalse()
    }
}
