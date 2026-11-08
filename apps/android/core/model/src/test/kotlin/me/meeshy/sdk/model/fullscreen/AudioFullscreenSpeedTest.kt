package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.PlaybackSpeed
import org.junit.Test

class AudioFullscreenSpeedTest {

    @Test
    fun `les paliers sont ceux d iOS, de la normale au double`() {
        assertThat(AudioFullscreenSpeed.steps).containsExactly(
            PlaybackSpeed.X1_0, PlaybackSpeed.X1_25, PlaybackSpeed.X1_5, PlaybackSpeed.X1_75, PlaybackSpeed.X2_0,
        ).inOrder()
    }

    @Test
    fun `le palier suivant monte d un quart puis revient a la normale apres le double`() {
        assertThat(AudioFullscreenSpeed.next(PlaybackSpeed.X1_0)).isEqualTo(PlaybackSpeed.X1_25)
        assertThat(AudioFullscreenSpeed.next(PlaybackSpeed.X1_75)).isEqualTo(PlaybackSpeed.X2_0)
        assertThat(AudioFullscreenSpeed.next(PlaybackSpeed.X2_0)).isEqualTo(PlaybackSpeed.X1_0)
    }

    @Test
    fun `une vitesse hors des paliers repart de la normale`() {
        assertThat(AudioFullscreenSpeed.next(PlaybackSpeed.X0_8)).isEqualTo(PlaybackSpeed.X1_0)
        assertThat(AudioFullscreenSpeed.next(PlaybackSpeed.X2_25)).isEqualTo(PlaybackSpeed.X1_0)
    }

    @Test
    fun `diminuer descend d un palier et s arrete a la normale`() {
        assertThat(AudioFullscreenSpeed.previous(PlaybackSpeed.X1_25)).isEqualTo(PlaybackSpeed.X1_0)
        assertThat(AudioFullscreenSpeed.previous(PlaybackSpeed.X2_0)).isEqualTo(PlaybackSpeed.X1_75)
        assertThat(AudioFullscreenSpeed.previous(PlaybackSpeed.X1_0)).isEqualTo(PlaybackSpeed.X1_0)
        assertThat(AudioFullscreenSpeed.previous(PlaybackSpeed.X2_25)).isEqualTo(PlaybackSpeed.X1_0)
    }
}
