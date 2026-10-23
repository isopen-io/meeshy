package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PaintRoleResolverTest {

    private fun palette(accent: String? = null) =
        AppearanceDesignPalette(base = "#F7F7FB", ink = "#1E1B4B", soft = "#E4E4F0", accent = accent)

    private fun hex(role: AppearancePaintRole, accent: String = "#FF0000", palette: AppearanceDesignPalette = palette()) =
        PaintRoleResolver.hex(role, palette, accent)

    @Test
    fun `ink soft and base come from the schema palette`() {
        assertThat(hex(AppearancePaintRole.INK)).isEqualTo("#1E1B4B")
        assertThat(hex(AppearancePaintRole.SOFT)).isEqualTo("#E4E4F0")
        assertThat(hex(AppearancePaintRole.BASE)).isEqualTo("#F7F7FB")
    }

    @Test
    fun `accent is the reader accent and next prev are rotated by plus and minus thirty degrees`() {
        assertThat(hex(AppearancePaintRole.ACCENT)).isEqualTo("#FF0000")
        assertThat(hex(AppearancePaintRole.ACCENT_NEXT)).isEqualTo("#FF7F00")
        assertThat(hex(AppearancePaintRole.ACCENT_PREV)).isEqualTo("#FF007F")
    }

    @Test
    fun `a palette that fixes its own accent wins over the reader accent`() {
        assertThat(hex(AppearancePaintRole.ACCENT, palette = palette(accent = "#00FF00"))).isEqualTo("#00FF00")
    }

    @Test
    fun `an invalid accent falls back to indigo and is never painted raw`() {
        assertThat(hex(AppearancePaintRole.ACCENT, accent = "not-a-colour")).isEqualTo("#6366F1")
        assertThat(hex(AppearancePaintRole.ACCENT, accent = "#12345")).isEqualTo("#6366F1")
        assertThat(hex(AppearancePaintRole.ACCENT_NEXT, accent = "")).isEqualTo(PaintRoleResolver.hueShifted("#6366F1", 30.0))
    }

    @Test
    fun `an accent without a hash is normalised to upper case`() {
        assertThat(PaintRoleResolver.normalizedAccent("ff00aa")).isEqualTo("#FF00AA")
    }

    @Test
    fun `hue rotation wraps around the wheel`() {
        assertThat(PaintRoleResolver.hueShifted("#FF007F", 30.0)).isEqualTo("#FF0000")
        assertThat(PaintRoleResolver.hueShifted("#FF0000", -30.0)).isEqualTo("#FF007F")
    }
}
