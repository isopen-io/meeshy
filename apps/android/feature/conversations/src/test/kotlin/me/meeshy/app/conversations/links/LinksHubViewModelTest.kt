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

    @Test
    fun `les quatre cartes recoivent leurs chiffres depuis les quatre sources`() = runTest {
        val cache = LinksCache()
        val vm = LinksHubViewModel(repository(Sources()), cache)
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
        val vm = LinksHubViewModel(repository(Sources()), LinksCache().apply { putFigures(held) })
        assertThat(LinksHubSummary.figures(LinksHubEntry.SHARE, vm.state.value.figures)?.count).isEqualTo(8)
    }

    @Test
    fun `une source qui echoue garde l'ancien chiffre des autres cartes intact`() = runTest {
        val cache = LinksCache()
        val sources = Sources()
        val first = LinksHubViewModel(repository(sources), cache)
        advanceUntilIdle()
        assertThat(first.state.value.figures.tracking.valueOrNull?.totalClicks).isEqualTo(40)

        sources.tracking = ApiResponse(success = false)
        val second = LinksHubViewModel(repository(sources), cache)
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
        val vm = LinksHubViewModel(repository(off), LinksCache())
        advanceUntilIdle()
        assertThat(LinksHubSummary.isEmpty(vm.state.value.figures)).isTrue()
    }
}
