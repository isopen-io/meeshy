package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextBackgroundStyle
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure text-backing model and its ordered presets: the
 * tagged-union wire mapping (none→absent, solid→hex, glass→radius) and the tap-cycle
 * that walks the preset list. No Android, no I/O.
 */
@RunWith(JUnit4::class)
class StoryTextBackgroundTest {

    // --- toStyleWire ---

    @Test
    fun `none projects to an absent background style so the wire payload stays minimal`() {
        assertThat(StoryTextBackground.None.toStyleWire()).isNull()
    }

    @Test
    fun `solid projects to the solid tagged union carrying only its hex`() {
        val wire = StoryTextBackground.Solid(hex = "6366F1").toStyleWire()
        assertThat(wire).isNotNull()
        assertThat(wire!!.type).isEqualTo("solid")
        assertThat(wire.hex).isEqualTo("6366F1")
        assertThat(wire.radius).isNull()
    }

    @Test
    fun `solid preserves an eight-digit hex with alpha verbatim`() {
        assertThat(StoryTextBackground.Solid(hex = "000000A6").toStyleWire()!!.hex).isEqualTo("000000A6")
    }

    @Test
    fun `glass projects to the glass tagged union carrying only its radius`() {
        val wire = StoryTextBackground.Glass(radius = 24.0).toStyleWire()
        assertThat(wire).isNotNull()
        assertThat(wire!!.type).isEqualTo("glass")
        assertThat(wire.radius).isEqualTo(24.0)
        assertThat(wire.hex).isNull()
    }

    // --- presets ---

    @Test
    fun `presets open with none then glass and are otherwise solids, in the iOS order`() {
        val all = StoryTextBackgroundPresets.all
        assertThat(all.first()).isEqualTo(StoryTextBackground.None)
        assertThat(all[1]).isEqualTo(StoryTextBackground.Glass(radius = 24.0))
        assertThat(all.drop(2)).containsExactly(
            StoryTextBackground.Solid("000000"),
            StoryTextBackground.Solid("000000A6"),
            StoryTextBackground.Solid("FFFFFF"),
            StoryTextBackground.Solid("FFFFFFA6"),
            StoryTextBackground.Solid("6366F1"),
            StoryTextBackground.Solid("6366F1A6"),
            StoryTextBackground.Solid("F472B6"),
            StoryTextBackground.Solid("34D399"),
            StoryTextBackground.Solid("FBBF24"),
            StoryTextBackground.Solid("F87171"),
        ).inOrder()
    }

    // --- next (tap-cycle) ---

    @Test
    fun `next advances to the following preset`() {
        assertThat(StoryTextBackgroundPresets.next(StoryTextBackground.None))
            .isEqualTo(StoryTextBackground.Glass(radius = 24.0))
    }

    @Test
    fun `next wraps past the last preset back to the first`() {
        val last = StoryTextBackgroundPresets.all.last()
        assertThat(StoryTextBackgroundPresets.next(last)).isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `next restarts at the first preset for a backing outside the palette`() {
        assertThat(StoryTextBackgroundPresets.next(StoryTextBackground.Solid(hex = "ABCDEF")))
            .isEqualTo(StoryTextBackground.None)
    }

    // --- resolve (reader: wire → backing, port of iOS resolvedBackgroundStyle) ---

    @Test
    fun `resolve returns none when neither a background style nor a legacy textBg is present`() {
        assertThat(StoryTextBackground.resolve(backgroundStyle = null, textBg = null))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve maps a solid style to a solid backing carrying its hex`() {
        val style = StoryTextBackgroundStyle(type = "solid", hex = "6366F1")
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.Solid(hex = "6366F1"))
    }

    @Test
    fun `resolve maps a glass style to a glass backing carrying its radius`() {
        val style = StoryTextBackgroundStyle(type = "glass", radius = 30.0)
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.Glass(radius = 30.0))
    }

    @Test
    fun `resolve maps an explicit none style to no backing`() {
        val style = StoryTextBackgroundStyle(type = "none")
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve prefers the modern style over a legacy textBg`() {
        // iOS priority: backgroundStyle (new) > textBg (legacy) > none — even when the
        // modern style resolves to none, it still wins over a legacy hex.
        val style = StoryTextBackgroundStyle(type = "none")
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = "112233"))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve falls back to a solid backing from a legacy textBg hex`() {
        assertThat(StoryTextBackground.resolve(backgroundStyle = null, textBg = "112233"))
            .isEqualTo(StoryTextBackground.Solid(hex = "112233"))
    }

    @Test
    fun `resolve treats a blank legacy textBg as no backing`() {
        assertThat(StoryTextBackground.resolve(backgroundStyle = null, textBg = "   "))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve treats a solid style with a null hex as no backing`() {
        val style = StoryTextBackgroundStyle(type = "solid", hex = null)
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve treats a solid style with a blank hex as no backing`() {
        val style = StoryTextBackgroundStyle(type = "solid", hex = "  ")
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve defaults a glass style with a missing radius to the picker default`() {
        val style = StoryTextBackgroundStyle(type = "glass", radius = null)
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.Glass(radius = StoryTextBackground.DEFAULT_GLASS_RADIUS))
    }

    @Test
    fun `resolve defaults a glass style with a non-positive radius to the picker default`() {
        val style = StoryTextBackgroundStyle(type = "glass", radius = 0.0)
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.Glass(radius = StoryTextBackground.DEFAULT_GLASS_RADIUS))
    }

    @Test
    fun `resolve defaults a glass style with a non-finite radius to the picker default`() {
        val style = StoryTextBackgroundStyle(type = "glass", radius = Double.NaN)
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.Glass(radius = StoryTextBackground.DEFAULT_GLASS_RADIUS))
    }

    @Test
    fun `resolve treats an unknown style type as no backing`() {
        val style = StoryTextBackgroundStyle(type = "hologram", hex = "6366F1", radius = 12.0)
        assertThat(StoryTextBackground.resolve(backgroundStyle = style, textBg = null))
            .isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `resolve is the inverse of toStyleWire for every backing`() {
        listOf(
            StoryTextBackground.None,
            StoryTextBackground.Solid(hex = "000000A6"),
            StoryTextBackground.Glass(radius = 24.0),
        ).forEach { backing ->
            assertThat(StoryTextBackground.resolve(backing.toStyleWire(), textBg = null))
                .isEqualTo(backing)
        }
    }
}
