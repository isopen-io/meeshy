package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The EFFECT axis of a story text (#4870): four values, a wire string, and an
 * em-based shadow table mirrored verbatim from iOS `StoryTextEffect` and the web
 * `lib/story-text-effect.ts`. Pure — no Compose, so the whole rule is tested here
 * and the canvases stay glue.
 */
class StoryTextEffectTest {

    @Test
    fun `an absent or unknown wire value is NONE, never an exception`() {
        assertThat(StoryTextEffect.fromWire(null)).isEqualTo(StoryTextEffect.NONE)
        assertThat(StoryTextEffect.fromWire("effect-from-the-future")).isEqualTo(StoryTextEffect.NONE)
    }

    @Test
    fun `every effect round-trips through its wire string`() {
        StoryTextEffect.entries.forEach { effect ->
            assertThat(StoryTextEffect.fromWire(effect.wire)).isEqualTo(effect)
        }
    }

    @Test
    fun `NONE publishes nothing — a text without effect keeps the JSON it had`() {
        assertThat(StoryTextEffect.NONE.wireOrNull).isNull()
        assertThat(StoryTextEffect.GLOW.wireOrNull).isEqualTo("glow")
    }

    @Test
    fun `NONE carries no shadow`() {
        assertThat(StoryTextEffect.NONE.shadow).isNull()
    }

    @Test
    fun `glow is a centered halo in the text colour`() {
        val glow = StoryTextEffect.GLOW.shadow!!
        assertThat(glow.offsetXEm).isEqualTo(0.0)
        assertThat(glow.offsetYEm).isEqualTo(0.0)
        assertThat(glow.blurEm).isGreaterThan(0.0)
        assertThat(glow.ink).isEqualTo(StoryTextEffectInk.TEXT)
    }

    @Test
    fun `shadow and relief are black and offset downwards — only shadow is blurred`() {
        val shadow = StoryTextEffect.SHADOW.shadow!!
        val relief = StoryTextEffect.RELIEF.shadow!!
        assertThat(shadow.offsetYEm).isGreaterThan(0.0)
        assertThat(relief.offsetYEm).isGreaterThan(0.0)
        assertThat(shadow.blurEm).isGreaterThan(0.0)
        assertThat(relief.blurEm).isEqualTo(0.0)
        assertThat(shadow.ink).isEqualTo(StoryTextEffectInk.DARK)
        assertThat(relief.ink).isEqualTo(StoryTextEffectInk.DARK)
    }

    /** The table is the iOS/web one, verbatim — a drift here is a drift the reader sees. */
    @Test
    fun `the table mirrors the iOS and web values`() {
        assertThat(StoryTextEffect.GLOW.shadow).isEqualTo(StoryTextEffectShadow(0.0, 0.0, 0.36, StoryTextEffectInk.TEXT, 1.0))
        assertThat(StoryTextEffect.SHADOW.shadow).isEqualTo(StoryTextEffectShadow(0.03, 0.06, 0.16, StoryTextEffectInk.DARK, 0.6))
        assertThat(StoryTextEffect.RELIEF.shadow).isEqualTo(StoryTextEffectShadow(0.05, 0.05, 0.0, StoryTextEffectInk.DARK, 0.85))
    }

    /**
     * The COUNT, and it interrupts (#5244). Fourteen entries including [StoryTextEffect.NONE].
     * An effect added on one mirror and forgotten on the others makes this red — the only place
     * that can say so, the table not being on the wire.
     */
    @Test
    fun `the axis carries fourteen effects`() {
        assertThat(StoryTextEffect.entries).hasSize(14)
    }

    /** Every effect but NONE carries a shadow — an entry-less case renders like "none". */
    @Test
    fun `every effect but none carries a shadow`() {
        StoryTextEffect.entries.filter { it != StoryTextEffect.NONE }.forEach {
            assertThat(it.shadow).isNotNull()
        }
    }

    /** No shadow is invisible: zero opacity, or neither offset nor blur, renders as "none". */
    @Test
    fun `no effect is invisible`() {
        StoryTextEffect.entries.mapNotNull { it.shadow }.forEach { spec ->
            assertThat(spec.opacity).isGreaterThan(0.0)
            assertThat(spec.offsetXEm != 0.0 || spec.offsetYEm != 0.0 || spec.blurEm > 0.0).isTrue()
        }
    }

    /** Two effects rendering the same shadow are a choice that is not one. */
    @Test
    fun `no two effects share the same shadow`() {
        val shadows = StoryTextEffect.entries.mapNotNull { it.shadow }
        assertThat(shadows.toSet()).hasSize(shadows.size)
    }

    /** The three new mirror values, verbatim from the iOS table. */
    @Test
    fun `the widened table mirrors the iOS values`() {
        assertThat(StoryTextEffect.NEON.shadow).isEqualTo(StoryTextEffectShadow(0.0, 0.0, 0.60, StoryTextEffectInk.TEXT, 1.0))
        assertThat(StoryTextEffect.LONG_SHADOW.shadow).isEqualTo(StoryTextEffectShadow(0.14, 0.14, 0.0, StoryTextEffectInk.DARK, 0.35))
        assertThat(StoryTextEffect.EMBOSS.shadow).isEqualTo(StoryTextEffectShadow(-0.03, -0.03, 0.02, StoryTextEffectInk.LIGHT, 0.7))
        assertThat(StoryTextEffect.LETTERPRESS.shadow).isEqualTo(StoryTextEffectShadow(0.0, 0.025, 0.01, StoryTextEffectInk.LIGHT, 0.6))
    }
}
