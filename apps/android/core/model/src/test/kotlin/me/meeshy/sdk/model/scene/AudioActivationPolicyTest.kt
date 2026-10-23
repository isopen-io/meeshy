package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioActivationPolicyTest {
    @Test fun `mute verrouille ne prepare rien`() {
        assertThat(AudioActivationPolicy.shouldPrepare(mute = true, muteIsLocked = true)).isFalse()
    }

    @Test fun `mute deverrouille prepare quand meme pour rebasculer sans latence`() {
        assertThat(AudioActivationPolicy.shouldPrepare(mute = true, muteIsLocked = false)).isTrue()
        assertThat(AudioActivationPolicy.shouldPrepare(mute = false, muteIsLocked = true)).isTrue()
    }

    @Test fun `l'activation exige du son et pas de mute global`() {
        assertThat(AudioActivationPolicy.shouldActivate(hasClips = true, hasSoundingVideo = false, mute = false)).isTrue()
        assertThat(AudioActivationPolicy.shouldActivate(hasClips = false, hasSoundingVideo = true, mute = false)).isTrue()
        assertThat(AudioActivationPolicy.shouldActivate(hasClips = false, hasSoundingVideo = false, mute = false)).isFalse()
        assertThat(AudioActivationPolicy.shouldActivate(hasClips = true, hasSoundingVideo = true, mute = true)).isFalse()
    }

    @Test fun `le moteur est retenu quand des clips existent mais sont mutes`() {
        assertThat(AudioActivationPolicy.shouldHoldEngine(hasClips = true, isMuted = true)).isTrue()
        assertThat(AudioActivationPolicy.shouldHoldEngine(hasClips = true, isMuted = false)).isFalse()
        assertThat(AudioActivationPolicy.shouldHoldEngine(hasClips = false, isMuted = true)).isFalse()
    }

    @Test fun `mute par piste et mute global se composent`() {
        assertThat(AudioActivationPolicy.isTrackAudible(globalMute = false, trackMuted = false)).isTrue()
        assertThat(AudioActivationPolicy.isTrackAudible(globalMute = true, trackMuted = false)).isFalse()
        assertThat(AudioActivationPolicy.isTrackAudible(globalMute = false, trackMuted = true)).isFalse()
        assertThat(AudioActivationPolicy.isTrackAudible(globalMute = true, trackMuted = true)).isFalse()
    }

    @Test fun `lever le mute global ne reveille pas une piste coupee`() {
        assertThat(AudioActivationPolicy.isTrackAudible(globalMute = false, trackMuted = true)).isFalse()
    }
}
