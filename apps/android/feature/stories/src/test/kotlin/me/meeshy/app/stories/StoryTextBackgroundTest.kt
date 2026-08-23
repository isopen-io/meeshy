package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
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
}
