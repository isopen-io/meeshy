package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AnsweredRemoteOfferTest {
    @Test
    fun `nothing answered yet replays nothing`() {
        assertThat(AnsweredRemoteOffer().replayFor("v=0 offer")).isNull()
    }

    @Test
    fun `an exact replay of the answered offer gets the same answer and generation`() {
        val memo = AnsweredRemoteOffer()
        memo.remember("v=0 offer", "v=0 answer", 3)
        assertThat(memo.replayFor("v=0 offer")).isEqualTo(AnsweredReplay("v=0 answer", 3))
    }

    @Test
    fun `a different offer is new and a newer answer replaces the memory`() {
        val memo = AnsweredRemoteOffer()
        memo.remember("v=0 offer", "v=0 answer", 1)
        assertThat(memo.replayFor("v=0 other")).isNull()
        memo.remember("v=0 other", "v=0 answer2", 2)
        assertThat(memo.replayFor("v=0 offer")).isNull()
    }

    @Test
    fun `clear forgets`() {
        val memo = AnsweredRemoteOffer()
        memo.remember("o", "a", 1)
        memo.clear()
        assertThat(memo.replayFor("o")).isNull()
    }
}
