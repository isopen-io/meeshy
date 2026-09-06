package me.meeshy.app.stories

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextEffect
import org.junit.Test

/**
 * `composeShadow` regressed to a non-exhaustive `when` the moment
 * [me.meeshy.sdk.model.StoryTextEffectInk] gained its `Tint` case (2026-09-05,
 * the five coloured neons): the base-colour branch only matched `Text`/`Dark`/
 * `Light`, so `:core:model:compileDebugKotlin` (a sibling casing mismatch in
 * the same commit) hid this second break behind the first one. This pins the
 * base colour a tinted effect must resolve to, opaque — the opacity in the
 * table applies afterwards, same as the three semantic inks.
 */
class StoryTextEffectShadowTest {

    @Test
    fun `a tinted effect resolves its base colour from the hex, ignoring the text colour`() {
        val shadow = StoryTextEffect.NEON_PINK.composeShadow(fontSizePx = 32f, textColor = Color.Blue)

        assertThat(shadow).isNotNull()
        assertThat(shadow!!.color).isEqualTo(Color(0xFFFF2D95))
    }

    @Test
    fun `a tinted effect still applies the table's own opacity, not full alpha`() {
        // GOLD carries opacity 0.95, not 1 — a tint branch that hardcodes full
        // alpha would silently drop this.
        val shadow = StoryTextEffect.GOLD.composeShadow(fontSizePx = 32f, textColor = Color.Blue)

        assertThat(shadow!!.color.alpha).isWithin(0.001f).of(0.95f)
    }

    @Test
    fun `the text ink still reads the caller's text colour, unaffected by tint support`() {
        val shadow = StoryTextEffect.GLOW.composeShadow(fontSizePx = 32f, textColor = Color.Red)

        assertThat(shadow!!.color.copy(alpha = 1f)).isEqualTo(Color.Red)
    }
}
