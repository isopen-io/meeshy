package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackResumeDeadZoneTest {

    @Test
    fun `une position collee au debut n'est pas reprise`() {
        assertThat(PlaybackResumeDeadZone.isResumable(1_000L, 30_000L)).isFalse()
        assertThat(PlaybackResumeDeadZone.isResumable(0L, 30_000L)).isFalse()
    }

    @Test
    fun `une position collee a la fin n'est pas reprise`() {
        assertThat(PlaybackResumeDeadZone.isResumable(29_000L, 30_000L)).isFalse()
        assertThat(PlaybackResumeDeadZone.isResumable(30_000L, 30_000L)).isFalse()
    }

    @Test
    fun `une position au coeur de la piste est reprise`() {
        assertThat(PlaybackResumeDeadZone.isResumable(1_001L, 30_000L)).isTrue()
        assertThat(PlaybackResumeDeadZone.isResumable(28_999L, 30_000L)).isTrue()
    }

    @Test
    fun `une piste de moins de deux secondes n'est jamais reprise`() {
        assertThat(PlaybackResumeDeadZone.isResumable(1_500L, 1_999L)).isFalse()
    }

    @Test
    fun `sans reprise memorisee la tete ne bouge pas`() {
        assertThat(PlaybackResumeDeadZone.action(null, 0L)).isEqualTo(PlaybackResumeDeadZone.Action.None)
    }

    @Test
    fun `une tete deja sur la reprise ou au-dela ne recule jamais`() {
        assertThat(PlaybackResumeDeadZone.action(10_000L, 9_600L)).isEqualTo(PlaybackResumeDeadZone.Action.None)
        assertThat(PlaybackResumeDeadZone.action(10_000L, 14_000L)).isEqualTo(PlaybackResumeDeadZone.Action.None)
    }

    @Test
    fun `une tete en retard recoit un seek vers la reprise`() {
        assertThat(PlaybackResumeDeadZone.action(10_000L, 0L)).isEqualTo(PlaybackResumeDeadZone.Action.SeekTo(10_000L))
    }
}
