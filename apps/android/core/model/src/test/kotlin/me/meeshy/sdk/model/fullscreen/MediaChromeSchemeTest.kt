package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.ThumbHashImage
import org.junit.Test

class MediaChromeSchemeTest {

    private val backdrop = MediaChromeBackdrop.of("a", "hash", null)!!
    private val probe = MediaChromeProbe(backdrop, MediaChromePlacement.of(ChromeRect(0.0, 0.0, 0.5, 0.5), 1.0, MediaChromeFraming.Fit, null))

    @Test
    fun `sans mesure le schema est le defaut sombre`() {
        assertThat(MediaChromeScheme.scheme(backdrop, null)).isEqualTo(ChromeScheme.Dark)
        assertThat(MediaChromeScheme.glyphScheme(probe, null)).isEqualTo(ChromeScheme.Dark)
        assertThat(MediaChromeScheme.forMedia(null)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `un controle sur verre bascule au seuil media 0,35`() {
        assertThat(MediaChromeScheme.forMedia(0.34)).isEqualTo(ChromeScheme.Dark)
        assertThat(MediaChromeScheme.forMedia(0.35)).isEqualTo(ChromeScheme.Light)
    }

    @Test
    fun `un glyphe nu bascule a l equilibre WCAG 0,179`() {
        assertThat(MediaChromeScheme.forBareGlyph(0.178)).isEqualTo(ChromeScheme.Dark)
        assertThat(MediaChromeScheme.forBareGlyph(0.179)).isEqualTo(ChromeScheme.Light)
        assertThat(MediaChromeScheme.forBareGlyph(0.2)).isEqualTo(ChromeScheme.Light)
        assertThat(MediaChromeScheme.forMedia(0.2)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `une mesure pour un autre media n entre pas`() {
        assertThat(MediaChromeScheme.scheme(backdrop, MediaChromeSample("b", 0.9))).isEqualTo(ChromeScheme.Dark)
        assertThat(MediaChromeScheme.scheme(backdrop, MediaChromeSample("a", 0.9))).isEqualTo(ChromeScheme.Light)
        assertThat(MediaChromeScheme.glyphScheme(probe, MediaChromeSample("a", 0.9))).isEqualTo(ChromeScheme.Dark)
        assertThat(MediaChromeScheme.glyphScheme(probe, MediaChromeSample(probe.key, 0.9))).isEqualTo(ChromeScheme.Light)
    }

    @Test
    fun `un media sans empreinte ni bitmap n a pas de backdrop`() {
        assertThat(MediaChromeBackdrop.of("a", "", null)).isNull()
        assertThat(MediaChromeBackdrop.of("a", null, "")).isNull()
        assertThat(MediaChromeBackdrop.of("a", null, "https://x/y.jpg")).isNotNull()
    }

    @Test
    fun `la luminance moyenne d un raster uniforme est celle de sa couleur`() {
        fun uniform(v: Int) = ThumbHashImage(2, 2, ByteArray(16) { if (it % 4 == 3) -1 else v.toByte() })
        assertThat(MediaChromeScheme.averageRelativeLuminance(uniform(0))).isEqualTo(0.0)
        assertThat(MediaChromeScheme.averageRelativeLuminance(uniform(255))).isWithin(1e-9).of(1.0)
        assertThat(MediaChromeScheme.averageRelativeLuminance(ThumbHashImage(2, 2, ByteArray(3)))).isNull()
    }

    @Test
    fun `le rail de story declare une empreinte partagee par tous ses glyphes`() {
        val stage = MediaChromeStage.storyRail(9.0 / 16)
        val a = stage.probe(backdrop, null, null)!!
        val b = stage.probe(backdrop, ChromeRect(1.0, 1.0, 2.0, 2.0), ChromeRect(0.0, 0.0, 10.0, 10.0))!!
        assertThat(a.key).isEqualTo(b.key)
        assertThat(MediaChromeStage.ReelPlayer.probe(backdrop, null, null)).isNull()
        assertThat(MediaChromeStage.ReelPlayer.probe(null, ChromeRect(0.0, 0.0, 1.0, 1.0), ChromeRect(0.0, 0.0, 1.0, 1.0))).isNull()
    }
}
