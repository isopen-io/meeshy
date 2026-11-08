package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTrimPlaybackStepTest {

    @Test
    fun `tant que la borne haute n'est pas atteinte la lecture continue`() {
        val step = AudioTrimPlaybackStep.next(currentTime = 3.0, playerIsPlaying = true, lowerBound = 2.0, upperBound = 5.0)
        assertThat(step).isEqualTo(AudioTrimPlaybackStep.Playing(3.0))
    }

    @Test
    fun `a la borne haute la lecture finit et repose au debut du segment`() {
        val step = AudioTrimPlaybackStep.next(currentTime = 5.0, playerIsPlaying = true, lowerBound = 2.0, upperBound = 5.0)
        assertThat(step).isEqualTo(AudioTrimPlaybackStep.Finished(2.0))
    }

    @Test
    fun `une fin naturelle du lecteur repose au debut du segment`() {
        val step = AudioTrimPlaybackStep.next(currentTime = 4.0, playerIsPlaying = false, lowerBound = 2.0, upperBound = 5.0)
        assertThat(step).isEqualTo(AudioTrimPlaybackStep.Finished(2.0))
    }
}
