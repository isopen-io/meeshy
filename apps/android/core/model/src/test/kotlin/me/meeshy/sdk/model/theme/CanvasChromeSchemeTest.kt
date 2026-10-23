package me.meeshy.sdk.model.theme

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundPalette
import org.junit.Test

class CanvasChromeSchemeTest {

    private fun solid(argb: Int) = IntArray(64) { argb }

    @Test
    fun `la luminance du noir est 0 et celle du blanc 1, avec ou sans diese`() {
        assertThat(CanvasChromeScheme.relativeLuminance("000000")).isWithin(1e-4).of(0.0)
        assertThat(CanvasChromeScheme.relativeLuminance("#FFFFFF")).isWithin(1e-4).of(1.0)
    }

    @Test
    fun `un hex invalide n'a pas de luminance`() {
        assertThat(CanvasChromeScheme.relativeLuminance("nope")).isNull()
        assertThat(CanvasChromeScheme.relativeLuminance("FFF")).isNull()
        assertThat(CanvasChromeScheme.relativeLuminance("")).isNull()
    }

    @Test
    fun `un degrade vaut la moyenne de ses deux stops`() {
        assertThat(CanvasChromeScheme.backgroundLuminance("gradient:000000:FFFFFF")).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `un fond sombre donne un chrome blanc et un fond clair un chrome sombre`() {
        assertThat(CanvasChromeScheme.scheme("1A2744", false)).isEqualTo(ChromeScheme.Dark)
        assertThat(CanvasChromeScheme.scheme("EEF2FF", false)).isEqualTo(ChromeScheme.Light)
        assertThat(CanvasChromeScheme.scheme("#0B1220", false)).isEqualTo(ChromeScheme.Dark)
        assertThat(CanvasChromeScheme.scheme("#F8F7FF", false)).isEqualTo(ChromeScheme.Light)
    }

    @Test
    fun `un fond absent ou illisible retombe sur le chrome blanc`() {
        assertThat(CanvasChromeScheme.scheme(null, false)).isEqualTo(ChromeScheme.Dark)
        assertThat(CanvasChromeScheme.scheme("oops", false)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `un media sans mesure garde le chrome blanc quel que soit le hex`() {
        assertThat(CanvasChromeScheme.scheme("FFFFFF", true)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `un media clair exige un chrome sombre et un media sombre reste blanc`() {
        assertThat(CanvasChromeScheme.scheme("#0B1220", true, 0.85)).isEqualTo(ChromeScheme.Light)
        assertThat(CanvasChromeScheme.scheme("#EEF2FF", true, 0.05)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `la luminance media n'est consultee que si un media de fond existe`() {
        assertThat(CanvasChromeScheme.scheme("#0B1220", false, 0.9)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `le seuil media est au dessus de l'equilibre WCAG`() {
        assertThat(CanvasChromeScheme.MEDIA_DARK_THRESHOLD).isGreaterThan(CanvasChromeScheme.DARK_THRESHOLD)
        assertThat(CanvasChromeScheme.scheme(null, true, 0.25)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `un glyphe nu tient 3 pour 1 sur tout fond uniforme`() {
        for (step in 0..200) {
            val ground = step / 200.0
            val scheme = CanvasChromeScheme.schemeForBareGlyphOver(ground)
            val glyph = if (scheme == ChromeScheme.Dark) 1.0 else CanvasChromeScheme.relativeLuminance("1E1B4B")!!
            assertThat(CanvasChromeScheme.contrastRatio(glyph, ground)).isAtLeast(3.0)
        }
    }

    @Test
    fun `un glyphe nu s'assombrit sur un fond mi clair que le seuil media laisserait blanc`() {
        assertThat(CanvasChromeScheme.schemeForBareGlyphOver(0.32)).isEqualTo(ChromeScheme.Light)
        assertThat(CanvasChromeScheme.scheme(null, true, 0.32)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `un glyphe nu sans luminance garde le defaut de la loi`() {
        assertThat(CanvasChromeScheme.schemeForBareGlyphOver(null))
            .isEqualTo(CanvasChromeScheme.scheme(null, true, null))
    }

    @Test
    fun `un fond uni et un glyphe nu se decident a la meme frontiere`() {
        for (hex in listOf("1A2744", "EEF2FF", "808080", "2E2E2E", "B0B0B0", "757575", "7A7A7A")) {
            assertThat(CanvasChromeScheme.scheme(hex, false))
                .isEqualTo(CanvasChromeScheme.schemeForBareGlyphOver(CanvasChromeScheme.backgroundLuminance(hex)))
        }
    }

    @Test
    fun `le halo prend la polarite opposee au glyphe`() {
        assertThat(CanvasChromeScheme.legibilityHalo(ChromeScheme.Dark)).isEqualTo(HaloPolarity.Black)
        assertThat(CanvasChromeScheme.legibilityHalo(ChromeScheme.Light)).isEqualTo(HaloPolarity.White)
    }

    @Test
    fun `la luminance moyenne d'un bitmap blanc approche 1 et celle d'un noir 0`() {
        assertThat(CanvasChromeScheme.averageRelativeLuminance(solid(0xFFFFFFFF.toInt()))).isWithin(0.05).of(1.0)
        assertThat(CanvasChromeScheme.averageRelativeLuminance(solid(0xFF000000.toInt()))).isWithin(0.05).of(0.0)
    }

    @Test
    fun `un gris moyen est lineairise sous la moitie`() {
        val lum = CanvasChromeScheme.averageRelativeLuminance(solid(0xFF808080.toInt()))!!
        assertThat(lum).isGreaterThan(0.1)
        assertThat(lum).isLessThan(0.5)
    }

    @Test
    fun `aucun pixel, aucune luminance`() {
        assertThat(CanvasChromeScheme.averageRelativeLuminance(IntArray(0))).isNull()
    }

    @Test
    fun `le voile est de 25 pour cent`() {
        assertThat(CanvasChromeScheme.SCENE_TEXT_VEIL_OPACITY).isEqualTo(0.25)
    }

    @Test
    fun `sur la palette du composeur le texte de scene tient 4,5 pour 1 dans le pire cas`() {
        var worst = Double.MAX_VALUE
        fun measure(r: Double, g: Double, b: Double, scheme: ChromeScheme) {
            val under = CanvasChromeScheme.luminanceUnderSceneTextVeil(r, g, b, scheme)
            worst = minOf(worst, CanvasChromeScheme.contrastRatio(CanvasChromeScheme.sceneTextInkLuminance(scheme), under))
        }
        fun channels(hex: String): Triple<Double, Double, Double> {
            val c = HexColor.parse(hex)!!
            return Triple(c.red / 255.0, c.green / 255.0, c.blue / 255.0)
        }
        StoryBackgroundPalette.SOLID_COLORS.forEach { hex ->
            val (r, g, b) = channels(hex)
            measure(r, g, b, CanvasChromeScheme.scheme(hex, false))
        }
        StoryBackgroundPalette.GRADIENTS.forEach { (start, end) ->
            val scheme = CanvasChromeScheme.scheme("gradient:$start:$end", false)
            val (r0, g0, b0) = channels(start)
            val (r1, g1, b1) = channels(end)
            for (step in 0..100) {
                val t = step / 100.0
                measure(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, scheme)
            }
        }
        assertThat(worst).isAtLeast(4.5)
    }
}
