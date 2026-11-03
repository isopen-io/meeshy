package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackResumeLawTest {
    @Test
    fun `une tete sur la reprise ou au-dela ne bouge pas`() {
        assertThat(PlaybackResumeLaw.action(savedMs = 10_000, currentMs = 10_000)).isEqualTo(PlaybackResumeDeadZone.Action.None)
        assertThat(PlaybackResumeLaw.action(savedMs = 10_000, currentMs = 9_600)).isEqualTo(PlaybackResumeDeadZone.Action.None)
        assertThat(PlaybackResumeLaw.action(savedMs = 10_000, currentMs = 14_000)).isEqualTo(PlaybackResumeDeadZone.Action.None)
    }

    @Test
    fun `une tete en retard recoit un seul seek vers la reprise`() {
        assertThat(PlaybackResumeLaw.action(savedMs = 10_000, currentMs = 0))
            .isEqualTo(PlaybackResumeDeadZone.Action.SeekTo(10_000))
    }

    @Test
    fun `rien a reprendre rien a faire`() {
        assertThat(PlaybackResumeLaw.action(savedMs = null, currentMs = 3_000)).isEqualTo(PlaybackResumeDeadZone.Action.None)
    }

    @Test
    fun `un lecteur rendu au pool garde une position reprenable sinon revient au debut`() {
        assertThat(PlaybackResumeLaw.recycledHeadMs(positionMs = 5_000, durationMs = 20_000)).isNull()
        assertThat(PlaybackResumeLaw.recycledHeadMs(positionMs = 500, durationMs = 20_000)).isEqualTo(0L)
        assertThat(PlaybackResumeLaw.recycledHeadMs(positionMs = 19_800, durationMs = 20_000)).isEqualTo(0L)
    }
}
