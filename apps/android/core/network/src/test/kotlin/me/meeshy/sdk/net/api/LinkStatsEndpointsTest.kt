package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import org.junit.Test

/** Les adresses du tableau « MES LIENS », capturées au dernier maillon et décodées par le vrai `Json`. */
class LinkStatsEndpointsTest {

    @Test
    fun `les liens de suivi se listent sur user-me avec la page demandee`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"trackingLinks":[{"id":"t1","token":"abc"}]}}""")

        val page = http.serve(TrackingLinkApi::class.java).listMine(offset = 10, limit = 5).data

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/tracking-links/user/me")
        assertThat(http.only.queryParameter("offset")).isEqualTo("10")
        assertThat(http.only.queryParameter("limit")).isEqualTo("5")
        assertThat(page?.trackingLinks?.single()?.token).isEqualTo("abc")
    }

    @Test
    fun `les chiffres de suivi se lisent sur tracking-links-stats`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"totalLinks":3,"totalClicks":8}}""")

        val stats = http.serve(TrackingLinkApi::class.java).stats().data

        assertThat(http.only.path).isEqualTo("/api/v1/tracking-links/stats")
        assertThat(stats?.totalClicks).isEqualTo(8)
    }

    @Test
    fun `la creation poste sur tracking-links et lit le lien enveloppe`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"trackingLink":{"id":"t","shortUrl":"https://meeshy.me/l/x"},"existed":true}}""",
        )

        val created = http.serve(TrackingLinkApi::class.java)
            .create(CreateTrackingLinkRequest(originalUrl = "https://example.com", campaign = "c")).data

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/tracking-links")
        assertThat(http.only.body).contains("\"originalUrl\":\"https://example.com\"")
        assertThat(created?.resolvedShortUrl).isEqualTo("https://meeshy.me/l/x")
        assertThat(created?.existed).isTrue()
    }

    @Test
    fun `le parrainage lit jetons et chiffres sur affiliate`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[]}""")
        val api = http.serve(AffiliateApi::class.java)

        api.listTokens(offset = 0, limit = 50)

        assertThat(http.only.path).isEqualTo("/api/v1/affiliate/tokens")
        assertThat(http.only.queryParameter("limit")).isEqualTo("50")
    }

    @Test
    fun `les chiffres de parrainage se lisent sur affiliate-stats`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"totalReferrals":2}}""")

        val stats = http.serve(AffiliateApi::class.java).stats().data

        assertThat(http.only.path).isEqualTo("/api/v1/affiliate/stats")
        assertThat(stats?.totalReferrals).isEqualTo(2)
    }

    @Test
    fun `les communautes administrees se lisent sur communities-mine avec leurs roles`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[{"id":"c","memberCount":3}]}""")

        val mine = http.serve(CommunityLinksApi::class.java).mine("admin,moderator").data

        assertThat(http.only.path).isEqualTo("/api/v1/communities/mine")
        assertThat(http.only.queryParameter("role")).isEqualTo("admin,moderator")
        assertThat(mine?.single()?.memberCount).isEqualTo(3)
    }
}
