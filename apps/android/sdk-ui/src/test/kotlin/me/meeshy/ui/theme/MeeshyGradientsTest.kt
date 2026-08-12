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
