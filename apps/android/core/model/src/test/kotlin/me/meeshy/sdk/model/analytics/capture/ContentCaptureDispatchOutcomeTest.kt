package me.meeshy.sdk.model.analytics.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentCaptureRefusal
import me.meeshy.sdk.model.analytics.capture.ContentCaptureDispatchOutcome.DONE
import me.meeshy.sdk.model.analytics.capture.ContentCaptureDispatchOutcome.DROP
import me.meeshy.sdk.model.analytics.capture.ContentCaptureDispatchOutcome.RETRY
import org.junit.Test

class ContentCaptureDispatchOutcomeTest {

    private fun of(result: Result<List<String>>, attempts: Int = 0, declared: List<String> = listOf("m1", "m2")) =
        ContentCaptureDispatchOutcome.of(result, declared, attempts)

    private fun refused(code: String) = Result.failure<List<String>>(ContentCaptureRefusal(code))

    @Test
    fun `every declared message noticed is done`() {
        assertThat(of(Result.success(listOf("m2", "m1")))).isEqualTo(DONE)
    }

    @Test
    fun `a judged but unnoticed message is retried`() {
        assertThat(of(Result.success(listOf("m1")), attempts = 0)).isEqualTo(RETRY)
        assertThat(of(Result.success(emptyList()), attempts = 1)).isEqualTo(RETRY)
    }

    @Test
    fun `after two attempts an unnoticed message counts as done`() {
        assertThat(of(Result.success(listOf("m1")), attempts = 2)).isEqualTo(DONE)
    }

    @Test
    fun `rate limited is replayed even though it is a final refusal for the transport`() {
        assertThat(of(refused("RATE_LIMITED"), attempts = 9)).isEqualTo(RETRY)
    }

    @Test
    fun `a final refusal drops the row`() {
        listOf("NOT_A_PARTICIPANT", "CONVERSATION_CLOSED", "VALIDATION_ERROR", "UNAUTHENTICATED", "HTTP_404", "HTTP_410", "HTTP_422")
            .forEach { assertThat(of(refused(it))).isEqualTo(DROP) }
    }

    @Test
    fun `an outage is retried`() {
        assertThat(of(refused("NO_SOCKET"))).isEqualTo(RETRY)
        assertThat(of(refused("TIMEOUT"))).isEqualTo(RETRY)
        assertThat(of(Result.failure(java.io.IOException("down")))).isEqualTo(RETRY)
    }
}
