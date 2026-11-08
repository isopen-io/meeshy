package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryPlaybackHold.EndAction
import org.junit.Test

class StoryPlaybackHoldTest {

    private fun hold(causes: StoryPlaybackCauses) = StoryPlaybackHold.resolve(causes)

    @Test
    fun `rien ne retient la story qui avance`() {
        assertThat(hold(StoryPlaybackCauses())).isNull()
        assertThat(StoryPlaybackHold.endAction(null)).isEqualTo(EndAction.Advance)
    }

    @Test
    fun `chaque cause de gel fige la story`() {
        listOf(
            StoryPlaybackCauses(explicitPause = true),
            StoryPlaybackCauses(reacting = true),
            StoryPlaybackCauses(gestureInFlight = true),
            StoryPlaybackCauses(coveredByScreen = true),
            StoryPlaybackCauses(interrupted = true),
        ).forEach { assertThat(hold(it)).isEqualTo(StoryPlaybackHold.Pause) }
    }

    @Test
    fun `un engagement seul fait boucler la story`() {
        assertThat(hold(StoryPlaybackCauses(engaged = true))).isEqualTo(StoryPlaybackHold.Loop)
        assertThat(StoryPlaybackHold.endAction(StoryPlaybackHold.Loop)).isEqualTo(EndAction.RestartInPlace)
    }

    @Test
    fun `la pause l'emporte sur la boucle`() {
        StoryPlaybackCauses(engaged = true).let { engaged ->
            assertThat(hold(engaged.copy(reacting = true))).isEqualTo(StoryPlaybackHold.Pause)
            assertThat(hold(engaged.copy(explicitPause = true))).isEqualTo(StoryPlaybackHold.Pause)
            assertThat(hold(engaged.copy(interrupted = true))).isEqualTo(StoryPlaybackHold.Pause)
        }
        assertThat(StoryPlaybackHold.endAction(StoryPlaybackHold.Pause)).isEqualTo(EndAction.Advance)
    }
}
