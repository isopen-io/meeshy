package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScrollTimePillLawTest {

    private fun scrolled(vararg at: Double) =
        at.fold(ScrollTimePillLaw.initialState()) { s, t -> ScrollTimePillLaw.reduce(s, ScrollActivityEvent.Scrolled(t)) }

    @Test
    fun `la pilule est invisible a l ouverture et visible au premier defilement`() {
        assertThat(ScrollTimePillLaw.isVisible(ScrollTimePillLaw.initialState(), 0.0)).isFalse()
        assertThat(ScrollTimePillLaw.isVisible(scrolled(1_000.0), 1_000.0)).isTrue()
    }

    @Test
    fun `la pilule reste 900 ms apres le dernier defilement fenetre semi-ouverte`() {
        assertThat(ScrollTimePillLaw.LINGER_MS).isEqualTo(900.0)
        val state = scrolled(1_000.0)
        assertThat(ScrollTimePillLaw.isVisible(state, 1_899.0)).isTrue()
        assertThat(ScrollTimePillLaw.isVisible(state, 1_900.0)).isFalse()
    }

    @Test
    fun `chaque defilement rearme le timer et le tick ne le rearme jamais`() {
        assertThat(ScrollTimePillLaw.isVisible(scrolled(1_000.0, 1_800.0), 2_000.0)).isTrue()
        val state = scrolled(0.0)
        assertThat(ScrollTimePillLaw.reduce(state, ScrollActivityEvent.Tick(500.0))).isSameInstanceAs(state)
        assertThat(ScrollTimePillLaw.isVisible(ScrollTimePillLaw.reduce(state, ScrollActivityEvent.Tick(899.0)), 900.0)).isFalse()
    }
}
