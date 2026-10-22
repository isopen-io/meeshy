package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * P0-4 contract: the theme-aware gradients actually branch on `dark` (a regression
 * where both branches returned the same brush would silently break light/dark
 * parity). Brush equality is structural, so equal brushes would fail this.
 */
class MeeshyGradientsTest {

    @Test
    fun `main background differs between dark and light`() {
        assertThat(MeeshyGradients.mainBackground(dark = true))
            .isNotEqualTo(MeeshyGradients.mainBackground(dark = false))
    }

    @Test
    fun `glass border differs between dark and light`() {
        assertThat(MeeshyGradients.glassBorder(dark = true))
            .isNotEqualTo(MeeshyGradients.glassBorder(dark = false))
    }

    @Test
    fun `main background is stable for a given theme`() {
        assertThat(MeeshyGradients.mainBackground(dark = true))
            .isEqualTo(MeeshyGradients.mainBackground(dark = true))
    }
}

class MeeshySurfaceGradientTest {
    private val tint = androidx.compose.ui.graphics.Color(0xFF6366F1)

    @Test
    fun `surface and border tinted tokens branch on dark`() {
        assertThat(MeeshyGradients.surfaceGradient(tint, dark = true))
            .isNotEqualTo(MeeshyGradients.surfaceGradient(tint, dark = false))
        assertThat(MeeshyGradients.tintedBorder(tint, dark = true))
            .isNotEqualTo(MeeshyGradients.tintedBorder(tint, dark = false))
    }
}

class MeeshyGlassRimGradientTest {
    @Test
    fun `le liseré liquid glass branche sur sombre et clair`() {
        assertThat(MeeshyGradients.liquidGlassRim(dark = true, isTinted = false))
            .isNotEqualTo(MeeshyGradients.liquidGlassRim(dark = false, isTinted = false))
    }

    @Test
    fun `le reflet liquid glass branche sur sombre et clair`() {
        assertThat(MeeshyGradients.liquidGlassSheen(dark = true))
            .isNotEqualTo(MeeshyGradients.liquidGlassSheen(dark = false))
    }
}
