package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxFlushGateTest {

    @Test
    fun `offline with work owed returns a 60 second deadline`() {
        assertThat(OutboxFlushGate.decide(online = false, hasWork = true)).isEqualTo(FlushGateDecision.RetryLater(60_000L))
    }

    @Test
    fun `online proceeds`() {
        assertThat(OutboxFlushGate.decide(online = true, hasWork = true)).isEqualTo(FlushGateDecision.Proceed)
        assertThat(OutboxFlushGate.decide(online = true, hasWork = false)).isEqualTo(FlushGateDecision.Proceed)
    }

    @Test
    fun `offline with an empty queue wakes nothing`() {
        assertThat(OutboxFlushGate.decide(online = false, hasWork = false)).isEqualTo(FlushGateDecision.Idle)
    }
}
