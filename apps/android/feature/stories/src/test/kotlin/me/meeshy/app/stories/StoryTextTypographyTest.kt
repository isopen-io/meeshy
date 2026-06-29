package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the pure [StoryTextStyle.typography] mapping — the single place that
 * decides how each of the five iOS-parity styles renders (weight / italic / family /
 * tracking / glow). The Composable consumes these tokens, so every branch is covered
 * here and the canvas stays glue.
 */
class StoryTextTypographyTest {

    @Test
    fun `bold is a heavy sans face with no glow`() {
        val t = StoryTextStyle.BOLD.typography()
        assertThat(t.family).isEqualTo(StoryTextFontFamily.SANS)
        assertThat(t.italic).isFalse()
        assertThat(t.glow).isFalse()
        assertThat(t.fontWeight).isGreaterThan(StoryTextStyle.CLASSIC.typography().fontWeight)
    }

    @Test
    fun `neon glows`() {
        val t = StoryTextStyle.NEON.typography()
        assertThat(t.glow).isTrue()
        assertThat(t.family).isEqualTo(StoryTextFontFamily.SANS)
    }

    @Test
    fun `typewriter is a monospace face`() {
        val t = StoryTextStyle.TYPEWRITER.typography()
        assertThat(t.family).isEqualTo(StoryTextFontFamily.MONOSPACE)
        assertThat(t.glow).isFalse()
    }

    @Test
    fun `handwriting is an italic cursive face`() {
        val t = StoryTextStyle.HANDWRITING.typography()
        assertThat(t.family).isEqualTo(StoryTextFontFamily.CURSIVE)
        assertThat(t.italic).isTrue()
        assertThat(t.glow).isFalse()
    }

    @Test
    fun `classic is an upright serif face with no glow`() {
        val t = StoryTextStyle.CLASSIC.typography()
        assertThat(t.family).isEqualTo(StoryTextFontFamily.SERIF)
        assertThat(t.italic).isFalse()
        assertThat(t.glow).isFalse()
    }

    @Test
    fun `every style resolves a usable font weight`() {
        StoryTextStyle.entries.forEach { style ->
            val weight = style.typography().fontWeight
            assertThat(weight).isAtLeast(100)
            assertThat(weight).isAtMost(900)
        }
    }

    @Test
    fun `letter spacing is never negative`() {
        StoryTextStyle.entries.forEach { style ->
            assertThat(style.typography().letterSpacingEm).isAtLeast(0f)
        }
    }

    @Test
    fun `each style maps to a distinct typography`() {
        val all = StoryTextStyle.entries.map { it.typography() }
        assertThat(all.toSet()).hasSize(StoryTextStyle.entries.size)
    }
}
