package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationSelfReadLedgerTest {

    @Test
    fun `an own echo inside the window is claimed`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("n1", now = 1_000)

        assertThat(ledger.claimsEcho("n1", now = 1_500)).isTrue()
    }

    @Test
    fun `a claim does not consume the entry so a re-emitted echo is claimed again`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("n1", now = 0)

        assertThat(ledger.claimsEcho("n1", now = 10)).isTrue()
        assertThat(ledger.claimsEcho("n1", now = 20)).isTrue()
    }

    @Test
    fun `the window closes at exactly thirty seconds`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("n1", now = 0)

        assertThat(ledger.claimsEcho("n1", now = 29_999)).isTrue()
        assertThat(ledger.claimsEcho("n1", now = 30_000)).isFalse()
    }

    @Test
    fun `an unknown key is a foreign echo`() {
        assertThat(NotificationSelfReadLedger().claimsEcho("n9", now = 0)).isFalse()
    }

    @Test
    fun `forget makes the next echo foreign again`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("n1", now = 0)

        ledger.forget("n1")

        assertThat(ledger.claimsEcho("n1", now = 1)).isFalse()
    }

    @Test
    fun `registering again restarts the window`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("n1", now = 0)
        ledger.register("n1", now = 25_000)

        assertThat(ledger.claimsEcho("n1", now = 40_000)).isTrue()
    }

    @Test
    fun `a blank key is never registered`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("", now = 0)

        assertThat(ledger.claimsEcho("", now = 1)).isFalse()
    }

    @Test
    fun `clear empties the ledger`() {
        val ledger = NotificationSelfReadLedger()
        ledger.register("n1", now = 0)

        ledger.clear()

        assertThat(ledger.claimsEcho("n1", now = 1)).isFalse()
    }

    @Test
    fun `a custom window is honoured`() {
        val ledger = NotificationSelfReadLedger(windowMillis = 100)
        ledger.register("n1", now = 0)

        assertThat(ledger.claimsEcho("n1", now = 99)).isTrue()
        assertThat(ledger.claimsEcho("n1", now = 100)).isFalse()
    }
}
