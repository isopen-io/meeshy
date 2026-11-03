package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoMuteStateTest {
    @Test
    fun `le mute effectif est le OU des deux intentions`() {
        assertThat(VideoMuteState().effectiveMuted).isFalse()
        assertThat(VideoMuteState(isMuted = true).effectiveMuted).isTrue()
        assertThat(VideoMuteState(isForceMuted = true).effectiveMuted).isTrue()
        assertThat(VideoMuteState(true, true).effectiveMuted).isTrue()
    }

    @Test
    fun `le changement de piece remet l intention de surface a zero et garde la preference globale`() {
        val after = VideoMuteState(isMuted = true, isForceMuted = true).onMediaChanged()
        assertThat(after).isEqualTo(VideoMuteState(isMuted = true, isForceMuted = false))
        assertThat(VideoMuteState(isForceMuted = true).onMediaChanged().effectiveMuted).isFalse()
    }

    @Test
    fun `demander du son rallume aussi la preference globale, le couper n y touche pas`() {
        val on = VideoMuteState(isMuted = true, isForceMuted = true).withSurfaceSound(true)
        assertThat(on.effectiveMuted).isFalse()
        val off = VideoMuteState(isMuted = false).withSurfaceSound(false)
        assertThat(off).isEqualTo(VideoMuteState(isMuted = false, isForceMuted = true))
        assertThat(VideoMuteState(isMuted = true).withSurfaceSound(false).isMuted).isTrue()
    }

    @Test
    fun `couper le son clot le visionnage et rallumer relance une consommation`() {
        val sound = VideoMuteState()
        val silent = VideoMuteState(isForceMuted = true)
        assertThat(silent.stretchEffect(sound)).isEqualTo(MuteStretchEffect.CLOSE_STRETCH)
        assertThat(sound.stretchEffect(silent)).isEqualTo(MuteStretchEffect.REOPEN_STRETCH)
        assertThat(VideoMuteState(isMuted = true).stretchEffect(silent)).isEqualTo(MuteStretchEffect.NONE)
    }
}
