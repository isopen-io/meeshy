package me.meeshy.sdk.friend

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FriendConnectionCoordinatorTest {

    private class Rig(scope: CoroutineScope) {
        val cache = FriendshipCache()
        val friends: FriendRepository = mockk(relaxed = true)
        val roster: FriendListRepository = mockk(relaxed = true)
        val requests: FriendRequestListRepository = mockk(relaxed = true)
        val outbox: OutboxRepository = mockk(relaxed = true)
        val outcomes = MutableSharedFlow<OutboxOutcome>(extraBufferCapacity = 16)
        var flushes = 0
        val coordinator: FriendConnectionCoordinator

        init {
            every { outbox.outcomes } returns outcomes
            val flush = OutboxFlushScheduler { flushes++ }
            val controller = ConnectionActionController(cache, friends, outbox, flush, scope)
            coordinator = FriendConnectionCoordinator(cache, friends, roster, requests, outbox, flush, controller, scope)
            cache.didReceiveRequest("alice", "req-1")
            coEvery { friends.enqueueRespondFriendRequest("req-1", "alice", any(), any()) } answers { lastArg() }
        }
    }

    private val alice = FriendRequestUser(id = "alice", username = "alice")

    @Test
    fun `accept befriends at once, injects the friend at the head and wakes the flusher`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)

            rig.coordinator.feedback.test {
                rig.coordinator.accept("alice", alice)?.join()

                assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.Friend)
                coVerify { rig.roster.insertAtHead(alice) }
                coVerify { rig.friends.enqueueRespondFriendRequest("req-1", "alice", true, any()) }
                assertThat(rig.flushes).isEqualTo(1)
                assertThat(awaitItem()).isEqualTo(ConnectionFeedback.ConnectionAccepted)
            }
        }

    @Test
    fun `accept without a profile takes the sender from the cached received requests`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            coEvery { rig.requests.cachedReceived() } returns
                listOf(FriendRequest(id = "req-1", senderId = "alice", sender = alice))

            rig.coordinator.accept("alice")?.join()

            coVerify { rig.roster.insertAtHead(alice) }
        }

    @Test
    fun `reject removes the request at once and queues the refusal`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)

        rig.coordinator.feedback.test {
            rig.coordinator.reject("alice")?.join()

            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.None)
            coVerify { rig.friends.enqueueRespondFriendRequest("req-1", "alice", false, any()) }
            assertThat(rig.flushes).isEqualTo(1)
            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestDeclined)
        }
    }

    @Test
    fun `an exhausted accept restores the request and reports the failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        var cmid = ""
        coEvery { rig.friends.enqueueRespondFriendRequest("req-1", "alice", true, any()) } answers {
            cmid = lastArg()
            cmid
        }

        rig.coordinator.feedback.test {
            rig.coordinator.accept("alice", alice)?.join()
            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.ConnectionAccepted)

            rig.outcomes.emit(OutboxOutcome.Exhausted(cmid, "gone"))

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.AcceptFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-1"))
            coVerify { rig.roster.remove("alice") }
        }
    }

    @Test
    fun `an exhausted reject restores the request and reports the failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        var cmid = ""
        coEvery { rig.friends.enqueueRespondFriendRequest("req-1", "alice", false, any()) } answers {
            cmid = lastArg()
            cmid
        }

        rig.coordinator.feedback.test {
            rig.coordinator.reject("alice")?.join()
            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.RequestDeclined)

            rig.outcomes.emit(OutboxOutcome.Exhausted(cmid, "gone"))

            assertThat(awaitItem()).isEqualTo(ConnectionFeedback.DeclineFailed)
            assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-1"))
        }
    }

    @Test
    fun `offline then online, the friend stays and nothing fails once the row is delivered`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            var cmid = ""
            coEvery { rig.friends.enqueueRespondFriendRequest("req-1", "alice", true, any()) } answers {
                cmid = lastArg()
                cmid
            }

            rig.coordinator.feedback.test {
                rig.coordinator.accept("alice", alice)?.join()
                assertThat(awaitItem()).isEqualTo(ConnectionFeedback.ConnectionAccepted)
                assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.Friend)

                rig.outcomes.emit(OutboxOutcome.Succeeded(cmid))

                expectNoEvents()
                assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.Friend)
            }
        }

    @Test
    fun `a repeated tap while an action is in flight is ignored and the user stays busy`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            val gate = CompletableDeferred<String?>()
            coEvery { rig.friends.enqueueRespondFriendRequest("req-1", "alice", true, any()) } coAnswers { gate.await() }

            val first = rig.coordinator.accept("alice", alice)
            val second = rig.coordinator.accept("alice", alice)

            assertThat(second).isNull()
            assertThat(rig.coordinator.busyUserIds.value).containsExactly("alice")
            gate.complete("cmid-1")
            first?.join()
            assertThat(rig.coordinator.busyUserIds.value).isEmpty()
            coVerify(exactly = 1) { rig.friends.enqueueRespondFriendRequest("req-1", "alice", true, any()) }
        }

    @Test
    fun `a failed local enqueue leaves the request pending and reports the failure`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            coEvery { rig.friends.enqueueRespondFriendRequest("req-1", "alice", true, any()) } throws
                IllegalStateException("disk")

            rig.coordinator.feedback.test {
                rig.coordinator.accept("alice", alice)?.join()

                assertThat(awaitItem()).isEqualTo(ConnectionFeedback.AcceptFailed)
                assertThat(rig.cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("req-1"))
            }
        }

    @Test
    fun `accept without a received request does nothing`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)

        rig.coordinator.accept("bob")?.join()

        coVerify(exactly = 0) { rig.friends.enqueueRespondFriendRequest(any(), any(), any(), any()) }
    }

    @Test
    fun `connect queues the durable send and cancel withdraws a queued one`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        coEvery { rig.friends.enqueueSendFriendRequest("bob", any(), any()) } answers { secondArg() }

        rig.coordinator.connect("bob")?.join()
        assertThat(rig.cache.status("bob")).isInstanceOf(FriendshipStatus.PendingSent::class.java)

        rig.coordinator.cancel("bob")?.join()
        assertThat(rig.cache.status("bob")).isEqualTo(FriendshipStatus.None)
        assertThat(rig.coordinator.busyUserIds.value).isEmpty()
    }
}
