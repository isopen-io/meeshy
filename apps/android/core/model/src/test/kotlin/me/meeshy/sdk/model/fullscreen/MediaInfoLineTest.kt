package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaInfoLineTest {

    private fun line(w: Int? = 1920, h: Int? = 1080, size: String? = "12 Mo", hasDuration: Boolean = true, label: String? = "0:42") =
        MediaInfoLine.text(MediaInfoLine.segments(w, h, size, hasDuration), label)

    @Test
    fun `les trois segments sont separes par un point median`() {
        assertThat(line()).isEqualTo("1920 × 1080 · 12 Mo · 0:42")
    }

    @Test
    fun `un segment absent ne laisse aucun separateur orphelin`() {
        assertThat(line(w = null)).isEqualTo("12 Mo · 0:42")
        assertThat(line(w = 0)).isEqualTo("12 Mo · 0:42")
        assertThat(line(size = "")).isEqualTo("1920 × 1080 · 0:42")
        assertThat(line(hasDuration = false)).isEqualTo("1920 × 1080 · 12 Mo")
        assertThat(line(w = null, size = null, hasDuration = false)).isEmpty()
    }

    @Test
    fun `une duree sans libelle disparait sans separateur`() {
        assertThat(line(label = null)).isEqualTo("1920 × 1080 · 12 Mo")
    }

    @Test
    fun `pendant la lecture la duree affichee est le temps restant`() {
        assertThat(MediaInfoLine.displayedDuration(60.0, 15.0, isPlaying = true)).isEqualTo(45.0)
        assertThat(MediaInfoLine.displayedDuration(60.0, 15.0, isPlaying = false)).isEqualTo(60.0)
        assertThat(MediaInfoLine.displayedDuration(60.0, 90.0, isPlaying = true)).isEqualTo(0.0)
        assertThat(MediaInfoLine.displayedDuration(60.0, Double.NaN, isPlaying = true)).isEqualTo(60.0)
    }

    @Test
    fun `la duree declaree tient tant que le moteur n'a pas la sienne`() {
        assertThat(MediaInfoLine.totalDuration(engine = 0.0, declared = 30.0)).isEqualTo(30.0)
        assertThat(MediaInfoLine.totalDuration(engine = Double.NaN, declared = 30.0)).isEqualTo(30.0)
        assertThat(MediaInfoLine.totalDuration(engine = 28.5, declared = 30.0)).isEqualTo(28.5)
        assertThat(MediaInfoLine.totalDuration(engine = 0.0, declared = -1.0)).isEqualTo(0.0)
    }
}
