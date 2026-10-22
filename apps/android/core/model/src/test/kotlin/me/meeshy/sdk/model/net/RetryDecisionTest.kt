package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RetryDecisionTest {

    private val now = 1_700_000_000_000L

    private fun delay(status: Int = 429, attempt: Int = 0, retryAfter: String? = null) =
        RetryDecision.delayMillis(status, attempt, retryAfter, now)

    @Test
    fun `Retry-After entier donne ce nombre de secondes`() {
        assertThat(delay(retryAfter = "7")).isEqualTo(7_000L)
    }

    @Test
    fun `Retry-After date HTTP donne l'ecart avec maintenant`() {
        val header = "Tue, 14 Nov 2023 22:13:30 GMT" // now = 22:13:20 GMT
        assertThat(delay(retryAfter = header)).isEqualTo(10_000L)
    }

    @Test
    fun `Retry-After date passee ne depasse pas zero`() {
        assertThat(delay(retryAfter = "Tue, 14 Nov 2023 22:00:00 GMT")).isEqualTo(0L)
    }

    @Test
    fun `Retry-After absent donne 2 puissance tentative secondes`() {
        assertThat((0..2).map { delay(attempt = it) }).containsExactly(1_000L, 2_000L, 4_000L).inOrder()
    }

    @Test
    fun `Retry-After negatif ou illisible retombe sur le recul exponentiel`() {
        assertThat(delay(attempt = 1, retryAfter = "-5")).isEqualTo(2_000L)
        assertThat(delay(attempt = 2, retryAfter = "bientot")).isEqualTo(4_000L)
    }

    @Test
    fun `Retry-After superieur a 30 s est plafonne`() {
        assertThat(delay(retryAfter = "120")).isEqualTo(30_000L)
    }

    @Test
    fun `la quatrieme reponse ne se rejoue pas`() {
        assertThat(delay(attempt = 3)).isNull()
        assertThat(RetryDecision.shouldRetry(503, 3, EndpointRetryPolicy.STANDARD)).isFalse()
        assertThat(RetryDecision.shouldRetry(503, 2, EndpointRetryPolicy.STANDARD)).isTrue()
    }

    @Test
    fun `seuls 429 et 503 se rejouent`() {
        assertThat(delay(status = 500)).isNull()
        assertThat(RetryDecision.shouldRetry(502, 0, EndpointRetryPolicy.STANDARD)).isFalse()
    }

    @Test
    fun `une politique jamais ne rejoue pas`() {
        assertThat(RetryDecision.shouldRetry(503, 0, EndpointRetryPolicy.NEVER)).isFalse()
    }

    @Test
    fun `un 429 quotidien ou en mode lent ne se rejoue jamais`() {
        listOf("DAILY_COMMENT_LIMIT", "DAILY_REACTION_LIMIT", "NEWCOMER_SLOW_MODE").forEach {
            assertThat(RetryDecision.shouldRetry(429, 0, EndpointRetryPolicy.STANDARD, it)).isFalse()
        }
        assertThat(RetryDecision.shouldRetry(429, 0, EndpointRetryPolicy.STANDARD, "OTHER")).isTrue()
    }
}
