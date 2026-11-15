package me.meeshy.sdk.friend

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.every
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionActionControllerTest {

    private class Rig(scope: CoroutineScope) {
        val cache = FriendshipCache()
        val friends: FriendRepository = mockk(relaxed = true)
        val outbox: OutboxRepository = mockk(relaxed = true)
        val outcomes = MutableSharedFlow<OutboxOutcome>(extraBufferCapacity = 16)
        var flushes = 0
        val controller: ConnectionActionController

        init {
            every { outbox.outcomes } returns outcomes
            controller = ConnectionActionController(cache, friends, outbox, { flushes++ }, scope)
        }
    }

    private fun failure() = NetworkResult.Failure(ApiError(message = "boom", code = null, httpStatus = 500))

    private fun ok() = NetworkResult.Success(FriendRequest(id = "r", status = "accepted"))

    @Test
    fun `send flips to pending at once, queues durably and wakes the flusher`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        coEvery { rig.friends.enqueueSendFriendRequest("alice", any(), any()) } answers { secondArg() }

        rig.controller.feedback.test {
            rig.controller.send("alice")?.join()

            assertThat(rig.cache.status("alice")).isInstanceOf(FriendshipStatus.PendingSent::class.java)
            assertThat(rig.flushes).isEqualTo(1)
            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestSent)
        }
    }

    @Test
    fun `an exhausted queue rolls the pending back and reports the failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        coEvery { rig.friends.enqueueSendFriendRequest("alice", any(), any()) } answers { secondArg() }

        rig.controller.feedback.test {
            rig.controller.send("alice")?.join()
            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestSent)
            val cmid = (rig.cache.status("alice") as FriendshipStatus.PendingSent).requestId

            rig.outcomes.emit(OutboxOutcome.Exhausted(cmid, "gone"))

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestSendFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.None)
        }
    }

    @Test
    fun `a delivered request keeps the pending state and raises no failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        coEvery { rig.friends.enqueueSendFriendRequest("alice", any(), any()) } answers { secondArg() }

        rig.controller.feedback.test {
            rig.controller.send("alice")?.join()
            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestSent)
            val cmid = (rig.cache.status("alice") as FriendshipStatus.PendingSent).requestId

            rig.outcomes.emit(OutboxOutcome.Succeeded(cmid))

            expectNoEvents()
            assertThat(rig.cache.status("alice")).isInstanceOf(FriendshipStatus.PendingSent::class.java)
        }
    }

    @Test
    fun `a failed local enqueue leaves no phantom pending`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        coEvery { rig.friends.enqueueSendFriendRequest("alice", any(), any()) } throws IllegalStateException("disk")

        rig.controller.feedback.test {
            rig.controller.send("alice")?.join()

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestSendFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.None)
        }
    }

    @Test
    fun `a repeated tap while a send is in flight is ignored`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        val gate = CompletableDeferred<String?>()
        coEvery { rig.friends.enqueueSendFriendRequest("alice", any(), any()) } coAnswers { gate.await() }

        val first = rig.controller.send("alice")
        val second = rig.controller.send("alice")

        assertThat(second).isNull()
        assertThat(rig.controller.isBusy("alice")).isTrue()
        gate.complete("cmid-1")
        first?.join()
        assertThat(rig.controller.isBusy("alice")).isFalse()
        coVerify(exactly = 1) { rig.friends.enqueueSendFriendRequest("alice", any(), any()) }
    }

    @Test
    fun `an existing relationship is never re-sent`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.cache.didSendRequest("alice", "r1")

        rig.controller.send("alice")?.join()

        coVerify(exactly = 0) { rig.friends.enqueueSendFriendRequest(any(), any(), any()) }
    }

    @Test
    fun `accept befriends at once and rolls back when the gateway refuses`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.cache.didReceiveRequest("alice", "req-7")
        coEvery { rig.friends.respond("req-7", true) } returns failure()

        rig.controller.feedback.test {
            rig.controller.accept("alice")?.join()

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.AcceptFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-7"))
        }
    }

    @Test
    fun `accept success makes a contact`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.cache.didReceiveRequest("alice", "req-7")
        coEvery { rig.friends.respond("req-7", true) } returns ok()

        rig.controller.feedback.test {
            rig.controller.accept("alice")?.join()

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.ConnectionAccepted)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.Friend)
        }
    }

    @Test
    fun `decline drops the request and restores it on failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.cache.didReceiveRequest("alice", "req-7")
        coEvery { rig.friends.respond("req-7", false) } returns failure()

        rig.controller.feedback.test {
            rig.controller.decline("alice")?.join()

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.DeclineFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-7"))
        }
    }

    @Test
    fun `cancelling a delivered request deletes it, and restores it on failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.cache.didSendRequest("alice", "real-id")
        coEvery { rig.friends.deleteRequest("real-id") } returns failure()

        rig.controller.feedback.test {
            rig.controller.cancel("alice")?.join()

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.CancelFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.PendingSent("real-id"))
        }
    }

    @Test
    fun `cancelling a request still queued offline discards the outbox row without calling the network`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            coEvery { rig.friends.enqueueSendFriendRequest("alice", any(), any()) } answers { secondArg() }
            rig.controller.send("alice")?.join()
            val cmid = (rig.cache.status("alice") as FriendshipStatus.PendingSent).requestId

            rig.controller.feedback.test {
                rig.controller.cancel("alice")?.join()

                assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestCancelled)
                assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.None)
                coVerify { rig.outbox.discard(cmid) }
                coVerify(exactly = 0) { rig.friends.deleteRequest(any()) }
            }
        }
}
