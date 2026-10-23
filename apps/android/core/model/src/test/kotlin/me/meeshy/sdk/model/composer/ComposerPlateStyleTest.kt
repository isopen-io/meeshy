package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.GlassRendering
import org.junit.Test

class ComposerPlateStyleTest {
    private fun style(sdk: Int, reduce: Boolean = false, dark: Boolean = false, backdrop: Boolean = true) =
        ComposerPlateStyle.resolve(sdkInt = sdk, reduceTransparency = reduce, hasBackdrop = backdrop, dark = dark)

    @Test fun `des l'API 31 la plaque floute le fond`() {
        assertThat(style(31).rendering).isEqualTo(GlassRendering.Blurred)
        assertThat(style(35).rendering).isEqualTo(GlassRendering.Blurred)
    }

    @Test fun `sous l'API 31 la plaque est opaque sans flou factice`() {
        assertThat(style(26).rendering).isEqualTo(GlassRendering.Opaque)
        assertThat(style(30).rendering).isEqualTo(GlassRendering.Opaque)
        assertThat(style(30).fillAlpha).isEqualTo(1f)
    }

    @Test fun `la transparence reduite force l'opaque meme sur API recente`() {
        val s = style(34, reduce = true)
        assertThat(s.rendering).isEqualTo(GlassRendering.Opaque)
        assertThat(s.fillAlpha).isEqualTo(1f)
    }

    @Test fun `sans fond a flouter la plaque reste translucide`() {
        assertThat(style(34, backdrop = false).rendering).isEqualTo(GlassRendering.Translucent)
    }

    @Test fun `le remplissage translucide est plus dense en sombre qu'en clair`() {
        assertThat(style(34, dark = true).fillAlpha).isLessThan(style(34, dark = false).fillAlpha)
        assertThat(style(34, dark = true).fillAlpha).isEqualTo(0.60f)
        assertThat(style(34, dark = false).fillAlpha).isEqualTo(0.72f)
    }

    @Test fun `la plaque est arrondie et bordee d'un trait fin`() {
        val s = style(34)
        assertThat(s.cornerRadiusDp).isEqualTo(28f)
        assertThat(s.borderWidthDp).isEqualTo(1f)
    }
}
