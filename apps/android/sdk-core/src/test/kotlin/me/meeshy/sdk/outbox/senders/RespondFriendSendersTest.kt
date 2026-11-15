package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.FriendRespondPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test

class RespondFriendSendersTest {

    private val friends = mockk<FriendRepository>()
    private val roster = mockk<FriendListRepository>(relaxed = true)

    private fun row(action: String) = outboxRow(
        OutboxKind.RESPOND_FRIEND_REQUEST,
        targetId = "req-1",
        payload = senderJson.encodeToString(FriendRespondPayload(action, "alice")),
    )

    private fun failure(status: Int?) = NetworkResult.Failure(ApiError("boom", null, status))

    @Test
    fun `an accept is delivered through respond and succeeds`() = runTest {
        coEvery { friends.respond("req-1", true) } returns NetworkResult.Success(FriendRequest(id = "req-1"))

        val result = RespondFriendRequestHandler(friends, FriendshipCache(), roster, senderJson).send(row("accept"))

        assertThat(result).isEqualTo(SendResult.Success)
    }

    @Test
    fun `a reject is delivered as a refusal`() = runTest {
        coEvery { friends.respond("req-1", false) } returns NetworkResult.Success(FriendRequest(id = "req-1"))

        RespondFriendRequestHandler(friends, FriendshipCache(), roster, senderJson).send(row("reject"))

        coVerify { friends.respond("req-1", false) }
    }

    @Test
    fun `a vanished request is dropped without retry and the injected friend is removed`() = runTest {
        val cache = FriendshipCache().apply { didReceiveRequest("alice", "req-1"); didAcceptRequest("alice") }
        coEvery { friends.respond("req-1", true) } returns failure(404)

        val result = RespondFriendRequestHandler(friends, cache, roster, senderJson).send(row("accept"))

        assertThat(result).isEqualTo(SendResult.Success)
        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.None)
        coVerify { roster.remove("alice") }
    }

    @Test
    fun `a server error is retried and a permanent one is final`() = runTest {
        val handler = RespondFriendRequestHandler(friends, FriendshipCache(), roster, senderJson)

        coEvery { friends.respond("req-1", true) } returns failure(503)
        assertThat(handler.send(row("accept"))).isEqualTo(SendResult.TransientFailure)

        coEvery { friends.respond("req-1", true) } returns failure(403)
        assertThat(handler.send(row("accept"))).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `an undecodable payload is a permanent failure`() = runTest {
        val bad = outboxRow(OutboxKind.RESPOND_FRIEND_REQUEST, targetId = "req-1", payload = "{}")

        val result = RespondFriendRequestHandler(friends, FriendshipCache(), roster, senderJson).send(bad)

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `an exhausted accept restores the pending request and removes the friend`() = runTest {
        val cache = FriendshipCache().apply { didReceiveRequest("alice", "req-1"); didAcceptRequest("alice") }

        RespondFriendRequestHandler(friends, cache, roster, senderJson).onExhausted(row("accept"))

        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-1"))
        coVerify { roster.remove("alice") }
    }

    @Test
    fun `an exhausted reject restores the pending request`() = runTest {
        val cache = FriendshipCache().apply { didReceiveRequest("alice", "req-1"); didRejectRequest("alice") }

        RespondFriendRequestHandler(friends, cache, roster, senderJson).onExhausted(row("reject"))

        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-1"))
    }
}
