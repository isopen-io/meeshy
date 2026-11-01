package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Tout ce qui recouvre la scène fige l'horloge de la story — le menu ⋮ compris. */
class StoryViewerCoverTest {

    @Test
    fun `a bare scene keeps playing`() {
        assertThat(StoryViewerCover().freezesPlayback).isFalse()
    }

    @Test
    fun `the options menu freezes playback like a sheet`() {
        assertThat(StoryViewerCover(menu = true).freezesPlayback).isTrue()
        assertThat(StoryViewerCover(sheet = true).freezesPlayback).isTrue()
    }

    @Test
    fun `a confirmation dialog or an open rail bar freezes playback`() {
        assertThat(StoryViewerCover(dialog = true).freezesPlayback).isTrue()
        assertThat(StoryViewerCover(railBar = true).freezesPlayback).isTrue()
    }

    @Test
    fun `a comment being written freezes playback, like iOS StoryComposerHold`() {
        assertThat(StoryViewerCover(composing = true).freezesPlayback).isTrue()
    }

    @Test
    fun `a typed draft, a staged piece or a send in flight holds the story, an empty composer does not`() {
        assertThat(StoryCommentHold.holds(draft = " ", hasMedia = false, isSubmitting = false)).isFalse()
        assertThat(StoryCommentHold.holds(draft = "Beau", hasMedia = false, isSubmitting = false)).isTrue()
        assertThat(StoryCommentHold.holds(draft = "", hasMedia = true, isSubmitting = false)).isTrue()
        assertThat(StoryCommentHold.holds(draft = "", hasMedia = false, isSubmitting = true)).isTrue()
    }
}
