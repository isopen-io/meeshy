package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReconcilePlanTest {
    private val day = ReconcilePlan.INTERVAL_MILLIS

    @Test
    fun `jamais reconcilie est du`() {
        assertThat(ReconcilePlan.isDue(null, now = 1_000L)).isTrue()
    }

    @Test
    fun `juste avant 24 h n est pas du`() {
        assertThat(ReconcilePlan.isDue(1_000L, now = 1_000L + day - 1)).isFalse()
    }

    @Test
    fun `a 24 h pile est du`() {
        assertThat(ReconcilePlan.isDue(1_000L, now = 1_000L + day)).isTrue()
    }

    @Test
    fun `l escalade exige un delta abouti`() {
        assertThat(ReconcilePlan.shouldEscalate(deltaSucceeded = false, mayHaveMore = true, due = true)).isFalse()
        assertThat(ReconcilePlan.shouldEscalate(true, mayHaveMore = true, due = false)).isTrue()
        assertThat(ReconcilePlan.shouldEscalate(true, mayHaveMore = false, due = true)).isTrue()
        assertThat(ReconcilePlan.shouldEscalate(true, mayHaveMore = false, due = false)).isFalse()
    }
}
