package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallAccessoryRequestLedgerTest {

    private class Clock(var now: Long = 0)

    private fun ledger(clock: Clock) = CallAccessoryRequestLedger { clock.now }

    @Test
    fun `an error inside the window is attributed to the request`() {
        val clock = Clock()
        val ledger = ledger(clock).apply { record(CallAccessoryRequest.TurnCredentials, "c1") }

        clock.now = 300
        assertThat(ledger.requestAnsweredBy("c1")).isEqualTo(CallAccessoryRequest.TurnCredentials)
    }

    @Test
    fun `the most recent request wins`() {
        val clock = Clock()
        val ledger = ledger(clock)
        ledger.record(CallAccessoryRequest.TurnCredentials, "c1")
        clock.now = 1_000
        ledger.record(CallAccessoryRequest.Reaction, "c1")

        clock.now = 1_200
        assertThat(ledger.requestAnsweredBy("c1")).isEqualTo(CallAccessoryRequest.Reaction)
    }

    @Test
    fun `outside the window the error stays a generic call error`() {
        val clock = Clock()
        val ledger = ledger(clock).apply { record(CallAccessoryRequest.MediaToggle, "c1") }

        clock.now = CallAccessoryRequestLedger.ATTRIBUTION_WINDOW_MS + 1
        assertThat(ledger.requestAnsweredBy("c1")).isNull()
    }

    @Test
    fun `a request of another call does not answer`() {
        val clock = Clock()
        val ledger = ledger(clock).apply { record(CallAccessoryRequest.Invitation, "c1") }

        assertThat(ledger.requestAnsweredBy("c2")).isNull()
    }

    @Test
    fun `an unnamed error or an unnamed request matches any call`() {
        val clock = Clock()
        val ledger = ledger(clock)
        ledger.record(CallAccessoryRequest.StateQuery, null)
        assertThat(ledger.requestAnsweredBy("c9")).isEqualTo(CallAccessoryRequest.StateQuery)

        ledger.record(CallAccessoryRequest.Recording, "c1")
        assertThat(ledger.requestAnsweredBy(null)).isEqualTo(CallAccessoryRequest.Recording)
    }

    @Test
    fun `nothing recorded means no attribution`() {
        assertThat(ledger(Clock()).requestAnsweredBy("c1")).isNull()
    }
}
