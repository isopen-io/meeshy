package me.meeshy.sdk.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * La vignette d'un vocal : un PNG de la forme d'onde. La géométrie des barres (une par échantillon,
 * centrée, en décibels, à deux fois la taille) est prouvée sur la JVM par `WaveformImageLayoutTest` ;
 * ici, le dessin et l'encodage rendent des octets, et une taille nulle ne rend rien.
 */
@RunWith(RobolectricTestRunner::class)
class WaveformImageRendererTest {

    private val renderer = WaveformImageRenderer()

    @Test
    fun `des echantillons rendent une image encodee`() {
        val png = renderer.render(List(64) { 0.1f + it / 100f }, width = 64, height = 32)

        assertThat(png).isNotEmpty()
    }

    @Test
    fun `sans echantillon l'image est transparente mais existe`() {
        assertThat(renderer.render(emptyList(), width = 64, height = 32)).isNotEmpty()
    }

    @Test
    fun `une taille nulle ou negative ne rend rien`() {
        assertThat(renderer.render(listOf(0.5f), width = 0, height = 32)).isEmpty()
        assertThat(renderer.render(listOf(0.5f), width = 64, height = -1)).isEmpty()
    }
}
