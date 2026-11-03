package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class OutboxResultClassifierTest {

    private fun failure(status: Int?, code: String?, limit: Int? = null, resetAt: Long? = null) =
        NetworkResult.Failure(ApiError("x", code = code, httpStatus = status, limit = limit, resetAtEpochMillis = resetAt))

    private fun verdict(failure: NetworkResult.Failure) = OutboxResultClassifier.toSendResult(failure)

    @Test
    fun `le reseau coupe, un 5xx et un 429 de debit sont transitoires`() {
        assertThat(verdict(failure(null, "NETWORK"))).isEqualTo(SendResult.TransientFailure)
        assertThat(verdict(failure(503, "UNAVAILABLE"))).isEqualTo(SendResult.TransientFailure)
        assertThat(verdict(failure(429, "RATE_LIMITED"))).isEqualTo(SendResult.TransientFailure)
        assertThat(verdict(failure(401, "UNAUTHORIZED"))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `un refus de la passerelle est definitif`() {
        assertThat(verdict(failure(404, "POST_NOT_FOUND"))).isEqualTo(SendResult.PermanentFailure("Refused: HTTP 404 POST_NOT_FOUND"))
        assertThat(verdict(failure(400, "VALIDATION_ERROR"))).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(verdict(failure(422, "AGE_BELOW_MINIMUM"))).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `le meme statut sans enveloppe de la passerelle reste transitoire`() {
        assertThat(verdict(failure(404, "HTTP_404"))).isEqualTo(SendResult.TransientFailure)
        assertThat(verdict(failure(400, null))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `une limite du jour est definitive et porte son heure et son plafond`() {
        val result = verdict(failure(429, "DAILY_COMMENT_LIMIT", limit = 50, resetAt = 1_793_743_200_000L))
        val reason = (result as SendResult.PermanentFailure).reason
        assertThat(DailyGestureLimit.fromReason(reason))
            .isEqualTo(DailyGestureLimit(DailyGestureLimit.Gesture.COMMENT, 1_793_743_200_000L, 50))
    }

    @Test
    fun `le mode lent n'est pas definitif, il se rejoue apres son delai`() {
        assertThat(verdict(failure(429, "NEWCOMER_SLOW_MODE"))).isEqualTo(SendResult.TransientFailure)
    }
}
