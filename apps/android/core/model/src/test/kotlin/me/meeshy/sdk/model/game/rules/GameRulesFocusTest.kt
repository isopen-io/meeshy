package me.meeshy.sdk.model.game.rules

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameRulesFocusTest {

    @Test
    fun `a rule wire names one of the eight rules`() {
        assertThat(GameRulesFocus.parse("rule-3")).isEqualTo(GameRulesFocus.Rule(3))
        assertThat(GameRulesFocus.parse("rule-8")).isEqualTo(GameRulesFocus.Rule(8))
    }

    @Test
    fun `a rule outside the book or malformed opens the book at the top`() {
        assertThat(GameRulesFocus.parse("rule-0")).isNull()
        assertThat(GameRulesFocus.parse("rule-9")).isNull()
        assertThat(GameRulesFocus.parse("rule-x")).isNull()
        assertThat(GameRulesFocus.parse("top")).isNull()
        assertThat(GameRulesFocus.parse(null)).isNull()
    }

    @Test
    fun `the badges wire names the badges section`() {
        assertThat(GameRulesFocus.parse("badges")).isEqualTo(GameRulesFocus.Badges)
    }

    @Test
    fun `a rule round-trips through its wire`() {
        assertThat(GameRulesFocus.parse(GameRulesFocus.Rule(5).wire)).isEqualTo(GameRulesFocus.Rule(5))
    }

    @Test
    fun `the timings follow iOS - settle, scroll, tint, hold then fade`() {
        assertThat(GameRulesFocus.ANCHOR).isEqualTo(0.18f)
        assertThat(GameRulesFocus.SETTLE_MILLIS).isEqualTo(250)
        assertThat(GameRulesFocus.SCROLL_MILLIS).isEqualTo(350)
        assertThat(GameRulesFocus.TINT_ALPHA).isEqualTo(0.14f)
        assertThat(GameRulesFocus.HOLD_MILLIS).isEqualTo(1_600)
        assertThat(GameRulesFocus.FADE_MILLIS).isEqualTo(400)
    }
}
