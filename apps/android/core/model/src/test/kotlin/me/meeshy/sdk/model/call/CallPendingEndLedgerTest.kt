package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPendingEndLedgerTest {

    private fun armed(vararg ends: Pair<String, String?>): CallPendingEndLedger =
        ends.fold(CallPendingEndLedger()) { ledger, (id, reason) -> ledger.arm(id, reason) }

    @Test
    fun `drain replays every call in arming order`() {
        val (entries, rest) = armed("a" to null, "b" to "rejected", "c" to null).drain()

        assertThat(entries.map { it.callId }).containsExactly("a", "b", "c").inOrder()
        assertThat(rest.isEmpty).isTrue()
    }

    @Test
    fun `arming the same call twice keeps one entry so the replay is emitted once`() {
        val (entries, _) = armed("a" to null, "a" to null).drain()

        assertThat(entries).containsExactly(CallPendingEnd("a", null))
    }

    @Test
    fun `re-arming one call never drops another call's entry`() {
        val (entries, _) = armed("a" to null, "b" to null, "a" to null).drain()

        assertThat(entries.map { it.callId }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `a decline is never downgraded to a plain end`() {
        val (entries, _) = armed("a" to "rejected", "a" to null).drain()

        assertThat(entries.single().reason).isEqualTo("rejected")
    }

    @Test
    fun `a call is abandoned after the fourth arming, even across drains`() {
        var ledger = CallPendingEndLedger()
        repeat(CallPendingEndLedger.MAX_ARMINGS) { ledger = ledger.arm("a", null).drain().second }

        ledger = ledger.arm("a", null)

        assertThat(ledger.isEmpty).isTrue()
    }

    @Test
    fun `the ledger is bounded and evicts the oldest call first`() {
        val ledger = (1..CallPendingEndLedger.CAPACITY + 3).fold(CallPendingEndLedger()) { l, i -> l.arm("call$i", null) }

        val (entries, _) = ledger.drain()

        assertThat(entries).hasSize(CallPendingEndLedger.CAPACITY)
        assertThat(entries.first().callId).isEqualTo("call4")
        assertThat(entries.last().callId).isEqualTo("call${CallPendingEndLedger.CAPACITY + 3}")
    }

    @Test
    fun `a blank call id is ignored`() {
        assertThat(CallPendingEndLedger().arm(" ", null).isEmpty).isTrue()
    }
}
