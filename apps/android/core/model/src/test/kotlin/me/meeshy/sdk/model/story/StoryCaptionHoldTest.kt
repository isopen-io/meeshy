package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCaptionHoldTest {
    @Test
    fun `lire la legende ou la transcription fait boucler la story sans la figer`() {
        val hold = StoryPlaybackHold.resolve(StoryPlaybackCauses(engaged = true))
        assertThat(hold).isEqualTo(StoryPlaybackHold.Loop)
        assertThat(StoryPlaybackHold.endAction(hold)).isEqualTo(StoryPlaybackHold.EndAction.RestartInPlace)
    }
}
