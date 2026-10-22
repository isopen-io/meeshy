package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialEventsDispatchTest {

    private fun stamped(event: SocialEvent) = StampedSocialEvent(event, SocialEventStamp("id-${event.postId}", 1))

    @Test
    fun `les open partent seuls et l'ordre est conserve`() {
        val v1 = stamped(SocialEvent.View("1"))
        val o1 = stamped(SocialEvent.Open("2"))
        val i1 = stamped(SocialEvent.Impression("3", "feed"))
        val o2 = stamped(SocialEvent.Open("4"))
        assertThat(SocialEventsDispatch.requests(listOf(v1, o1, i1, o2))).containsExactly(listOf(v1, i1), listOf(o1, o2)).inOrder()
    }

    @Test
    fun `une requete vide est omise`() {
        val v = stamped(SocialEvent.View("1"))
        val o = stamped(SocialEvent.Open("2"))
        assertThat(SocialEventsDispatch.requests(listOf(v))).containsExactly(listOf(v))
        assertThat(SocialEventsDispatch.requests(listOf(o))).containsExactly(listOf(o))
        assertThat(SocialEventsDispatch.requests(emptyList())).isEmpty()
    }

    @Test
    fun `refus permanents et rejouables`() {
        listOf(400, 401, 403, 404, 422).forEach { assertThat(SocialEventsDispatch.isPermanentRefusal(it)).isTrue() }
        listOf(408, 429, 500, 502, 503).forEach { assertThat(SocialEventsDispatch.isPermanentRefusal(it)).isFalse() }
        assertThat(SocialEventsDispatch.isPermanentRefusal(null)).isFalse()
        assertThat(SocialEventsDispatch.isPermanentRefusal(200, readableBody = false)).isTrue()
        assertThat(SocialEventsDispatch.isPermanentRefusal(200, readableBody = true)).isFalse()
    }

    @Test
    fun `source d'impression d'un detail selon la provenance`() {
        assertThat(ContentEntry.notification.detailImpressionSource).isEqualTo("notification")
        assertThat(ContentEntry.sharedLink.detailImpressionSource).isEqualTo("shared_link")
        assertThat(ContentEntry.trackingLink.detailImpressionSource).isEqualTo("shared_link")
        assertThat(ContentEntry.listing(OpenOrigin.FEED).detailImpressionSource).isEqualTo("detail")
        assertThat(ContentEntry.external.detailImpressionSource).isEqualTo("detail")
        assertThat(ContentEntry.direct.detailImpressionSource).isEqualTo("detail")
    }
}
