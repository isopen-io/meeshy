package me.meeshy.app.conversations.links

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.link.CommunityLinkRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.CommunityLinksApi
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityLinksViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class FakeApi(var response: ApiResponse<List<CommunityMini>>) : CommunityLinksApi {
        override suspend fun mine(role: String) = response
    }

    private fun mini(id: String, members: Int = 4) = CommunityMini(id = id, name = "C$id", identifier = "c$id", memberCount = members)

    private fun viewModel(api: FakeApi, cache: LinksCache = LinksCache()) =
        CommunityLinksViewModel(CommunityLinkRepository(api, MeeshyConfig()), cache)

    @Test
    fun `la liste arrive avec ses chiffres et alimente le cache`() = runTest {
        val cache = LinksCache()
        val vm = viewModel(FakeApi(ApiResponse(success = true, data = listOf(mini("1", 4), mini("2", 6)))), cache)
        assertThat(vm.state.value.hasLoaded).isFalse()
        advanceUntilIdle()

        assertThat(vm.state.value.links).hasSize(2)
        assertThat(vm.state.value.stats.totalMembers).isEqualTo(10)
        assertThat(vm.state.value.refreshFailed).isFalse()
        assertThat(cache.communityLinks()).hasSize(2)
    }

    @Test
    fun `une liste vide reste un etat charge, pas un echec`() = runTest {
        val vm = viewModel(FakeApi(ApiResponse(success = true, data = emptyList())))
        advanceUntilIdle()

        assertThat(vm.state.value.hasLoaded).isTrue()
        assertThat(vm.state.value.links).isEmpty()
        assertThat(vm.state.value.refreshFailed).isFalse()
    }

    @Test
    fun `hors ligne le cache reste affiche et l'echec est signale`() = runTest {
        val cache = LinksCache().apply { putCommunityLinks(listOf(CommunityLink(id = "1", name = "C1"))) }
        val vm = viewModel(FakeApi(ApiResponse(success = false)), cache)
        assertThat(vm.state.value.links).hasSize(1)
        assertThat(vm.state.value.hasLoaded).isTrue()
        advanceUntilIdle()

        assertThat(vm.state.value.links).hasSize(1)
        assertThat(vm.state.value.refreshFailed).isTrue()
        assertThat(vm.state.value.isRefreshing).isFalse()
    }

    @Test
    fun `sans cache, un echec laisse l'etat non charge`() = runTest {
        val vm = viewModel(FakeApi(ApiResponse(success = false)))
        advanceUntilIdle()

        assertThat(vm.state.value.hasLoaded).isFalse()
        assertThat(vm.state.value.refreshFailed).isTrue()
    }
}
