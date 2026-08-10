package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure picker-mode decision — the Feed counterpart of
 * `me.meeshy.app.stories.StoryMediaPicker`. Android's
 * `PickMultipleVisualMedia(maxItems)` contract **throws** when `maxItems <= 1`,
 * so the composer cannot blindly launch the multi-picker: a single free slot
 * must fall back to the single-item picker, and a full draft must launch
 * nothing. This rule lives in a pure function so the crash-avoidance is fully
 * unit-tested, keeping the Compose sheet as thin glue that only routes to a
 * launcher.
 */
class FeedMediaPickerTest {

    @Test
    fun `no free slots launches nothing`() {
        assertThat(FeedMediaPicker.modeFor(0)).isEqualTo(FeedMediaPickMode.None)
    }

    @Test
    fun `negative slots are treated as no free slots`() {
        assertThat(FeedMediaPicker.modeFor(-3)).isEqualTo(FeedMediaPickMode.None)
    }

    @Test
    fun `exactly one free slot uses the single-item picker`() {
        assertThat(FeedMediaPicker.modeFor(1)).isEqualTo(FeedMediaPickMode.Single)
    }

    @Test
    fun `two free slots use the multi-item picker`() {
        assertThat(FeedMediaPicker.modeFor(2)).isEqualTo(FeedMediaPickMode.Multiple)
    }

    @Test
    fun `the full media allowance uses the multi-item picker`() {
        assertThat(FeedMediaPicker.modeFor(FeedComposerDraft.MAX_MEDIA))
            .isEqualTo(FeedMediaPickMode.Multiple)
    }

    @Test
    fun `a fresh draft offers the multi-item picker for its full allowance`() {
        val draft = FeedComposerDraft()
        assertThat(FeedMediaPicker.modeFor(draft.remainingMediaSlots))
            .isEqualTo(FeedMediaPickMode.Multiple)
    }

    @Test
    fun `a draft with a single slot left falls back to the single picker`() {
        val draft = FeedComposerDraft(mediaIds = List(FeedComposerDraft.MAX_MEDIA - 1) { "m$it" })
        assertThat(draft.remainingMediaSlots).isEqualTo(1)
        assertThat(FeedMediaPicker.modeFor(draft.remainingMediaSlots))
            .isEqualTo(FeedMediaPickMode.Single)
    }

    @Test
    fun `a full draft launches nothing`() {
        val draft = FeedComposerDraft(mediaIds = List(FeedComposerDraft.MAX_MEDIA) { "m$it" })
        assertThat(draft.isMediaFull).isTrue()
        assertThat(FeedMediaPicker.modeFor(draft.remainingMediaSlots))
            .isEqualTo(FeedMediaPickMode.None)
    }
}
