package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryGroupIntroCoverTest {
    @Test
    fun `l interlude fige la lecture et la story n attend plus rien une fois leve`() {
        assertThat(StoryViewerCover(groupIntro = true).freezesPlayback).isTrue()
        assertThat(StoryViewerCover(groupIntro = false).freezesPlayback).isFalse()
    }
}
