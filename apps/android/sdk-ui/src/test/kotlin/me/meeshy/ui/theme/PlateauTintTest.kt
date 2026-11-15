package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlin.math.pow
import org.junit.Test

class PlateauTintTest {
    private fun channel(v: Float): Double = v.toDouble().let { if (it <= 0.03928) it / 12.92 else ((it + 0.055) / 1.055).pow(2.4) }
    private fun lum(c: Color) = 0.2126 * channel(c.red) + 0.7152 * channel(c.green) + 0.0722 * channel(c.blue)
    private fun contrast(ink: Color, plane: Color): Double {
        val painted = Color(
            ink.red * ink.alpha + plane.red * (1 - ink.alpha),
            ink.green * ink.alpha + plane.green * (1 - ink.alpha),
            ink.blue * ink.alpha + plane.blue * (1 - ink.alpha),
        )
        val a = lum(painted)
        val b = lum(plane)
        return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
    }

    @Test
    fun `the three tints are palette tokens and the default is the deep indigo`() {
        assertThat(PlateauTint.entries.map { it.color })
            .containsExactly(MeeshyPalette.PlateauNoir, MeeshyPalette.Indigo950, MeeshyPalette.Violet950).inOrder()
        assertThat(PlateauTint.DEFAULT).isEqualTo(PlateauTint.INDIGO_PROFOND)
    }

    @Test
    fun `storage keys are stable and an unknown key falls back to the default`() {
        assertThat(PlateauTint.entries.map { it.storageKey }).containsExactly("noir", "indigoProfond", "violetProfond").inOrder()
        assertThat(PlateauTint.fromStorage("violetProfond")).isEqualTo(PlateauTint.VIOLET_PROFOND)
        assertThat(PlateauTint.fromStorage("turquoise")).isEqualTo(PlateauTint.DEFAULT)
        assertThat(PlateauTint.fromStorage(null)).isEqualTo(PlateauTint.DEFAULT)
    }

    @Test
    fun `plateau inks read at AA on every tint even when the app is light`() {
        PlateauTint.entries.forEach { tint ->
            assertWithMessage("primary on ${tint.name}").that(contrast(ComposerPlateauInk.primary, tint.color)).isAtLeast(4.5)
            assertWithMessage("secondary on ${tint.name}").that(contrast(ComposerPlateauInk.secondary, tint.color)).isAtLeast(4.5)
            assertWithMessage("white on ${tint.name}").that(contrast(Color.White, tint.color)).isAtLeast(4.5)
            assertWithMessage("accent on ${tint.name}").that(contrast(ComposerPlateauInk.accent, tint.color)).isAtLeast(3.0)
        }
    }

    @Test
    fun `hit target is at least 44 dp`() {
        assertThat(ComposerPlateauInk.HIT_TARGET_DP).isAtLeast(44)
    }
}
