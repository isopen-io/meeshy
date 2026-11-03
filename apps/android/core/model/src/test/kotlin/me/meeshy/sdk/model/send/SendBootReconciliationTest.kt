package me.meeshy.sdk.model.send

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SendBootReconciliationTest {

    private fun plan(rows: List<BootSendRow>, outbox: Map<String, OutboxPresence>) =
        SendBootReconciliation.plan(rows) { outbox[it] ?: OutboxPresence.ABSENT }

    @Test
    fun `a sending bubble without an outbox row becomes failed`() {
        val result = plan(listOf(BootSendRow("cid_a", BootSendState.SENDING)), emptyMap())

        assertThat(result).containsExactly(BootSendTransition("cid_a", BootSendState.FAILED))
    }

    @Test
    fun `a sending bubble whose outbox row is exhausted becomes failed`() {
        val result = plan(listOf(BootSendRow("cid_a", BootSendState.SENDING)), mapOf("cid_a" to OutboxPresence.EXHAUSTED))

        assertThat(result).containsExactly(BootSendTransition("cid_a", BootSendState.FAILED))
    }

    @Test
    fun `a failed bubble whose outbox restarted becomes sending`() {
        val result = plan(listOf(BootSendRow("cid_a", BootSendState.FAILED)), mapOf("cid_a" to OutboxPresence.LIVE))

        assertThat(result).containsExactly(BootSendTransition("cid_a", BootSendState.SENDING))
    }

    @Test
    fun `coherent bubbles are left alone`() {
        val rows = listOf(BootSendRow("cid_a", BootSendState.SENDING), BootSendRow("cid_b", BootSendState.FAILED))
        val outbox = mapOf("cid_a" to OutboxPresence.LIVE, "cid_b" to OutboxPresence.EXHAUSTED)

        assertThat(plan(rows, outbox)).isEmpty()
    }

    @Test
    fun `a failed bubble with no outbox row stays failed and retryable`() {
        assertThat(plan(listOf(BootSendRow("cid_a", BootSendState.FAILED)), emptyMap())).isEmpty()
    }
}
