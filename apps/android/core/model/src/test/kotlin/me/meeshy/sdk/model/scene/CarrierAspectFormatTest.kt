package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.SceneV3
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Le format du cadre (portrait 9:16 ou paysage 16:9) se déduit du seul
 * `carrierAspect` de la scène v3 — port de `StoryCanvasAspect.from(ratio:)`
 * (iOS). Le portrait est le défaut : toute valeur absente ou aberrante y
 * retombe, jamais sur un cadre paysage fabriqué.
 */
@RunWith(JUnit4::class)
class CarrierAspectFormatTest {

    @Test
    fun `un porteur 9 sur 16 donne le cadre portrait`() {
        assertThat(CanvasFormat.fromCarrierAspect(9.0 / 16.0)).isEqualTo(CanvasFormat.PORTRAIT)
    }

    @Test
    fun `un porteur 16 sur 9 donne le cadre paysage`() {
        assertThat(CanvasFormat.fromCarrierAspect(16.0 / 9.0)).isEqualTo(CanvasFormat.LANDSCAPE)
    }

    @Test
    fun `un porteur absent donne le portrait par defaut`() {
        assertThat(CanvasFormat.fromCarrierAspect(null)).isEqualTo(CanvasFormat.PORTRAIT)
    }

    @Test
    fun `un porteur carre ou plus haut que large reste en portrait`() {
        assertThat(CanvasFormat.fromCarrierAspect(1.0)).isEqualTo(CanvasFormat.PORTRAIT)
        assertThat(CanvasFormat.fromCarrierAspect(0.75)).isEqualTo(CanvasFormat.PORTRAIT)
    }

    @Test
    fun `un porteur plus large que haut bascule en paysage`() {
        assertThat(CanvasFormat.fromCarrierAspect(1.0001)).isEqualTo(CanvasFormat.LANDSCAPE)
        assertThat(CanvasFormat.fromCarrierAspect(4.0 / 3.0)).isEqualTo(CanvasFormat.LANDSCAPE)
    }

    @Test
    fun `une valeur aberrante retombe sur le portrait`() {
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 0.0, -1.7778, -0.0).forEach {
            assertThat(CanvasFormat.fromCarrierAspect(it)).isEqualTo(CanvasFormat.PORTRAIT)
        }
    }

    @Test
    fun `les ratios largeur sur hauteur des deux formats sont 9 sur 16 et son inverse`() {
        assertThat(CanvasFormat.PORTRAIT.ratio).isEqualTo(0.5625)
        assertThat(CanvasFormat.LANDSCAPE.ratio).isWithin(1e-12).of(16.0 / 9.0)
        assertThat(CanvasFormat.PORTRAIT.ratio * CanvasFormat.LANDSCAPE.ratio).isWithin(1e-12).of(1.0)
    }

    @Test
    fun `une scene v3 sans carrierAspect est en portrait`() {
        assertThat(SceneV3(id = "s1").canvasFormat).isEqualTo(CanvasFormat.PORTRAIT)
    }

    @Test
    fun `une scene v3 dont le porteur est 16 sur 9 est en paysage`() {
        assertThat(SceneV3(id = "s1", carrierAspect = 16.0 / 9.0).canvasFormat)
            .isEqualTo(CanvasFormat.LANDSCAPE)
    }

    @Test
    fun `le format se lit sur le fil depuis carrierAspect`() {
        val json = Json { ignoreUnknownKeys = true }

        val landscape = json.decodeFromString<SceneV3>("""{"id":"s1","carrierAspect":1.7777}""")
        val native = json.decodeFromString<SceneV3>("""{"id":"s2"}""")

        assertThat(landscape.canvasFormat).isEqualTo(CanvasFormat.LANDSCAPE)
        assertThat(native.canvasFormat).isEqualTo(CanvasFormat.PORTRAIT)
    }
}
