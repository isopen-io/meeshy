package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure picker-mode decision. Android's
 * `PickMultipleVisualMedia(maxItems)` contract **throws** when `maxItems <= 1`,
 * so the composer cannot blindly launch the multi-picker: a single free slot
 * must fall back to the single-item picker, and a full draft must launch nothing.
 * This rule lives in a pure function so the crash-avoidance is fully unit-tested,
 * keeping the Compose screen as thin glue that only routes to a launcher.
 */
class StoryMediaPickerTest {

    @Test
    fun `no free slots launches nothing`() {
        assertThat(StoryMediaPicker.modeFor(0)).isEqualTo(StoryMediaPickMode.None)
    }

    @Test
    fun `negative slots are treated as no free slots`() {
        assertThat(StoryMediaPicker.modeFor(-3)).isEqualTo(StoryMediaPickMode.None)
    }

    @Test
    fun `exactly one free slot uses the single-item picker`() {
        assertThat(StoryMediaPicker.modeFor(1)).isEqualTo(StoryMediaPickMode.Single)
    }

    @Test
    fun `two free slots use the multi-item picker`() {
        assertThat(StoryMediaPicker.modeFor(2)).isEqualTo(StoryMediaPickMode.Multiple)
    }

    @Test
    fun `the full media allowance uses the multi-item picker`() {
        assertThat(StoryMediaPicker.modeFor(StoryComposerDraft.MAX_MEDIA))
            .isEqualTo(StoryMediaPickMode.Multiple)
    }

    @Test
    fun `an empty draft offers the multi-item picker for its full allowance`() {
        val draft = StoryComposerDraft()
        assertThat(StoryMediaPicker.modeFor(draft.remainingMediaSlots))
            .isEqualTo(StoryMediaPickMode.Multiple)
    }

    @Test
    fun `a draft with a single slot left falls back to the single picker`() {
        val draft = StoryComposerDraft(mediaIds = List(StoryComposerDraft.MAX_MEDIA - 1) { "m$it" })
        assertThat(draft.remainingMediaSlots).isEqualTo(1)
        assertThat(StoryMediaPicker.modeFor(draft.remainingMediaSlots))
            .isEqualTo(StoryMediaPickMode.Single)
    }

    @Test
    fun `a full draft launches nothing`() {
        val draft = StoryComposerDraft(mediaIds = List(StoryComposerDraft.MAX_MEDIA) { "m$it" })
        assertThat(draft.isMediaFull).isTrue()
        assertThat(StoryMediaPicker.modeFor(draft.remainingMediaSlots))
            .isEqualTo(StoryMediaPickMode.None)
    }
}
