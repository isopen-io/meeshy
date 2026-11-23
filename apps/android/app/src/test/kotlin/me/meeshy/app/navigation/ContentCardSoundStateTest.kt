package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.contentcard.ContentCardVisual
import me.meeshy.sdk.model.playback.AudioPlaybackState
import org.junit.Test

/** Le son seul d'une carte de contenu lit le moteur UNIQUE des vocaux : son état quand c'est lui qui joue, sa durée servie sinon (#20233). */
class ContentCardSoundStateTest {

    private val sound = ContentCardVisual.Sound(attachmentId = "a1", url = "/f/a.mp3", durationSeconds = 31)

    @Test
    fun `at rest, the sound shows its served duration`() {
        val state = ContentCardSoundState.of(sound, AudioPlaybackState(attachmentId = "autre", isPlaying = true, durationMs = 9_000))
        assertThat(state.isPlaying).isFalse()
        assertThat(state.durationSeconds).isEqualTo(31.0)
    }

    @Test
    fun `while the engine plays it, the sound shows the engine's progress and duration`() {
        val state = ContentCardSoundState.of(sound, AudioPlaybackState(attachmentId = "a1", isPlaying = true, currentTimeMs = 5_000, durationMs = 20_000))
        assertThat(state.isPlaying).isTrue()
        assertThat(state.liveElapsedSeconds).isEqualTo(5.0)
        assertThat(state.liveFraction).isEqualTo(0.25)
        assertThat(state.durationSeconds).isEqualTo(20.0)
    }
}
