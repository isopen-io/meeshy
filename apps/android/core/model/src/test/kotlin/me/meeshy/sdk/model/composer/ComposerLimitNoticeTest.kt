package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Une limite ne se dit qu'au moment où on l'atteint (#13838) : ni compteur ni plafond avant, un mot bref à la limite. */
class ComposerLimitNoticeTest {

    @Test
    fun `below the cap nothing is said, not even the cap`() {
        assertThat(ComposerLimitNotice.visibleAt(used = 0, cap = 5000)).isNull()
        assertThat(ComposerLimitNotice.visibleAt(used = 4999, cap = 5000)).isNull()
    }

    @Test
    fun `at the cap the limit is reached, past it the content is too long`() {
        assertThat(ComposerLimitNotice.visibleAt(used = 5000, cap = 5000)).isEqualTo(ComposerLimitNotice.Kind.REACHED)
        assertThat(ComposerLimitNotice.visibleAt(used = 5001, cap = 5000)).isEqualTo(ComposerLimitNotice.Kind.EXCEEDED)
    }

    @Test
    fun `a cap of nothing never speaks`() {
        assertThat(ComposerLimitNotice.visibleAt(used = 3, cap = 0)).isNull()
    }

    @Test
    fun `the haptic plays once, on the keystroke that reaches the limit, never while typing below or past it`() {
        assertThat(ComposerLimitNotice.crossed(previous = 4999, current = 5000, cap = 5000)).isTrue()
        assertThat(ComposerLimitNotice.crossed(previous = 4998, current = 4999, cap = 5000)).isFalse()
        assertThat(ComposerLimitNotice.crossed(previous = 5000, current = 5001, cap = 5000)).isFalse()
        assertThat(ComposerLimitNotice.crossed(previous = 5001, current = 4999, cap = 5000)).isFalse()
    }

    @Test
    fun `a paste that jumps over the limit still counts as reaching it`() {
        assertThat(ComposerLimitNotice.crossed(previous = 10, current = 6000, cap = 5000)).isTrue()
    }

    @Test
    fun `the clock of the plan only shows once the playhead has left the start`() {
        assertThat(ComposerLimitNotice.showsPlanClock(playheadSeconds = 0f)).isFalse()
        assertThat(ComposerLimitNotice.showsPlanClock(playheadSeconds = 1.5f)).isTrue()
    }
}
