package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La vignette d'un vocal : une barre par échantillon, centrée, en échelle décibel. */
class WaveformImageLayoutTest {

    @Test
    fun `une barre par echantillon, du bord gauche vers la droite`() {
        val bars = WaveformImageLayout.bars(List(64) { 0.1f }, pixelWidth = 128, pixelHeight = 64)

        assertThat(bars).hasSize(64)
        assertThat(bars.first().x).isEqualTo(0)
        assertThat(bars.map { it.x }).isInStrictOrder()
        assertThat(bars.last().x + bars.last().width).isAtMost(128)
    }

    @Test
    fun `chaque barre est centree verticalement`() {
        WaveformImageLayout.bars(listOf(0.02f, 0.2f, 0.9f), pixelWidth = 90, pixelHeight = 64).forEach {
            assertThat(it.y).isEqualTo((64 - it.height) / 2)
        }
    }

    @Test
    fun `la hauteur suit l'echelle decibel sur quatre-vingt-dix pour cent`() {
        val loud = WaveformImageLayout.bars(listOf(1f), pixelWidth = 10, pixelHeight = 100).single()
        val quiet = WaveformImageLayout.bars(listOf(0.01f), pixelWidth = 10, pixelHeight = 100).single()

        assertThat(loud.height).isEqualTo(90)
        assertThat(quiet.height).isEqualTo(30)
    }

    @Test
    fun `le silence garde une barre d'un pixel, jamais un trou`() {
        val bar = WaveformImageLayout.bars(listOf(0f), pixelWidth = 10, pixelHeight = 100).single()

        assertThat(bar.height).isEqualTo(1)
        assertThat(bar.width).isAtLeast(1)
    }

    @Test
    fun `plus d'echantillons que de pixels donne des barres d'un pixel`() {
        val bars = WaveformImageLayout.bars(List(300) { 0.5f }, pixelWidth = 128, pixelHeight = 64)

        assertThat(bars).hasSize(300)
        assertThat(bars.all { it.width == 1 }).isTrue()
    }

    @Test
    fun `sans echantillon ou sans surface, aucune barre`() {
        assertThat(WaveformImageLayout.bars(emptyList(), 128, 64)).isEmpty()
        assertThat(WaveformImageLayout.bars(listOf(0.5f), 0, 64)).isEmpty()
        assertThat(WaveformImageLayout.bars(listOf(0.5f), 128, 0)).isEmpty()
    }
}
