package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class SocialEventsBodyTest {

    private val networkJson = Json { encodeDefaults = false; ignoreUnknownKeys = true }
    private val event = StampedSocialEvent(SocialEvent.Open("p1", OpenOrigin.FEED), SocialEventStamp("e1", 1_757_928_863_563L))

    @Test
    fun `corps sans consentement`() {
        val body = SocialEventsBody.of(listOf(event), 1_757_928_864_000L)
        assertThat(networkJson.encodeToString(SocialEventsBody.serializer(), body)).isEqualTo(
            """{"events":[{"type":"open","postId":"p1","origin":"feed","eventId":"e1","occurredAt":"2025-09-15T09:34:23.563Z"}],""" +
                """"context":{"sentAt":"2025-09-15T09:34:24.000Z"}}""",
        )
    }

    @Test
    fun `corps avec consentement`() {
        val body = SocialEventsBody.of(listOf(event), 1_757_928_864_000L, SocialEventsBody.Consent.denied)
        assertThat(networkJson.encodeToString(SocialEventsBody.serializer(), body))
            .contains(""""context":{"sentAt":"2025-09-15T09:34:24.000Z","consent":"denied"}""")
    }
}
