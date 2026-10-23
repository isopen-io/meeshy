package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AffiliateTrackVisitRequest
import me.meeshy.sdk.model.SetTrackingLinkActiveRequest
import me.meeshy.sdk.model.TrackingClickRequest
import me.meeshy.sdk.model.TrackingRedirectStatusRequest
import org.junit.Test

/** Les adresses des communautés, liens, liens de suivi et parrainage, capturées au dernier maillon. */
class CommunityLinkRoutesTest {

    @Test
    fun `les communautes administrees se lisent sur mine avec le role demande`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[{"id":"c1","name":"A","memberCount":3},{"name":"sans id"}]}""")

        val mine = http.serve(CommunityApi::class.java).mine("admin,moderator").data

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/communities/mine")
        assertThat(http.only.queryParameter("role")).isEqualTo("admin,moderator")
        assertThat(mine).hasSize(2)
        assertThat(mine!![0].memberCount).isEqualTo(3)
        assertThat(mine[0].isActive).isTrue()
        assertThat(mine[1].id).isEmpty()
    }

    @Test
    fun `les arrivees d'un lien portent le curseur rendu`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"arrivals":[{"id":"a"}],"nextCursor":""}}""")

        val page = http.serve(LinkDetailApi::class.java).arrivals("l1", limit = 20, cursor = "cur").data

        assertThat(http.only.path).isEqualTo("/api/v1/links/l1/arrivals")
        assertThat(http.only.queryParameter("cursor")).isEqualTo("cur")
        assertThat(page?.arrivals).hasSize(1)
        assertThat(page?.cursorOrNull).isNull()
    }

    @Test
    fun `la carte et les statistiques d'un lien ont leur route`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"visits":4}}""")
        val api = http.serve(LinkDetailApi::class.java)

        api.card("abc")
        api.linkStats("l1")
        api.messages("abc", limit = 10)
        api.checkIdentifier("x")

        assertThat(http.requests.map { it.path }).containsExactly(
            "/api/v1/links/abc/card",
            "/api/v1/links/l1/stats",
            "/api/v1/links/abc/messages",
            "/api/v1/links/check-identifier/x",
        ).inOrder()
    }

    @Test
    fun `le suivi couvre resolution, clic, etat de redirection, desactivation et statistiques`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{}}""")
        val api = http.serve(TrackingLinkTokenApi::class.java)

        api.resolve("t")
        api.click("t", TrackingClickRequest(socialSource = "android-app"))
        api.redirectStatus("t", TrackingRedirectStatusRequest(clickId = "k", status = "confirmed"))
        api.setActive("t", SetTrackingLinkActiveRequest(isActive = false))
        api.deactivate("t")
        api.linkStats("t")
        api.byConversation("c")

        assertThat(http.requests.map { it.method + " " + it.path }).containsExactly(
            "GET /api/v1/tracking-links/t/resolve",
            "POST /api/v1/tracking-links/t/click",
            "POST /api/v1/tracking-links/t/redirect-status",
            "PATCH /api/v1/tracking-links/t",
            "PATCH /api/v1/tracking-links/t/deactivate",
            "GET /api/v1/tracking-links/t/stats",
            "GET /api/v1/tracking-links/conversation/c",
        ).inOrder()
        assertThat(http.requests[1].body).contains("\"socialSource\":\"android-app\"")
        assertThat(http.requests[2].body).contains("\"status\":\"confirmed\"")
    }

    @Test
    fun `le parrainage poste la visite et valide un jeton`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"isValid":true,"token":{"id":"1","token":"t"},"sessionKey":"s"}}""",
        )
        val api = http.serve(AffiliateReferralApi::class.java)

        val visit = api.trackVisit(AffiliateTrackVisitRequest(token = "t")).data
        val validation = api.validate("t").data

        assertThat(http.requests.map { it.method + " " + it.path }).containsExactly(
            "POST /api/v1/affiliate/track-visit",
            "GET /api/v1/affiliate/validate/t",
        ).inOrder()
        assertThat(visit?.sessionKey).isEqualTo("s")
        assertThat(validation?.isValid).isTrue()
        assertThat(validation?.token?.token).isEqualTo("t")
    }

    @Test
    fun `la redirection courte suit l adresse du jeton`() = runTest {
        val http = RecordingHttp(responseBody = "")

        http.serve(RedirectApi::class.java).follow("abc")

        assertThat(http.only.path).isEqualTo("/api/v1/l/abc")
    }
}
