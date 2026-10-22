package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockActionResponse
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.outbox.FriendRequestPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.IOException

class FriendBlockSendersTest {

    private val blockApi = mockk<BlockApi>()
    private val friendRepository = mockk<FriendRepository>()
    private val blockRepository = BlockRepository(blockApi, BlockCache(), mockk<OutboxRepository>(relaxed = true))

    @Test
    fun `block user maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = BlockUserHandler(blockRepository, BlockCache())
        val row = outboxRow(OutboxKind.BLOCK_USER, targetId = "u1")

        coEvery { blockApi.block("u1") } returns accepted(BlockActionResponse())
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { blockApi.block("u1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { blockApi.block("u1") } throws IOException("offline")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `unblock user maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = UnblockUserHandler(blockApi, BlockCache())
        val row = outboxRow(OutboxKind.UNBLOCK_USER, targetId = "u1")

        coEvery { blockApi.unblock("u1") } returns accepted(BlockActionResponse())
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { blockApi.unblock("u1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    private fun friendHandler(cache: FriendshipCache) =
        SendFriendRequestHandler(friendRepository, cache, senderJson)

    private fun friendRow(message: String? = "salut") = outboxRow(
        OutboxKind.SEND_FRIEND_REQUEST,
        targetId = "u1",
        payload = encodedPayload(FriendRequestPayload(message)),
    )

    @Test
    fun `a delivered friend request grafts the real request id over the placeholder`() = runTest {
        val cache = FriendshipCache().apply { didSendRequest("u1", "cmid-1") }
        coEvery { friendRepository.sendFriendRequest("u1", "salut") } returns
            NetworkResult.Success(FriendRequest(id = "req-9"))

        val result = friendHandler(cache).send(friendRow())

        assertThat(result).isEqualTo(SendResult.Success)
        assertThat(cache.status("u1")).isEqualTo(FriendshipStatus.PendingSent("req-9"))
    }

    @Test
    fun `a request the gateway already holds is an idempotent success that leaves the cache alone`() = runTest {
        val cache = FriendshipCache().apply { didSendRequest("u1", "cmid-1") }
        coEvery { friendRepository.sendFriendRequest("u1", "salut") } returns
            NetworkResult.Failure(ApiError("exists", httpStatus = 409))

        val result = friendHandler(cache).send(friendRow())

        assertThat(result).isEqualTo(SendResult.Success)
        assertThat(cache.status("u1")).isEqualTo(FriendshipStatus.PendingSent("cmid-1"))
    }

    @Test
    fun `a request refused with a client error is a permanent failure carrying the reason`() = runTest {
        val cache = FriendshipCache()
        coEvery { friendRepository.sendFriendRequest("u1", "salut") } returns
            NetworkResult.Failure(ApiError("receiver not found", httpStatus = 404))

        val result = friendHandler(cache).send(friendRow())

        assertThat(result).isEqualTo(SendResult.PermanentFailure("receiver not found"))
    }

    @Test
    fun `a request that fails on the network or the server stays retryable`() = runTest {
        val cache = FriendshipCache()
        coEvery { friendRepository.sendFriendRequest("u1", "salut") } returns
            NetworkResult.Failure(ApiError("boom", httpStatus = 503))

        assertThat(friendHandler(cache).send(friendRow())).isEqualTo(SendResult.TransientFailure)

        coEvery { friendRepository.sendFriendRequest("u1", "salut") } returns
            NetworkResult.Failure(ApiError("offline", code = "NETWORK"))

        assertThat(friendHandler(cache).send(friendRow())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a friend request with an undecodable payload fails permanently`() = runTest {
        val result = friendHandler(FriendshipCache())
            .send(outboxRow(OutboxKind.SEND_FRIEND_REQUEST, targetId = "u1", payload = "["))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
