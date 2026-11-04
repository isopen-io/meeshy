package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import org.junit.Test

class AudioFullscreenPlaybackScopeTest {

    private fun engineOn(id: String?, currentMs: Long, speed: PlaybackSpeed = PlaybackSpeed.X1_0) =
        AudioPlaybackState(attachmentId = id, isPlaying = id != null, currentTimeMs = currentMs, durationMs = 10_000L, speed = speed)

    @Test
    fun `la page dont la piste est chargee suit le moteur tic par tic`() {
        val engine = engineOn("a", currentMs = 2_500L)

        assertThat(AudioFullscreenPlaybackScope.of(engine, "a")).isEqualTo(engine)
    }

    @Test
    fun `une page voisine ne voit que le repos, quel que soit le tic du moteur`() {
        val early = AudioFullscreenPlaybackScope.of(engineOn("a", currentMs = 2_500L), "b")
        val later = AudioFullscreenPlaybackScope.of(engineOn("a", currentMs = 2_600L), "b")

        assertThat(early).isEqualTo(later)
        assertThat(early.attachmentId).isNull()
        assertThat(early.isPlaying).isFalse()
        assertThat(early.currentTimeMs).isEqualTo(0L)
    }

    @Test
    fun `la vitesse traverse toutes les pages, c est un reglage du lecteur`() {
        val neighbour = AudioFullscreenPlaybackScope.of(engineOn("a", currentMs = 2_500L, speed = PlaybackSpeed.X1_5), "b")

        assertThat(neighbour.speed).isEqualTo(PlaybackSpeed.X1_5)
    }

    @Test
    fun `sans piste chargee chaque page est au repos`() {
        val idle = AudioFullscreenPlaybackScope.of(AudioPlaybackState(speed = PlaybackSpeed.X2_0), "b")

        assertThat(idle).isEqualTo(AudioPlaybackState(speed = PlaybackSpeed.X2_0))
    }
}
