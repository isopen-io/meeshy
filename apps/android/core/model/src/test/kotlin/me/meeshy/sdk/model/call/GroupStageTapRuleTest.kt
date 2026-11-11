package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GroupStageTapRuleTest {
    @Test
    fun `hidden chrome is relit by a tile tap`() {
        assertThat(GroupStageTapRule.outcome(isChromeVisible = false)).isEqualTo(GroupStageTapOutcome.RevealChrome)
    }

    @Test
    fun `visible chrome puts the tile in the spotlight`() {
        assertThat(GroupStageTapRule.outcome(isChromeVisible = true)).isEqualTo(GroupStageTapOutcome.Spotlight)
    }

    @Test
    fun `my tile in a duo follows the same law, hidden controls come back first (G1_9, law 15)`() {
        assertThat(GroupStageTapRule.tapsTheSwap(isChromeVisible = true)).isTrue()
        assertThat(GroupStageTapRule.tapsTheSwap(isChromeVisible = false)).isFalse()
    }
}
