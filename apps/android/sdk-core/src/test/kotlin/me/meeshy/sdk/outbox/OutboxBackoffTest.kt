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
}
