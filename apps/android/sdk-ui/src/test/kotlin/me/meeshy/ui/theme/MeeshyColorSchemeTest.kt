package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * P0-2 contract: no Material default (grey/lavender) surface may leak. Every
 * surface/container role must resolve to a Meeshy Indigo token, and the tonal
 * elevation overlay must be off (`surfaceTint == Transparent`) so elevated
 * Material components stay flat and on-brand.
 */
class MeeshyColorSchemeTest {

    @Test
    fun `dark surfaces derive from Meeshy tokens`() {
        with(MeeshyDarkColorScheme) {
            assertThat(background).isEqualTo(DarkMeeshyTokens.backgroundPrimary)
            assertThat(surface).isEqualTo(DarkMeeshyTokens.backgroundSecondary)
            assertThat(surfaceVariant).isEqualTo(DarkMeeshyTokens.backgroundTertiary)
            assertThat(onSurface).isEqualTo(DarkMeeshyTokens.textPrimary)
            assertThat(onSurfaceVariant).isEqualTo(DarkMeeshyTokens.textSecondary)
        }
    }

    @Test
    fun `light surfaces derive from Meeshy tokens`() {
        with(MeeshyLightColorScheme) {
            assertThat(background).isEqualTo(LightMeeshyTokens.backgroundPrimary)
            assertThat(surface).isEqualTo(LightMeeshyTokens.backgroundSecondary)
            assertThat(surfaceVariant).isEqualTo(LightMeeshyTokens.backgroundTertiary)
            assertThat(onSurface).isEqualTo(LightMeeshyTokens.textPrimary)
        }
    }

    @Test
    fun `tonal elevation overlay is disabled in both themes`() {
        assertThat(MeeshyDarkColorScheme.surfaceTint).isEqualTo(Color(0x00000000))
        assertThat(MeeshyLightColorScheme.surfaceTint).isEqualTo(Color(0x00000000))
    }

    @Test
    fun `primary stays the indigo signature in both themes`() {
        assertThat(MeeshyDarkColorScheme.primary).isEqualTo(MeeshyPalette.Indigo500)
        assertThat(MeeshyLightColorScheme.primary).isEqualTo(MeeshyPalette.Indigo500)
    }

    @Test
    fun `dark elevation ramp is indigo-tinted, never grey`() {
        // Every dark container must keep blue >= red (indigo bias), i.e. never a
        // neutral/grey where red ~= green ~= blue.
        listOf(
            MeeshyDarkColorScheme.surfaceContainerLowest,
            MeeshyDarkColorScheme.surfaceContainerLow,
            MeeshyDarkColorScheme.surfaceContainer,
            MeeshyDarkColorScheme.surfaceContainerHigh,
            MeeshyDarkColorScheme.surfaceContainerHighest,
        ).forEach { c ->
            assertThat(c.blue).isAtLeast(c.red)
        }
    }
}
