package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureTakeLedgerTest {
    @Test
    fun `a take follows its token to delivery`() {
        val l = CaptureTakeLedger().begin("a").deliver("a")
        assertThat(l.pending).isEmpty()
        assertThat(l.delivered).containsExactly("a")
        assertThat(l.hasLostTake).isFalse()
    }

    @Test
    fun `an abandoned take is reported lost`() {
        val l = CaptureTakeLedger().begin("a").abandon("a")
        assertThat(l.lost).containsExactly("a")
        assertThat(l.hasLostTake).isTrue()
    }

    @Test
    fun `a late delivery of a lost or unknown token changes nothing`() {
        val lost = CaptureTakeLedger().begin("a").abandon("a")
        assertThat(lost.deliver("a")).isEqualTo(lost)
        assertThat(lost.begin("a")).isEqualTo(lost)
        assertThat(CaptureTakeLedger().deliver("zz")).isEqualTo(CaptureTakeLedger())
    }

    @Test
    fun `closing the session loses the takes still open`() {
        val l = CaptureTakeLedger().begin("a").begin("b").deliver("b").closeSession()
        assertThat(l.lost).containsExactly("a")
        assertThat(l.delivered).containsExactly("b")
        assertThat(l.pending).isEmpty()
    }
}
