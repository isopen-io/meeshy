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
        assertThat(glow.usesTextColor).isTrue()
    }

    @Test
    fun `shadow and relief are black and offset downwards — only shadow is blurred`() {
        val shadow = StoryTextEffect.SHADOW.shadow!!
        val relief = StoryTextEffect.RELIEF.shadow!!
        assertThat(shadow.offsetYEm).isGreaterThan(0.0)
        assertThat(relief.offsetYEm).isGreaterThan(0.0)
        assertThat(shadow.blurEm).isGreaterThan(0.0)
        assertThat(relief.blurEm).isEqualTo(0.0)
        assertThat(shadow.usesTextColor).isFalse()
        assertThat(relief.usesTextColor).isFalse()
    }

    /** The table is the iOS/web one, verbatim — a drift here is a drift the reader sees. */
    @Test
    fun `the table mirrors the iOS and web values`() {
        assertThat(StoryTextEffect.GLOW.shadow).isEqualTo(StoryTextEffectShadow(0.0, 0.0, 0.36, usesTextColor = true, opacity = 1.0))
        assertThat(StoryTextEffect.SHADOW.shadow).isEqualTo(StoryTextEffectShadow(0.03, 0.06, 0.16, usesTextColor = false, opacity = 0.6))
        assertThat(StoryTextEffect.RELIEF.shadow).isEqualTo(StoryTextEffectShadow(0.05, 0.05, 0.0, usesTextColor = false, opacity = 0.85))
    }
}
