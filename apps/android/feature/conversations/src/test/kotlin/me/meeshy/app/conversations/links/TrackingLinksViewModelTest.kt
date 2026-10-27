package me.meeshy.app.conversations.links

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.link.TrackingLinkRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.CreatedTrackingLinkPayload
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingLinksPage
import me.meeshy.sdk.net.api.TrackingLinkApi
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TrackingLinksViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun link(id: String) = TrackingLink(id = id, token = "tok$id", shortUrl = "https://meeshy.me/l/tok$id")

    private class FakeApi(
        var list: ApiResponse<TrackingLinksPage> = ApiResponse(success = true, data = TrackingLinksPage()),
        var stats: ApiResponse<TrackingLinkStats> = ApiResponse(success = true, data = TrackingLinkStats()),
        var create: ApiResponse<CreatedTrackingLinkPayload> = ApiResponse(success = false),
    ) : TrackingLinkApi {
        val created = mutableListOf<CreateTrackingLinkRequest>()
        override suspend fun listMine(offset: Int, limit: Int) = list
        override suspend fun stats() = stats
        override suspend fun create(body: CreateTrackingLinkRequest): ApiResponse<CreatedTrackingLinkPayload> { created += body; return create }
    }

    private fun viewModel(api: FakeApi, cache: LinksCache = LinksCache()) = TrackingLinksViewModel(TrackingLinkRepository(api), cache)

    @Test
    fun `liste et chiffres arrivent ensemble et le cache est mis a jour`() = runTest {
        val cache = LinksCache()
        val vm = viewModel(
            FakeApi(
                list = ApiResponse(success = true, data = TrackingLinksPage(listOf(link("1")))),
                stats = ApiResponse(success = true, data = TrackingLinkStats(totalLinks = 1, totalClicks = 9)),
            ),
            cache,
        )
        assertThat(vm.state.value.hasLoaded).isFalse()
        advanceUntilIdle()

        assertThat(vm.state.value.links.links).hasSize(1)
        assertThat(vm.state.value.stats?.totalClicks).isEqualTo(9)
        assertThat(cache.trackingLinks()).hasSize(1)
    }

    @Test
    fun `hors ligne le cache reste affiche sous un bandeau`() = runTest {
        val cache = LinksCache().apply { putTrackingLinks(listOf(link("1"))) }
        val vm = viewModel(FakeApi(list = ApiResponse(success = false)), cache)
        assertThat(vm.state.value.links.links).hasSize(1)
        advanceUntilIdle()
        assertThat(vm.state.value.links.links).hasSize(1)
        assertThat(vm.state.value.refreshFailed).isTrue()
    }

    @Test
    fun `une creation reussie passe en tete, ferme la feuille et alimente le cache`() = runTest {
        val api = FakeApi(create = ApiResponse(success = true, data = CreatedTrackingLinkPayload(link("9"))))
        val cache = LinksCache()
        val vm = viewModel(api, cache)
        advanceUntilIdle()

        vm.openCreate()
        vm.editForm { it.copy(destinationUrl = "meeshy.me/promo", name = "Promo") }
        vm.create()
        advanceUntilIdle()

        assertThat(api.created.single().originalUrl).isEqualTo("https://meeshy.me/promo")
        assertThat(vm.state.value.links.links.map { it.id }).containsExactly("9")
        assertThat(vm.state.value.createSheet).isNull()
        assertThat(cache.trackingLinks()?.map { it.id }).containsExactly("9")
    }

    @Test
    fun `une creation refusee affiche l'erreur dans la feuille`() = runTest {
        val vm = viewModel(FakeApi(create = ApiResponse(success = false, error = "Token deja pris")))
        advanceUntilIdle()
        vm.openCreate()
        vm.editForm { it.copy(destinationUrl = "https://a.io") }
        vm.create()
        advanceUntilIdle()

        val sheet = vm.state.value.createSheet
        assertThat(sheet?.error).isNotNull()
        assertThat(sheet?.isCreating).isFalse()
    }

    @Test
    fun `une url invalide ne part pas au reseau`() = runTest {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.openCreate()
        vm.editForm { it.copy(destinationUrl = "") }
        vm.create()
        advanceUntilIdle()
        assertThat(api.created).isEmpty()
    }

    @Test
    fun `au retour sur l'ecran le cache modifie par la fiche fait foi`() = runTest {
        val cache = LinksCache().apply { putTrackingLinks(listOf(link("1"), link("2"))) }
        val vm = viewModel(FakeApi(list = ApiResponse(success = false)), cache)
        advanceUntilIdle()

        cache.putTrackingLinks(listOf(link("2")))
        vm.onResumed()

        assertThat(vm.state.value.links.links.map { it.id }).containsExactly("2")
    }
}
