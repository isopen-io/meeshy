package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import org.junit.Test
import kotlin.time.Duration.Companion.seconds

/** The account boundary every queued write and every send crosses (#13555). Deterministic: one test scheduler. */
class AccountFenceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    @Test
    fun `a write begun before the account closed never commits after it`() = runTest {
        val owner = Owner("A")
        val fence = AccountFence(owner)
        val ticket = fence.ticket()

        fence.close { owner.id = null }
        owner.id = "B"
        var written = false
        val committed = fence.commit(ticket) { written = true }

        assertThat(committed).isNull()
        assertThat(written).isFalse()
        assertThat(fence.isCurrent(ticket)).isFalse()
    }

    @Test
    fun `a write whose owner changed without a close is not current either`() = runTest {
        val owner = Owner("A")
        val fence = AccountFence(owner)
        val ticket = fence.ticket()

        owner.id = "B"

        assertThat(fence.isCurrent(ticket)).isFalse()
        assertThat(fence.commit(ticket) { "written" }).isNull()
    }

    @Test
    fun `closing waits for a commit already writing, then wipes after it`() = runTest {
        val fence = AccountFence(Owner("A"))
        val order = mutableListOf<String>()
        val release = CompletableDeferred<Unit>()
        val ticket = fence.ticket()

        val writing = launch { fence.commit(ticket) { order += "write-start"; release.await(); order += "write-end" } }
        runCurrent()
        val closing = launch { fence.close { order += "wipe" } }
        runCurrent()

        assertThat(order).containsExactly("write-start")
        release.complete(Unit)
        writing.join()
        closing.join()
        assertThat(order).containsExactly("write-start", "write-end", "wipe").inOrder()
    }

    @Test
    fun `closing cancels a send in flight and awaits it before wiping`() = runTest {
        val fence = AccountFence(Owner("A"))
        val order = mutableListOf<String>()
        val ticket = fence.ticket()

        val sending = async {
            fence.guard(ticket) {
                order += "send-start"
                try {
                    awaitCancellation()
                } finally {
                    order += "send-cancelled"
                }
            }
        }
        runCurrent()
        fence.close { order += "wipe" }

        val outcome: Any? = sending.await()
        assertThat(outcome).isNull()
        assertThat(order).containsExactly("send-start", "send-cancelled", "wipe").inOrder()
    }

    @Test
    fun `a send under a closed account never starts`() = runTest {
        val fence = AccountFence(Owner("A"))
        val ticket = fence.ticket()
        fence.close {}
        var started = false

        assertThat(fence.guard(ticket) { started = true }).isNull()
        assertThat(started).isFalse()
    }

    @Test
    fun `a send that completes under its account returns its result`() = runTest {
        val fence = AccountFence(Owner("A"))

        assertThat(fence.guard(fence.ticket()) { "delivered" }).isEqualTo("delivered")
        assertThat(fence.commit(fence.ticket()) { "written" }).isEqualTo("written")
    }

    @Test
    fun `a write nested in another write commits instead of waiting on itself`() = runTest(timeout = DEADLOCK_TIMEOUT) {
        val fence = AccountFence(Owner("A"))
        val ticket = fence.ticket()

        val outcome = fence.commit(ticket) { fence.commit(ticket) { "inner" } }

        assertThat(outcome).isEqualTo("inner")
    }

    @Test
    fun `two writes of the same account land side by side, neither queues behind the other`() = runTest(timeout = DEADLOCK_TIMEOUT) {
        val fence = AccountFence(Owner("A"))
        val slow = CompletableDeferred<Unit>()
        val order = mutableListOf<String>()

        val first = launch { fence.commit(fence.ticket()) { slow.await(); order += "slow" } }
        runCurrent()
        fence.commit(fence.ticket()) { order += "fast" }
        slow.complete(Unit)
        first.join()

        assertThat(order).containsExactly("fast", "slow").inOrder()
    }

    @Test
    fun `a write begun while the wipe runs lands after it, never inside it`() = runTest {
        val owner = Owner("A")
        val fence = AccountFence(owner)
        val order = mutableListOf<String>()
        val wiping = CompletableDeferred<Unit>()

        val closing = launch { fence.close { owner.id = null; order += "wipe-start"; wiping.await(); order += "wipe-end" } }
        runCurrent()
        val writing = launch { fence.commit(fence.ticket()) { order += "write" } }
        runCurrent()
        assertThat(order).containsExactly("wipe-start")

        wiping.complete(Unit)
        closing.join()
        writing.join()
        assertThat(order).containsExactly("wipe-start", "wipe-end", "write").inOrder()
    }

    @Test
    fun `a session that ends, even for the same account id, retires the tickets taken under it`() = runTest {
        val transition = SessionTransitionFlags()
        val fence = AccountFence(Owner("A"), transition)
        val ticket = fence.ticket()

        transition.bumpGeneration()

        assertThat(fence.isCurrent(ticket)).isFalse()
        assertThat(fence.commit(ticket) { "written" }).isNull()
        assertThat(fence.commit(fence.ticket()) { "written" }).isEqualTo("written")
    }

    @Test
    fun `revoking for a new owner cancels the send in flight without a wipe`() = runTest {
        val owner = Owner("A")
        val fence = AccountFence(owner)
        val ticket = fence.ticket()
        var chunksAfterSwitch = 0
        val switched = CompletableDeferred<Unit>()

        val sending = async {
            fence.guard(ticket) {
                switched.await()
                chunksAfterSwitch += 1
                "delivered"
            }
        }
        runCurrent()
        owner.id = "B"
        fence.revoke()
        switched.complete(Unit)

        val outcome: Any? = sending.await()
        assertThat(outcome).isNull()
        assertThat(chunksAfterSwitch).isEqualTo(0)
        assertThat(fence.guard(fence.ticket()) { "delivered" }).isEqualTo("delivered")
    }

    private companion object {
        /** A write that waits on itself or on its neighbour never ends: fail in seconds, not after the default minute. */
        val DEADLOCK_TIMEOUT = 5.seconds
    }
}
