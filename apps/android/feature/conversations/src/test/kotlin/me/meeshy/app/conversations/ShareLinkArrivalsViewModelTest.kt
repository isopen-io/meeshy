package me.meeshy.app.conversations

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.link.LinkCacheRepository
import me.meeshy.sdk.model.ShareLinkArrivalEntry
import me.meeshy.sdk.model.ShareLinkArrivalStats
import me.meeshy.sdk.model.ShareLinkArrivalsPage
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ShareLinkArrivalsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private fun entry(name: String) = ShareLinkArrivalEntry(displayName = name, joinedAt = "2026-10-20T10:00:00.000Z")

    private fun viewModel(repository: LinkCacheRepository) =
        ShareLinkArrivalsViewModel(repository, SavedStateHandle(mapOf(ShareLinkDetailViewModel.LINK_ID_ARG to "l1")))

    private fun repository(cached: ShareLinkArrivalStats?) = mockk<LinkCacheRepository> {
        every { stats("l1", any()) } returns flowOf(cached?.let { CacheResult.Stale(it, 1L) } ?: CacheResult.Empty)
    }

    @Test
    fun `les recentes de la fiche se peignent puis la premiere page serveur les remplace`() = runTest(dispatcher) {
        val repo = repository(ShareLinkArrivalStats(arrivals = 2, recentArrivals = listOf(entry("cache"))))
        coEvery { repo.arrivalsPage("l1", null, any()) } returns NetworkResult.Success(ShareLinkArrivalsPage(listOf(entry("srv1"), entry("srv2")), "c1"))

        val vm = viewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.arrivals.map { it.displayName }).containsExactly("srv1", "srv2").inOrder()
        assertThat(vm.state.value.hasMore).isTrue()
    }

    @Test
    fun `la suite se charge avec le curseur et un echec ne retire rien`() = runTest(dispatcher) {
        val repo = repository(null)
        coEvery { repo.arrivalsPage("l1", null, any()) } returns NetworkResult.Success(ShareLinkArrivalsPage(listOf(entry("a")), "c1"))
        coEvery { repo.arrivalsPage("l1", "c1", any()) } returns NetworkResult.Failure(ApiError("boom", null))

        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.loadNextPage()
        advanceUntilIdle()

        assertThat(vm.state.value.arrivals).hasSize(1)
        assertThat(vm.state.value.nextPageFailed).isTrue()
    }

    @Test
    fun `a froid et hors ligne l erreur pleine se montre puis reessayer recharge`() = runTest(dispatcher) {
        val repo = repository(null)
        coEvery { repo.arrivalsPage("l1", null, any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError("off", null)),
            NetworkResult.Success(ShareLinkArrivalsPage(listOf(entry("a")), null)),
        )

        val vm = viewModel(repo)
        advanceUntilIdle()
        assertThat(vm.state.value.showsFullError).isTrue()

        vm.retry()
        advanceUntilIdle()
        assertThat(vm.state.value.arrivals.map { it.displayName }).containsExactly("a")
    }
}
