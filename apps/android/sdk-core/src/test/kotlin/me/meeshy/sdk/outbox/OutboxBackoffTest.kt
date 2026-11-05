package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxBackoffTest {

    @Test
    fun `the delay doubles from 2 seconds and is capped at 30`() {
        val delays = (1..8).map { OutboxBackoff.delayMs(it, jitterSample = 0.0) }

        assertThat(delays).containsExactly(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L, 30_000L, 30_000L).inOrder()
    }

    @Test
    fun `the injected jitter adds at most half a second`() {
        assertThat(OutboxBackoff.delayMs(1, jitterSample = 1.0)).isEqualTo(2_500L)
        assertThat(OutboxBackoff.delayMs(1, jitterSample = 0.5)).isEqualTo(2_250L)
        assertThat(OutboxBackoff.delayMs(1, jitterSample = 9.0)).isEqualTo(2_500L)
    }

    @Test
    fun `an absurd failure count neither overflows nor exceeds the cap`() {
        assertThat(OutboxBackoff.delayMs(10_000, jitterSample = 0.0)).isEqualTo(30_000L)
        assertThat(OutboxBackoff.delayMs(0, jitterSample = 0.0)).isEqualTo(2_000L)
    }

    @Test
    fun `a conversation removal waits 5 seconds doubled per failure and capped at 60`() {
        val delays = listOf(OutboxKind.LEAVE_CONVERSATION, OutboxKind.DELETE_CONVERSATION_FOR_ME, OutboxKind.DELETE_CONVERSATION_FOR_ALL)
            .map { kind -> (1..7).map { OutboxBackoff.delayMs(kind, it, jitterSample = 0.0) } }

        delays.forEach {
            assertThat(it).containsExactly(5_000L, 10_000L, 20_000L, 40_000L, 60_000L, 60_000L, 60_000L).inOrder()
        }
    }

    @Test
    fun `a removal backoff survives an absurd failure count and carries the usual jitter`() {
        assertThat(OutboxBackoff.delayMs(OutboxKind.LEAVE_CONVERSATION, 10_000, jitterSample = 0.0)).isEqualTo(60_000L)
        assertThat(OutboxBackoff.delayMs(OutboxKind.LEAVE_CONVERSATION, 1, jitterSample = 1.0)).isEqualTo(5_500L)
    }

    @Test
    fun `any other kind keeps the general 2 to 30 second cadence`() {
        assertThat((1..6).map { OutboxBackoff.delayMs(OutboxKind.ADD_REACTION, it, jitterSample = 0.0) })
            .containsExactly(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L).inOrder()
    }
}
