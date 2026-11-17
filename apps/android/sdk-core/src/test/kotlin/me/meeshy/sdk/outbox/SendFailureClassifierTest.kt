package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.net.ApiError
import org.junit.Test
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class SendFailureClassifierTest {

    private fun gateway(status: Int, code: String = "REFUSED") = ApiError("refused", code = code, httpStatus = status)

    @Test
    fun `a definitive refusal of the gateway fails at the first attempt`() {
        listOf(400, 403, 404, 410, 413, 415, 422).forEach { status ->
            assertThat(SendFailureClassifier.classify(gateway(status))).isInstanceOf(SendResult.PermanentFailure::class.java)
        }
    }

    @Test
    fun `an expired session is deferred without charging the budget`() {
        assertThat(SendFailureClassifier.classify(gateway(401)))
            .isEqualTo(SendResult.Deferred(SendFailureClassifier.SESSION_EXPIRED_REASON))
    }

    @Test
    fun `a transport failure is its own outcome, never a charged attempt`() {
        assertThat(SendFailureClassifier.classify(ApiError("offline", code = "NETWORK"))).isEqualTo(SendResult.TransportFailure)
        listOf(IOException("reset"), UnknownHostException("dns"), SocketTimeoutException("slow")).forEach {
            assertThat(SendFailureClassifier.classify(it)).isEqualTo(SendResult.TransportFailure)
        }
    }

    @Test
    fun `a throttle, an overload, a server error and a conflict are retried within the budget`() {
        listOf(408, 409, 429, 500, 502, 503, 504).forEach { status ->
            assertThat(SendFailureClassifier.classify(gateway(status))).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `an answer without a status or code is retried`() {
        assertThat(SendFailureClassifier.classify(ApiError("?"))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a daily gesture limit is final until its reset`() {
        assertThat(SendFailureClassifier.classify(gateway(429, "DAILY_REACTION_LIMIT")))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    /** #19047 — an exhausted row keeps its refusal as the reason [SendFailureClassifier.classify] wrote, and only that. */
    @Test
    fun `a refusal that says the target is gone reads back from the reason it left, and no other does`() {
        fun reason(error: ApiError) = (SendFailureClassifier.classify(error) as SendResult.PermanentFailure).reason

        assertThat(SendFailureClassifier.refusedAsGone(reason(gateway(404, "MESSAGE_NOT_FOUND")))).isTrue()
        assertThat(SendFailureClassifier.refusedAsGone(reason(gateway(410, "")))).isTrue()
        listOf(400, 403, 413, 415, 422).forEach { status ->
            assertThat(SendFailureClassifier.refusedAsGone(reason(gateway(status)))).isFalse()
        }
        assertThat(SendFailureClassifier.refusedAsGone(reason(gateway(429, "DAILY_REACTION_LIMIT")))).isFalse()
        listOf(null, "", "refused for good", "Refused: HTTP 4040 X", "Refused: HTTP").forEach {
            assertThat(SendFailureClassifier.refusedAsGone(it)).isFalse()
        }
    }

    @Test
    fun `a status the gateway did not envelope may come from a proxy and is retried, except a too-large body`() {
        assertThat(SendFailureClassifier.classify(ApiError("404 page not found", code = "HTTP_404", httpStatus = 404)))
            .isEqualTo(SendResult.TransientFailure)
        assertThat(SendFailureClassifier.classify(ApiError("too large", code = "HTTP_413", httpStatus = 413)))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
