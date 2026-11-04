package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryAudioMuteStateTest {
    @Test fun `le global bascule et coupe toute piste`() {
        val muted = StoryAudioMuteState().toggleGlobal()
        assertThat(muted.isGlobalMuted).isTrue()
        assertThat(muted.isAudible("a")).isFalse()
        assertThat(muted.toggleGlobal().isAudible("a")).isTrue()
    }

    @Test fun `couper une piste ne coupe que la sienne`() {
        val state = StoryAudioMuteState().toggleTrack("a")
        assertThat(state.isTrackMuted("a")).isTrue()
        assertThat(state.isAudible("a")).isFalse()
        assertThat(state.isAudible("b")).isTrue()
        assertThat(state.isGlobalMuted).isFalse()
    }

    @Test fun `un second tap rend la piste`() {
        val state = StoryAudioMuteState().toggleTrack("a").toggleTrack("a")
        assertThat(state.isTrackMuted("a")).isFalse()
        assertThat(state.isAudible("a")).isTrue()
    }

    @Test fun `le global ne touche pas aux pistes et reciproquement`() {
        val state = StoryAudioMuteState().toggleTrack("a").toggleGlobal().toggleGlobal()
        assertThat(state.isTrackMuted("a")).isTrue()
    }

    @Test fun `changer de slide vide les pistes mais garde le global`() {
        val cleared = StoryAudioMuteState().toggleGlobal().toggleTrack("a").cleared()
        assertThat(cleared.mutedTrackIds).isEmpty()
        assertThat(cleared.isGlobalMuted).isTrue()
    }

    @Test fun `le focus audio a l'ouverture ne force pas le mute`() {
        assertThat(StoryAudioMuteState().isGlobalMuted).isFalse()
    }
}
