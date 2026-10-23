package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.ThumbHashImage
import org.junit.Test

class MediaChromePlacementTest {

    private fun placement(
        region: ChromeRect = ChromeRect(0.79, 0.1, 0.96, 0.9),
        aspect: Double = 9.0 / 16,
        framing: MediaChromeFraming = MediaChromeFraming.Fill,
        veil: MediaChromeVeil? = null,
    ) = MediaChromePlacement.of(region, aspect, framing, veil)

    private fun raster(width: Int, height: Int, pixel: (Int, Int) -> Int): ThumbHashImage {
        val rgba = ByteArray(width * height * 4)
        for (y in 0 until height) for (x in 0 until width) {
            val v = pixel(x, y).toByte()
            val o = (y * width + x) * 4
            rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = 0xFF.toByte()
        }
        return ThumbHashImage(width, height, rgba)
    }

    @Test
    fun `la region est arrondie vers l exterieur sur la grille de 64`() {
        val region = placement(ChromeRect(0.801, 0.1, 0.951, 0.9)).region
        assertThat(region.left).isEqualTo(51.0 / 64)
        assertThat(region.right).isEqualTo(61.0 / 64)
    }

    @Test
    fun `deux controles dans la meme cellule partagent une signature donc une mesure`() {
        assertThat(placement(ChromeRect(0.801, 0.1, 0.9, 0.5)).signature)
            .isEqualTo(placement(ChromeRect(0.803, 0.1, 0.9, 0.5)).signature)
    }

    @Test
    fun `le ratio du cadre le cadrage et le voile changent la signature`() {
        val base = placement().signature
        assertThat(placement(aspect = 1.0).signature).isNotEqualTo(base)
        assertThat(placement(framing = MediaChromeFraming.Fit).signature).isNotEqualTo(base)
        assertThat(placement(veil = MediaChromeVeil.ReelPlayer).signature).isNotEqualTo(base)
    }

    @Test
    fun `un controle mesure dans son cadre est normalise`() {
        val p = MediaChromePlacement.ofControl(
            control = ChromeRect(300.0, 100.0, 400.0, 200.0),
            container = ChromeRect(0.0, 0.0, 400.0, 800.0),
            framing = MediaChromeFraming.Fit, veil = null,
        )!!
        assertThat(p.region.left).isEqualTo(0.75)
        assertThat(p.containerAspect).isEqualTo(0.5)
        assertThat(MediaChromePlacement.ofControl(ChromeRect(0.0, 0.0, 0.0, 0.0), ChromeRect(0.0, 0.0, 1.0, 1.0), MediaChromeFraming.Fit, null)).isNull()
    }

    @Test
    fun `en fill une image plus large que le cadre perd ses cotes`() {
        val zone = placement(ChromeRect(0.0, 0.0, 1.0, 1.0), aspect = 0.5).mediaRegion(imageAspect = 1.0)
        assertThat(zone.left).isWithin(0.02).of(0.25)
        assertThat(zone.right).isWithin(0.02).of(0.75)
        assertThat(zone.top).isEqualTo(0.0)
    }

    @Test
    fun `en fit un controle dans la bande de letterbox lit la frange du bord le plus proche`() {
        val zone = placement(ChromeRect(0.0, 0.0, 1.0, 0.1), aspect = 0.5, framing = MediaChromeFraming.Fit).mediaRegion(imageAspect = 1.0)
        assertThat(zone.top).isEqualTo(0.0)
        assertThat(zone.height).isWithin(1e-9).of(1.0 / 64)
    }

    @Test
    fun `la part du media sous le controle decide de la luminance`() {
        val image = raster(32, 32) { x, _ -> if (x < 16) 0 else 255 }
        val right = placement(ChromeRect(0.75, 0.0, 1.0, 1.0), aspect = 1.0, framing = MediaChromeFraming.Fit)
        val left = placement(ChromeRect(0.0, 0.0, 0.25, 1.0), aspect = 1.0, framing = MediaChromeFraming.Fit)
        assertThat(right.luminance(image)).isGreaterThan(0.9)
        assertThat(left.luminance(image)).isLessThan(0.01)
    }

    @Test
    fun `le voile noir assombrit la mesure du bord bas`() {
        val white = raster(16, 16) { _, _ -> 255 }
        val bottom = ChromeRect(0.0, 0.9, 1.0, 1.0)
        val bare = placement(bottom, aspect = 1.0, framing = MediaChromeFraming.Fit).luminance(white)!!
        val veiled = placement(bottom, aspect = 1.0, framing = MediaChromeFraming.Fit, veil = MediaChromeVeil.ReelPlayer).luminance(white)!!
        assertThat(veiled).isLessThan(bare)
        assertThat(placement(ChromeRect(0.0, 0.0, 1.0, 0.1), aspect = 1.0, framing = MediaChromeFraming.Fit, veil = MediaChromeVeil.ReelPlayer).luminance(white)).isWithin(1e-9).of(bare)
    }

    @Test
    fun `l opacite du voile s interpole entre ses stops`() {
        assertThat(MediaChromeVeil.ReelPlayer.opacityAt(0.25)).isEqualTo(0.0)
        assertThat(MediaChromeVeil.ReelPlayer.opacityAt(0.75)).isWithin(1e-9).of(0.3)
        assertThat(MediaChromeVeil.ReelPlayer.opacityAt(1.0)).isEqualTo(0.6)
    }

    @Test
    fun `un raster tronque ne donne aucune mesure`() {
        assertThat(placement().luminance(ThumbHashImage(4, 4, ByteArray(3)))).isNull()
    }
}
