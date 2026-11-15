package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.AudioTrackActivationLaw.Step
import org.junit.Test

class AudioTrackActivationLawTest {
    @Test
    fun `au mute la sortie se coupe avant la piste`() {
        assertThat(AudioTrackActivationLaw.steps(playerIsMuted = false, wantsMuted = true))
            .containsExactly(Step.SILENCE_PLAYER, Step.DISABLE_AUDIO_TRACKS).inOrder()
    }

    @Test
    fun `au demute la piste se rallume sous la sortie muette puis la sortie s'ouvre`() {
        assertThat(AudioTrackActivationLaw.steps(playerIsMuted = true, wantsMuted = false))
            .containsExactly(Step.ENABLE_AUDIO_TRACKS, Step.SOUND_PLAYER).inOrder()
    }

    @Test
    fun `la sortie deja juste ne se reecrit pas mais les pistes se reconcilient`() {
        assertThat(AudioTrackActivationLaw.steps(playerIsMuted = true, wantsMuted = true))
            .containsExactly(Step.DISABLE_AUDIO_TRACKS)
        assertThat(AudioTrackActivationLaw.steps(playerIsMuted = false, wantsMuted = false))
            .containsExactly(Step.ENABLE_AUDIO_TRACKS)
    }

    @Test
    fun `les pistes sont eteintes exactement quand la sortie est muette`() {
        assertThat(AudioTrackActivationLaw.audioTracksDisabled(true)).isTrue()
        assertThat(AudioTrackActivationLaw.audioTracksDisabled(false)).isFalse()
    }
}
