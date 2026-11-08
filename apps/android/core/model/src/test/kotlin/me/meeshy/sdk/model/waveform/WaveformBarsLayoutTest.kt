package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WaveformBarsLayoutTest {
    @Test fun `72 barres en grand et 48 en compact`() {
        assertThat(WaveformBarsLayout.barCount(isCompact = false)).isEqualTo(72)
        assertThat(WaveformBarsLayout.barCount(isCompact = true)).isEqualTo(48)
    }

    @Test fun `la bande fait 24 dp et les capsules vont de 2 a 22 dp`() {
        assertThat(WaveformBarsLayout.BAND_HEIGHT_DP).isEqualTo(24f)
        val heights = WaveformBarsLayout.heights(samples = listOf(0f, 1f, 0.5f), count = 72)
        assertThat(heights).hasSize(72)
        assertThat(heights.min()).isAtLeast(2f)
        assertThat(heights.max()).isAtMost(22f)
        assertThat(heights.first()).isEqualTo(2f)
        assertThat(heights.last()).isWithin(1e-4f).of(22f * Math.pow(0.5, 0.65).toFloat())
    }

    @Test fun `sans echantillon la forme de repli est deterministe et bornee`() {
        val a = WaveformBarsLayout.heights(emptyList(), 48)
        val b = WaveformBarsLayout.heights(emptyList(), 48)
        assertThat(a).isEqualTo(b)
        assertThat(a.all { it in 2f..22f }).isTrue()
    }

    @Test fun `une barre est lue quand son centre est atteint`() {
        assertThat(WaveformBarsLayout.isPlayed(index = 0, count = 72, progress = 0.0)).isFalse()
        assertThat(WaveformBarsLayout.isPlayed(index = 35, count = 72, progress = 0.5)).isTrue()
        assertThat(WaveformBarsLayout.isPlayed(index = 36, count = 72, progress = 0.5)).isFalse()
        assertThat(WaveformBarsLayout.playedCount(count = 72, progress = 1.0)).isEqualTo(72)
        assertThat(WaveformBarsLayout.playedCount(count = 72, progress = 0.5)).isEqualTo(36)
    }

    @Test fun `la teinte distingue lecture live, repos et non lu`() {
        assertThat(WaveformBarsLayout.tint(true, isLive = true)).isEqualTo(WaveformBarTint.PLAYED_LIVE)
        assertThat(WaveformBarsLayout.tint(true, isLive = false)).isEqualTo(WaveformBarTint.PLAYED_RESTING)
        assertThat(WaveformBarsLayout.tint(false, isLive = true)).isEqualTo(WaveformBarTint.UNPLAYED)
    }

    @Test fun `la largeur d une barre vaut 62 pour cent du pas, 1,5 dp au minimum`() {
        assertThat(WaveformBarsLayout.barWidthDp(slotDp = 5f)).isWithin(1e-4f).of(3.1f)
        assertThat(WaveformBarsLayout.barWidthDp(slotDp = 1f)).isEqualTo(1.5f)
    }
}
