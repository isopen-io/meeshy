package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlin.random.Random
import org.junit.Test

/**
 * Behavioural spec for the pure story-background authoring palette — the Android
 * port of iOS's `StoryBackgroundPalette` (`StoryComposerSupportTypes.swift`). It
 * owns the picker's preset colours + gradients and the soft-pastel random
 * generator, all pure: no `Color`, no clock, an injectable [Random] so the
 * composer stays glue and every branch is unit-tested.
 */
class StoryBackgroundPaletteTest {

    private fun channels(hex: String): Triple<Int, Int, Int> =
        Triple(
            hex.substring(0, 2).toInt(16),
            hex.substring(2, 4).toInt(16),
            hex.substring(4, 6).toInt(16),
        )

    @Test
    fun `the solid palette exposes the seventeen iOS preset colours`() {
        assertThat(StoryBackgroundPalette.SOLID_COLORS).hasSize(17)
        assertThat(StoryBackgroundPalette.SOLID_COLORS)
            .containsAtLeast("0F0C29", "FF2E63", "2ECC71", "000000", "FFFFFF")
    }

    @Test
    fun `the gradient palette exposes the six iOS preset pairs`() {
        assertThat(StoryBackgroundPalette.GRADIENTS).hasSize(6)
        assertThat(StoryBackgroundPalette.GRADIENTS).contains("FF2E63" to "08D9D6")
    }

    @Test
    fun `presets project solids as Hex and gradients as Gradient values`() {
        val presets = StoryBackgroundPalette.presets()

        assertThat(presets).hasSize(23)
        assertThat(presets).contains(StoryBackgroundValue.Hex("FF2E63"))
        assertThat(presets).contains(StoryBackgroundValue.Gradient("FF2E63", "08D9D6"))
    }

    @Test
    fun `hsbToHex converts the pure primary hues`() {
        assertThat(StoryBackgroundPalette.hsbToHex(0.0, 1.0, 1.0)).isEqualTo("FF0000")
        assertThat(StoryBackgroundPalette.hsbToHex(1.0 / 3.0, 1.0, 1.0)).isEqualTo("00FF00")
        assertThat(StoryBackgroundPalette.hsbToHex(2.0 / 3.0, 1.0, 1.0)).isEqualTo("0000FF")
    }

    @Test
    fun `hsbToHex maps zero saturation to a grey ramp regardless of hue`() {
        assertThat(StoryBackgroundPalette.hsbToHex(0.42, 0.0, 1.0)).isEqualTo("FFFFFF")
        assertThat(StoryBackgroundPalette.hsbToHex(0.42, 0.0, 0.0)).isEqualTo("000000")
    }

    @Test
    fun `randomPastelHex is always a six-digit uppercase hex string`() {
        val random = Random(1)
        repeat(200) {
            assertThat(StoryBackgroundPalette.randomPastelHex(random)).matches("[0-9A-F]{6}")
        }
    }

    @Test
    fun `randomPastelHex stays in the soft-pastel brightness band`() {
        val random = Random(7)
        repeat(200) {
            val (r, g, b) = channels(StoryBackgroundPalette.randomPastelHex(random))
            val max = maxOf(r, g, b)
            // brightness 0.93..0.98 → the top channel truncates into [237, 249].
            assertThat(max).isAtLeast(235)
            assertThat(max).isAtMost(250)
        }
    }

    @Test
    fun `randomPastelHex stays in the low-saturation band`() {
        val random = Random(13)
        repeat(200) {
            val (r, g, b) = channels(StoryBackgroundPalette.randomPastelHex(random))
            val max = maxOf(r, g, b)
            val min = minOf(r, g, b)
            val saturation = (max - min).toDouble() / max
            // saturation 0.14..0.24 with a truncation cushion on both ends.
            assertThat(saturation).isAtLeast(0.10)
            assertThat(saturation).isAtMost(0.28)
        }
    }

    @Test
    fun `randomPastelHex never returns a preset solid colour`() {
        val random = Random(99)
        val presets = StoryBackgroundPalette.SOLID_COLORS.toSet()
        repeat(300) {
            assertThat(presets).doesNotContain(StoryBackgroundPalette.randomPastelHex(random))
        }
    }

    @Test
    fun `randomPastel wraps the generated hex as a Hex value`() {
        val expected = StoryBackgroundPalette.randomPastelHex(Random(42))

        assertThat(StoryBackgroundPalette.randomPastel(Random(42)))
            .isEqualTo(StoryBackgroundValue.Hex(expected))
    }
}
