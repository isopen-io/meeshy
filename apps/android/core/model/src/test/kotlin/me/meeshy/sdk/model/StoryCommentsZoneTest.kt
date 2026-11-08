package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryCommentsZone.ComposerState
import me.meeshy.sdk.model.StoryCommentsZone.Metrics
import org.junit.Test

class StoryCommentsZoneTest {

    private fun metrics(composer: Float? = 80f, keyboard: Float = 0f) =
        Metrics(windowHeight = 800f, safeBottom = 30f, topReserved = 120f, composerHeight = composer, keyboardHeight = keyboard)

    @Test
    fun `without a composer the list rests on the safe area up to 42 percent of the window`() {
        val frame = StoryCommentsZone.frame(ComposerState.ABSENT, metrics())
        assertThat(frame.bottomInset).isEqualTo(50f)
        assertThat(frame.maxHeight).isWithin(0.01f).of(336f)
    }

    @Test
    fun `a folded composer lifts the list above its bubble`() {
        val frame = StoryCommentsZone.frame(ComposerState.FOLDED, metrics(composer = 44f))
        assertThat(frame.bottomInset).isEqualTo(50f + 44f + 8f)
    }

    @Test
    fun `an expanded composer lets the list emerge from the middle of the plate and grow to 56 percent`() {
        val frame = StoryCommentsZone.frame(ComposerState.EXPANDED, metrics(composer = 80f))
        assertThat(frame.bottomInset).isEqualTo(90f)
        assertThat(frame.maxHeight).isWithin(0.01f).of(448f)
    }

    @Test
    fun `typing takes all the room between the header and the keyboard`() {
        val frame = StoryCommentsZone.frame(ComposerState.TYPING, metrics(composer = 80f, keyboard = 300f))
        assertThat(frame.bottomInset).isEqualTo(340f)
        assertThat(frame.maxHeight).isEqualTo(800f - 120f - 340f)
        assertThat(frame.topEdge).isEqualTo(680f)
    }

    @Test
    fun `the height never goes negative when the keyboard eats the window`() {
        assertThat(StoryCommentsZone.frame(ComposerState.TYPING, metrics(keyboard = 900f)).maxHeight).isEqualTo(0f)
    }

    @Test
    fun `fold wins over the keyboard and no composer means absent`() {
        assertThat(StoryCommentsZone.state(true, true, expanded = false, keyboardHeight = 300f)).isEqualTo(ComposerState.FOLDED)
        assertThat(StoryCommentsZone.state(true, true, expanded = true, keyboardHeight = 300f)).isEqualTo(ComposerState.TYPING)
        assertThat(StoryCommentsZone.state(true, true, expanded = true, keyboardHeight = 0f)).isEqualTo(ComposerState.EXPANDED)
        assertThat(StoryCommentsZone.state(false, true, expanded = true, keyboardHeight = 0f)).isEqualTo(ComposerState.ABSENT)
    }
}
