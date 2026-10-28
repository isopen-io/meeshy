package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.outbox.OutboxOwnerSource
import org.junit.Test

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
}
