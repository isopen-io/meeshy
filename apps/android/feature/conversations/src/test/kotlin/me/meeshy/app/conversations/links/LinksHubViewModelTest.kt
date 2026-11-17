package me.meeshy.app.conversations.links

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.link.AffiliateRepository
import me.meeshy.sdk.link.LinkStatsRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.link.TrackingLinkRepository
import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.CreatedTrackingLinkPayload
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.LinkStatsCard
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ToggleShareLinkRequest
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingLinksPage
import me.meeshy.sdk.model.links.LinksHubEntry
import me.meeshy.sdk.model.links.LinksHubFigures
import me.meeshy.sdk.model.links.LinksHubSummary
import me.meeshy.sdk.net.api.AffiliateApi
import me.meeshy.sdk.net.api.CommunityLinksApi
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.net.api.TrackingLinkApi
import me.meeshy.sdk.sharelink.ShareLinkRepository
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.profile.MyAddressWire
import me.meeshy.sdk.model.profile.MyAddressesPayload
import me.meeshy.sdk.net.api.MyAddressesApi
import me.meeshy.sdk.profile.MyAddressesRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LinksHubViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class Sources(
        var tracking: ApiResponse<TrackingLinkStats> = ApiResponse(success = true, data = TrackingLinkStats(totalLinks = 3, totalClicks = 40)),
        var affiliate: ApiResponse<AffiliateStats> = ApiResponse(success = true, data = AffiliateStats(totalTokens = 2, totalReferrals = 7)),
        var share: ApiResponse<MyShareLinkStats> = ApiResponse(success = true, data = MyShareLinkStats(totalLinks = 5, totalUses = 12)),
        var community: ApiResponse<List<CommunityMini>> = ApiResponse(success = true, data = listOf(CommunityMini(id = "1", memberCount = 9))),
    )

    private fun repository(sources: Sources) = LinkStatsRepository(
        tracking = TrackingLinkRepository(object : TrackingLinkApi {
            override suspend fun listMine(offset: Int, limit: Int) = ApiResponse<TrackingLinksPage>(success = false)
            override suspend fun stats() = sources.tracking
            override suspend fun create(body: CreateTrackingLinkRequest) = ApiResponse<CreatedTrackingLinkPayload>(success = false)
        }),
        affiliate = AffiliateRepository(object : AffiliateApi {
            override suspend fun listTokens(offset: Int, limit: Int) = ApiResponse<List<AffiliateToken>>(success = false)
            override suspend fun stats() = sources.affiliate
        }),
        share = ShareLinkRepository(object : LinkApi {
            override suspend fun create(body: CreateShareLinkRequest) = ApiResponse<CreateShareLinkResponse>(success = false)
            override suspend fun listMyLinks(offset: Int, limit: Int, expand: String?) = ApiResponse<List<MyShareLink>>(success = false)
            override suspend fun fetchMyStats() = sources.share
            override suspend fun toggle(linkId: String, body: ToggleShareLinkRequest) = ApiResponse<Unit>(success = false)
            override suspend fun delete(linkId: String) = ApiResponse<Unit>(success = false)
            override suspend fun extend(linkId: String, body: ExtendShareLinkRequest) = ApiResponse<Unit>(success = false)
            override suspend fun update(linkId: String, body: JsonObject) = ApiResponse<Unit>(success = false)
        }),
        communityApi = object : CommunityLinksApi {
            override suspend fun mine(role: String) = sources.community
        },
    )

    private class Addresses(var answer: () -> ApiResponse<MyAddressesPayload>) : MyAddressesApi {
        override suspend fun list() = answer()
    }

    private val site = MyAddressWire(id = "a", title = "Site", url = "https://aissandiaye.studio", glyph = "site", position = 0)

    private fun addresses(answer: () -> ApiResponse<MyAddressesPayload> = { ApiResponse(success = true, data = MyAddressesPayload(listOf(site))) }) =
        MyAddressesRepository(Addresses(answer))

    private fun user(username: String?) = username?.let { MeeshyUser(id = "u1", username = it) }

    private fun session(username: String? = "aissa") = session(MutableStateFlow(user(username)))

    private fun session(current: MutableStateFlow<MeeshyUser?>) = mockk<SessionRepository> {
        every { currentUser } returns current
    }

    private fun hub(
        sources: Sources = Sources(),
        cache: LinksCache = LinksCache(),
        addresses: MyAddressesRepository = addresses(),
        session: SessionRepository = session(),
    ) = LinksHubViewModel(repository(sources), cache, addresses, session)

    @Test
    fun `mon lien de profil est la des le premier instant, sans attendre le reseau`() = runTest {
        val vm = hub()

        assertThat(vm.state.value.profileLink?.webLink).isEqualTo("https://meeshy.me/u/aissa")
    }

    @Test
    fun `mon lien de profil suit la session sans attendre un rechargement`() = runTest {
        val current = MutableStateFlow(user(null))
        val vm = hub(session = session(current))
        advanceUntilIdle()
        assertThat(vm.state.value.profileLink).isNull()

        current.value = user("aissa")
        advanceUntilIdle()
        assertThat(vm.state.value.profileLink?.webLink).isEqualTo("https://meeshy.me/u/aissa")

        current.value = user("aissandiaye")
        advanceUntilIdle()
        assertThat(vm.state.value.profileLink?.webLink).isEqualTo("https://meeshy.me/u/aissandiaye")
    }

    @Test
    fun `sans pseudo partageable le billet du lien de profil n'existe pas`() = runTest {
        assertThat(hub(session = session(username = null)).state.value.profileLink).isNull()
    }

    @Test
    fun `mes adresses arrivent avec le serveur et la section reste vide quand il ne les sert pas`() = runTest {
        val served = hub()
        advanceUntilIdle()
        assertThat(served.state.value.addresses.map { it.id }).containsExactly("a")

        val absent = hub(addresses = addresses { ApiResponse(success = true, data = MyAddressesPayload()) })
        advanceUntilIdle()
        assertThat(absent.state.value.addresses).isEmpty()
    }

    @Test
    fun `les adresses du cache sont peintes au premier instant et un echec les garde`() = runTest {
        val api = Addresses { ApiResponse(success = true, data = MyAddressesPayload(listOf(site))) }
        val repository = MyAddressesRepository(api)
        repository.refresh()
        api.answer = { throw java.io.IOException("offline") }

        val vm = hub(addresses = repository)
        assertThat(vm.state.value.addresses.map { it.id }).containsExactly("a")
        advanceUntilIdle()
        assertThat(vm.state.value.addresses.map { it.id }).containsExactly("a")
    }

    @Test
    fun `les quatre cartes recoivent leurs chiffres depuis les quatre sources`() = runTest {
        val cache = LinksCache()
        val vm = hub(cache = cache)
        assertThat(vm.state.value.isRefreshing).isTrue()
        advanceUntilIdle()

        val figures = vm.state.value.figures
        assertThat(LinksHubSummary.figures(LinksHubEntry.SHARE, figures)).isEqualTo(LinksHubFigures(5, 12))
        assertThat(LinksHubSummary.figures(LinksHubEntry.TRACKING, figures)).isEqualTo(LinksHubFigures(3, 40))
        assertThat(LinksHubSummary.figures(LinksHubEntry.COMMUNITY, figures)).isEqualTo(LinksHubFigures(1, 9))
        assertThat(LinksHubSummary.figures(LinksHubEntry.AFFILIATE, figures)).isEqualTo(LinksHubFigures(2, 7))
        assertThat(vm.state.value.isRefreshing).isFalse()
        assertThat(cache.figures()).isEqualTo(figures)
    }

    @Test
    fun `un cache existant est peint au premier instant`() = runTest {
        val held = LinkStatsSnapshot(share = LinkStatsCard.Loaded(MyShareLinkStats(totalLinks = 8)))
        val vm = hub(cache = LinksCache().apply { putFigures(held) })
        assertThat(LinksHubSummary.figures(LinksHubEntry.SHARE, vm.state.value.figures)?.count).isEqualTo(8)
    }

    @Test
    fun `une source qui echoue garde l'ancien chiffre des autres cartes intact`() = runTest {
        val cache = LinksCache()
        val sources = Sources()
        val first = hub(sources = sources, cache = cache)
        advanceUntilIdle()
        assertThat(first.state.value.figures.tracking.valueOrNull?.totalClicks).isEqualTo(40)

        sources.tracking = ApiResponse(success = false)
        val second = hub(sources = sources, cache = cache)
        advanceUntilIdle()

        assertThat(second.state.value.figures.tracking.valueOrNull?.totalClicks).isEqualTo(40)
        assertThat(second.state.value.figures.share.valueOrNull?.totalUses).isEqualTo(12)
    }

    @Test
    fun `hors ligne et sans cache aucun chiffre n'est invente`() = runTest {
        val off = Sources(
            tracking = ApiResponse(success = false), affiliate = ApiResponse(success = false),
            share = ApiResponse(success = false), community = ApiResponse(success = false),
        )
        val vm = hub(sources = off)
        advanceUntilIdle()
        assertThat(LinksHubSummary.isEmpty(vm.state.value.figures)).isTrue()
    }
}
