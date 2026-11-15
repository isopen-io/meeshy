package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class FriendRequestResponseTest {

    private fun failure(status: Int?, message: String = "boom") =
        NetworkResult.Failure(ApiError(message = message, code = null, httpStatus = status))

    @Test
    fun `an applied answer is delivered`() {
        val result = NetworkResult.Success(FriendRequest(id = "r1", status = "accepted"))

        assertThat(FriendRequestResponse.classify(result)).isEqualTo(FriendRequestResponseDelivery.Delivered)
    }

    @Test
    fun `a 404 means the request is gone and is never retried`() {
        assertThat(FriendRequestResponse.classify(failure(404))).isEqualTo(FriendRequestResponseDelivery.Gone)
    }

    @Test
    fun `a 5xx is retried`() {
        assertThat(FriendRequestResponse.classify(failure(503))).isEqualTo(FriendRequestResponseDelivery.Retry)
    }

    @Test
    fun `a failure without status is retried`() {
        assertThat(FriendRequestResponse.classify(failure(null))).isEqualTo(FriendRequestResponseDelivery.Retry)
    }

    @Test
    fun `a throttled call is retried`() {
        assertThat(FriendRequestResponse.classify(failure(429))).isEqualTo(FriendRequestResponseDelivery.Retry)
    }

    @Test
    fun `permanent client errors are rejected with their reason`() {
        listOf(400, 403, 409, 422).forEach { status ->
            assertThat(FriendRequestResponse.classify(failure(status, "nope")))
                .isEqualTo(FriendRequestResponseDelivery.Rejected("nope"))
        }
    }
}
