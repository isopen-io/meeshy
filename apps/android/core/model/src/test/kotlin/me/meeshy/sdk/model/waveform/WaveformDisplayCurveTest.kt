package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import org.junit.Test

/**
 * La courbe d'affichage d'une bulle audio et son repli procédural. Miroir de
 * `AudioPlayerView.waveformHeight` et `AudioWaveformAnalyzer.generateFallback` (iOS).
 */
class WaveformDisplayCurveTest {

    @Test
    fun `sans valeurs la barre prend la forme procedurale, toujours la meme`() {
        val first = (0 until 72).map { WaveformDisplayCurve.barHeightDp(it, total = 72, levels = emptyList()) }
        val second = (0 until 72).map { WaveformDisplayCurve.barHeightDp(it, total = 72, levels = emptyList()) }

        assertThat(first).isEqualTo(second)
        assertThat(first.toSet().size).isGreaterThan(10)
    }

    @Test
    fun `le repli suit la somme sinus cosinus de la graine index fois sept plus trois`() {
        val seed = 3.0
        val expected = (5.0 + sin(seed) * 6 + cos(seed * 0.5) * 4).toFloat()

        assertThat(WaveformDisplayCurve.proceduralHeightDp(0)).isWithin(1e-4f).of(expected)
        assertThat(WaveformDisplayCurve.proceduralHeightDp(0)).isWithin(1e-3f).of(6.13f)
    }

    @Test
    fun `le repli reste entre deux et vingt-deux dp`() {
        (0 until 500).forEach {
            val height = WaveformDisplayCurve.proceduralHeightDp(it)
            assertThat(height).isAtLeast(WaveformDisplayCurve.MIN_HEIGHT_DP)
            assertThat(height).isAtMost(WaveformDisplayCurve.MAX_HEIGHT_DP)
        }
    }

    @Test
    fun `une barre pleine monte a vingt-deux dp et le silence reste a deux`() {
        assertThat(WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(1f))).isEqualTo(22f)
        assertThat(WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(0f))).isEqualTo(2f)
    }

    @Test
    fun `la courbe perceptive est une puissance zero virgule soixante-cinq`() {
        val expected = (0.5.pow(0.65) * 22.0).toFloat()

        assertThat(WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(0.5f))).isWithin(1e-4f).of(expected)
        assertThat(expected).isWithin(0.01f).of(14.016f)
    }

    @Test
    fun `les passages calmes sont releves au-dessus du lineaire`() {
        val calm = WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(0.1f))

        assertThat(calm).isGreaterThan(0.1f * 22f + 1f)
    }

    @Test
    fun `des niveaux hors bornes sont ramenes entre zero et un`() {
        assertThat(WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(3f))).isEqualTo(22f)
        assertThat(WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(-2f))).isEqualTo(2f)
    }

    @Test
    fun `une valeur non numerique tombe au plancher, jamais en hauteur indefinie`() {
        assertThat(WaveformDisplayCurve.barHeightDp(0, total = 1, levels = listOf(Float.NaN))).isEqualTo(2f)
    }

    @Test
    fun `moins de valeurs que de barres, chaque valeur couvre ses barres voisines`() {
        val levels = listOf(1f, 0f, 1f, 0f)
        val heights = WaveformDisplayCurve.barHeightsDp(total = 8, levels = levels)

        assertThat(heights).containsExactly(22f, 22f, 2f, 2f, 22f, 22f, 2f, 2f).inOrder()
    }

    @Test
    fun `plus de valeurs que de barres, la barre lit la valeur de son rang`() {
        val levels = List(100) { it / 100f }
        val heights = WaveformDisplayCurve.barHeightsDp(total = 10, levels = levels)

        heights.forEachIndexed { index, height ->
            val expected = maxOf(2f, ((index * 100 / 10) / 100f).toDouble().pow(0.65).toFloat() * 22f)
            assertThat(height).isWithin(1e-4f).of(expected)
        }
    }

    @Test
    fun `un nombre de barres nul ou negatif ne plante pas`() {
        assertThat(WaveformDisplayCurve.barHeightsDp(total = 0, levels = listOf(0.5f))).isEmpty()
        assertThat(WaveformDisplayCurve.barHeightsDp(total = -3, levels = emptyList())).isEmpty()
        assertThat(WaveformDisplayCurve.barHeightDp(index = 0, total = 0, levels = listOf(0.5f))).isAtLeast(2f)
    }

    @Test
    fun `les niveaux de repli sont deterministes et entre zero virgule deux et un`() {
        val levels = WaveformDisplayCurve.fallbackLevels(120)

        assertThat(levels).hasSize(120)
        assertThat(levels).isEqualTo(WaveformDisplayCurve.fallbackLevels(120))
        levels.forEach {
            assertThat(it).isAtLeast(0.2f)
            assertThat(it).isAtMost(1f)
        }
        assertThat(levels[0]).isWithin(1e-4f).of((0.2 + kotlin.math.abs(sin(3.0) * 0.4 + cos(1.5) * 0.3)).toFloat())
    }

    @Test
    fun `les niveaux de repli de n valeurs sont le prefixe de ceux de n plus un`() {
        assertThat(WaveformDisplayCurve.fallbackLevels(40))
            .isEqualTo(WaveformDisplayCurve.fallbackLevels(41).take(40))
        assertThat(WaveformDisplayCurve.fallbackLevels(0)).isEmpty()
        assertThat(WaveformDisplayCurve.fallbackLevels(-1)).isEmpty()
    }
}
