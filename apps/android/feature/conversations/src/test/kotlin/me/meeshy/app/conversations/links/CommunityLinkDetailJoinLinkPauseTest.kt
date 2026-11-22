package me.meeshy.app.conversations.links

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.link.CommunityLinkRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.CommunityApi
import me.meeshy.sdk.net.api.CommunityJoinLinkState
import me.meeshy.sdk.net.api.CommunityLinksApi
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La rangée « Actif » de la fiche Android du lien d'une communauté (#20255, iso iOS `CommunityLinkDetailViewModel`) :
 * offerte seulement quand la passerelle sert l'état, optimiste, la réponse fait foi, un refus remet l'état d'avant.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CommunityLinkDetailJoinLinkPauseTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private object NoList : CommunityLinksApi {
        override suspend fun mine(role: String) = ApiResponse<List<CommunityMini>>(success = false)
    }

    private fun link(paused: Boolean?, active: Boolean = true) =
        CommunityLink(id = "c1", name = "Club", identifier = "mshy-club", isActive = active, joinLinkPaused = paused)

    private fun cacheWith(vararg links: CommunityLink) = LinksCache().apply { putCommunityLinks(links.toList()) }

    private fun viewModel(cache: LinksCache, communities: CommunityApi = mockk()) = CommunityLinkDetailViewModel(
        SavedStateHandle(mapOf(CommunityLinkDetailViewModel.COMMUNITY_ID_ARG to "c1")),
        CommunityLinkRepository(NoList, MeeshyConfig(), communities),
        cache,
    )

    private fun serving(pausedAt: String?): CommunityApi = mockk<CommunityApi>().also {
        coEvery { it.setJoinLinkState(any(), any()) } returns
            ApiResponse(success = true, data = CommunityJoinLinkState(joinLinkPausedAt = pausedAt))
    }

    @Test
    fun `l'etat servi par la liste peint la rangee et le billet`() = runTest {
        val vm = viewModel(cacheWith(link(paused = true)))

        assertThat(vm.joinLink.value.paused).isTrue()
        assertThat(vm.joinLink.value.canPause).isTrue()
        assertThat(vm.joinLink.value.isLinkActive).isFalse()
    }

    @Test
    fun `une passerelle qui ne sert pas l'etat n'offre aucune bascule`() = runTest {
        val vm = viewModel(cacheWith(link(paused = null)))

        assertThat(vm.joinLink.value.canPause).isFalse()
        assertThat(vm.joinLink.value.isLinkActive).isTrue()
        vm.setJoinLinkActive(false)
        advanceUntilIdle()
        assertThat(vm.joinLink.value.paused).isNull()
    }

    @Test
    fun `une communaute inactive n'a pas un billet actif meme quand son lien ne l'est pas en pause`() = runTest {
        val vm = viewModel(cacheWith(link(paused = false, active = false)))

        assertThat(vm.joinLink.value.isLinkActive).isFalse()
    }

    @Test
    fun `mettre en pause bascule tout de suite, avant la reponse`() = runTest {
        val gate = CompletableDeferred<ApiResponse<CommunityJoinLinkState>>()
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState(any(), any()) } coAnswers { gate.await() }
        val vm = viewModel(cacheWith(link(paused = false)), communities)

        vm.setJoinLinkActive(false)
        runCurrent()

        assertThat(vm.joinLink.value.paused).isTrue()
        assertThat(vm.joinLink.value.isSetting).isTrue()
        gate.complete(ApiResponse(success = true, data = CommunityJoinLinkState(joinLinkPausedAt = "2026-11-22T08:00:00.000Z")))
        advanceUntilIdle()
        assertThat(vm.joinLink.value.paused).isTrue()
        assertThat(vm.joinLink.value.isSetting).isFalse()
    }

    @Test
    fun `la reponse de la passerelle fait foi`() = runTest {
        val vm = viewModel(cacheWith(link(paused = false)), serving(pausedAt = null))

        vm.setJoinLinkActive(false)
        advanceUntilIdle()

        assertThat(vm.joinLink.value.paused).isFalse()
    }

    @Test
    fun `un refus remet l'etat d'avant et le signale`() = runTest {
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState(any(), any()) } returns ApiResponse(success = false)
        val vm = viewModel(cacheWith(link(paused = false)), communities)

        vm.setJoinLinkActive(false)
        advanceUntilIdle()

        assertThat(vm.joinLink.value.paused).isFalse()
        assertThat(vm.joinLink.value.failed).isTrue()
        assertThat(vm.joinLink.value.isSetting).isFalse()
    }

    @Test
    fun `un second toucher en vol n'envoie rien`() = runTest {
        val gate = CompletableDeferred<ApiResponse<CommunityJoinLinkState>>()
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState(any(), any()) } coAnswers { gate.await() }
        val vm = viewModel(cacheWith(link(paused = false)), communities)

        vm.setJoinLinkActive(false)
        runCurrent()
        vm.setJoinLinkActive(true)
        runCurrent()
        gate.complete(ApiResponse(success = true, data = CommunityJoinLinkState(joinLinkPausedAt = "2026-11-22T08:00:00.000Z")))
        advanceUntilIdle()

        coVerify(exactly = 1) { communities.setJoinLinkState(any(), any()) }
        assertThat(vm.joinLink.value.paused).isTrue()
    }

    @Test
    fun `demander l'etat deja servi n'envoie rien`() = runTest {
        val communities = mockk<CommunityApi>()
        val vm = viewModel(cacheWith(link(paused = false)), communities)

        vm.setJoinLinkActive(true)
        advanceUntilIdle()

        coVerify(exactly = 0) { communities.setJoinLinkState(any(), any()) }
    }

    @Test
    fun `une bascule reussie met a jour la ligne du cache, et elle seule`() = runTest {
        val other = CommunityLink(id = "c2", name = "Cafe", identifier = "mshy-cafe", isActive = true, joinLinkPaused = false)
        val cache = cacheWith(link(paused = false), other)
        val vm = viewModel(cache, serving(pausedAt = "2026-11-22T08:00:00.000Z"))

        vm.setJoinLinkActive(false)
        advanceUntilIdle()

        assertThat(cache.communityLinks()!!.map { it.id to it.joinLinkPaused }).containsExactly("c1" to true, "c2" to false).inOrder()
    }

    @Test
    fun `un refus laisse le cache comme il etait`() = runTest {
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState(any(), any()) } returns ApiResponse(success = false)
        val cache = cacheWith(link(paused = false))
        val vm = viewModel(cache, communities)

        vm.setJoinLinkActive(false)
        advanceUntilIdle()

        assertThat(cache.communityLinks()!!.single().joinLinkPaused).isFalse()
    }
}
