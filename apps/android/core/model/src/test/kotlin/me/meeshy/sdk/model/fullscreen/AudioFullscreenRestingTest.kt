package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.MediaResumeMerge.StampedPosition
import org.junit.Test

/** Miroir des vecteurs d'iOS `AudioFullscreenPlaybackSnapshot.resting(savedPosition:duration:)`. */
class AudioFullscreenRestingTest {

    private fun stored(positionMs: Long) = StampedPosition(positionMs = positionMs, savedAtEpochMs = 1_700_000_000_000L)

    @Test
    fun `une page revisitee repart de la position que l appareil a memorisee`() {
        assertThat(AudioFullscreenResting.storedPositionMs(stored(4_000L), durationMs = 10_000L)).isEqualTo(4_000L)
    }

    @Test
    fun `sans position memorisee la page n a aucun repos local`() {
        assertThat(AudioFullscreenResting.storedPositionMs(null, durationMs = 10_000L)).isNull()
    }

    @Test
    fun `une position nulle n est pas un repos`() {
        assertThat(AudioFullscreenResting.storedPositionMs(stored(0L), durationMs = 10_000L)).isNull()
    }

    @Test
    fun `une position au bout ou au dela de la piste n est pas un repos`() {
        assertThat(AudioFullscreenResting.storedPositionMs(stored(10_000L), durationMs = 10_000L)).isNull()
        assertThat(AudioFullscreenResting.storedPositionMs(stored(12_000L), durationMs = 10_000L)).isNull()
    }

    @Test
    fun `une duree inconnue rend le repos nu`() {
        assertThat(AudioFullscreenResting.storedPositionMs(stored(4_000L), durationMs = 0L)).isNull()
        assertThat(AudioFullscreenResting.storedPositionMs(stored(4_000L), durationMs = -1L)).isNull()
    }
}
