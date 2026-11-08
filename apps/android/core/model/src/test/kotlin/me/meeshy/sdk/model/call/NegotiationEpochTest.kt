package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NegotiationEpochTest {
    @Test
    fun `generation 0 and 1 are always accepted at the head of a call`() {
        assertThat(NegotiationEpoch().accept(0, isOffer = true)).isTrue()
        assertThat(NegotiationEpoch().accept(1, isOffer = false)).isTrue()
        assertThat(NegotiationEpoch().accept(null, isOffer = true)).isTrue()
    }

    @Test
    fun `outgoing offers number the generations from 1`() {
        val epoch = NegotiationEpoch()
        assertThat(epoch.beginOutgoing()).isEqualTo(1)
        assertThat(epoch.beginOutgoing()).isEqualTo(2)
    }

    @Test
    fun `a strictly older signal is stale, an equal or newer one advances the mark`() {
        val epoch = NegotiationEpoch()
        assertThat(epoch.accept(4, isOffer = false)).isTrue()
        assertThat(epoch.accept(3, isOffer = false)).isFalse()
        assertThat(epoch.accept(4, isOffer = false)).isTrue()
        assertThat(epoch.accept(5, isOffer = false)).isTrue()
        assertThat(epoch.highWaterMark).isEqualTo(5)
    }

    @Test
    fun `the first offer of a returning peer renumbers the epoch from 1`() {
        val epoch = NegotiationEpoch()
        epoch.accept(7, isOffer = true)
        assertThat(epoch.accept(1, isOffer = true)).isTrue()
        assertThat(epoch.highWaterMark).isEqualTo(1)
    }

    @Test
    fun `a low answer or candidate is stale, only an offer can be a fresh link`() {
        val epoch = NegotiationEpoch()
        epoch.accept(7, isOffer = true)
        assertThat(epoch.accept(1, isOffer = false)).isFalse()
        assertThat(epoch.accept(2, isOffer = true)).isFalse()
    }

    @Test
    fun `reset forgets the previous call`() {
        val epoch = NegotiationEpoch()
        epoch.accept(9, isOffer = false)
        epoch.reset()
        assertThat(epoch.accept(0, isOffer = true)).isTrue()
    }
}
