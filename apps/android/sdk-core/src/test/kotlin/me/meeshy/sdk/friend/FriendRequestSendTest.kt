package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class FriendRequestSendTest {

    private fun success(id: String) =
        NetworkResult.Success(FriendRequest(id = id, receiverId = "alice", status = "pending"))

    private fun failure(status: Int?, code: String? = null, message: String = "boom") =
        NetworkResult.Failure(ApiError(message = message, code = code, httpStatus = status))

    @Test
    fun `a delivered request with a real id grafts that id back`() {
        val outcome = FriendRequestSend.classify(success("req-42"))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.Delivered("req-42"))
    }

    @Test
    fun `a success with a blank id is treated as an idempotent already-exists`() {
        val outcome = FriendRequestSend.classify(success("   "))

        // The gateway acknowledged but handed back no usable id — the placeholder
        // stands and a later hydrate reconciles; never retried, never rolled back.
        assertThat(outcome).isEqualTo(FriendRequestDelivery.AlreadyExists)
    }

    @Test
    fun `a 409 conflict is an idempotent already-exists, not a retry`() {
        // The gateway returns 409 when a request already exists between the two
        // users (services/gateway/src/routes/friends.ts). Retrying forever would
        // never clear it; the pending state is already directionally correct.
        val outcome = FriendRequestSend.classify(failure(status = 409, code = "HTTP_409"))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.AlreadyExists)
    }

    @Test
    fun `a 400 bad request is a permanent rejection carrying the reason`() {
        val outcome = FriendRequestSend.classify(failure(status = 400, message = "invalid receiver"))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.Rejected("invalid receiver"))
    }

    @Test
    fun `a 403 forbidden is a permanent rejection`() {
        val outcome = FriendRequestSend.classify(failure(status = 403, message = "blocked"))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.Rejected("blocked"))
    }

    @Test
    fun `a 404 unknown receiver is a permanent rejection`() {
        val outcome = FriendRequestSend.classify(failure(status = 404, message = "no such user"))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.Rejected("no such user"))
    }

    @Test
    fun `a 422 validation error is a permanent rejection`() {
        val outcome = FriendRequestSend.classify(failure(status = 422))

        assertThat(outcome).isInstanceOf(FriendRequestDelivery.Rejected::class.java)
    }

    @Test
    fun `a 5xx server error is a transient retry`() {
        val outcome = FriendRequestSend.classify(failure(status = 503))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.Retry)
    }

    @Test
    fun `an offline network failure with no http status is a transient retry`() {
        val outcome = FriendRequestSend.classify(failure(status = null, code = "NETWORK"))

        assertThat(outcome).isEqualTo(FriendRequestDelivery.Retry)
    }
}
