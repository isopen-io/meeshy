package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.SocialEventStamp
import me.meeshy.sdk.model.analytics.SocialEventsBody
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import org.junit.Test

class SocialEventsApiTest {

    private val receipt = """{"success":true,"data":{"recorded":2,"rejected":0}}"""

    private fun impression(id: String) = StampedSocialEvent(
        SocialEvent.Impression(postId = id, source = "feed", surface = ContentSurface.FEED),
        SocialEventStamp("00000000-0000-4000-8000-00000000000$id", 1_757_928_863_563L),
    )

    @Test
    fun `un lot d impressions part a plat sur social events`() = runTest {
        val http = RecordingHttp(responseBody = receipt)
        val body = SocialEventsBody.of(listOf(impression("1"), impression("2")), 1_757_928_864_000L)

        val result = http.serve(SocialEventsApi::class.java).record(body).data!!

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/social/events")
        assertThat(http.only.body).contains(""""type":"impression"""")
        assertThat(http.only.body).contains(""""postId":"1"""")
        assertThat(http.only.body).contains(""""context":{"sentAt":"2025-09-15T09:34:24.000Z"}""")
        assertThat(result.recorded).isEqualTo(2)
    }

    @Test
    fun `un compte ne presente pas de jeton de session`() = runTest {
        val http = RecordingHttp(responseBody = receipt)

        http.serve(SocialEventsApi::class.java).record(SocialEventsBody.of(listOf(impression("1")), 0L))

        assertThat(http.only.request.header("X-Session-Token")).isNull()
    }

    @Test
    fun `un visiteur presente son jeton de session`() = runTest {
        val http = RecordingHttp(responseBody = receipt)

        http.serve(SocialEventsApi::class.java).record(SocialEventsBody.of(listOf(impression("1")), 0L), "visitor_abc")

        assertThat(http.only.request.header("X-Session-Token")).isEqualTo("visitor_abc")
    }

    @Test
    fun `les tendances demandent une limite`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[{"tag":"paris","usageCount":12}]}""")

        val tags = http.serve(HashtagApi::class.java).trending(limit = 10).data!!

        assertThat(http.only.path).isEqualTo("/api/v1/hashtags/trending")
        assertThat(http.only.queryParameter("limit")).isEqualTo("10")
        assertThat(tags.single().tag).isEqualTo("paris")
    }
}
