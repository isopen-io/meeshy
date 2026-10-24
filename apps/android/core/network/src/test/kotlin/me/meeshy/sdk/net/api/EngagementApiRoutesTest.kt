package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.game.engagement.EngagementProgressParser
import org.junit.Test

/** Les deux routes de la progression, telles qu'elles partent — requête capturée derrière le vrai Retrofit. */
class EngagementApiRoutesTest {

    private fun engagement(http: RecordingHttp) = http.serve(EngagementApi::class.java)

    @Test
    fun `lire la progression appelle me engagement et rend une charge lisible`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"counters":[{"axisKey":"future.axis","count":1}],"milestones":[],"streak":{"currentStreakDays":1,"longestStreakDays":2},"level":{"engagementScore":3}}}""",
        )

        val response = engagement(http).progress()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/me/engagement")
        assertThat(EngagementProgressParser.parse(response.data)!!.streak.longestStreakDays).isEqualTo(2)
    }

    @Test
    fun `la frappe poste l identifiant d intention et le prix maximal`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"status":"minted"}}""")

        engagement(http).mintMeesh(MeeshMintRequest(requestId = "req-1", maxPrice = 1221))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/me/meesh/mint")
        assertThat(http.only.body).isEqualTo("""{"requestId":"req-1","maxPrice":1221}""")
    }

    @Test
    fun `sans garde de prix le corps ne porte que l identifiant`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"status":"minted"}}""")

        engagement(http).mintMeesh(MeeshMintRequest(requestId = "req-2"))

        assertThat(http.only.body).isEqualTo("""{"requestId":"req-2"}""")
    }
}
