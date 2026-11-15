package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.CreatedTrackingLinkPayload
import me.meeshy.sdk.model.LinkStatsCard
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingLinksPage
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TrackingLinkApi
import org.junit.Test

class LinksCacheTest {

    @Test
    fun `le cache rend ce qui a ete pose et se vide a la deconnexion`() = runTest {
        val cache = LinksCache()
        assertThat(cache.trackingLinks()).isNull()

        cache.putTrackingLinks(listOf(TrackingLink(id = "1", token = "a")))
        cache.putAffiliateTokens(listOf(AffiliateToken(id = "2", token = "b", name = "n")))
        cache.putCommunityLinks(listOf(CommunityLink(id = "3")))
        cache.putFigures(LinkStatsSnapshot(share = LinkStatsCard.Loaded(MyShareLinkStats(totalLinks = 2))))
        assertThat(cache.trackingLinks()?.single()?.token).isEqualTo("a")
        assertThat(cache.affiliateTokens()).hasSize(1)
        assertThat(cache.communityLinks()).hasSize(1)
        assertThat(cache.figures()?.share?.valueOrNull?.totalLinks).isEqualTo(2)

        cache.clear()

        assertThat(cache.trackingLinks()).isNull()
        assertThat(cache.affiliateTokens()).isNull()
        assertThat(cache.communityLinks()).isNull()
        assertThat(cache.figures()).isNull()
    }

    @Test
    fun `chaque ecran n'efface pas la lecture des autres`() {
        val cache = LinksCache()
        cache.putTrackingLinks(listOf(TrackingLink(id = "1", token = "a")))
        cache.putCommunityLinks(emptyList())
        assertThat(cache.trackingLinks()).hasSize(1)
        assertThat(cache.affiliateTokens()).isNull()
    }

    private class FakeApi(var created: CreatedTrackingLinkPayload?) : TrackingLinkApi {
        override suspend fun listMine(offset: Int, limit: Int) = ApiResponse<TrackingLinksPage>(success = false)
        override suspend fun stats() = ApiResponse<TrackingLinkStats>(success = false)
        override suspend fun create(body: CreateTrackingLinkRequest) = ApiResponse(success = created != null, data = created)
    }

    @Test
    fun `createLink rend le lien enveloppe et refuse une charge sans lien`() = runTest {
        val ok = TrackingLinkRepository(FakeApi(CreatedTrackingLinkPayload(TrackingLink(id = "1", token = "tok"))))
            .createLink(CreateTrackingLinkRequest(originalUrl = "https://a.io"))
        assertThat((ok as NetworkResult.Success).data.token).isEqualTo("tok")

        val legacy = TrackingLinkRepository(FakeApi(CreatedTrackingLinkPayload(shortUrl = "https://meeshy.me/l/x")))
            .createLink(CreateTrackingLinkRequest(originalUrl = "https://a.io"))
        assertThat(legacy).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
