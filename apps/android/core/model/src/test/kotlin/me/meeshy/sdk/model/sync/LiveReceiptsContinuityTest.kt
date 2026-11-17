package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #19049 — under `live-receipts`, a 304 of the message window says nothing of its receipt counters: the socket keeps
 * them. A thread may send its validator only while the socket stayed connected since the thread's last FULL read; after
 * a (re)connection, its next read goes without `If-None-Match`, once, and the receipts missed during the cut are repaired.
 */
class LiveReceiptsContinuityTest {

    @Test
    fun `a thread never read in full in this process reads in full`() {
        val continuity = LiveReceiptsContinuity()

        assertThat(continuity.mayRevalidateConditionally("c1")).isFalse()
    }

    @Test
    fun `a thread read in full while the socket stays connected may send its validator`() {
        val continuity = LiveReceiptsContinuity()
        continuity.connected()
        val epoch = continuity.epoch()

        continuity.readInFull("c1", epoch)

        assertThat(continuity.mayRevalidateConditionally("c1")).isTrue()
        assertThat(continuity.mayRevalidateConditionally("c2")).isFalse()
    }

    @Test
    fun `after a reconnection every thread reads in full once, then may send its validator again`() {
        val continuity = LiveReceiptsContinuity()
        continuity.connected()
        continuity.readInFull("c1", continuity.epoch())

        continuity.connected()

        assertThat(continuity.mayRevalidateConditionally("c1")).isFalse()
        continuity.readInFull("c1", continuity.epoch())
        assertThat(continuity.mayRevalidateConditionally("c1")).isTrue()
    }

    @Test
    fun `a full read whose request left before a reconnection does not count for the new connection`() {
        val continuity = LiveReceiptsContinuity()
        continuity.connected()
        val askedUnder = continuity.epoch()

        continuity.connected()
        continuity.readInFull("c1", askedUnder)

        assertThat(continuity.mayRevalidateConditionally("c1")).isFalse()
    }
}
