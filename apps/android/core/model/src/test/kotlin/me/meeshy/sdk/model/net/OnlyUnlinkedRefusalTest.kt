package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OnlyUnlinkedRefusalTest {

    @Test
    fun `the refusal written on an outbox row reads back with its numbers`() {
        val refusal = OnlyUnlinkedRefusal(limit = 50, unlinked = 3)

        assertThat(OnlyUnlinkedRefusal.parse(refusal.reason)).isEqualTo(refusal)
    }

    @Test
    fun `a refusal whose numbers the gateway did not give still reads as this refusal`() {
        assertThat(OnlyUnlinkedRefusal.parse("ONLY_UNLINKED_RECIPIENTS_LIMIT")).isEqualTo(OnlyUnlinkedRefusal(null, null))
    }

    @Test
    fun `any other failure is not this refusal`() {
        assertThat(OnlyUnlinkedRefusal.parse("Post refused: HTTP 429")).isNull()
        assertThat(OnlyUnlinkedRefusal.parse(null)).isNull()
    }

    @Test
    fun `it is never replayed by the http pipeline`() {
        assertThat(RetryDecision.shouldRetry(429, attempt = 0, policy = EndpointRetryPolicy.STANDARD, refusalCode = OnlyUnlinkedRefusal.CODE))
            .isFalse()
    }
}
