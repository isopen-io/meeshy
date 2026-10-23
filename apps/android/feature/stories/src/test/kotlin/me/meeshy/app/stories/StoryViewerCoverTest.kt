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
}
