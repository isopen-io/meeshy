package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityLinkStats
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.CreatedTrackingLinkPayload
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.LinkStatsCard
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ToggleShareLinkRequest
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingLinksPage
import me.meeshy.sdk.net.api.AffiliateApi
import me.meeshy.sdk.net.api.CommunityLinksApi
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.net.api.TrackingLinkApi
import me.meeshy.sdk.sharelink.ShareLinkRepository
import org.junit.Test

class LinkStatsRepositoryTest {

    /** Chaque source attend que les quatre soient en vol : une charge séquentielle ne finirait jamais. */
    private class Rendezvous(private val parties: Int) {
        private val arrived = AtomicInteger(0)
        private val gate = CompletableDeferred<Unit>()
        suspend fun meet() {
            if (arrived.incrementAndGet() == parties) gate.complete(Unit)
            gate.await()
        }
    }

    private class Sources(
        val gate: Rendezvous? = null,
        val trackingFails: Boolean = false,
        val affiliateFails: Boolean = false,
        val shareFails: Boolean = false,
        val communityFails: Boolean = false,
    ) {
        suspend fun <T> serve(fails: Boolean, value: T): ApiResponse<T> {
            gate?.meet()
            if (fails) throw IOException("down")
            return ApiResponse(success = true, data = value)
        }

        val tracking = object : TrackingLinkApi {
            override suspend fun listMine(offset: Int, limit: Int) = serve(false, TrackingLinksPage())
            override suspend fun stats() = serve(trackingFails, TrackingLinkStats(totalLinks = 2, totalClicks = 9))
            override suspend fun create(body: CreateTrackingLinkRequest) = ApiResponse<CreatedTrackingLinkPayload>()
        }
        val affiliate = object : AffiliateApi {
            override suspend fun listTokens(offset: Int, limit: Int) = serve(false, emptyList<AffiliateToken>())
            override suspend fun stats() = serve(affiliateFails, AffiliateStats(totalReferrals = 5))
        }
        val links = object : LinkApi {
            override suspend fun create(body: CreateShareLinkRequest) = ApiResponse<CreateShareLinkResponse>()
            override suspend fun listMyLinks(offset: Int, limit: Int, expand: String?) =
                ApiResponse<List<MyShareLink>>()
            override suspend fun fetchMyStats() = serve(shareFails, MyShareLinkStats(totalLinks = 7, totalUses = 3))
            override suspend fun toggle(linkId: String, body: ToggleShareLinkRequest) = ApiResponse<Unit>()
            override suspend fun delete(linkId: String) = ApiResponse<Unit>()
            override suspend fun extend(linkId: String, body: ExtendShareLinkRequest) = ApiResponse<Unit>()
            override suspend fun update(linkId: String, body: JsonObject) = ApiResponse<Unit>()
        }
        val community = object : CommunityLinksApi {
            override suspend fun mine(role: String) = serve(
                communityFails,
                listOf(
                    CommunityMini(id = "c1", memberCount = 10, isActive = true),
                    CommunityMini(id = "c2", memberCount = 4, isActive = false),
                ),
            )
        }

        fun repository() = LinkStatsRepository(
            tracking = TrackingLinkRepository(tracking),
            affiliate = AffiliateRepository(affiliate),
            share = ShareLinkRepository(links),
            communityApi = community,
        )
    }

    @Test
    fun `load lance les quatre requetes en parallele`() = runTest {
        val snapshot = Sources(gate = Rendezvous(4)).repository().load()

        assertThat(snapshot.tracking).isEqualTo(LinkStatsCard.Loaded(TrackingLinkStats(totalLinks = 2, totalClicks = 9)))
        assertThat(snapshot.affiliate.valueOrNull?.totalReferrals).isEqualTo(5)
        assertThat(snapshot.share.valueOrNull?.totalUses).isEqualTo(3)
        assertThat(snapshot.community).isEqualTo(
            LinkStatsCard.Loaded(CommunityLinkStats(totalCommunities = 2, totalMembers = 14, activeCommunities = 1)),
        )
    }

    @Test
    fun `l'echec d'une carte n'affecte pas les trois autres`() = runTest {
        val snapshot = Sources(affiliateFails = true).repository().load()

        assertThat(snapshot.affiliate).isEqualTo(LinkStatsCard.Unavailable)
        assertThat(snapshot.tracking).isInstanceOf(LinkStatsCard.Loaded::class.java)
        assertThat(snapshot.share).isInstanceOf(LinkStatsCard.Loaded::class.java)
        assertThat(snapshot.community).isInstanceOf(LinkStatsCard.Loaded::class.java)
    }

    @Test
    fun `hors ligne toutes les cartes sont Unavailable sans valeur fabriquee`() = runTest {
        val snapshot = run {
            Sources(trackingFails = true, affiliateFails = true, shareFails = true, communityFails = true)
        }.repository().load()

        assertThat(snapshot.tracking).isEqualTo(LinkStatsCard.Unavailable)
        assertThat(snapshot.affiliate).isEqualTo(LinkStatsCard.Unavailable)
        assertThat(snapshot.share).isEqualTo(LinkStatsCard.Unavailable)
        assertThat(snapshot.community).isEqualTo(LinkStatsCard.Unavailable)
    }
}
