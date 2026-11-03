package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SilentPushBudgetTest {
    @Test
    fun `no remaining budget leaves no time to work`() {
        assertThat(SilentPushBudget.flushDeadline(1_000, 0)).isEqualTo(1_000)
    }

    @Test
    fun `a budget smaller than the margin leaves no time to work`() {
        assertThat(SilentPushBudget.flushDeadline(1_000, 500)).isEqualTo(1_000)
    }

    @Test
    fun `two seconds remaining leave one second after the margin`() {
        assertThat(SilentPushBudget.flushDeadline(1_000, 2_000)).isEqualTo(2_000)
    }

    @Test
    fun `twenty seconds remaining are capped at five`() {
        assertThat(SilentPushBudget.flushDeadline(1_000, 20_000)).isEqualTo(6_000)
    }

    @Test
    fun `an unknown budget serves the cap`() {
        assertThat(SilentPushBudget.flushDeadline(0, null)).isEqualTo(SilentPushBudget.CAP_MILLIS)
        assertThat(SilentPushBudget.workBudgetMillis(null)).isEqualTo(5_000)
    }
}
