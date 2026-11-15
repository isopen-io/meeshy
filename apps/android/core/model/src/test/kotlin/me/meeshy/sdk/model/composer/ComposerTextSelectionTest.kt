package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerTextSelectionTest {
    @Test
    fun `a selection inside the text is shown as it was left`() {
        assertThat(ComposerTextSelection(2, 5).shownIn(10)).isEqualTo(ComposerTextSelection(2, 5))
    }

    @Test
    fun `a selection beyond a shorter text is clamped to its end`() {
        assertThat(ComposerTextSelection(8, 12).shownIn(6)).isEqualTo(ComposerTextSelection(6, 6))
    }

    @Test
    fun `an untouched document puts the caret at the end of whatever text arrives`() {
        assertThat(ComposerTextSelection.AT_END.shownIn(7)).isEqualTo(ComposerTextSelection(7, 7))
        assertThat(ComposerTextSelection.AT_END.shownIn(0)).isEqualTo(ComposerTextSelection(0, 0))
    }

    @Test
    fun `a reversed or negative selection is normalised`() {
        assertThat(ComposerTextSelection(5, 2).shownIn(10)).isEqualTo(ComposerTextSelection(2, 5))
        assertThat(ComposerTextSelection(-3, 4).shownIn(10)).isEqualTo(ComposerTextSelection(0, 4))
    }

    @Test
    fun `the raw wish survives a trip through a text too short for it`() {
        val wish = ComposerTextSelection(4, 4)
        wish.shownIn(0)
        assertThat(wish.shownIn(9)).isEqualTo(ComposerTextSelection(4, 4))
    }
}
